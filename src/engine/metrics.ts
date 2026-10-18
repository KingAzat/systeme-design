/**
 * SystemLab — collecte et agrégation des métriques.
 *
 * MetricsStore accumule, pendant la simulation :
 *   - par nœud : compteurs (arrivées/traités/rejets/erreurs), occupation des
 *     slots (aire pondérée en temps), longueur de file (aire + max), échantillons
 *     d'attente, temps de service, temps sous-arbre aval, circuit breakers ;
 *   - globalement : requêtes générées/servies/rejetées/en erreur par bucket,
 *     échantillons de latence bout-en-bout par bucket.
 *
 * Les compteurs vivent dans le domaine ÉCHANTILLONNÉ ; l'agrégation remet à
 * l'échelle (× 1/samplingRate) les débits et volumes, jamais les latences.
 */
import type { NodeMetrics, OverallMetrics, SimulationSeries, SimRole, TimePoint } from "@/types";
import { theoreticalCapacityRps, UNBOUNDED_RPS } from "./runtime";
import type { NodeRuntime, RoleConfig } from "./runtime";
import { nodeCostPerMonth } from "./cost";
import type { FailureEngine } from "./failures";

/* ============================================================
 * Accumulateurs par nœud
 * ============================================================ */

export interface NodeAcc {
  arrivals: number;
  arrivalsRead: number;
  arrivalsWrite: number;
  processed: number;
  rejected: number;
  errors: number;
  timeouts: number;
  cacheHits: number;
  /** Slots/connexions occupés (instantané) et aire pondérée. */
  slotsBusy: number;
  slots: number;
  slotsBusyAreaMs: number;
  lastBusyT: number;
  /** Utilisation instantanée max (slotsBusy / slots). */
  utilMax: number;
  /** Requêtes présentes (arrivées − terminées) + max. */
  inFlight: number;
  inFlightMax: number;
  /** File FIFO / profondeur : instantané, aire, max. */
  queueLen: number;
  queueLenMax: number;
  queueAreaMs: number;
  lastQueueT: number;
  /** Échantillons (ms) — observations par requête, non remises à l'échelle. */
  waitSamples: number[];
  serviceSumMs: number;
  serviceCount: number;
  /** Temps écoulé entre routage aval et retour (servers) — règle cascade. */
  downstreamSamples: number[];
  connExhaustedErrors: number;
  cbOpenCount: number;
  cbLastOpenAtMs: number | null;
  /** Séries par bucket. */
  bucketBusy: number[];
  bucketArrivals: number[];
  bucketQueueLen: number[];
}

/* ============================================================
 * Store
 * ============================================================ */

export class MetricsStore {
  readonly bucketCount: number;
  readonly bucketSec: number;
  private readonly bucketMs: number;
  private readonly accs = new Map<string, NodeAcc>();

  /* Compteurs globaux (requêtes clientes, domaine échantillonné).
   * Publics (lecture seule) : l'agrégation `aggregate` du même module les
   * remet à l'échelle pour construire les séries temporelles. */
  generated = 0;
  served = 0;
  rejected = 0;
  errored = 0;
  readonly bucketGenerated: number[];
  readonly bucketServed: number[];
  readonly bucketRejected: number[];
  readonly bucketErrored: number[];
  readonly latencyByBucket: number[][];

  constructor(bucketCount: number, bucketSec: number) {
    this.bucketCount = bucketCount;
    this.bucketSec = bucketSec;
    this.bucketMs = bucketSec * 1000;
    this.bucketGenerated = new Array<number>(bucketCount).fill(0);
    this.bucketServed = new Array<number>(bucketCount).fill(0);
    this.bucketRejected = new Array<number>(bucketCount).fill(0);
    this.bucketErrored = new Array<number>(bucketCount).fill(0);
    this.latencyByBucket = Array.from({ length: bucketCount }, () => [] as number[]);
  }

