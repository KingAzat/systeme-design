/**
 * SystemLab — handlers par rôle : la mécanique événementielle de la simulation.
 *
 * Une requête traverse le graphe saut par saut (« arrival » → prise de
 * ressources → « service » → routage aval…). Chaque nœud qui relaie une requête
 * pousse une frame sur sa pile ; le retour de réponse est simulé par le
 * « déroulement » (unwind) LIFO synchrone dans `completeRequest` : les slots,
 * connexions et fenêtres de circuit breaker y sont relâchés/enregistrés.
 *
 * Le trajet réseau RETOUR vaut exactement le trajet aller (latence finale =
 * 2 × réseau + Σ attentes + Σ services) — hypothèse documentée.
 *
 * Tout l'aléa passe par ctx.rng (jamais Math.random) : à seed identique, la
 * trajectoire est reproductible.
 */
import type { Frame, NodeRuntime, SimContext, SimRequest } from "./runtime";
import {
  DB_CONN_WAIT_TIMEOUT_MS,
  MAX_HOPS,
  QUEUE_ACK_PERSIST_MS,
  SERVER_QUEUE_CAP,
  consumeToken,
  trafficProfileFactor,
} from "./runtime";
import { hashString } from "./rng";

/* ============================================================
 * Codes d'erreur / rejet (comptabilisés par MetricsStore)
 * ============================================================ */

const ERR = {
  outage: "outage-conn-refused", // nœud en panne (connexion refusée)
  loop: "loop-detected", // MAX_HOPS dépassé (« Boucle détectée »)
  overload: "503-overload", // capacité en débit dépassée (cdn, balancer, proxy…)
  queueFull: "503-queue-full", // file FIFO serveur pleine
  rateLimit: "429-rate-limit", // quota du rate limiter
  noTarget: "502-no-target", // aucune cible disponible (balancer)
  app: "500-app", // erreur applicative aléatoire
  timeout: "timeout-504", // délai amont dépassé
  connExhausted: "conn-exhausted", // pool de connexions base épuisé
  cbOpen: "cb-open", // circuit breaker ouvert
  workerTimeout: "worker-timeout", // timeout asynchrone d'un worker
  queueFullAsync: "queue-full", // enqueue refusé (profondeur max)
  unknown: "error",
} as const;

/** Les rejets (429/503) ne comptent ni en erreur ni en indisponibilité. */
const REJECT_CODES: ReadonlySet<string> = new Set([
  ERR.overload,
  ERR.queueFull,
  ERR.rateLimit,
  ERR.queueFullAsync,
]);

function isRejectCode(code: string | undefined): boolean {
  return code !== undefined && REJECT_CODES.has(code);
}

const clampNum = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/* ============================================================
 * Fabriques de requêtes
 * ============================================================ */

function newRequest(
  ctx: SimContext,
  generatorId: string,
  isRead: boolean,
  sizeKb: number,
  internal: boolean,
  depth: number,
): SimRequest {
  return {
    id: ctx.reqSeq++,
    createdAt: ctx.now,
    generatorId,
    isRead,
    sizeKb,
    networkMs: 0,
    waitMs: 0,
    serviceMs: 0,
    legWaitMs: 0,
    legServiceMs: 0,
    hops: 0,
    frames: [],
    internal,
    depth,
    preSlotted: false,
    cacheDecision: null,
  };
}

/** Clone « fire-and-forget » d'un fan-out : frames vierges, interne, profondeur bornée. */
function cloneRequest(ctx: SimContext, req: SimRequest): SimRequest {
  return {
    ...req,
    id: ctx.reqSeq++,
    frames: [],
    internal: true,
    depth: req.depth + 1,
  };
}

/* ============================================================
 * Routage aval
 * ============================================================ */

/**
 * Transmet la requête vers `targetId` via l'arête correspondante.
 * `extraDelayMs` = temps de traitement du nœud émetteur (ajouté au délai
 * réseau de l'arête). Retourne false si la cible est inconnue.
 */
function forwardTo(
  ctx: SimContext,
  req: SimRequest,
  fromNodeId: string,
  targetId: string,
  extraDelayMs = 0,
): boolean {
  if (!ctx.nodes.has(targetId)) {
    completeRequest(ctx, req, fromNodeId, false, ERR.noTarget);
    return false;
  }
  if (req.hops >= MAX_HOPS) {
    ctx.loopKilled++;
    completeRequest(ctx, req, fromNodeId, false, ERR.loop);
    return false;
  }
  let edgeLatencyMs = 0;
  for (const o of ctx.out.get(fromNodeId) ?? []) {
    if (o.targetId === targetId) {
      edgeLatencyMs = Math.max(0, o.edge.networkLatencyMs);
      break;
    }
  }
  req.hops++;
  req.networkMs += edgeLatencyMs;
  ctx.heap.push({
    time: ctx.now + extraDelayMs + edgeLatencyMs,
    type: "arrival",
    nodeId: targetId,
    req,
  });
  return true;
}

