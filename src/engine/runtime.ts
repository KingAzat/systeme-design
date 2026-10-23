/**
 * SystemLab — noyau partagé du moteur de simulation.
 *
 * Contient : constantes/limites, lecture robuste de la configuration par rôle
 * (helper `cfg*`), capacités théoriques par rôle, profil de trafic, seaux à
 * jetons, et les types d'exécution partagés (requête, frames, nœuds, contexte).
 *
 * Ce module est volontairement SANS logique d'exécution : il décrit le modèle.
 */
import type { ArchEdge, ArchNode, CategoryId, SimRole, TrafficProfile } from "@/types";
import { getComponentById } from "@/data/catalog/registry";
import type { EventHeap } from "./events";
import type { Rng } from "./rng";
import type { MetricsStore } from "./metrics";
import type { FailureEngine } from "./failures";

/* ============================================================
 * Limites du moteur (documentées dans les hypothèses du résultat)
 * ============================================================ */

export const MAX_NODES = 60;
export const MAX_EDGES_WARN = 120;
/** Requêtes simulées au maximum avant échantillonnage (rps × durée). */
export const MAX_EVENTS = 100_000;
/**
 * Budget GLOBAL de requêtes créées (arrivées externes + clones internes de
 * fan-out + messages + effets de bord). MAX_EVENTS ne borne que les arrivées
 * externes : un graphe à fan-out profond (proxy « persister + publier » en
 * cascade) sinon multiplie les événements sans limite et gèle le navigateur.
 * Valeur : max(1 200 000, 2,5 × maximum observé sur les 17 modèles — 214 766
 * requêtes pour whatsapp-messagerie) ⇒ 1 200 000. Au-delà, les CLONES de
 * fan-out ne sont plus créés (compteur de drops) ; le chemin principal
 * continue et un clamp pédagogique est émis.
 */
export const MAX_TOTAL_REQUESTS = 1_200_000;
/** Bornes de la profondeur de file (maxDepth) — capacité de file des messages. */
export const MIN_MAX_DEPTH = 1;
export const MAX_MAX_DEPTH = 10_000;
/** Bornes du pool de connexions (maxConnections) — caches/bases/répliques. */
export const MIN_MAX_CONNECTIONS = 1;
export const MAX_MAX_CONNECTIONS = 10_000;
/** Budget temps réel d'un drain interne (tryDrainFifo / handleDispatch). */
export const DRAIN_SLICE_MS = 16;
/** Granularité du contrôle de tranche dans les boucles de drain internes. */
export const DRAIN_ITER_CHUNK = 256;
/** Profondeur maximale (sauts) d'une requête avant erreur « boucle ». */
export const MAX_HOPS = 10;
/** Capacité de la file FIFO d'un serveur (en requêtes, avant rejet 503). */
export const SERVER_QUEUE_CAP = 500;
/** Attente maximale d'une connexion base avant erreur « connexions épuisées ». */
export const DB_CONN_WAIT_TIMEOUT_MS = 1_000;
/** Latence d'acquittement des files persistantes. */
export const QUEUE_ACK_PERSIST_MS = 2;
/** Capacité « pratiquement illimitée » (composants neutres) — évite Infinity en JSON. */
export const UNBOUNDED_RPS = 1_000_000;
export const MIN_DURATION_SEC = 5;
export const MAX_DURATION_SEC = 600;
export const MIN_RPS = 1;
export const MAX_RPS = 200_000;

/* ============================================================
 * Lecture robuste de la configuration (node.config → défauts catalogue)
 * ============================================================ */

