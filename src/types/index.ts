/**
 * SystemLab — Contrat de types partagé.
 * Ce fichier est la source de vérité pour TOUS les modules (catalogue, moteur,
 * stores, UI, API). Ne le modifiez pas sans coordonner avec le worklog.
 */

/* ============================================================
 * 1. CATALOGUE DE COMPOSANTS
 * ============================================================ */

export type CategoryId =
  | "clients"
  | "network"
  | "compute"
  | "sql"
  | "nosql"
  | "cache"
  | "messaging"
  | "storage"
  | "search"
  | "communication"
  | "security"
  | "resilience"
  | "observability"
  | "distributed"
  | "jobs"
  | "ai"
  | "business"
  | "infrastructure";

export interface CatalogCategory {
  id: CategoryId;
  label: string;
  /** Nom d'icône Lucide (clé de src/lib/icons.ts) */
  icon: string;
}

export type FieldType = "number" | "select" | "boolean" | "text";

/** Groupes d'affichage du panneau de configuration */
export type FieldGroup = "general" | "capacity" | "advanced";

export interface CatalogField {
  key: string;
  label: string;
  type: FieldType;
  group: FieldGroup;
  /** Unité affichée : "req/s", "ms", "Go", "instances", "%"… */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Pour type === "select" */
  options?: { value: string; label: string }[];
  default: number | string | boolean;
  /** Explication pédagogique courte du paramètre */
  help?: string;
}

/**
 * Niveau de prise en charge par le moteur de simulation.
 * - "simulated"  : entièrement simulé (modèle dédié)
 * - "partial"    : partiellement modélisé (latence/capacité génériques)
 * - "visual"     : uniquement visuel / pédagogique (pass-through neutre)
 */
export type SimulationMaturity = "simulated" | "partial" | "visual";

/** Rôle joué par le composant dans le moteur de simulation */
export type SimRole =
  | "generator"
  | "cdn"
  | "balancer"
  | "rate-limiter"
  | "server"
  | "cache"
  | "database"
  | "replica"
  | "queue"
  | "worker"
  | "circuit-breaker"
  | "proxy"
  | "storage"
  | "pass-through";

export interface LearningDoc {
  /** Rôle du composant dans une architecture */
  role: string;
  /** Fonctionnement détaillé */
  howItWorks: string;
  /** Avantages */
  pros: string[];
  /** Inconvénients / limites */
  cons: string[];
  /** Cas d'utilisation typiques */
  useCases: string[];
  /** Erreurs fréquentes des concepteurs */
  pitfalls: string[];
  /** Concepts techniques associés (mots-clés) */
  concepts: string[];
}

export interface CatalogComponent {
  /** Identifiant stable kebab-case, ex. "api-server" */
  id: string;
  name: string;
  category: CategoryId;
  /** Nom d'icône Lucide PascalCase (clé de src/lib/icons.ts) */
  icon: string;
  description: string;
  ports: { inputs: number; outputs: number };
  /** Schéma de configuration affiché dans le panneau droit */
  fields: CatalogField[];
  /** Valeurs par défaut (clé → valeur) alignées sur fields */
  defaults: Record<string, number | string | boolean>;
  maturity: SimulationMaturity;
  /** Présent si maturity !== "visual" */
  simRole?: SimRole;
  /** Clés de champs résumées sous le nom du nœud sur le canvas */
  subtitleFields?: string[];
  learning: LearningDoc;
}

export interface CategoryWithComponents {
  category: CatalogCategory;
  components: CatalogComponent[];
}

/* ============================================================
 * 2. ARCHITECTURE (graphe éditable)
 * ============================================================ */

export interface ArchNode {
  id: string;
  /** Identifiant du composant dans le catalogue */
  componentId: string;
  /** Nom personnalisé par l'utilisateur (défaut : nom du catalogue) */
  label: string;
  config: Record<string, number | string | boolean>;
  position: { x: number; y: number };
  zoneId?: string;
}

export type Protocol =
  | "http"
  | "https"
  | "tcp"
  | "grpc"
  | "websocket"
  | "amqp"
  | "kafka"
  | "redis"
  | "sql";

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  protocol: Protocol;
  /** Latence réseau ajoutée par cette connexion (ms) */
  networkLatencyMs: number;
  /** Débit nominal de la connexion (Mbps) */
  bandwidthMbps: number;
  label?: string;
}