/** Fan-out générique : la 1re sortie porte la requête, les suivantes des clones internes. */
function forwardFanout(
  ctx: SimContext,
  rt: NodeRuntime,
  req: SimRequest,
  delayMs = 0,
): void {
  const outs = ctx.out.get(rt.id) ?? [];
  if (outs.length === 0) {
    completeRequest(ctx, req, rt.id, true);
    return;
  }
  for (let i = 0; i < outs.length; i++) {
    const r = i === 0 ? req : cloneRequest(ctx, req);
    forwardTo(ctx, r, rt.id, outs[i].targetId, delayMs);
  }
}

/** Cible de routage d'un serveur selon le mix lecture/écriture (même logique que l'estimation). */
function serverRouteTarget(
  ctx: SimContext,
  rt: NodeRuntime,
  isRead: boolean,
): { targetId: string | null; fanout: boolean } {
  const caches: string[] = [];
  const replicas: string[] = [];
  const databases: string[] = [];
  const queues: string[] = [];
  for (const o of ctx.out.get(rt.id) ?? []) {
    const t = ctx.nodes.get(o.targetId);
    if (!t) continue;
    if (t.role === "cache") caches.push(o.targetId);
    else if (t.role === "replica") replicas.push(o.targetId);
    else if (t.role === "database") databases.push(o.targetId);
    else if (t.role === "queue") queues.push(o.targetId);
  }
  if (isRead) {
    // Lectures : cache direct (hit/miss fetch-through) → réplica → base → file.
    if (caches.length > 0) return { targetId: caches[0], fanout: false };
    if (replicas.length > 0) return { targetId: replicas[0], fanout: false };
    if (databases.length > 0) return { targetId: databases[0], fanout: false };
    if (queues.length > 0) return { targetId: queues[0], fanout: false };
  } else {
    // Écritures : write-around vers la base → file (async) → cache.
    if (databases.length > 0) return { targetId: databases[0], fanout: false };
    if (queues.length > 0) return { targetId: queues[0], fanout: false };
    if (caches.length > 0) return { targetId: caches[0], fanout: false };
  }
  return { targetId: null, fanout: true };
}

/* ============================================================
 * Complétion / déroulement des frames
 * ============================================================ */

/**
 * Termine une requête : transmet le verdict au nœud terminal (frame dédiée
 * si présente, sinon comptage direct), déroule la pile de frames (relâche
 * slots/connexions, enregistre les circuit breakers, vérifie les timeouts
 * amont), puis comptabilise le résultat client.
 */
