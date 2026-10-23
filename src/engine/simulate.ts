/**
 * SystemLab — point d'entrée du moteur de simulation.
 *
 * `runSimulation` exécute une simulation événementielle découpée en tranches
 * de temps réel (yield entre tranches, abort via AbortSignal, progression par
 * phase). Le déterminisme est garanti par le PRNG seedé : AUCUN Math.random
 * ni Date.now n'entre dans la trajectoire simulée (seuls startedAt/computeMs,
 * hors résultat métrique, utilisent l'horloge réelle).
 */
import type {
  ArchEdge,
  ArchitectureData,
  Diagnostic,
  RunOptions,
  ScenarioConfig,
  SimRole,
  SimulationProgress,
  SimulationResult,
  TrafficProfile,
} from "@/types";
import { shortId, clamp, formatNumber } from "@/lib/format";
import { getComponentById } from "@/data/catalog/registry";
import { EventHeap } from "./events";
import { Rng } from "./rng";
import { MetricsStore, aggregate } from "./metrics";
import { FailureEngine } from "./failures";
import { analyzeGraph } from "./graph";
import { processEvent, sweepFifos } from "./handlers";
import { buildDiagnostics } from "./diagnostics";
import {
  MAX_NODES,
  MAX_EVENTS,
  MAX_TOTAL_REQUESTS,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  MIN_RPS,
  MAX_RPS,
  makeTokenBucket,
  resolveRoleConfig,
  theoreticalCapacityRps,
  trafficProfileFactor,
} from "./runtime";
import type { NodeRuntime, RouteTargets, SimContext } from "./runtime";

export const ENGINE_VERSION = "1.0.0";

/* ============================================================
 * Normalisation du scénario
 * ============================================================ */

function finiteOr(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}

const PROFILES: readonly TrafficProfile[] = ["constant", "ramp", "spike", "waves", "random"];
const MODES: readonly ScenarioConfig["mode"][] = ["quick", "load", "stress", "endurance", "failure"];

function normalizeScenario(sc: ScenarioConfig | undefined): ScenarioConfig {
  const s = (sc ?? {}) as Partial<ScenarioConfig>;
  return {
    activeUsers: Math.max(1, finiteOr(s.activeUsers, 1000)),
    requestsPerSecond: finiteOr(s.requestsPerSecond, 100),
    durationSec: finiteOr(s.durationSec, 30),
    readRatio: clamp(finiteOr(s.readRatio, 0.8), 0, 1),
    networkLatencyMs: Math.max(0, finiteOr(s.networkLatencyMs, 40)),
    baseErrorRate: clamp(finiteOr(s.baseErrorRate, 0), 0, 1),
    requestSizeKb: Math.max(0.1, finiteOr(s.requestSizeKb, 10)),
    profile: oneOf(s.profile, PROFILES, "constant"),
    mode: oneOf(s.mode, MODES, "load"),
    seed: Math.floor(finiteOr(s.seed, 42)),
    budgetPerMonthUsd: Math.max(0, finiteOr(s.budgetPerMonthUsd, 1000)),
    failure: s.failure ?? null,
  };
}

/* ============================================================
 * Contexte de simulation
 * ============================================================ */

const SLOT_ROLES: ReadonlySet<SimRole> = new Set(["server", "worker", "cache", "database", "replica"]);