  acc(nodeId: string): NodeAcc {
    let a = this.accs.get(nodeId);
    if (a === undefined) {
      a = {
        arrivals: 0,
        arrivalsRead: 0,
        arrivalsWrite: 0,
        processed: 0,
        rejected: 0,
        errors: 0,
        timeouts: 0,
        cacheHits: 0,
        slotsBusy: 0,
        slots: 1,
        slotsBusyAreaMs: 0,
        lastBusyT: 0,
        utilMax: 0,
        inFlight: 0,
        inFlightMax: 0,
        queueLen: 0,
        queueLenMax: 0,
        queueAreaMs: 0,
        lastQueueT: 0,
        waitSamples: [],
        serviceSumMs: 0,
        serviceCount: 0,
        downstreamSamples: [],
        connExhaustedErrors: 0,
        cbOpenCount: 0,
        cbLastOpenAtMs: null,
        bucketBusy: new Array<number>(this.bucketCount).fill(0),
        bucketArrivals: new Array<number>(this.bucketCount).fill(0),
        bucketQueueLen: new Array<number>(this.bucketCount).fill(0),
      };
      this.accs.set(nodeId, a);
    }
    return a;
  }

  bucketOf(tMs: number): number {
    const b = Math.floor(tMs / this.bucketMs);
    return Math.min(this.bucketCount - 1, Math.max(0, b));
  }

  /* --- visites --- */

  beginVisit(nodeId: string, isRead: boolean, tMs: number): void {
    const a = this.acc(nodeId);
    a.arrivals++;
    if (isRead) a.arrivalsRead++;
    else a.arrivalsWrite++;
    a.inFlight++;
    if (a.inFlight > a.inFlightMax) a.inFlightMax = a.inFlight;
    a.bucketArrivals[this.bucketOf(tMs)]++;
  }

  endVisit(nodeId: string): void {
    const a = this.acc(nodeId);
    a.inFlight--;
  }

  /* --- slots (concurrence / connexions) --- */

  setSlots(nodeId: string, slots: number): void {
    this.acc(nodeId).slots = Math.max(0.001, slots);
  }

  takeSlot(nodeId: string, tMs: number): void {
    const a = this.acc(nodeId);
    this.settleBusy(a, tMs);
    a.slotsBusy++;
    const u = a.slotsBusy / a.slots;
    if (u > a.utilMax) a.utilMax = u;
  }

  releaseSlot(nodeId: string, tMs: number): void {
    const a = this.acc(nodeId);
    this.settleBusy(a, tMs);
    a.slotsBusy = Math.max(0, a.slotsBusy - 1);
  }

  /** Intègre l'aire d'occupation depuis la dernière mise à jour, par bucket. */
  private settleBusy(a: NodeAcc, tMs: number): void {
    if (tMs <= a.lastBusyT) return;
    const dt = tMs - a.lastBusyT;
    if (a.slotsBusy > 0) {
      a.slotsBusyAreaMs += dt * a.slotsBusy;
      this.distribute(a.lastBusyT, tMs, a.slotsBusy, (b, area) => {
        a.bucketBusy[b] += area;
      });
    }
    a.lastBusyT = tMs;
  }

  /* --- files --- */

  setQueueLen(nodeId: string, len: number, tMs: number): void {
    const a = this.acc(nodeId);
    if (tMs > a.lastQueueT) {
      const dt = tMs - a.lastQueueT;
      if (a.queueLen > 0) a.queueAreaMs += dt * a.queueLen;
      a.lastQueueT = tMs;
    }
    a.queueLen = len;
    if (len > a.queueLenMax) a.queueLenMax = len;
  }

  /** Instantané de fin de bucket (séries « queues »). */
  onBucketBoundary(bucketIdx: number): void {
    for (const a of this.accs.values()) {
      a.bucketQueueLen[bucketIdx] = a.queueLen;
    }
  }

  /* --- compteurs de nœud --- */

  addProcessed(nodeId: string): void {
    this.acc(nodeId).processed++;
  }

  addRejected(nodeId: string): void {
    this.acc(nodeId).rejected++;
  }

  addError(nodeId: string, code: string): void {
    const a = this.acc(nodeId);
    a.errors++;
    if (code === "timeout-504" || code === "worker-timeout") a.timeouts++;
    if (code === "conn-exhausted") a.connExhaustedErrors++;
  }

  addCacheHit(nodeId: string): void {
    this.acc(nodeId).cacheHits++;
  }

  addCircuitOpen(nodeId: string, tMs: number): void {
    const a = this.acc(nodeId);
    a.cbOpenCount++;
    a.cbLastOpenAtMs = tMs;
  }

  sampleWait(nodeId: string, ms: number): void {
    if (ms > 0) this.acc(nodeId).waitSamples.push(ms);
  }

  sampleService(nodeId: string, ms: number): void {
    const a = this.acc(nodeId);
    a.serviceSumMs += ms;
    a.serviceCount++;
  }