function completeRequest(
  ctx: SimContext,
  req: SimRequest,
  terminalId: string | null,
  ok: boolean,
  code?: string,
): void {
  const now = ctx.now;
  let success = ok;
  let errCode = code;

  if (terminalId !== null) {
    // Le nœud terminal possède-t-il sa propre frame au sommet de la pile ?
    // (rôles à slots : server, cache, database, replica, worker — frame poussée
    // par startService). Dans ce cas le déroulement applique le verdict (une
    // seule fois : endVisit + compteur + releaseSlot). Sinon, comptage direct.
    const top = req.frames.length > 0 ? req.frames[req.frames.length - 1] : undefined;
    if (top !== undefined && top.kind === "server" && top.nodeId === terminalId) {
      top.verdict = success ? "ok" : isRejectCode(errCode) ? "reject" : "error";
      top.verdictCode = errCode;
    } else {
      ctx.metrics.endVisit(terminalId);
      if (success) ctx.metrics.addProcessed(terminalId);
      else if (isRejectCode(errCode)) ctx.metrics.addRejected(terminalId);
      else ctx.metrics.addError(terminalId, errCode ?? ERR.unknown);
    }
  }

  while (req.frames.length > 0) {
    const frame = req.frames.pop() as Frame;
    if (frame.kind === "server" && frame.verdict !== undefined) {
      // frame du nœud terminal : verdict final déjà établi
      ctx.metrics.endVisit(frame.nodeId);
      if (frame.verdict === "ok") ctx.metrics.addProcessed(frame.nodeId);
      else if (frame.verdict === "reject") ctx.metrics.addRejected(frame.nodeId);
      else ctx.metrics.addError(frame.nodeId, frame.verdictCode ?? ERR.unknown);
      releaseSlotAndDrain(ctx, frame.nodeId);
      continue;
    }
    if (frame.kind === "server") {
      const rt = ctx.nodes.get(frame.nodeId);
      ctx.metrics.endVisit(frame.nodeId);
      let timedOut = false;
      if (rt?.role === "server") {
        // temps sous-arbre aval (règle « cascade de timeouts »)
        ctx.metrics.sampleDownstream(frame.nodeId, Math.max(0, now - frame.routedAt - frame.ownServiceMs));
        // attente + service + descendants > timeout ⇒ 504
        if (frame.ownWaitMs + (now - frame.routedAt) > frame.timeoutMs) timedOut = true;
      }
      if (timedOut) {
        success = false;
        errCode = ERR.timeout;
        ctx.metrics.addError(frame.nodeId, ERR.timeout);
      } else {
        ctx.metrics.addProcessed(frame.nodeId);
      }
      releaseSlotAndDrain(ctx, frame.nodeId);
    } else if (frame.kind === "breaker") {
      recordBreakerResult(ctx, frame.nodeId, frame.targetId, success, now);
    } else {
      // « hop » : relais sans ressource (cdn, balancer, proxy…)
      ctx.metrics.endVisit(frame.nodeId);
      if (success) ctx.metrics.addProcessed(frame.nodeId);
    }
  }

  if (!req.internal) {
    ctx.metrics.endVisit(req.generatorId);
    if (success) {
      // réseau aller + attentes + services + MÊME réseau en retour
      ctx.metrics.onServed(now, 2 * req.networkMs + req.waitMs + req.serviceMs);
      ctx.metrics.addProcessed(req.generatorId);
    } else if (isRejectCode(errCode)) {
      ctx.metrics.onRejected(now);
      ctx.metrics.addRejected(req.generatorId);
    } else {
      ctx.metrics.onError(now);
      ctx.metrics.addError(req.generatorId, errCode ?? ERR.unknown);
    }
  }
}

function failRequest(
  ctx: SimContext,
  req: SimRequest,
  atNodeId: string,
  code: string,
): void {
  completeRequest(ctx, req, atNodeId, false, code);
}

/* ============================================================
 * Slots, files FIFO, service
 * ============================================================ */

function releaseSlotAndDrain(ctx: SimContext, nodeId: string): void {
  ctx.metrics.releaseSlot(nodeId, ctx.now);
  tryDrainFifo(ctx, ctx.nodes.get(nodeId));
}

/** Temps de service par rôle (dégradation : × 1/facteur de panne). */
function serviceTimeFor(ctx: SimContext, rt: NodeRuntime, req: SimRequest, factor: number): number {
  const f = factor > 0 ? factor : 1;
  let base: number;
  switch (rt.role) {
    case "server":
      // lognormal bornée [0,2× ; 5×] : traitements longs rares
      base = rt.rc.avgServiceMs * clampNum(Math.exp(rt.rc.serviceVariability * ctx.rng.gaussian()), 0.2, 5);
      break;
    case "worker":
      base = rt.rc.avgProcessingMs * clampNum(Math.exp(0.3 * ctx.rng.gaussian()), 0.2, 5);
      break;
    case "database":
      base = req.isRead
        ? rt.rc.avgReadMs * (rt.rc.internalCacheEnabled ? 0.6 : 1)
        : rt.rc.avgWriteMs;
      break;
    case "replica":
      base = rt.rc.avgReadMs;
      break;
    case "cache":
      base = rt.rc.avgServiceMs;
      break;
    default:
      base = rt.rc.latencyMs;
  }
  return Math.max(0.05, base / f);
}

/**
 * Démarre le service : prend un slot, pousse la frame (relâchée au retour),
 * programme la fin de service. Le nœud tient sa resistance pendant tout le
 * temps des descendants (modèle synchrone réaliste).
 */