function buildContext(
  nodes: ArchitectureData["nodes"],
  edges: ArchEdge[],
  scenario: ScenarioConfig,
  scale: number,
  clampLog: string[],
): SimContext {
  const bucketCount = Math.round(clamp(scenario.durationSec, 12, 60));
  const bucketSec = scenario.durationSec / bucketCount;
  const metrics = new MetricsStore(bucketCount, bucketSec);
  const heap = new EventHeap();
  const rng = new Rng(scenario.seed);

  const nodeRuntimes = new Map<string, NodeRuntime>();
  const order: string[] = [];
  for (const n of nodes) {
    const comp = getComponentById(n.componentId);
    if (!comp) continue; // composant inconnu : ignoré (signalé par analyzeGraph)
    const role: SimRole = comp.simRole ?? "pass-through";
    const rc = resolveRoleConfig(n, clampLog);
    const rt: NodeRuntime = {
      id: n.id,
      label: n.label || comp.name || n.id,
      componentId: n.componentId,
      role,
      category: comp.category ?? null,
      maturity: comp.maturity,
      rc,
      slots: 1,
      fifo: [],
      fifoHead: 0,
      bucket: null,
      rlTokens: null,
      rlWindow: [],
      cb: new Map(),
      rr: 0,
      routes: null,
      outTargets: null,
      outLatencyMs: null,
    };
    switch (role) {
      case "server":
      case "worker":
        rt.slots = Math.max(1, Math.round(rc.instances * rc.maxConcurrencyPerInstance * scale));
        break;
      case "cache":
      case "database":
        rt.slots = Math.max(1, Math.round(rc.maxConnections * scale));
        break;
      case "replica":
        rt.slots = Math.max(1, Math.round(rc.instances * rc.maxConnections * scale));
        break;
      case "cdn":
        rt.bucket = makeTokenBucket(Math.max(0.001, rc.capacityRps * scale));
        break;
      case "balancer":
        rt.bucket = makeTokenBucket(Math.max(0.001, rc.capacityRps * Math.max(1, rc.instances) * scale));
        break;
      case "proxy":
      case "storage":
        rt.bucket = makeTokenBucket(Math.max(0.001, rc.capacityRps * scale));
        break;
      case "rate-limiter":
        rt.rlTokens = makeTokenBucket(Math.max(0.001, (rc.limit + rc.burst) * scale));
        break;
      default:
        break;
    }
    if (SLOT_ROLES.has(role)) metrics.setSlots(rt.id, rt.slots);
    nodeRuntimes.set(rt.id, rt);
    order.push(rt.id);
  }

  const out = new Map<string, { edge: ArchEdge; targetId: string }[]>();
  const rev = new Map<string, string[]>();
  for (const id of order) {
    out.set(id, []);
    rev.set(id, []);
  }
  for (const e of edges) {
    if (!nodeRuntimes.has(e.source) || !nodeRuntimes.has(e.target)) continue;
    out.get(e.source)?.push({ edge: e, targetId: e.target });
    rev.get(e.target)?.push(e.source);
  }

  // Précalcul des cibles de routage (supprime les map/filter par requête) :
  //  - serveurs/workers : listes aval groupées par rôle (serverRouteTarget) ;
  //  - balancers : cibles directes (l'ordre des arêtes est préservé — la
  //    santé reste évaluée dynamiquement au moment du choix) ;
  //  - tous : latence d'arête par cible (la 1re arête vers une cible gagne,
  //    exactement comme l'ancienne recherche linéaire de forwardTo).
  for (const id of order) {
    const rt = nodeRuntimes.get(id)!;
    const outs = out.get(id) ?? [];
    if (rt.role === "server" || rt.role === "worker") {
      const routes: RouteTargets = { caches: [], replicas: [], databases: [], queues: [] };
      for (const o of outs) {
        const t = nodeRuntimes.get(o.targetId);
        if (!t) continue;
        if (t.role === "cache") routes.caches.push(o.targetId);
        else if (t.role === "replica") routes.replicas.push(o.targetId);
        else if (t.role === "database") routes.databases.push(o.targetId);
        else if (t.role === "queue") routes.queues.push(o.targetId);
      }
      rt.routes = routes;
    }
    if (rt.role === "balancer") {
      rt.outTargets = outs.map((o) => o.targetId);
    }
    const latency = new Map<string, number>();
    for (const o of outs) {
      if (!latency.has(o.targetId)) latency.set(o.targetId, Math.max(0, o.edge.networkLatencyMs));
    }
    rt.outLatencyMs = latency;
  }

  const generators = order.filter((id) => nodeRuntimes.get(id)?.role === "generator");
  const genTotalWeight = generators.reduce(
    (s, id) => s + Math.max(0.001, nodeRuntimes.get(id)!.rc.weight),
    0,
  );

  const ctx: SimContext = {
    nodes: nodeRuntimes,
    order,
    out,
    rev,
    heap,
    rng,
    metrics,
    failure: new FailureEngine(scenario.failure ? [scenario.failure] : []),
    durationMs: scenario.durationSec * 1000,
    durationSec: scenario.durationSec,
    rps: scenario.requestsPerSecond,
    readRatio: scenario.readRatio,
    requestSizeKb: scenario.requestSizeKb,
    baseErrorRate: scenario.baseErrorRate,
    networkLatencyMs: scenario.networkLatencyMs,
    profile: scenario.profile,
    scale,
    genTotalWeight,
    loopKilled: 0,
    requestsCreated: 0,
    maxRequests: MAX_TOTAL_REQUESTS,
    fanoutDropped: 0,
    reqSeq: 1,
    now: 0,
  };

  // premières arrivées : processus de Poisson amorcé à t=0 (tirage seedé)
  for (const id of generators) {
    const rt = nodeRuntimes.get(id)!;
    const share = rt.rc.weight / Math.max(0.001, genTotalWeight);
    const factor = trafficProfileFactor(ctx.profile, 0, ctx.durationSec, ctx.rng);
    const lambda = Math.max(0, ctx.rps * factor * ctx.scale * share);
    const t = lambda > 0 ? ctx.rng.expovariateMs(lambda) : 0;
    ctx.heap.push({ time: t, type: "gen", nodeId: id });
  }
  return ctx;
}