/** Valeurs de repli si ni node.config ni le catalogue ne fournissent la clé. */
const FALLBACKS: Record<string, number | string | boolean> = {
  weight: 1,
  instances: 1,
  capacityRps: 10_000,
  latencyMs: 2,
  cacheHitRatio: 0.85,
  hitLatencyMs: 12,
  layer: "l7",
  algorithm: "round-robin",
  healthCheck: true,
  limit: 1000,
  burst: 200,
  rlAlgorithm: "token-bucket",
  avgServiceMs: 50,
  serviceVariability: 0.3,
  maxConcurrencyPerInstance: 64,
  timeoutMs: 3000,
  errorRate: 0.001,
  cpuCoresPerInstance: 2,
  memoryGbPerInstance: 4,
  hitRatio: 0.75,
  maxConnections: 200,
  memoryGb: 8,
  evictionPolicy: "allkeys-lru",
  avgReadMs: 12,
  avgWriteMs: 35,
  dataGb: 100,
  cpuCores: 8,
  internalCacheEnabled: true,
  replicationPolicy: "async",
  replicationLagMs: 200,
  maxDepth: 10_000,
  partitions: 3,
  persistMessages: true,
  avgProcessingMs: 150,
  errorThreshold: 0.5,
  minRequestsToTrip: 20,
  cooldownMs: 5000,
  halfOpenProbes: 3,
};

function rawValue(node: ArchNode, key: string): number | string | boolean | undefined {
  const v = node.config?.[key];
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  const d = getComponentById(node.componentId)?.defaults?.[key];
  if (typeof d === "number" || typeof d === "string" || typeof d === "boolean") return d;
  return FALLBACKS[key];
}

/** Nombre robuste : accepte 45 ou "45", repli sur le défaut si invalide. */
export function cfgNum(node: ArchNode, key: string): number {
  const v = rawValue(node, key);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return Number(FALLBACKS[key] ?? 0);
}

/** Booléen robuste : accepte true ou "true". */
export function cfgBool(node: ArchNode, key: string): boolean {
  const v = rawValue(node, key);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return Boolean(FALLBACKS[key] ?? false);
}

/** Chaîne robuste (clés select). */
export function cfgStr(node: ArchNode, key: string): string {
  const v = rawValue(node, key);
  if (typeof v === "string" && v !== "") return v;
  if (typeof v === "number") return String(v);
  return String(FALLBACKS[key] ?? "");
}

/** Configuration typée et bornée par rôle (vue plate commune). */
export interface RoleConfig {
  // generator
  weight: number;
  // cdn
  cacheHitRatio: number;
  hitLatencyMs: number;
  // balancer / proxy / storage / cdn
  capacityRps: number;
  latencyMs: number;
  layer: "l4" | "l7";
  algorithm: "round-robin" | "least-connections" | "ip-hash";
  instances: number;
  healthCheck: boolean;
  // rate-limiter
  limit: number;
  burst: number;
  rlAlgorithm: "token-bucket" | "sliding-window";
  // server
  avgServiceMs: number;
  serviceVariability: number;
  maxConcurrencyPerInstance: number;
  timeoutMs: number;
  errorRate: number;
  cpuCoresPerInstance: number;
  memoryGbPerInstance: number;
  // cache
  hitRatio: number;
  maxConnections: number;
  memoryGb: number;
  evictionPolicy: string;
  // database
  avgReadMs: number;
  avgWriteMs: number;
  dataGb: number;
  cpuCores: number;
  internalCacheEnabled: boolean;
  replicationPolicy: string;
  // replica
  replicationLagMs: number;
  // queue
  maxDepth: number;
  partitions: number;
  persistMessages: boolean;
  // worker
  avgProcessingMs: number;
  // circuit-breaker
  errorThreshold: number;
  minRequestsToTrip: number;
  cooldownMs: number;
  halfOpenProbes: number;
}

const num01 = (n: number): number => Math.min(1, Math.max(0, n));
const numPos = (n: number): number => Math.max(n > 0 ? n : 0.001, 0.001);
const fmtBound = (n: number): string => (Number.isFinite(n) ? String(n) : "—");