function startService(ctx: SimContext, rt: NodeRuntime, req: SimRequest): void {
  const factor = ctx.failure.factor(rt.id, ctx.now);
  const svc = serviceTimeFor(ctx, rt, req, factor);
  req.serviceMs += svc;
  req.legServiceMs = svc;
  ctx.metrics.takeSlot(rt.id, ctx.now);
  ctx.metrics.sampleService(rt.id, svc);
  req.frames.push({
    kind: "server",
    nodeId: rt.id,
    ownWaitMs: req.legWaitMs,
    ownServiceMs: svc,
    routedAt: ctx.now,
    timeoutMs: rt.rc.timeoutMs,
  });
  ctx.heap.push({ time: ctx.now + svc, type: "service", nodeId: rt.id, req });
}

/** Capacité FIFO (domaine échantillonné) avant rejet 503. */
function fifoCap(ctx: SimContext): number {
  return Math.max(1, Math.round(SERVER_QUEUE_CAP * ctx.scale));
}

/** Tente de démarrer le service des requêtes en attente (slots libres). */
function tryDrainFifo(ctx: SimContext, rt: NodeRuntime | undefined): void {
  if (!rt) return;
  if (rt.role === "queue") return; // les messages files sont dispatchés vers les workers
  const fifoRoles = rt.role === "server" || rt.role === "cache" || rt.role === "database" || rt.role === "replica" || rt.role === "worker";
  if (!fifoRoles) return;
  const acc = ctx.metrics.acc(rt.id);
  while (rt.fifo.length > 0 && acc.slotsBusy < rt.slots) {
    const entry = rt.fifo.shift();
    if (!entry) break;
    const waitMs = Math.max(0, ctx.now - entry.enqueuedAt);
    entry.req.waitMs += waitMs;
    entry.req.legWaitMs = waitMs;
    ctx.metrics.sampleWait(rt.id, waitMs);
    ctx.metrics.setQueueLen(rt.id, rt.fifo.length, ctx.now);
    // dépassement du délai d'attente pendant la file
    if (rt.role === "database" && waitMs > DB_CONN_WAIT_TIMEOUT_MS) {
      failRequest(ctx, entry.req, rt.id, ERR.connExhausted);
      continue;
    }
    if (rt.role === "server" && waitMs >= rt.rc.timeoutMs) {
      failRequest(ctx, entry.req, rt.id, ERR.timeout);
      continue;
    }
    startService(ctx, rt, entry.req);
  }
}

/** Arrivée sur un nœud à slots : service immédiat ou file d'attente FIFO. */
function arriveAtSlotNode(ctx: SimContext, rt: NodeRuntime, req: SimRequest): void {
  const acc = ctx.metrics.acc(rt.id);
  if (acc.slotsBusy < rt.slots) {
    req.legWaitMs = 0;
    startService(ctx, rt, req);
    return;
  }
  if (rt.fifo.length >= fifoCap(ctx)) {
    failRequest(ctx, req, rt.id, ERR.queueFull);
    return;
  }
  rt.fifo.push({ req, enqueuedAt: ctx.now });
  ctx.metrics.setQueueLen(rt.id, rt.fifo.length, ctx.now);
}

/* ============================================================
 * Générateur — arrivées Poisson
 * ============================================================ */

function handleGen(ctx: SimContext, nodeId: string): void {
  const rt = ctx.nodes.get(nodeId);
  if (!rt || rt.role !== "generator") return;
  const share = rt.rc.weight / Math.max(0.001, ctx.genTotalWeight);
  const factor = trafficProfileFactor(ctx.profile, ctx.now / 1000, ctx.durationSec, ctx.rng);
  const lambda = Math.max(0, ctx.rps * factor * ctx.scale * share);
  const dt = lambda > 0 ? ctx.rng.expovariateMs(lambda) : 1000;
  if (ctx.now + dt <= ctx.durationMs) {
    ctx.heap.push({ time: ctx.now + dt, type: "gen", nodeId });
  }
  const f = ctx.failure.factor(nodeId, ctx.now);
  if (f <= 0) return; // générateur en panne : aucune émission
  if (f < 1 && !ctx.rng.chance(f)) return; // dégradation : amincissement

  const outs = ctx.out.get(nodeId) ?? [];
  const req = newRequest(ctx, nodeId, ctx.rng.chance(ctx.readRatio), ctx.requestSizeKb, false, 0);
  ctx.metrics.onGenerated(ctx.now);
  ctx.metrics.beginVisit(nodeId, req.isRead, ctx.now);
  if (outs.length === 0) {
    completeRequest(ctx, req, nodeId, true);
    return;
  }
  req.networkMs = ctx.networkLatencyMs; // première latence réseau du chemin
  const pick = outs[rt.rr++ % outs.length];
  forwardTo(ctx, req, nodeId, pick.targetId);
}