/* ============================================================
 * Boucle événementielle découpée
 * ============================================================ */

function makeAbortError(): Error {
  const e = new Error("Simulation interrompue (abort).");
  e.name = "AbortError";
  return e;
}

/** Journal de progression interne (phase, progression 0-1, détails). */
type Reporter = (phase: string, progress: number, extra?: Partial<SimulationProgress>) => void;

async function runEventLoop(
  ctx: SimContext,
  opts: RunOptions | undefined,
  report: Reporter,
): Promise<void> {
  const signal = opts?.signal;
  if (signal?.aborted) throw makeAbortError();
  const sliceMs = Math.max(1, opts?.sliceMs ?? 16);
  let sliceStart = Date.now();
  let processed = 0;
  const bucketMs = ctx.metrics.bucketSec * 1000;
  let nextBoundary = 1;

  report("Simulation événementielle", 0.1, {
    virtualTimeSec: 0,
    detail: `${ctx.heap.size} événements initiaux`,
  });

  for (;;) {
    const ev = ctx.heap.peek();
    if (!ev || ev.time > ctx.durationMs) break;
    ctx.heap.pop();
    ctx.now = Math.max(ctx.now, ev.time);
    // instantanés de fin de bucket (séries files/utilisation)
    while (nextBoundary < ctx.metrics.bucketCount && ctx.now >= nextBoundary * bucketMs) {
      ctx.metrics.onBucketBoundary(nextBoundary - 1);
      nextBoundary++;
    }
    processEvent(ctx, ev);
    processed++;
    if ((processed & 511) === 0) {
      if (signal?.aborted) throw makeAbortError();
      if (Date.now() - sliceStart >= sliceMs) {
        report(
          "Simulation événementielle",
          0.1 + 0.8 * Math.min(1, ctx.now / ctx.durationMs),
          { virtualTimeSec: ctx.now / 1000 },
        );
        await new Promise((r) => setTimeout(r, 0));
        sliceStart = Date.now();
      }
    }
  }
  ctx.metrics.onBucketBoundary(ctx.metrics.bucketCount - 1);
}