/** Résout la configuration d'un nœud en valeurs numériques bornées. */
export function resolveRoleConfig(node: ArchNode, clampLog?: string[]): RoleConfig {
  const algorithm = cfgStr(node, "algorithm");
  const layer = cfgStr(node, "layer");
  const rlAlgorithm = cfgStr(node, "algorithm");
  const rawMaxDepth = Math.round(cfgNum(node, "maxDepth"));
  const rawMaxConnections = Math.round(cfgNum(node, "maxConnections"));
  const maxDepth = Math.min(MAX_MAX_DEPTH, Math.max(MIN_MAX_DEPTH, rawMaxDepth));
  const maxConnections = Math.min(
    MAX_MAX_CONNECTIONS,
    Math.max(MIN_MAX_CONNECTIONS, rawMaxConnections),
  );
  // Diagnostic de clamp uniquement pour une valeur réellement CONFIGURÉE sur
  // le nœud (≠ défaut du catalogue) : les défauts hors bornes (ex. maxDepth
  // 1 000 000 pour Kafka) sont normalisés silencieusement — sinon chaque
  // simulation bénie porterait des diagnostics « paramètre ajusté » sans
  // intérêt pédagogique.
  const catalogDepth = getComponentById(node.componentId)?.defaults?.maxDepth;
  const catalogConn = getComponentById(node.componentId)?.defaults?.maxConnections;
  const depthConfigured = node.config?.maxDepth !== undefined && node.config.maxDepth !== catalogDepth;
  const connConfigured = node.config?.maxConnections !== undefined && node.config.maxConnections !== catalogConn;
  if (clampLog && maxDepth !== rawMaxDepth && depthConfigured) {
    clampLog.push(
      `profondeur de file (maxDepth) ${fmtBound(rawMaxDepth)} → ${maxDepth} (bornes ${MIN_MAX_DEPTH}–${MAX_MAX_DEPTH}) — nœud « ${node.label || node.id} »`,
    );
  }
  if (clampLog && maxConnections !== rawMaxConnections && connConfigured) {
    clampLog.push(
      `connexions max (maxConnections) ${fmtBound(rawMaxConnections)} → ${maxConnections} (bornes ${MIN_MAX_CONNECTIONS}–${MAX_MAX_CONNECTIONS}) — nœud « ${node.label || node.id} »`,
    );
  }
  return {
    weight: Math.max(0.001, cfgNum(node, "weight")),
    cacheHitRatio: num01(cfgNum(node, "cacheHitRatio")),
    hitLatencyMs: numPos(cfgNum(node, "hitLatencyMs")),
    capacityRps: numPos(cfgNum(node, "capacityRps")),
    latencyMs: Math.max(0, cfgNum(node, "latencyMs")),
    layer: layer === "l4" ? "l4" : "l7",
    algorithm:
      algorithm === "least-connections" || algorithm === "ip-hash" ? algorithm : "round-robin",
    instances: Math.max(1, Math.round(cfgNum(node, "instances"))),
    healthCheck: cfgBool(node, "healthCheck"),
    limit: numPos(cfgNum(node, "limit")),
    burst: Math.max(0, cfgNum(node, "burst")),
    rlAlgorithm: rlAlgorithm === "sliding-window" ? "sliding-window" : "token-bucket",
    avgServiceMs: numPos(cfgNum(node, "avgServiceMs")),
    serviceVariability: num01(cfgNum(node, "serviceVariability")),
    maxConcurrencyPerInstance: Math.max(1, Math.round(cfgNum(node, "maxConcurrencyPerInstance"))),
    timeoutMs: numPos(cfgNum(node, "timeoutMs")),
    errorRate: num01(cfgNum(node, "errorRate")),
    cpuCoresPerInstance: numPos(cfgNum(node, "cpuCoresPerInstance")),
    memoryGbPerInstance: numPos(cfgNum(node, "memoryGbPerInstance")),
    hitRatio: num01(cfgNum(node, "hitRatio")),
    maxConnections: maxConnections,
    memoryGb: numPos(cfgNum(node, "memoryGb")),
    evictionPolicy: cfgStr(node, "evictionPolicy"),
    avgReadMs: numPos(cfgNum(node, "avgReadMs")),
    avgWriteMs: numPos(cfgNum(node, "avgWriteMs")),
    dataGb: numPos(cfgNum(node, "dataGb")),
    cpuCores: numPos(cfgNum(node, "cpuCores")),
    internalCacheEnabled: cfgBool(node, "internalCacheEnabled"),
    replicationPolicy: cfgStr(node, "replicationPolicy"),
    replicationLagMs: Math.max(0, cfgNum(node, "replicationLagMs")),
    maxDepth: maxDepth,
    partitions: Math.max(1, Math.round(cfgNum(node, "partitions"))),
    persistMessages: cfgBool(node, "persistMessages"),
    avgProcessingMs: numPos(cfgNum(node, "avgProcessingMs")),
    errorThreshold: Math.min(1, Math.max(0.01, cfgNum(node, "errorThreshold"))),
    minRequestsToTrip: Math.max(1, Math.round(cfgNum(node, "minRequestsToTrip"))),
    cooldownMs: numPos(cfgNum(node, "cooldownMs")),
    halfOpenProbes: Math.max(1, Math.round(cfgNum(node, "halfOpenProbes"))),
  };
}

