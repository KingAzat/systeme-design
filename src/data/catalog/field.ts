import type { CatalogField } from "@/types";

/**
 * SystemLab — Helpers de définition des champs du catalogue.
 * Partagé par tous les fichiers de composants (cœur et étendus).
 * Les clés générées ici respectent le contrat du moteur de simulation
 * (voir src/engine) : ne pas renommer sans coordination.
 */

export type FieldValue = number | string | boolean;
export type FieldGroup = CatalogField["group"];
export type SelectOption = { value: string; label: string };

export const f = {
  num(
    key: string,
    label: string,
    def: number,
    group: FieldGroup,
    extra: Partial<CatalogField> = {},
  ): CatalogField {
    return { key, label, type: "number", group, default: def, ...extra };
  },
  sel(
    key: string,
    label: string,
    options: SelectOption[],
    def: string,
    group: FieldGroup,
    extra: Partial<CatalogField> = {},
  ): CatalogField {
    return { key, label, type: "select", group, options, default: def, ...extra };
  },
  bool(
    key: string,
    label: string,
    def: boolean,
    group: FieldGroup,
    extra: Partial<CatalogField> = {},
  ): CatalogField {
    return { key, label, type: "boolean", group, default: def, ...extra };
  },
  text(
    key: string,
    label: string,
    def: string,
    group: FieldGroup,
    extra: Partial<CatalogField> = {},
  ): CatalogField {
    return { key, label, type: "text", group, default: def, ...extra };
  },
};

/** Un ensemble cohérent { champs, valeurs par défaut } pour un composant. */
export interface FieldSet {
  fields: CatalogField[];
  defaults: Record<string, FieldValue>;
}

/** Déduit les defaults directement des champs (utilisé par les builders). */
export function defaultsFrom(fields: CatalogField[]): Record<string, FieldValue> {
  const defaults: Record<string, FieldValue> = {};
  for (const field of fields) defaults[field.key] = field.default;
  return defaults;
}

function setOf(fields: CatalogField[]): FieldSet {
  return { fields, defaults: defaultsFrom(fields) };
}

/* ------------------------------------------------------------------
 * Builders par rôle de simulation — clés IMMUABLES (contrat moteur)
 * ------------------------------------------------------------------ */

/** Rôle generator : poids de répartition du trafic du scénario global. */
export function generatorFields(help?: string): FieldSet {
  return setOf([
    f.num("weight", "Poids de trafic", 1, "advanced", {
      min: 1, max: 10, step: 1,
      help: help ?? "Répartition du trafic entre les différentes sources.",
    }),
  ]);
}

/** Rôle cdn : taux de hit, latence sur hit, capacité. */
export function cdnFields(o: {
  cacheHitRatio?: number;
  hitLatencyMs?: number;
  capacityRps?: number;
} = {}): FieldSet {
  return setOf([
    f.num("cacheHitRatio", "Taux de hit (0-1)", o.cacheHitRatio ?? 0.85, "capacity", {
      min: 0, max: 1, step: 0.05,
      help: "Fraction des requêtes servies directement depuis l'edge.",
    }),
    f.num("hitLatencyMs", "Latence sur hit (ms)", o.hitLatencyMs ?? 12, "capacity", {
      min: 1, max: 500, step: 1,
    }),
    f.num("capacityRps", "Capacité (req/s)", o.capacityRps ?? 20000, "capacity", {
      min: 100, max: 1000000, step: 100,
    }),
  ]);
}

/** Rôle balancer : couche, algorithme, instances, capacité, latence, health checks. */
export function balancerFields(o: {
  layer?: "l4" | "l7";
  algorithm?: "round-robin" | "least-connections" | "ip-hash";
  instances?: number;
  capacityRps?: number;
  latencyMs?: number;
  healthCheck?: boolean;
} = {}): FieldSet {
  return setOf([
    f.sel("layer", "Couche", [
      { value: "l4", label: "L4 — Transport (TCP)" },
      { value: "l7", label: "L7 — Application (HTTP)" },
    ], o.layer ?? "l7", "general"),
    f.sel("algorithm", "Algorithme de répartition", [
      { value: "round-robin", label: "Round Robin" },
      { value: "least-connections", label: "Least Connections" },
      { value: "ip-hash", label: "IP Hash" },
    ], o.algorithm ?? "least-connections", "capacity", {
      help: "Least Connections répartit selon la charge réelle des cibles.",
    }),
    f.num("instances", "Instances (redondance)", o.instances ?? 2, "general", {
      min: 1, max: 4, step: 1,
      help: "Deux instances évitent un point de défaillance unique.",
    }),
    f.num("capacityRps", "Capacité (req/s)", o.capacityRps ?? 50000, "capacity", {
      min: 100, max: 1000000, step: 100,
    }),
    f.num("latencyMs", "Latence de traitement (ms)", o.latencyMs ?? 2, "capacity", {
      min: 0, max: 100, step: 0.5,
    }),
    f.bool("healthCheck", "Health checks actifs", o.healthCheck ?? true, "advanced", {
      help: "Retire automatiquement les cibles en panne (failover).",
    }),
  ]);
}