/* ============================================================
 * Drain de fin de fenêtre
 *
 * La boucle principale coupe net à durationMs : les requêtes EN VOL (services
 * en cours, routages intermédiaires, files non vides) restaient sans verdict —
 * inFlight résiduel, « faux lag » de file et invariant arrivées ≠ traités +
 * rejets + erreurs rompu. La phase de drain poursuit le tas jusqu'à
 * épuisement SANS nouvelles arrivées externes, avec trois garde-fous :
 *   (a) les événements « gen » au-delà de durationMs sont ignorés ;
 *   (b) cap de temps virtuel : au-delà de 1,5 × durationMs, les événements
 *       restants sont abandonnés (requêtes tronquées — hypothèse émise) ;
 *   (c) cap de temps réel : 1 500 ms maximum pour toute la phase.
 * Un balayage final des files couvre les drains internes coupés par leur
 * tranche coopérative (16 ms) : les entrées restantes avec slots libres
 * repartent, les files restantes à workers saturés sont du VRAI lag.
 * ============================================================ */

const DRAIN_REAL_CAP_MS = 1_500;
const DRAIN_VIRTUAL_CAP_FACTOR = 1.5;

async function runDrainPhase(
  ctx: SimContext,
  opts: RunOptions | undefined,
  report: Reporter,
): Promise<void> {
  const signal = opts?.signal;
  if (signal?.aborted) throw makeAbortError();
  const sliceMs = Math.max(1, opts?.sliceMs ?? 16);
  const virtualCapMs = ctx.durationMs * DRAIN_VIRTUAL_CAP_FACTOR;
  const realDeadline = Date.now() + DRAIN_REAL_CAP_MS;
  let sliceStart = Date.now();
  let processed = 0;

  report("Drain de fin", 0.9, {
    virtualTimeSec: ctx.now / 1000,
    detail: "résolution des requêtes en vol",
  });

  for (;;) {
    for (;;) {
      const ev = ctx.heap.peek();
      if (!ev) break; // tas épuisé
      if (ev.type === "gen") {
        // (a) pas de nouvelles arrivées externes au-delà de la fenêtre
        ctx.heap.pop();
        continue;
      }
      if (ev.time > virtualCapMs) break; // (b) cap virtuel — abandonné
      ctx.heap.pop();
      ctx.now = Math.max(ctx.now, ev.time);
      processEvent(ctx, ev);
      processed++;
      if ((processed & 511) === 0) {
        if (signal?.aborted) throw makeAbortError();
        if (Date.now() - sliceStart >= sliceMs) {
          // (c) cap temps réel global
          if (Date.now() > realDeadline) return;
          report(
            "Drain de fin",
            0.9 + 0.05 * clamp((ctx.now - ctx.durationMs) / (virtualCapMs - ctx.durationMs), 0, 1),
            { virtualTimeSec: ctx.now / 1000 },
          );
          await new Promise((r) => setTimeout(r, 0));
          sliceStart = Date.now();
        }
      }
    }
    // balayage des files restantes (drains internes coupés en tranche) :
    // sans progression → les files restantes sont du vrai lag (workers
    // saturés) — rien de plus à solder.
    if (Date.now() > realDeadline) return;
    if (sweepFifos(ctx) === 0) return;
  }
}

/* ============================================================
 * Hypothèses du modèle
 * ============================================================ */