/* ============================================================
 * Capacité théorique par rôle (req/s, domaine nominal non échantillonné)
 *
 * server    : instances × concurrence/instance × 1000 / avgServiceMs
 * database  : maxConnections × 1000 / temps moyen pondéré lecture/écriture
 * cache     : maxConnections × 1000 / avgServiceMs
 * replica   : instances × maxConnections × 1000 / avgReadMs
 * balancer  : capacityRps × instances
 * queue     : débit de consommation des workers aval (drain)
 * ============================================================ */

export function theoreticalCapacityRps(
  role: SimRole,
  rc: RoleConfig,
  readRatio: number,
  workerDrainRps = 0,
): number {
  const rr = num01(readRatio);
  switch (role) {
    case "generator":
      return UNBOUNDED_RPS;
    case "cdn":
      return numPos(rc.capacityRps);
    case "balancer":
      return numPos(rc.capacityRps) * Math.max(1, rc.instances);
    case "rate-limiter":
      return numPos(rc.limit);
    case "server":
      return (
        (Math.max(1, rc.instances) *
          Math.max(1, rc.maxConcurrencyPerInstance) *
          1000) /
        numPos(rc.avgServiceMs)
      );
    case "cache":
      return (Math.max(1, rc.maxConnections) * 1000) / numPos(rc.avgServiceMs);
    case "database": {
      const readMs = rc.avgReadMs * (rc.internalCacheEnabled ? 0.6 : 1);
      const mix = rr * readMs + (1 - rr) * rc.avgWriteMs;
      return (Math.max(1, rc.maxConnections) * 1000) / Math.max(0.001, mix);
    }
    case "replica":
      return (
        (Math.max(1, rc.instances) * Math.max(1, rc.maxConnections) * 1000) /
        numPos(rc.avgReadMs)
      );
    case "queue":
      return Math.max(0, workerDrainRps);
    case "worker":
      return (
        (Math.max(1, rc.instances) *
          Math.max(1, rc.maxConcurrencyPerInstance) *
          1000) /
        numPos(rc.avgProcessingMs)
      );
    case "proxy":
    case "storage":
      return numPos(rc.capacityRps);
    case "circuit-breaker":
    case "pass-through":
      return UNBOUNDED_RPS;
  }
}

/* ============================================================
 * Profil de trafic — facteur multiplicatif de λ(t)
 * ============================================================ */

export function trafficProfileFactor(
  profile: TrafficProfile,
  tSec: number,
  durationSec: number,
  rng: Rng,
): number {
  const d = Math.max(1, durationSec);
  switch (profile) {
    case "constant":
      return 1;
    case "ramp":
      return 0.2 + (0.8 * tSec) / d;
    case "spike":
      // 0.3 en régime courant, ×5 (→ 1.5) sur la fenêtre centrale [0.4D, 0.6D]
      return tSec / d >= 0.4 && tSec / d <= 0.6 ? 1.5 : 0.3;
    case "waves":
      return 0.5 + 0.5 * Math.sin((2 * Math.PI * tSec) / 20);
    case "random":
      return 0.7 + 0.6 * rng.next();
  }
}