/* ============================================================
 * Circuit breaker
 * ============================================================ */

function breakerStateFor(rt: NodeRuntime, targetId: string) {
  let st = rt.cb.get(targetId);
  if (!st) {
    st = {
      status: "closed",
      window: [],
      openUntilMs: 0,
      probesLeft: rt.rc.halfOpenProbes,
      openCount: 0,
      lastOpenAtMs: null,
    };
    rt.cb.set(targetId, st);
  }
  return st;
}

/** Le breaker laisse-t-il passer un appel vers `targetId` ? (rafraîchit OPEN→HALF-OPEN) */
function breakerAllows(ctx: SimContext, rt: NodeRuntime, targetId: string): boolean {
  const st = breakerStateFor(rt, targetId);
  if (st.status === "open" && ctx.now >= st.openUntilMs) {
    st.status = "half-open";
    st.probesLeft = rt.rc.halfOpenProbes;
  }
  if (st.status === "open") return false;
  if (st.status === "half-open") {
    if (st.probesLeft <= 0) return false;
    st.probesLeft--;
    return true;
  }
  return true;
}

function tripBreaker(ctx: SimContext, rt: NodeRuntime, st: NonNullable<ReturnType<typeof breakerStateFor>>, now: number): void {
  st.status = "open";
  st.openUntilMs = now + rt.rc.cooldownMs;
  st.probesLeft = rt.rc.halfOpenProbes;
  st.openCount++;
  st.lastOpenAtMs = now;
  st.window = [];
  ctx.metrics.addCircuitOpen(rt.id, now);
}

function recordBreakerResult(
  ctx: SimContext,
  nodeId: string,
  targetId: string,
  ok: boolean,
  now: number,
): void {
  const rt = ctx.nodes.get(nodeId);
  if (!rt || rt.role !== "circuit-breaker") return;
  const st = rt.cb.get(targetId);
  if (!st) return;
  if (st.status === "half-open") {
    if (ok) {
      st.status = "closed";
      st.window = [];
    } else {
      tripBreaker(ctx, rt, st, now);
    }
    return;
  }
  if (st.status !== "closed") return;
  st.window.push(ok);
  if (st.window.length > rt.rc.minRequestsToTrip) st.window.shift();
  if (st.window.length >= rt.rc.minRequestsToTrip) {
    const failures = st.window.reduce((s, v) => s + (v ? 0 : 1), 0);
    if (failures / st.window.length >= rt.rc.errorThreshold) {
      tripBreaker(ctx, rt, st, now);
    }
  }
}

/* ============================================================
 * Rate limiter
 * ============================================================ */

function allowRate(ctx: SimContext, rt: NodeRuntime): boolean {
  if (rt.rc.rlAlgorithm === "sliding-window") {
    const limit = Math.max(1, rt.rc.limit * ctx.scale);
    rt.rlWindow = rt.rlWindow.filter((t) => ctx.now - t < 1000);
    if (rt.rlWindow.length >= limit) return false;
    rt.rlWindow.push(ctx.now);
    return true;
  }
  // token bucket : régime permanent = limit, rafale initiale = limit + burst
  const rate = Math.max(0.001, rt.rc.limit * ctx.scale);
  const cap = Math.max(rate, (rt.rc.limit + rt.rc.burst) * ctx.scale);
  const b = rt.rlTokens;
  if (!b) return true;
  if (ctx.now > b.lastRefillMs) {
    b.tokens = Math.min(cap, b.tokens + (rate * (ctx.now - b.lastRefillMs)) / 1000);
    b.lastRefillMs = ctx.now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return true;
  }
  return false;
}

/* ============================================================
 * Files → workers
 * ============================================================ */