  sampleDownstream(nodeId: string, ms: number): void {
    if (ms > 0) this.acc(nodeId).downstreamSamples.push(ms);
  }

  /* --- compteurs globaux (requêtes clientes) --- */

  onGenerated(tMs: number): void {
    this.generated++;
    this.bucketGenerated[this.bucketOf(tMs)]++;
  }

  onServed(tMs: number, latencyMs: number): void {
    this.served++;
    this.bucketServed[this.bucketOf(tMs)]++;
    this.latencyByBucket[this.bucketOf(tMs)].push(latencyMs);
  }

  onRejected(tMs: number): void {
    this.rejected++;
    this.bucketRejected[this.bucketOf(tMs)]++;
  }

  onError(tMs: number): void {
    this.errored++;
    this.bucketErrored[this.bucketOf(tMs)]++;
  }

  /** Répartit une aire [from, to) sur les buckets traversés. */
  private distribute(
    from: number,
    to: number,
    perMs: number,
    add: (bucket: number, areaMs: number) => void,
  ): void {
    if (to <= from || perMs <= 0) return;
    let b0 = Math.floor(from / this.bucketMs);
    if (b0 > this.bucketCount - 1) return;
    if (b0 < 0) b0 = 0;
    const bEnd = Math.min(this.bucketCount - 1, Math.floor((to - 1e-9) / this.bucketMs));
    if (b0 === bEnd) {
      add(b0, (to - from) * perMs);
      return;
    }
    add(b0, ((b0 + 1) * this.bucketMs - from) * perMs);
    for (let b = b0 + 1; b < bEnd; b++) add(b, this.bucketMs * perMs);
    add(bEnd, (to - bEnd * this.bucketMs) * perMs);
  }
}

/* ============================================================
 * Agrégation finale
 * ============================================================ */

export interface NodeExtra {
  nodeId: string;
  /** p95 du temps sous-arbre aval (ms) — règle « cascade de timeouts ». */
  downstreamP95Ms: number;
  cbOpenCount: number;
  cbLastOpenAtSec: number | null;
  connExhaustedErrors: number;
  readArrivals: number;
  writeArrivals: number;
  queueDepthEnd: number;
  queueDepthMax: number;
}

export interface AggregateInput {
  runtimes: NodeRuntime[];
  store: MetricsStore;
  scale: number;
  durationSec: number;
  rps: number;
  requestSizeKb: number;
  readRatio: number;
  failure: FailureEngine;
  /** Capacité de consommation par nœud file (req/s nominales). */
  workerDrainRps: Map<string, number>;
}

export interface AggregateOutput {
  nodes: NodeMetrics[];
  series: SimulationSeries;
  overall: OverallMetrics;
  extras: Map<string, NodeExtra>;
}

/** Percentile par rang le plus proche (tableau trié croissant). */
export function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
  return sorted[idx];
}

function sortedCopy(arr: number[]): number[] {
  const c = [...arr];
  c.sort((x, y) => x - y);
  return c;
}

const SLOT_ROLES: ReadonlySet<string> = new Set(["server", "worker", "cache", "database", "replica"]);
const RATE_ROLES: ReadonlySet<string> = new Set(["cdn", "balancer", "rate-limiter", "proxy", "storage"]);

/** Utilisation par nœud : moyenne, max, et valeur par bucket (séries). */
function utilizationSeries(
  role: SimRole,
  rc: RoleConfig,
  a: NodeAcc,
  input: AggregateInput,
  capacityNominal: number,
): { mean: number; max: number; buckets: number[] } {
  const { scale, durationSec } = input;
  const durationMs = durationSec * 1000;
  const buckets = new Array<number>(a.bucketBusy.length);
  if (SLOT_ROLES.has(role)) {
    const slots = Math.max(0.001, a.slots);
    for (let b = 0; b < buckets.length; b++) buckets[b] = a.bucketBusy[b] / (slots * input.store.bucketSec * 1000);
    return {
      mean: a.slotsBusyAreaMs / (slots * durationMs),
      max: a.utilMax,
      buckets,
    };
  }
  if (role === "queue") {
    const capS = Math.max(1, rc.maxDepth * scale);
    for (let b = 0; b < buckets.length; b++) buckets[b] = a.bucketQueueLen[b] / capS;
    return {
      mean: a.queueAreaMs / (capS * durationMs),
      max: a.queueLenMax / capS,
      buckets,
    };
  }
  if (role === "generator") {
    // Un générateur n'est pas une ressource : aucune saturation possible.
    // Utilisation forcée à 0 (le « 106 % » observé venait du ratio
    // arrivées/cible — sans signification physique).
    buckets.fill(0);
    return { mean: 0, max: 0, buckets };
  }
  // cdn, balancer, rate-limiter, proxy, storage, circuit-breaker, pass-through
  const capS = Math.max(0.001, capacityNominal * scale);
  for (let b = 0; b < buckets.length; b++) buckets[b] = a.bucketArrivals[b] / (capS * input.store.bucketSec);
  return {
    mean: a.arrivals / (capS * durationSec),
    max: Math.max(0, ...buckets),
    buckets,
  };
}