/* ============================================================
 * Seau à jetons — capacité en débit (cdn, balancer, proxy, storage)
 * Remplissage paresseux : burst = 1 s de débit.
 * ============================================================ */

export interface TokenBucket {
  tokens: number;
  lastRefillMs: number;
}

export function makeTokenBucket(ratePerSec: number): TokenBucket {
  return { tokens: ratePerSec, lastRefillMs: 0 };
}

/** Consomme 1 jeton si disponible (remplissage continu jusqu'à 1 s de débit). */
export function consumeToken(b: TokenBucket, ratePerSec: number, tMs: number): boolean {
  if (tMs > b.lastRefillMs) {
    const refill = (ratePerSec * (tMs - b.lastRefillMs)) / 1000;
    b.tokens = Math.min(ratePerSec, b.tokens + refill);
    b.lastRefillMs = tMs;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return true;
  }
  return false;
}

/* ============================================================
 * Types d'exécution
 * ============================================================ */

/**
 * Frame de pile : chaque nœud qui relaie une requête vers l'aval en pousse une.
 * Le « déroulement » (unwind) LIFO libère les ressources au retour de la
 * réponse : slot serveur, visite, enregistrement circuit breaker…
 */
export type Frame =
  | {
      kind: "server";
      nodeId: string;
      ownWaitMs: number;
      ownServiceMs: number;
      routedAt: number;
      timeoutMs: number;
      /** Verdict final si ce frame est celui du nœud TERMINAL de la requête. */
      verdict?: "ok" | "reject" | "error";
      verdictCode?: string;
    }
  | { kind: "breaker"; nodeId: string; targetId: string }
  | { kind: "hop"; nodeId: string };

/** Requête simulée (cliente ou interne — workers/effets secondaires). */
export interface SimRequest {
  id: number;
  /** Date de création (ms simulées) — point de départ de la latence bout-en-bout. */
  createdAt: number;
  generatorId: string;
  isRead: boolean;
  sizeKb: number;
  /** Σ latences réseau du chemin aller (la retour vaut la même somme). */
  networkMs: number;
  /** Σ attentes (files FIFO, connexions) sur tout le chemin. */
  waitMs: number;
  /** Σ temps de service sur tout le chemin. */
  serviceMs: number;
  /** Attente + service du nœud COURANT (snapshot au démarrage du service). */
  legWaitMs: number;
  legServiceMs: number;
  hops: number;
  frames: Frame[];
  /** Requête interne (hors compteurs clients et latences globales). */
  internal: boolean;
  /** Profondeur de spawn interne (worker → écriture = 1 ; bornée pour éviter les cascades). */
  depth: number;
  /** Message de file : slot worker déjà réservé au moment du dispatch. */
  preSlotted: boolean;
  /** Décision cache/CDN prise à l'arrivée (« hit » ⇒ succès terminal au service). */
  cacheDecision: "hit" | "miss" | null;
}

/** État d'un circuit breaker pour une cible aval donnée. */
export interface CircuitState {
  status: "closed" | "open" | "half-open";
  /** Fenêtre glissante des derniers résultats (true = succès). */
  window: boolean[];
  openUntilMs: number;
  probesLeft: number;
  openCount: number;
  lastOpenAtMs: number | null;
}

export interface FifoEntry {
  req: SimRequest;
  enqueuedAt: number;
}

/* ============================================================
 * FIFO à indice de tête — dequeue O(1)
 *
 * `fifo` conserve les entrées consommées jusqu'à la compaction : la tête
 * logique est `fifoHead`, la taille logique est `fifo.length - fifoHead`.
 * Compaction amortie : quand la tête dépasse 512 ET la moitié du tableau,
 * on retire d'un coup le préfixe consommé (chaque entrée est déplacée au
 * plus une fois → coût amorti O(1) par défilement).
 * ============================================================ */

/** Taille logique de la FIFO (O(1)). */
export function fifoSize(rt: NodeRuntime): number {
  return rt.fifo.length - rt.fifoHead;
}