function handleDispatch(ctx: SimContext, rt: NodeRuntime): void {
  if (rt.role !== "queue") return;
  const outs = ctx.out.get(rt.id) ?? [];
  for (const o of outs) {
    const w = ctx.nodes.get(o.targetId);
    if (!w || w.role !== "worker") continue;
    const acc = ctx.metrics.acc(w.id);
    while (rt.fifo.length > 0 && acc.slotsBusy < w.slots) {
      const entry = rt.fifo.shift();
      if (!entry) break;
      const waitMs = Math.max(0, ctx.now - entry.enqueuedAt);
      entry.req.waitMs += waitMs;
      entry.req.legWaitMs = waitMs;
      entry.req.preSlotted = true;
      ctx.metrics.sampleWait(rt.id, waitMs);
      ctx.metrics.setQueueLen(rt.id, rt.fifo.length, ctx.now);
      const factor = ctx.failure.factor(w.id, ctx.now);
      const proc = Math.max(
        0.05,
        (w.rc.avgProcessingMs * clampNum(Math.exp(0.3 * ctx.rng.gaussian()), 0.2, 5)) /
          (factor > 0 ? factor : 1),
      );
      entry.req.serviceMs += proc;
      entry.req.legServiceMs = proc;
      ctx.metrics.takeSlot(w.id, ctx.now);
      ctx.metrics.sampleService(w.id, proc);
      entry.req.frames.push({
        kind: "server",
        nodeId: w.id,
        ownWaitMs: 0,
        ownServiceMs: proc,
        routedAt: ctx.now,
        timeoutMs: w.rc.timeoutMs,
      });
      ctx.heap.push({ time: ctx.now + proc, type: "service", nodeId: w.id, req: entry.req });
    }
  }
}

/** Redéclenche le dispatch des files alimentant ce worker. */
function kickUpstreamQueues(ctx: SimContext, workerId: string): void {
  for (const src of ctx.rev.get(workerId) ?? []) {
    const q = ctx.nodes.get(src);
    if (q && q.role === "queue") {
      ctx.heap.push({ time: ctx.now, type: "dispatch", nodeId: src });
    }
  }
}

/* ============================================================
 * Arrivée sur un nœud — dispatch par rôle
 * ============================================================ */