const HYPOTHESES: string[] = [
  "Échantillonnage : au-delà de 100 000 requêtes (rps × durée), seule une fraction du trafic est réellement simulée ; les compteurs de débit et de volume sont remis à l'échelle, les latences et les files restent des observations par requête.",
  "Budget de fan-out : le nombre TOTAL de requêtes créées (arrivées externes + clones internes de fan-out + messages + effets de bord) est plafonné à 1 200 000 ; au-delà, les clones additionnels sont abandonnés (le chemin principal continue) et un clamp « fan-out tronqué » est émis.",
  "Files d'attente approchées : une file FIFO unique par nœud (sans priorités ni pools par instance) ; la concurrence est modélisée par un pool de slots borné.",
  "Latence réseau : le trajet retour vaut exactement le trajet aller (réseau symétrique) ; le temps de traversée des nœuds au retour n'est pas compté.",
  "Écritures : write-around par défaut — les écritures traversent le cache sans le mettre à jour ; aucune invalidation ni expiration de cache n'est simulée.",
  "Routage mono-cible : un serveur relié à plusieurs caches/bases/files n'envoie chaque requête que vers le PREMIER d'entre eux (caches[0]/databases[0]…) — pas de répartition ni de parallélisation des appels aval ; seuls les proxys/pass-through font un vrai fan-out (clones internes).",
  "Erreurs applicatives : le taux d'erreur effectif d'un serveur est la SOMME du taux du composant et du taux de base du scénario (errorRate + baseErrorRate, plafonné à 100 %).",
  "Disponibilité : calculée comme 1 − taux d'erreur observé sur la fenêtre simulée ; ni MTBF/MTTR réels, ni pannes hors scénario injecté.",
  "Coûts : ordres de grandeur (±30 %) sur des tarifs cloud publics moyens 2025 — à lire comme des comparatifs entre variantes, pas comme des devis.",
  "Composants visuels (maturité « visuel ») : pass-through neutre (1 ms, capacité illimitée) — sans effet sur les résultats.",
  "Reproductibilité : à seed et scénario identiques, la trajectoire est identique (PRNG mulberry32, ordre des événements déterministe) ; aucun aléa hors graine — exception documentée : la soupape de tranche des drains internes (16 ms) peut, sur un graphe pathologique, dépendre du temps réel.",
];

/* ============================================================
 * API publique
 * ============================================================ */