/** Enfile une entrée (O(1) amorti). */
export function fifoEnqueue(rt: NodeRuntime, entry: FifoEntry): void {
  rt.fifo.push(entry);
}

/** Défile la plus ancienne entrée (O(1) amorti) ; null si vide. */
export function fifoDequeue(rt: NodeRuntime): FifoEntry | null {
  const head = rt.fifoHead;
  if (head >= rt.fifo.length) return null;
  const entry = rt.fifo[head];
  if (entry === undefined) return null;
  rt.fifo[head] = undefined; // libère la référence (GC)
  const newHead = head + 1;
  rt.fifoHead = newHead;
  if (newHead > 512 && newHead * 2 > rt.fifo.length) {
    rt.fifo.splice(0, newHead);
    rt.fifoHead = 0;
  }
  return entry;
}

/** Cibles de routage aval d'un serveur/worker, groupées par rôle (précalcul). */
export interface RouteTargets {
  caches: string[];
  replicas: string[];
  databases: string[];
  queues: string[];
}

/** Nœud à l'exécution : configuration résolue + état dynamique. */
export interface NodeRuntime {
  id: string;
  label: string;
  componentId: string;
  role: SimRole;
  category: CategoryId | null;
  maturity: "simulated" | "partial" | "visual";
  rc: RoleConfig;
  /** Slots de concurrence effectifs (échelle d'échantillonnage appliquée). */
  slots: number;
  /**
   * File FIFO : serveurs (attente), bases/caches (connexions), files (messages).
   * Les cases [0, fifoHead) sont déjà consommées (voir fifoSize/fifoDequeue).
   */
  fifo: (FifoEntry | undefined)[];
  /** Indice de tête logique de la FIFO (défilement O(1)). */
  fifoHead: number;
  /** Capacité en débit (cdn, balancer, proxy, storage). */
  bucket: TokenBucket | null;
  /** Jetons du rate limiter (token bucket) ou fenêtre glissante (timestamps ms). */
  rlTokens: TokenBucket | null;
  rlWindow: number[];
  /** Circuit breakers par cible aval. */
  cb: Map<string, CircuitState>;
  /** Compteur round-robin. */
  rr: number;
  /** Cibles aval par rôle (serveurs/workers) — précalculées à l'initialisation. */
  routes: RouteTargets | null;
  /** Cibles directes (balancer) — précalculées, ordre des arêtes préservé. */
  outTargets: string[] | null;
  /** Latence d'arête par cible (tous rôles) — première arête gagne, comme avant. */
  outLatencyMs: Map<string, number> | null;
}

/** Contexte de simulation — partagé par tous les handlers. */
export interface SimContext {
  nodes: Map<string, NodeRuntime>;
  /** Ordre stable des nœuds (déterminisme des itérations). */
  order: string[];
  out: Map<string, { edge: ArchEdge; targetId: string }[]>;
  /** Arêtes inverses (cible → sources) — dispatch des files vers les workers. */
  rev: Map<string, string[]>;
  heap: EventHeap;
  rng: Rng;
  metrics: MetricsStore;
  failure: FailureEngine;
  /** Paramètres effectifs (clampés). */
  durationMs: number;
  durationSec: number;
  rps: number;
  readRatio: number;
  requestSizeKb: number;
  baseErrorRate: number;
  networkLatencyMs: number;
  profile: TrafficProfile;
  /** Taux d'échantillonnage (1 = simulation intégrale). */
  scale: number;
  /** Σ des poids des générateurs (répartition du trafic entre sources). */
  genTotalWeight: number;
  /** Requêtes coupées par la limite de profondeur (boucles). */
  loopKilled: number;
  /** Total de requêtes créées (externes + clones + messages) — garde fan-out. */
  requestsCreated: number;
  /** Plafond de requêtes créées (MAX_TOTAL_REQUESTS). */
  maxRequests: number;
  /** Clones de fan-out abandonnés faute de budget (chemin principal préservé). */
  fanoutDropped: number;
  reqSeq: number;
  /** Temps simulé courant (ms). */
  now: number;
}
