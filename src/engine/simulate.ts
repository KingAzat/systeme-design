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
import { shortId, clamp } from "@/lib/format";
import { getComponentById } from "@/data/catalog/registry";
import { EventHeap } from "./events";
import { Rng } from "./rng";
import { MetricsStore, aggregate } from "./metrics";
import { FailureEngine } from "./failures";
import { analyzeGraph } from "./graph";
import { processEvent } from "./handlers";
import { buildDiagnostics } from "./diagnostics";
import {
  MAX_NODES,
  MAX_EVENTS,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  MIN_RPS,
  MAX_RPS,
  makeTokenBucket,
  resolveRoleConfig,
  theoreticalCapacityRps,
  trafficProfileFactor,
} from "./runtime";
import type { NodeRuntime, SimContext } from "./runtime";

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
    const rc = resolveRoleConfig(n);
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
      bucket: null,
      rlTokens: null,
      rlWindow: [],
      cb: new Map(),
      rr: 0,
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
 * Hypothèses du modèle
 * ============================================================ */

const HYPOTHESES: string[] = [
  "Échantillonnage : au-delà de 100 000 requêtes (rps × durée), seule une fraction du trafic est réellement simulée ; les compteurs de débit et de volume sont remis à l'échelle, les latences et les files restent des observations par requête.",
  "Files d'attente approchées : une file FIFO unique par nœud (sans priorités ni pools par instance) ; la concurrence est modélisée par un pool de slots borné.",
  "Latence réseau : le trajet retour vaut exactement le trajet aller (réseau symétrique) ; le temps de traversée des nœuds au retour n'est pas compté.",
  "Écritures : write-around par défaut — les écritures traversent le cache sans le mettre à jour ; aucune invalidation ni expiration de cache n'est simulée.",
  "Disponibilité : calculée comme 1 − taux d'erreur observé sur la fenêtre simulée ; ni MTBF/MTTR réels, ni pannes hors scénario injecté.",
  "Coûts : ordres de grandeur (±30 %) sur des tarifs cloud publics moyens 2025 — à lire comme des comparatifs entre variantes, pas comme des devis.",
  "Composants visuels (maturité « visuel ») : pass-through neutre (1 ms, capacité illimitée) — sans effet sur les résultats.",
  "Reproductibilité : à seed et scénario identiques, la trajectoire est identique (PRNG mulberry32, ordre des événements déterministe) ; aucun aléa hors graine.",
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
  const report = (phase: string, progress: number, extra?: Partial<SimulationProgress>): void => {
    opts?.onProgress?.({ phase, progress, ...extra });
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
  const ctx = buildContext(keptNodes, keptEdges, scenario, scale);

  /* --- phase 3 : simulation événementielle --- */
  await runEventLoop(ctx, opts, report);

  /* --- phase 4 : agrégation --- */
  report("Agrégation", 0.9);
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
  report("Diagnostics", 0.95);
  const diagnostics: Diagnostic[] = buildDiagnostics({
    runtimes,
    nodes: agg.nodes,
    extras: agg.extras,
    overall: agg.overall,
    graph: analysis,
    scenario,
    scale,
    loopKilled: ctx.loopKilled,
    clamps,
  });
  report("Terminé", 1);

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
    hypotheses: HYPOTHESES,
    diagnostics,
  };
}