function handleArrival(ctx: SimContext, rt: NodeRuntime, req: SimRequest): void {
  const f = ctx.failure.factor(rt.id, ctx.now);
  if (f <= 0) {
    ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
    failRequest(ctx, req, rt.id, ERR.outage);
    return;
  }

  switch (rt.role) {
    case "generator":
    case "pass-through": {
      // relais neutre : 1 ms, capacité illimitée
      ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
      const outs = ctx.out.get(rt.id) ?? [];
      if (outs.length === 0) {
        completeRequest(ctx, req, rt.id, true);
        return;
      }
      req.serviceMs += 1 / f;
      req.frames.push({ kind: "hop", nodeId: rt.id });
      forwardFanout(ctx, rt, req, 1 / f);
      return;
    }

    case "cdn": {
      ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
      const rate = Math.max(0.001, rt.rc.capacityRps * ctx.scale * f);
      if (rt.bucket && !consumeToken(rt.bucket, rate, ctx.now)) {
        failRequest(ctx, req, rt.id, ERR.overload);
        return;
      }
      const hit = req.isRead && ctx.rng.chance(rt.rc.cacheHitRatio);
      req.cacheDecision = hit ? "hit" : "miss";
      if (hit) {
        ctx.metrics.addCacheHit(rt.id);
        const svc = rt.rc.hitLatencyMs / f;
        req.serviceMs += svc;
        req.legServiceMs = svc;
        ctx.heap.push({ time: ctx.now + svc, type: "service", nodeId: rt.id, req });
        return;
      }
      const outs = ctx.out.get(rt.id) ?? [];
      if (outs.length === 0) {
        completeRequest(ctx, req, rt.id, true);
        return;
      }
      const svc = rt.rc.latencyMs / f;
      req.serviceMs += svc;
      req.frames.push({ kind: "hop", nodeId: rt.id });
      forwardFanout(ctx, rt, req, svc);
      return;
    }

    case "balancer": {
      ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
      const rate = Math.max(0.001, rt.rc.capacityRps * Math.max(1, rt.rc.instances) * ctx.scale * f);
      if (rt.bucket && !consumeToken(rt.bucket, rate, ctx.now)) {
        failRequest(ctx, req, rt.id, ERR.overload);
        return;
      }
      const outs = ctx.out.get(rt.id) ?? [];
      if (outs.length === 0) {
        failRequest(ctx, req, rt.id, ERR.noTarget);
        return;
      }
      const targets = outs.map((o) => o.targetId).filter((id) => ctx.nodes.has(id));
      const healthy = rt.rc.healthCheck
        ? targets.filter((id) => ctx.failure.factor(id, ctx.now) > 0)
        : targets;
      if (healthy.length === 0) {
        // health checks actifs et toutes les cibles en panne
        failRequest(ctx, req, rt.id, ERR.noTarget);
        return;
      }
      let pick: string;
      if (rt.rc.algorithm === "least-connections") {
        let best = healthy[0];
        let bestInFlight = Number.POSITIVE_INFINITY;
        for (const id of healthy) {
          const infl = ctx.metrics.acc(id).inFlight;
          if (infl < bestInFlight) {
            bestInFlight = infl;
            best = id;
          }
        }
        pick = best;
      } else if (rt.rc.algorithm === "ip-hash") {
        pick = healthy[hashString(`req-${req.id}`) % healthy.length];
      } else {
        pick = healthy[rt.rr++ % healthy.length];
      }
      const svc = rt.rc.latencyMs / f;
      req.serviceMs += svc;
      req.frames.push({ kind: "hop", nodeId: rt.id });
      forwardTo(ctx, req, rt.id, pick, svc);
      return;
    }

    case "rate-limiter": {
      ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
      if (!allowRate(ctx, rt)) {
        // 429 immédiat, sans toucher l'aval
        failRequest(ctx, req, rt.id, ERR.rateLimit);
        return;
      }
      const outs = ctx.out.get(rt.id) ?? [];
      if (outs.length === 0) {
        completeRequest(ctx, req, rt.id, true);
        return;
      }
      const svc = rt.rc.latencyMs / f;
      req.serviceMs += svc;
      req.frames.push({ kind: "hop", nodeId: rt.id });
      forwardFanout(ctx, rt, req, svc);
      return;
    }

    case "circuit-breaker": {
      ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
      const outs = ctx.out.get(rt.id) ?? [];
      if (outs.length === 0) {
        completeRequest(ctx, req, rt.id, true);
        return;
      }
      const svc = 1 / f;
      req.serviceMs += svc;
      let primaryUsed = false;
      for (let i = 0; i < outs.length; i++) {
        const targetId = outs[i].targetId;
        if (!ctx.nodes.has(targetId)) continue;
        if (!breakerAllows(ctx, rt, targetId)) continue; // circuit ouvert pour cette cible
        const r = primaryUsed ? cloneRequest(ctx, req) : req;
        r.frames.push({ kind: "breaker", nodeId: rt.id, targetId });
        primaryUsed = true; // la requête primaire est consommée (réussite ou échec)
        forwardTo(ctx, r, rt.id, targetId, svc);
      }
      if (!primaryUsed) {
        // tous les circuits sont ouverts
        failRequest(ctx, req, rt.id, ERR.cbOpen);
      }
      return;
    }

    case "proxy": {
      ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
      const rate = Math.max(0.001, rt.rc.capacityRps * ctx.scale * f);
      if (rt.bucket && !consumeToken(rt.bucket, rate, ctx.now)) {
        failRequest(ctx, req, rt.id, ERR.overload);
        return;
      }
      const svc = rt.rc.latencyMs / f;
      req.serviceMs += svc;
      req.frames.push({ kind: "hop", nodeId: rt.id });
      forwardFanout(ctx, rt, req, svc);
      return;
    }

    case "storage": {
      ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
      const rate = Math.max(0.001, rt.rc.capacityRps * ctx.scale * f);
      if (rt.bucket && !consumeToken(rt.bucket, rate, ctx.now)) {
        failRequest(ctx, req, rt.id, ERR.overload);
        return;
      }
      const svc = rt.rc.latencyMs / f;
      req.serviceMs += svc;
      req.legServiceMs = svc;
      ctx.heap.push({ time: ctx.now + svc, type: "service", nodeId: rt.id, req });
      return;
    }

    case "server":
    case "cache":
    case "database":
    case "replica":
    case "worker": {
      ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
      if (rt.role === "cache") {
        // décision hit/miss tirée à l'arrivée (ordre déterministe des tirages)
        req.cacheDecision = req.isRead && ctx.rng.chance(rt.rc.hitRatio) ? "hit" : "miss";
      }
      arriveAtSlotNode(ctx, rt, req);
      return;
    }

    case "queue": {
      handleQueueArrival(ctx, rt, req);
      return;
    }
  }
}

/** Enqueue : acquitte la requête émettrice (202) et crée un message interne. */
function handleQueueArrival(ctx: SimContext, rt: NodeRuntime, req: SimRequest): void {
  ctx.metrics.beginVisit(rt.id, req.isRead, ctx.now);
  const depthCap = Math.max(1, Math.round(rt.rc.maxDepth * ctx.scale));
  if (rt.fifo.length >= depthCap) {
    failRequest(ctx, req, rt.id, ERR.queueFullAsync);
    return;
  }
  const msg = newRequest(ctx, req.generatorId, req.isRead, req.sizeKb, true, req.depth + 1);
  rt.fifo.push({ req: msg, enqueuedAt: ctx.now });
  ctx.metrics.setQueueLen(rt.id, rt.fifo.length, ctx.now);
  // acquittement : +2 ms si messages persistants
  const ack = rt.rc.persistMessages ? QUEUE_ACK_PERSIST_MS : 0;
  if (ack > 0) {
    req.serviceMs += ack;
    req.legServiceMs = ack;
    ctx.heap.push({ time: ctx.now + ack, type: "service", nodeId: rt.id, req });
  } else {
    completeRequest(ctx, req, rt.id, true); // 202 immédiat
  }
  ctx.heap.push({ time: ctx.now, type: "dispatch", nodeId: rt.id });
}