/** Rôle rate-limiter : limite, rafale, algorithme. */
export function rateLimiterFields(o: {
  limit?: number;
  burst?: number;
  algorithm?: "token-bucket" | "sliding-window";
} = {}): FieldSet {
  return setOf([
    f.num("limit", "Limite (req/s)", o.limit ?? 1000, "capacity", {
      min: 1, max: 100000, step: 1,
    }),
    f.num("burst", "Rafale autorisée", o.burst ?? 200, "capacity", {
      min: 0, max: 100000, step: 10,
      help: "Taille du burst absorbé au-delà de la limite.",
    }),
    f.sel("algorithm", "Algorithme", [
      { value: "token-bucket", label: "Token Bucket" },
      { value: "sliding-window", label: "Fenêtre glissante" },
    ], o.algorithm ?? "token-bucket", "advanced"),
  ]);
}

/** Rôle server : version, instances, temps de traitement, concurrence, timeout… */
export function serverFields(o: {
  versions: SelectOption[];
  version: string;
  instances: number;
  avgServiceMs: number;
  serviceVariability?: number;
  maxConcurrencyPerInstance: number;
  timeoutMs?: number;
  errorRate?: number;
  cpuCoresPerInstance?: number;
  memoryGbPerInstance?: number;
  avgHelp?: string;
  instancesHelp?: string;
}): FieldSet {
  return setOf([
    f.sel("version", "Version", o.versions, o.version, "general"),
    f.num("instances", "Instances", o.instances, "general", {
      min: 1, max: 50, step: 1,
      help: o.instancesHelp ?? "Nombre de copies identiques derrière le répartiteur.",
    }),
    f.num("avgServiceMs", "Temps de traitement moyen (ms)", o.avgServiceMs, "capacity", {
      min: 1, max: 5000, step: 1,
      help: o.avgHelp ?? "Temps CPU/logique hors appels descendants.",
    }),
    f.num("serviceVariability", "Variabilité du traitement (0-1)", o.serviceVariability ?? 0.3, "capacity", {
      min: 0, max: 1, step: 0.05,
      help: "Dispersion type des temps de traitement.",
    }),
    f.num("maxConcurrencyPerInstance", "Concurrence max / instance", o.maxConcurrencyPerInstance, "capacity", {
      min: 1, max: 2000, step: 1,
      help: "Requêtes traitées simultanément par instance.",
    }),
    f.num("timeoutMs", "Timeout (ms)", o.timeoutMs ?? 3000, "advanced", {
      // Max 60 000 aligné sur workerFields : l'agent IA (défaut 60 s,
      // raisonnement multi-étapes) doit rester dans les bornes du curseur.
      min: 100, max: 60000, step: 100,
    }),
    f.num("errorRate", "Taux d'erreur applicatif (0-1)", o.errorRate ?? 0.001, "advanced", {
      min: 0, max: 0.2, step: 0.001,
    }),
    f.num("cpuCoresPerInstance", "CPU / instance (cœurs)", o.cpuCoresPerInstance ?? 2, "advanced", {
      min: 0.5, max: 64, step: 0.5,
    }),
    f.num("memoryGbPerInstance", "Mémoire / instance (Go)", o.memoryGbPerInstance ?? 4, "advanced", {
      min: 0.5, max: 256, step: 0.5,
    }),
  ]);
}