export async function runSimulation(
  arch: ArchitectureData,
  opts?: RunOptions,
): Promise<SimulationResult> {
  const t0 = Date.now();
  const startedAt = new Date(t0).toISOString();
  // onProgress PROTÉGÉ : un callback défaillant (exception, setState sur un
  // composant démonté…) ne doit jamais interrompre la simulation elle-même.
  const report = (phase: string, progress: number, extra?: Partial<SimulationProgress>): void => {
    try {
      opts?.onProgress?.({ phase, progress, ...extra });
    } catch {
      /* callback défaillant : ignoré */
    }
  };

  /* --- phase 1 : analyse du graphe --- */
  report("Analyse du graphe", 0);
  const analysis = analyzeGraph(arch);
  if (!analysis.hasGenerator) {
    throw new Error(
      "Aucune source de trafic : ajoutez un Utilisateur ou un Générateur de trafic avant de simuler.",
    );
  }

  const clamps: string[] = [];
  let keptNodes = arch.nodes ?? [];
  if (keptNodes.length > MAX_NODES) {
    clamps.push(`${keptNodes.length} nœuds → ${MAX_NODES} simulés (le surplus est ignoré)`);
    keptNodes = keptNodes.slice(0, MAX_NODES);
  }
  const keptIds = new Set(keptNodes.map((n) => n.id));
  const keptEdges = (arch.edges ?? []).filter((e) => keptIds.has(e.source) && keptIds.has(e.target));

  const rawScenario = normalizeScenario(arch.scenario);
  const durationSec = Math.round(clamp(rawScenario.durationSec, MIN_DURATION_SEC, MAX_DURATION_SEC));
  if (durationSec !== rawScenario.durationSec) {
    clamps.push(
      `durée ${rawScenario.durationSec} s → ${durationSec} s (bornes ${MIN_DURATION_SEC}–${MAX_DURATION_SEC} s)`,
    );
  }
  const rps = Math.round(clamp(rawScenario.requestsPerSecond, MIN_RPS, MAX_RPS));
  if (rps !== rawScenario.requestsPerSecond) {
    clamps.push(
      `trafic ${rawScenario.requestsPerSecond} → ${rps} req/s (bornes ${MIN_RPS}–${MAX_RPS})`,
    );
  }
  const scenario: ScenarioConfig = { ...rawScenario, durationSec, requestsPerSecond: rps };

  /* --- phase 2 : initialisation --- */
  report("Initialisation", 0.05);
  const estimatedRequests = rps * durationSec;
  const scale = estimatedRequests > MAX_EVENTS ? MAX_EVENTS / estimatedRequests : 1;
  const ctx = buildContext(keptNodes, keptEdges, scenario, scale, clamps);

  /* --- phase 3 : simulation événementielle --- */
  await runEventLoop(ctx, opts, report);

  /* --- phase 3bis : drain de fin de fenêtre (requêtes en vol) --- */
  await runDrainPhase(ctx, opts, report);

  /* --- clamps posts-exécution --- */
  if (ctx.fanoutDropped > 0) {
    clamps.push(
      `fan-out tronqué : ${formatNumber(ctx.fanoutDropped)} clones de fan-out abandonnés — budget global de ${formatNumber(MAX_TOTAL_REQUESTS)} requêtes simulées atteint (le chemin principal de chaque requête est préservé)`,
    );
  }
  // plusieurs nœuds peuvent produire le même message de clamp de config
  const uniqueClamps = [...new Set(clamps)];

  /* --- phase 4 : agrégation --- */
  report("Agrégation", 0.95);
  const runtimes = ctx.order.map((id) => ctx.nodes.get(id)!);
  const workerDrainRps = new Map<string, number>();
  for (const rt of runtimes) {
    if (rt.role !== "queue") continue;
    let drain = 0;
    for (const o of ctx.out.get(rt.id) ?? []) {
      const w = ctx.nodes.get(o.targetId);
      if (w && w.role === "worker") drain += theoreticalCapacityRps("worker", w.rc, scenario.readRatio);
    }
    workerDrainRps.set(rt.id, drain);
  }
  const agg = aggregate({
    runtimes,
    store: ctx.metrics,
    scale,
    durationSec,
    rps,
    requestSizeKb: scenario.requestSizeKb,
    readRatio: scenario.readRatio,
    failure: ctx.failure,
    workerDrainRps,
  });

  /* --- phase 5 : diagnostics --- */
  report("Diagnostics", 0.97);
  // requêtes clientes encore en vol à la fin (drain borné) : tronquées
  const cutInFlight = Math.max(
    0,
    ctx.metrics.generated - ctx.metrics.served - ctx.metrics.rejected - ctx.metrics.errored,
  );
  const diagnostics: Diagnostic[] = buildDiagnostics({
    runtimes,
    nodes: agg.nodes,
    extras: agg.extras,
    overall: agg.overall,
    graph: analysis,
    scenario,
    scale,
    loopKilled: ctx.loopKilled,
    clamps: uniqueClamps,
    cutInFlight,
  });
  report("Terminé", 1);

  const hypotheses = [...HYPOTHESES];
  if (cutInFlight > 0) {
    hypotheses.push(
      `${formatNumber(Math.round(cutInFlight / scale))} requêtes encore en vol à la fin de la fenêtre ont été tronquées : le drain de fin (bornes 1,5 × durée en temps virtuel, 1 500 ms en temps réel) n'a pas pu les solder — elles ne comptent ni comme servies, ni comme rejetées, ni comme erreurs.`,
    );
  }

  const computeMs = Date.now() - t0;
  return {
    id: shortId("sim"),
    architectureId: "local",
    architectureName: arch.name || "Architecture",
    engineVersion: ENGINE_VERSION,
    mode: "event-sampled",
    seed: scenario.seed,
    startedAt,
    computeMs,
    scenario,
    snapshot: {
      nodes: keptNodes,
      edges: keptEdges,
      zones: arch.zones ?? [],
    },
    overall: agg.overall,
    nodes: agg.nodes,
    series: agg.series,
    requestsSimulated: ctx.metrics.generated,
    samplingRate: scale,
    hypotheses,
    diagnostics,
  };
}