export function aggregate(input: AggregateInput): AggregateOutput {
  const { runtimes, store, scale, durationSec, requestSizeKb, readRatio, failure } = input;
  const k = scale > 0 ? 1 / scale : 1; // facteur de remise à l'échelle
  const nodes: NodeMetrics[] = [];
  const extras = new Map<string, NodeExtra>();

  for (const rt of runtimes) {
    const a = store.acc(rt.id);
    const drain = input.workerDrainRps.get(rt.id) ?? 0;
    const capNominal =
      rt.role === "generator" ? UNBOUNDED_RPS : theoreticalCapacityRps(rt.role, rt.rc, readRatio, drain);
    const util = utilizationSeries(rt.role, rt.rc, a, input, capNominal);

    const arrivals = a.arrivals * k;
    const processed = a.processed * k;
    const rejected = a.rejected * k;
    const errors = a.errors * k;
    const throughputRps = processed / durationSec;
    const waits = sortedCopy(a.waitSamples);
    const outageSec = failure.outageSec(rt.id, durationSec);

    const nm: NodeMetrics = {
      nodeId: rt.id,
      label: rt.label,
      componentId: rt.componentId,
      arrivals,
      processed,
      rejected,
      errors,
      timeouts: a.timeouts * k,
      throughputRps,
      capacityRps: capNominal,
      utilization: util.mean,
      utilizationMax: util.max,
      avgQueueLength: (a.queueAreaMs / (durationSec * 1000)) * k,
      maxQueueLength: a.queueLenMax * k,
      avgWaitMs:
        a.waitSamples.length > 0
          ? a.waitSamples.reduce((s, v) => s + v, 0) / a.waitSamples.length
          : 0,
      p95WaitMs: percentile(waits, 0.95),
      avgServiceMs: a.serviceCount > 0 ? a.serviceSumMs / a.serviceCount : 0,
      inFlightMax: a.inFlightMax,
      availability: Math.max(0, 1 - outageSec / durationSec),
      errorRate: arrivals > 0 ? errors / arrivals : 0,
      costPerMonthUsd: nodeCostPerMonth(rt.role, rt.rc, rt.componentId, throughputRps, requestSizeKb),
    };
    if (rt.role === "cache" || rt.role === "cdn") {
      nm.cacheHits = a.cacheHits * k;
      nm.cacheHitRate = a.arrivalsRead > 0 ? a.cacheHits / a.arrivalsRead : 0;
    }
    nodes.push(nm);

    const downstream = sortedCopy(a.downstreamSamples);
    extras.set(rt.id, {
      nodeId: rt.id,
      downstreamP95Ms: percentile(downstream, 0.95),
      cbOpenCount: a.cbOpenCount,
      cbLastOpenAtSec: a.cbLastOpenAtMs === null ? null : a.cbLastOpenAtMs / 1000,
      connExhaustedErrors: a.connExhaustedErrors * k,
      readArrivals: a.arrivalsRead,
      writeArrivals: a.arrivalsWrite,
      queueDepthEnd: a.queueLen * k,
      queueDepthMax: a.queueLenMax * k,
    });
  }

  /* --- séries temporelles --- */
  const bucketCount = store.bucketCount;
  const bs = store.bucketSec;
  const throughput: TimePoint[] = [];
  const latency: TimePoint[] = [];
  const errorsSeries: TimePoint[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const t = b * bs;
    throughput.push({
      t,
      inputRps: (store.bucketGenerated[b] * k) / bs,
      servedRps: (store.bucketServed[b] * k) / bs,
      rejectedRps: (store.bucketRejected[b] * k) / bs,
    });
    const samples = store.latencyByBucket[b];
    latency.push({
      t,
      avgMs: samples.length > 0 ? samples.reduce((s, v) => s + v, 0) / samples.length : 0,
      p95Ms: percentile(sortedCopy(samples), 0.95),
    });
    errorsSeries.push({
      t,
      errors: store.bucketErrored[b] * k,
      rejects: store.bucketRejected[b] * k,
    });
  }

  /* files : 5 nœuds avec la plus grande longueur max (domaine réel) */
  const queueRanked = runtimes
    .map((rt) => ({ rt, a: store.acc(rt.id) }))
    .filter((x) => x.a.queueLenMax > 0)
    .sort((x, y) => y.a.queueLenMax - x.a.queueLenMax || x.rt.id.localeCompare(y.rt.id))
    .slice(0, 5);
  const queues: TimePoint[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const row: TimePoint = { t: b * bs };
    for (const { rt, a } of queueRanked) row[rt.id] = a.bucketQueueLen[b] * k;
    queues.push(row);
  }

  /* utilisation : 5 nœuds les plus utilisés (hors générateurs — ρ≈1 par construction) */
  const utilEntries: { rt: NodeRuntime; mean: number; max: number; buckets: number[] }[] = [];
  for (const rt of runtimes) {
    const a = store.acc(rt.id);
    const drain = input.workerDrainRps.get(rt.id) ?? 0;
    const capNominal = rt.role === "generator" ? UNBOUNDED_RPS : theoreticalCapacityRps(rt.role, rt.rc, readRatio, drain);
    const u = utilizationSeries(rt.role, rt.rc, a, input, capNominal);
    utilEntries.push({ rt, mean: u.mean, max: u.max, buckets: u.buckets });
  }
  const utilRanked = utilEntries
    .filter((x) => x.rt.role !== "generator")
    .sort((x, y) => y.max - x.max || x.rt.id.localeCompare(y.rt.id))
    .slice(0, 5);
  const utilization: TimePoint[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const row: TimePoint = { t: b * bs };
    for (const { rt, buckets } of utilRanked) row[rt.id] = buckets[b];
    utilization.push(row);
  }

  /* --- métriques globales --- */
  const allLatencies: number[] = [];
  for (const samples of store.latencyByBucket) allLatencies.push(...samples);
  const sortedLatencies = sortedCopy(allLatencies);
  const totalRequests = store.generated * k;
  const servedRequests = store.served * k;
  const rejectedRequests = store.rejected * k;
  const errorRequests = store.errored * k;
  const costTotal = nodes.reduce((s, n) => s + n.costPerMonthUsd, 0);

  /* goulot : nœud non-générateur le plus utilisé (tie-break : longueur max de file) */
  let bottleneckNodeId: string | null = null;
  let bestUtil = -1;
  let bestQueue = -1;
  for (const nm of nodes) {
    const rt = runtimes.find((r) => r.id === nm.nodeId);
    if (!rt || rt.role === "generator" || nm.arrivals <= 0) continue;
    if (
      nm.utilization > bestUtil + 1e-9 ||
      (Math.abs(nm.utilization - bestUtil) <= 1e-9 && nm.maxQueueLength > bestQueue)
    ) {
      bestUtil = nm.utilization;
      bestQueue = nm.maxQueueLength;
      bottleneckNodeId = nm.nodeId;
    }
  }

  const overall: OverallMetrics = {
    inputRps: totalRequests / durationSec,
    servedRps: servedRequests / durationSec,
    rejectedRps: rejectedRequests / durationSec,
    errorRate: totalRequests > 0 ? errorRequests / totalRequests : 0,
    latencyAvgMs: sortedLatencies.length > 0 ? allLatencies.reduce((s, v) => s + v, 0) / allLatencies.length : 0,
    p50Ms: percentile(sortedLatencies, 0.5),
    p95Ms: percentile(sortedLatencies, 0.95),
    p99Ms: percentile(sortedLatencies, 0.99),
    availability: totalRequests > 0 ? 1 - errorRequests / totalRequests : 1,
    costPerMonthUsd: Math.round(costTotal * 100) / 100,
    totalRequests,
    servedRequests,
    rejectedRequests,
    errorRequests,
    bottleneckNodeId,
  };

  const series: SimulationSeries = {
    throughput,
    latency,
    errors: errorsSeries,
    queues,
    utilization,
  };

  return { nodes, series, overall, extras };
}