/** Rôle cache : hitRatio, latence, connexions, mémoire, éviction. */
export function cacheFields(o: {
  versions?: SelectOption[];
  version?: string;
  hitRatio?: number;
  avgServiceMs?: number;
  maxConnections?: number;
  memoryGb?: number;
  evictionPolicy?: string;
  hitHelp?: string;
} = {}): FieldSet {
  const fields: CatalogField[] = [];
  if (o.versions && o.version) {
    fields.push(f.sel("version", "Version", o.versions, o.version, "general"));
  }
  fields.push(
    f.num("hitRatio", "Taux de hit (0-1)", o.hitRatio ?? 0.75, "capacity", {
      min: 0, max: 1, step: 0.05,
      help: o.hitHelp ?? "Fraction des lectures servies depuis le cache.",
    }),
    f.num("avgServiceMs", "Latence sur hit (ms)", o.avgServiceMs ?? 2, "capacity", {
      min: 0.1, max: 100, step: 0.1,
    }),
    f.num("maxConnections", "Connexions max", o.maxConnections ?? 10000, "capacity", {
      min: 100, max: 100000, step: 100,
    }),
    f.num("memoryGb", "Mémoire (Go)", o.memoryGb ?? 8, "advanced", {
      min: 0.25, max: 512, step: 0.25,
      help: "Dimensionne le working set cacheable.",
    }),
    f.sel("evictionPolicy", "Politique d'éviction", [
      { value: "allkeys-lru", label: "allkeys-lru" },
      { value: "volatile-lru", label: "volatile-lru" },
      { value: "no-eviction", label: "no-eviction" },
    ], o.evictionPolicy ?? "allkeys-lru", "advanced"),
  );
  return setOf(fields);
}

/** Rôle database : version, lectures/écritures, connexions, volume, réplication. */
export function databaseFields(o: {
  versions: SelectOption[];
  version: string;
  avgReadMs: number;
  avgWriteMs: number;
  maxConnections?: number;
  dataGb?: number;
  cpuCores?: number;
  memoryGb?: number;
  internalCacheEnabled?: boolean;
  replicationPolicy?: "async" | "sync";
  readHelp?: string;
  writeHelp?: string;
}): FieldSet {
  return setOf([
    f.sel("version", "Version", o.versions, o.version, "general"),
    f.num("avgReadMs", "Temps de lecture moyen (ms)", o.avgReadMs, "capacity", {
      min: 0.5, max: 500, step: 0.5,
      help: o.readHelp ?? "Lecture indexée bien dimensionnée.",
    }),
    f.num("avgWriteMs", "Temps d'écriture moyen (ms)", o.avgWriteMs, "capacity", {
      min: 1, max: 1000, step: 1,
      help: o.writeHelp ?? "INSERT/UPDATE avec journal et fsync.",
    }),
    f.num("maxConnections", "Connexions max", o.maxConnections ?? 200, "capacity", {
      min: 10, max: 5000, step: 10,
    }),
    f.num("dataGb", "Taille des données (Go)", o.dataGb ?? 100, "capacity", {
      min: 1, max: 10000, step: 1,
    }),
    f.num("cpuCores", "CPU (cœurs)", o.cpuCores ?? 8, "advanced", { min: 1, max: 128, step: 1 }),
    f.num("memoryGb", "Mémoire (Go)", o.memoryGb ?? 16, "advanced", {
      min: 1, max: 1024, step: 1,
      help: "Dimensionne les buffers internes.",
    }),
    f.bool("internalCacheEnabled", "Cache interne actif", o.internalCacheEnabled ?? true, "advanced", {
      help: "Les buffers internes réduisent les lectures disque.",
    }),
    f.sel("replicationPolicy", "Politique de réplication", [
      { value: "async", label: "Asynchrone" },
      { value: "sync", label: "Synchrone" },
    ], o.replicationPolicy ?? "async", "advanced"),
  ]);
}

/** Rôle replica : instances, lectures, connexions, décalage de réplication. */
export function replicaFields(o: {
  instances?: number;
  avgReadMs?: number;
  maxConnections?: number;
  replicationLagMs?: number;
} = {}): FieldSet {
  return setOf([
    f.num("instances", "Réplicas", o.instances ?? 2, "general", {
      min: 1, max: 16, step: 1,
      help: "Nombre de réplicas de lecture.",
    }),
    f.num("avgReadMs", "Temps de lecture moyen (ms)", o.avgReadMs ?? 14, "capacity", {
      min: 0.5, max: 500, step: 0.5,
    }),
    f.num("maxConnections", "Connexions max / réplica", o.maxConnections ?? 150, "capacity", {
      min: 10, max: 5000, step: 10,
    }),
    f.num("replicationLagMs", "Décalage de réplication (ms)", o.replicationLagMs ?? 200, "advanced", {
      min: 0, max: 5000, step: 50,
      help: "Les lectures peuvent servir des données légèrement anciennes.",
    }),
  ]);
}