/* ============================================================
 * Fin de service — dispatch par rôle
 * ============================================================ */

function handleService(ctx: SimContext, rt: NodeRuntime, req: SimRequest): void {
  switch (rt.role) {
    case "server": {
      // erreur applicative aléatoire (composant + base du scénario)
      if (ctx.rng.chance(Math.min(1, rt.rc.errorRate + ctx.baseErrorRate))) {
        failRequest(ctx, req, rt.id, ERR.app);
        return;
      }
      const { targetId, fanout } = serverRouteTarget(ctx, rt, req.isRead);
      if (targetId !== null) {
        forwardTo(ctx, req, rt.id, targetId);
        return;
      }
      if (!fanout) {
        completeRequest(ctx, req, rt.id, true);
        return;
      }
      forwardFanout(ctx, rt, req);
      return;
    }

    case "cache": {
      if (req.cacheDecision === "hit") {
        ctx.metrics.addCacheHit(rt.id);
        completeRequest(ctx, req, rt.id, true);
        return;
      }
      // miss / écriture : fetch-through ou write-around vers SA base aval
      // (la frame serveur du cache est déjà empilée : connexion maintenue)
      forwardFanout(ctx, rt, req);
      return;
    }

    case "database":
    case "replica":
    case "storage": {
      completeRequest(ctx, req, rt.id, true);
      return;
    }

    case "worker": {
      completeWorkerMessage(ctx, rt, req);
      return;
    }

    case "queue": {
      // acquittement 202 différé (persistance)
      completeRequest(ctx, req, rt.id, true);
      return;
    }

    case "cdn": {
      if (req.cacheDecision === "hit") {
        completeRequest(ctx, req, rt.id, true);
        return;
      }
      forwardFanout(ctx, rt, req);
      return;
    }

    default: {
      completeRequest(ctx, req, rt.id, true);
    }
  }
}

/** Fin de traitement d'un message par un worker (asynchrone vis-à-vis du client). */
function completeWorkerMessage(ctx: SimContext, rt: NodeRuntime, req: SimRequest): void {
  const timedOut = req.legServiceMs > rt.rc.timeoutMs;
  if (timedOut) {
    // erreur asynchrone : la requête émettrice est déjà servie (202)
    failRequest(ctx, req, rt.id, ERR.workerTimeout);
  } else {
    completeRequest(ctx, req, rt.id, true);
    // effet de bord : écriture du résultat vers l'aval (profondeur bornée)
    if (req.depth < 2) {
      const { targetId, fanout } = serverRouteTarget(ctx, rt, false);
      if (targetId !== null) {
        const wr = newRequest(ctx, req.generatorId, false, req.sizeKb, true, req.depth + 1);
        forwardTo(ctx, wr, rt.id, targetId);
      } else if (fanout) {
        const wr = newRequest(ctx, req.generatorId, false, req.sizeKb, true, req.depth + 1);
        forwardFanout(ctx, rt, wr);
      }
    }
  }
  kickUpstreamQueues(ctx, rt.id);
}

/* ============================================================
 * Aiguillage des événements
 * ============================================================ */

export function processEvent(
  ctx: SimContext,
  ev: { type: string; nodeId: string; req?: SimRequest | null },
): void {
  switch (ev.type) {
    case "gen":
      handleGen(ctx, ev.nodeId);
      break;
    case "arrival": {
      const rt = ctx.nodes.get(ev.nodeId);
      if (!rt || !ev.req) break;
      handleArrival(ctx, rt, ev.req);
      break;
    }
    case "service": {
      const rt = ctx.nodes.get(ev.nodeId);
      if (!rt || !ev.req) break;
      handleService(ctx, rt, ev.req);
      break;
    }
    case "dispatch": {
      const rt = ctx.nodes.get(ev.nodeId);
      if (!rt) break;
      handleDispatch(ctx, rt);
      break;
    }
  }
}