export type ZoneColor = "indigo" | "cyan" | "emerald" | "amber" | "violet" | "rose";

export interface ArchZone {
  id: string;
  label: string;
  color: ZoneColor;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/* ============================================================
 * 3. SCÉNARIO DE TRAFIC
 * ============================================================ */

export type TrafficProfile = "constant" | "ramp" | "spike" | "waves" | "random";
export type SimulationMode =
  | "quick"
  | "load"
  | "stress"
  | "endurance"
  | "failure";

export interface FailureScenario {
  /** Nœud victime de la panne */
  nodeId: string;
  /** Début de la panne (secondes de temps simulé) */
  startSec: number;
  /** Durée de la panne (s) */
  durationSec: number;
  /** "outage" = indisponible ; "degradation" = ralenti */
  kind: "outage" | "degradation";
  /** Pour degradation : fraction de capacité perdue (0-1) */
  severity: number;
  /** Temps de récupération progressif après la panne (s) */
  recoverySec: number;
}

export interface ScenarioConfig {
  activeUsers: number;
  /** Trafic cible total en requêtes/s (≠ utilisateurs actifs) */
  requestsPerSecond: number;
  durationSec: number;
  /** Proportion de lectures 0-1 (le reste en écritures) */
  readRatio: number;
  /** Latence réseau de base client → edge (ms) */
  networkLatencyMs: number;
  /** Taux d'erreur aléatoire de base (0-1) */
  baseErrorRate: number;
  requestSizeKb: number;
  profile: TrafficProfile;
  mode: SimulationMode;
  /** Graine aléatoire — mêmes paramètres + seed ⇒ résultats reproductibles */
  seed: number;
  budgetPerMonthUsd: number;
  failure: FailureScenario | null;
}

/* ============================================================
 * 4. ARCHITECTURE PERSISTÉE
 * ============================================================ */

export interface ArchitectureData {
  name: string;
  description?: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  zones: ArchZone[];
  scenario: ScenarioConfig;
}

export interface Architecture extends ArchitectureData {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Vue liste (sans le graphe complet) */
export interface ArchitectureSummary {
  id: string;
  name: string;
  description?: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

/* ============================================================
 * 5. RÉSULTATS DE SIMULATION
 * ============================================================ */

export interface NodeMetrics {
  nodeId: string;
  label: string;
  componentId: string;
  /** Requêtes arrivées sur la période simulée */
  arrivals: number;
  processed: number;
  rejected: number;
  errors: number;
  timeouts: number;
  /** Débit moyen traité (req/s) */
  throughputRps: number;
  /** Capacité théorique (req/s) */
  capacityRps: number;
  /** Utilisation moyenne 0-1 */
  utilization: number;
  /** Utilisation maximale 0-1 */
  utilizationMax: number;
  avgQueueLength: number;
  maxQueueLength: number;
  avgWaitMs: number;
  p95WaitMs: number;
  avgServiceMs: number;
  /** Cache : requêtes servies depuis le cache */
  cacheHits?: number;
  /** Cache : taux de hit 0-1 */
  cacheHitRate?: number;
  /** Concurrence maximale observée */
  inFlightMax: number;
  /** Disponibilité simulée 0-1 */
  availability: number;
  /** Taux d'erreur 0-1 */
  errorRate: number;
  /** Coût infra estimé ($/mois) */
  costPerMonthUsd: number;
}

/** Point temporel : t en secondes simulées, clés dynamiques selon la série */
export interface TimePoint {
  t: number;
  [key: string]: number;
}

export interface SimulationSeries {
  /** { t, inputRps, servedRps, rejectedRps } */
  throughput: TimePoint[];
  /** { t, avgMs, p95Ms } */
  latency: TimePoint[];
  /** { t, errors, rejects } */
  errors: TimePoint[];
  /** { t, [nodeId]: longueur de file } — nœuds les plus chargés */
  queues: TimePoint[];
  /** { t, [nodeId]: utilisation 0-1 } */
  utilization: TimePoint[];
}

export interface OverallMetrics {
  inputRps: number;
  servedRps: number;
  rejectedRps: number;
  errorRate: number;
  /** Latences de bout en bout (ms) */
  latencyAvgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  /** Disponibilité simulée 0-1 */
  availability: number;
  costPerMonthUsd: number;
  totalRequests: number;
  servedRequests: number;
  rejectedRequests: number;
  errorRequests: number;
  bottleneckNodeId: string | null;
}

export type DiagnosticSeverity = "critical" | "warning" | "info";

export interface DiagnosticSolution {
  label: string;
  how: string;
  /** Conditions dans lesquelles la solution est pertinente */
  conditions: string;
  /** Compromis acceptés */
  tradeoffs: string;
}

export interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  title: string;
  nodeId?: string;
  nodeLabel?: string;
  /** Métriques justifiant le diagnostic */
  evidence: { label: string; value: string }[];
  cause: string;
  /** Explication pédagogique */
  explanation: string;
  solutions: DiagnosticSolution[];
}

export interface SimulationResult {
  id: string;
  architectureId: string;
  architectureName: string;
  engineVersion: string;
  /** Mode utilisé : "analytical" | "event-sampled" */
  mode: "analytical" | "event-sampled";
  seed: number;
  startedAt: string;
  /** Temps de calcul réel (ms) */
  computeMs: number;
  scenario: ScenarioConfig;
  /** Copie du graphe simulé */
  snapshot: {
    nodes: ArchNode[];
    edges: ArchEdge[];
    zones: ArchZone[];
  };
  overall: OverallMetrics;
  nodes: NodeMetrics[];
  series: SimulationSeries;
  /** Nombre de requêtes réellement simulées (échantillonnage) */
  requestsSimulated: number;
  /** Fraction du trafic réellement simulée 0-1 */
  samplingRate: number;
  /** Hypothèses du modèle — affichées avec les résultats */
  hypotheses: string[];
  diagnostics: Diagnostic[];
}

/* ============================================================
 * 6. API DU MOTEUR (implémentée dans src/engine)
 * ============================================================ */

export interface SimulationProgress {
  /** Phase courante : "Analyse du graphe", "Simulation événementielle"… */
  phase: string;
  /** Progression 0-1 */
  progress: number;
  /** Temps virtuel atteint (s) */
  virtualTimeSec?: number;
  detail?: string;
}

export interface RunOptions {
  onProgress?: (p: SimulationProgress) => void;
  signal?: AbortSignal;
  /** Tranche de temps de calcul par itération (ms) */
  sliceMs?: number;
}

/* ============================================================
 * 7. MODÈLES PRÉCONFIGURÉS & APPRENTISSAGE
 * ============================================================ */

export interface ArchitectureTemplate {
  id: string;
  name: string;
  description: string;
  difficulty: "débutant" | "intermédiaire" | "avancé";
  tags: string[];
  data: ArchitectureData;
}

export type CourseLevel = "débutant" | "intermédiaire" | "avancé";

export interface QuizQuestion {
  question: string;
  choices: string[];
  /** Index de la bonne réponse */
  answer: number;
  explanation: string;
}

export interface CourseExercise {
  title: string;
  goal: string;
  /** Contraintes à respecter (budget, latence cible…) */
  constraints: string[];
  /** Template d'architecture de départ */
  templateId: string;
  /** Critères de réussite évalués sur les métriques simulées */
  successCriteria: {
    metric: "p95Ms" | "errorRate" | "servedRps" | "costPerMonthUsd" | "cacheHitRate";
    op: "<=" | ">=";
    value: number;
  }[];
}

export interface CourseSection {
  title: string;
  content: string;
}

export interface Course {
  slug: string;
  title: string;
  level: CourseLevel;
  durationMin: number;
  summary: string;
  sections: CourseSection[];
  concepts: string[];
  quiz: QuizQuestion[];
  /** Points essentiels à retenir (affichés en fin de cours) */
  keyTakeaways?: string[];
  exercise?: CourseExercise;
}

/* ============================================================
 * 8. VUES DE L'APPLICATION (SPA mono-route)
 * ============================================================ */

export type AppView =
  | "landing"
  | "dashboard"
  | "editor"
  | "results"
  | "compare"
  | "templates"
  | "learn"
  | "history"
  | "settings";

export interface SimulationSummary {
  id: string;
  architectureId: string;
  architectureName: string;
  label?: string;
  mode: "analytical" | "event-sampled";
  seed: number;
  createdAt: string;
  overall: {
    servedRps: number;
    p95Ms: number;
    errorRate: number;
    availability: number;
    costPerMonthUsd: number;
  };
}