/** Rôle queue : profondeur, partitions, persistance. */
export function queueFields(o: {
  maxDepth?: number;
  partitions?: number;
  persistMessages?: boolean;
  partitionsHelp?: string;
  maxDepthHelp?: string;
} = {}): FieldSet {
  return setOf([
    f.num("maxDepth", "Profondeur max (messages)", o.maxDepth ?? 10000, "capacity", {
      min: 100, max: 1000000, step: 100,
      help: o.maxDepthHelp ?? "Nombre de messages tamponnés avant rejet du producteur.",
    }),
    f.num("partitions", "Partitions / shards", o.partitions ?? 3, "advanced", {
      min: 1, max: 128, step: 1,
      help: o.partitionsHelp ?? "Parallelisme de consommation : une partition = un ordre.",
    }),
    f.bool("persistMessages", "Persistance des messages", o.persistMessages ?? true, "advanced", {
      help: "Écriture sur disque : survit à un redémarrage du broker.",
    }),
  ]);
}

/** Rôle worker : instances, temps de traitement, concurrence, timeout. */
export function workerFields(o: {
  instances: number;
  avgProcessingMs: number;
  maxConcurrencyPerInstance?: number;
  timeoutMs?: number;
}): FieldSet {
  return setOf([
    f.num("instances", "Instances", o.instances, "general", { min: 1, max: 200, step: 1 }),
    f.num("avgProcessingMs", "Temps de traitement moyen (ms)", o.avgProcessingMs, "capacity", {
      min: 1, max: 60000, step: 1,
    }),
    f.num("maxConcurrencyPerInstance", "Messages simultanés / instance", o.maxConcurrencyPerInstance ?? 10, "capacity", {
      min: 1, max: 500, step: 1,
    }),
    f.num("timeoutMs", "Timeout (ms)", o.timeoutMs ?? 5000, "advanced", {
      min: 100, max: 60000, step: 100,
    }),
  ]);
}

/** Rôle circuit-breaker : seuil, volume min, cooldown, sondes. */
export function circuitBreakerFields(o: {
  errorThreshold?: number;
  minRequestsToTrip?: number;
  cooldownMs?: number;
  halfOpenProbes?: number;
} = {}): FieldSet {
  return setOf([
    f.num("errorThreshold", "Seuil d'erreur (0-1)", o.errorThreshold ?? 0.5, "capacity", {
      min: 0.05, max: 1, step: 0.05,
    }),
    f.num("minRequestsToTrip", "Requêtes min. avant déclenchement", o.minRequestsToTrip ?? 20, "capacity", {
      min: 5, max: 1000, step: 5,
    }),
    f.num("cooldownMs", "Durée d'ouverture (ms)", o.cooldownMs ?? 5000, "advanced", {
      min: 500, max: 60000, step: 500,
    }),
    f.num("halfOpenProbes", "Sondes en demi-ouverture", o.halfOpenProbes ?? 3, "advanced", {
      min: 1, max: 20, step: 1,
    }),
  ]);
}

/** Rôle proxy (partiel) : capacité, latence, éventuellement connexions. */
export function proxyFields(o: {
  capacityRps?: number;
  latencyMs?: number;
  maxConnections?: number;
  latencyHelp?: string;
  capacityHelp?: string;
} = {}): FieldSet {
  const fields: CatalogField[] = [
    f.num("capacityRps", "Capacité (req/s)", o.capacityRps ?? 20000, "capacity", {
      min: 100, max: 1000000, step: 100,
      help: o.capacityHelp,
    }),
    f.num("latencyMs", "Latence de traitement (ms)", o.latencyMs ?? 5, "capacity", {
      min: 0, max: 2000, step: 0.5,
      help: o.latencyHelp,
    }),
  ];
  if (o.maxConnections !== undefined) {
    fields.push(f.num("maxConnections", "Connexions max", o.maxConnections, "capacity", {
      min: 100, max: 100000, step: 100,
    }));
  }
  return setOf(fields);
}

/** Rôle storage (partiel) : latence d'accès et capacité en requêtes/s. */
export function storageFields(o: {
  latencyMs?: number;
  capacityRps?: number;
} = {}): FieldSet {
  return setOf([
    f.num("latencyMs", "Latence d'accès (ms)", o.latencyMs ?? 40, "capacity", {
      min: 1, max: 500, step: 1,
      help: "Temps de premier octet pour un objet moyen.",
    }),
    f.num("capacityRps", "Capacité (req/s)", o.capacityRps ?? 5000, "capacity", {
      min: 100, max: 1000000, step: 100,
    }),
  ]);
}

/** Composant visuel : champs purement informatifs (1 à 3 max recommandés). */
export function visualFields(fields: CatalogField[]): FieldSet {
  return setOf(fields.slice(0, 3));
}
