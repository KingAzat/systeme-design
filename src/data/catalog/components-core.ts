import type { CatalogComponent } from "@/types";

/**
 * Composants cœur du simulateur — STUB DE RÉFÉRENCE.
 * L'agent catalogue étend ce fichier vers ~100 composants en conservant
 * IMPÉRATIVEMENT les identifiants et les clés de configuration simulées
 * ci-dessous (contrat avec src/engine).
 *
 * NOTE (data-catalog) : le composant `rate-limiter` (clés inchangées) a été
 * déplacé vers la catégorie « network » dans ./extended/network.ts.
 * Sa définition d'origine (limite, rafale, algorithme) reste le contrat moteur.
 */

const f = {
  num: (
    key: string,
    label: string,
    def: number,
    group: "general" | "capacity" | "advanced",
    extra: Partial<CatalogComponent["fields"][number]> = {},
  ): CatalogComponent["fields"][number] => ({
    key, label, type: "number", group, default: def, ...extra,
  }),
  sel: (
    key: string,
    label: string,
    options: { value: string; label: string }[],
    def: string,
    group: "general" | "capacity" | "advanced",
    extra: Partial<CatalogComponent["fields"][number]> = {},
  ): CatalogComponent["fields"][number] => ({
    key, label, type: "select", group, options, default: def, ...extra,
  }),
  bool: (
    key: string,
    label: string,
    def: boolean,
    group: "general" | "capacity" | "advanced",
    extra: Partial<CatalogComponent["fields"][number]> = {},
  ): CatalogComponent["fields"][number] => ({
    key, label, type: "boolean", group, default: def, ...extra,
  }),
};

export const CORE_COMPONENTS: CatalogComponent[] = [
  {
    id: "user",
    name: "Utilisateur",
    category: "clients",
    icon: "User",
    description:
      "Utilisateur final accédant au système via son navigateur ou son application.",
    ports: { inputs: 0, outputs: 1 },
    fields: [
      f.num("weight", "Poids de trafic", 1, "advanced", {
        min: 1, max: 10, step: 1, help: "Répartition du trafic entre plusieurs sources.",
      }),
    ],
    defaults: { weight: 1 },
    maturity: "simulated",
    simRole: "generator",
    subtitleFields: [],
    learning: {
      role: "Point d'entrée du trafic dans l'architecture.",
      howItWorks:
        "Le générateur produit des requêtes selon le scénario de trafic (profil, débit cible, mix lecture/écriture). Plusieurs sources se répartissent le trafic proportionnellement à leur poids.",
      pros: ["Contrôle précis du trafic simulé", "Reproductibilité via la seed"],
      cons: ["Modèle simplifié du comportement humain réel"],
      useCases: ["Simuler des visiteurs d'un site", "Tester une montée en charge"],
      pitfalls: [
        "Confondre utilisateurs actifs et requêtes par seconde : un utilisateur émet des requêtes par intermittence.",
      ],
      concepts: ["Trafic", "Profil de charge", "RPS"],
    },
  },
  {
    id: "traffic-generator",
    name: "Générateur de trafic",
    category: "clients",
    icon: "Gauge",
    description:
      "Source de trafic synthétique paramétrable pour tester l'architecture.",
    ports: { inputs: 0, outputs: 1 },
    fields: [
      f.num("weight", "Poids de trafic", 1, "advanced", {
        min: 1, max: 10, step: 1, help: "Répartition du trafic entre plusieurs générateurs.",
      }),
    ],
    defaults: { weight: 1 },
    maturity: "simulated",
    simRole: "generator",
    subtitleFields: [],
    learning: {
      role: "Injecte un trafic contrôlé dans le système.",
      howItWorks:
        "Les arrivées suivent un processus de Poisson (inter-arrivées exponentielles) modulé par le profil de trafic. La seed garantit la reproductibilité.",
      pros: ["Charge reproductible", "Profils réalistes (pic, vagues…)"],
      cons: ["Ne reproduit pas les corrélations du trafic réel"],
      useCases: ["Test de charge", "Test de stress", "Validation d'un autoscaler"],
      pitfalls: ["Oublier que le débit cible est global au scénario, pas par générateur."],
      concepts: ["Processus de Poisson", "Open vs closed workload"],
    },
  },
  {
    id: "cdn",
    name: "CDN",
    category: "network",
    icon: "Globe",
    description:
      "Réseau de diffusion de contenu qui sert les ressources statiques au plus près des utilisateurs.",
    ports: { inputs: 1, outputs: 1 },
    fields: [
      f.num("cacheHitRatio", "Taux de hit (0-1)", 0.85, "capacity", {
        min: 0, max: 1, step: 0.05, help: "Fraction des requêtes servies directement par le CDN.",
      }),
      f.num("hitLatencyMs", "Latence sur hit (ms)", 12, "capacity", {
        min: 1, max: 500, step: 1,
      }),
      f.num("capacityRps", "Capacité (req/s)", 20000, "capacity", {
        min: 100, max: 1000000, step: 100,
      }),
    ],
    defaults: { cacheHitRatio: 0.85, hitLatencyMs: 12, capacityRps: 20000 },
    maturity: "simulated",
    simRole: "cdn",
    subtitleFields: [],
    learning: {
      role: "Décharge le trafic statique avant qu'il n'atteigne l'origine.",
      howItWorks:
        "Sur un hit, la réponse est servie depuis le nœud edge (latence faible). Sur un miss, la requête est transmise à l'origine puis mise en cache.",
      pros: ["Réduit la latence perçue", "Décharge l'origine", "Résilience géographique"],
      cons: ["Invalidation complexe", "Peu utile pour le contenu dynamique"],
      useCases: ["Sites statiques", "Médias", "Scripts et styles"],
      pitfalls: [
        "Servir du contenu dynamique non cacheable",
        "Taux de hit trop faible : le CDN devient un coût inutile",
      ],
      concepts: ["Edge computing", "Cache hit/miss", "TTL", "Invalidation"],
    },
  },
  {
    id: "load-balancer",
    name: "Load Balancer",
    category: "network",
    icon: "Network",
    description:
      "Répartit le trafic entrant entre plusieurs instances selon une stratégie.",
    ports: { inputs: 1, outputs: 1 },
    fields: [
      f.sel("layer", "Couche", [
        { value: "l4", label: "L4 — Transport (TCP)" },
        { value: "l7", label: "L7 — Application (HTTP)" },
      ], "l7", "general"),
      f.sel("algorithm", "Algorithme de répartition", [
        { value: "round-robin", label: "Round Robin" },
        { value: "least-connections", label: "Least Connections" },
        { value: "ip-hash", label: "IP Hash" },
      ], "least-connections", "capacity", {
        help: "Least Connections répartit selon la charge réelle des cibles.",
      }),
      f.num("instances", "Instances (redondance)", 2, "general", {
        min: 1, max: 4, step: 1, help: "Deux instances évitent un point de défaillance unique.",
      }),
      f.num("capacityRps", "Capacité (req/s)", 50000, "capacity", {
        min: 100, max: 1000000, step: 100,
      }),
      f.num("latencyMs", "Latence de traitement (ms)", 2, "capacity", {
        min: 0, max: 100, step: 0.5,
      }),
      f.bool("healthCheck", "Health checks actifs", true, "advanced", {
        help: "Retire automatiquement les cibles en panne (failover).",
      }),
    ],
    defaults: {
      layer: "l7", algorithm: "least-connections", instances: 2,
      capacityRps: 50000, latencyMs: 2, healthCheck: true,
    },
    maturity: "simulated",
    simRole: "balancer",
    subtitleFields: ["layer", "capacityRps"],
    learning: {
      role: "Point d'entrée qui distribue la charge vers un pool de serveurs.",
      howItWorks:
        "Chaque requête est dirigée vers une cible selon l'algorithme choisi. Les health checks écartent les cibles défaillantes : le trafic bascule vers les survivantes.",
      pros: ["Scaling horizontal", "Haute disponibilité", "Zéro downtime en déploiement"],
      cons: [
        "Un L4 ne voit pas les routes HTTP",
        "L'IP Hash peut déséquilibrer la charge",
      ],
      useCases: ["Pool de serveurs API", "Blue/green deployment", "Répartition multi-région"],
      pitfalls: [
        "Un seul Load Balancer = point de défaillance unique",
        "Oublier les health checks : le trafic continue vers une cible morte",
      ],
      concepts: ["Round Robin", "Least Connections", "Failover", "L4 vs L7"],
    },
  },
  {
    id: "api-server",
    name: "API Server",
    category: "compute",
    icon: "Server",
    description:
      "Serveur applicatif traitant les requêtes : logique métier, validation, orchestration.",
    ports: { inputs: 1, outputs: 1 },
    fields: [
      f.sel("version", "Version", [
        { value: "node-22", label: "Node.js 22" },
        { value: "jvm-21", label: "JVM 21" },
        { value: "go-1.23", label: "Go 1.23" },
        { value: "python-3.12", label: "Python 3.12" },
      ], "node-22", "general"),
      f.num("instances", "Instances", 3, "general", {
        min: 1, max: 50, step: 1, help: "Nombre de copies identiques derrière le répartiteur.",
      }),
      f.num("avgServiceMs", "Temps de traitement moyen (ms)", 45, "capacity", {
        min: 1, max: 5000, step: 1, help: "Temps CPU/logique hors appels descendants.",
      }),
      f.num("serviceVariability", "Variabilité du traitement (0-1)", 0.3, "capacity", {
        min: 0, max: 1, step: 0.05, help: "Dispersion type des temps de traitement.",
      }),
      f.num("maxConcurrencyPerInstance", "Concurrence max / instance", 64, "capacity", {
        min: 1, max: 2000, step: 1, help: "Requêtes traitées simultanément par instance.",
      }),
      f.num("timeoutMs", "Timeout (ms)", 3000, "advanced", {
        min: 100, max: 30000, step: 100,
      }),
      f.num("errorRate", "Taux d'erreur applicatif (0-1)", 0.001, "advanced", {
        min: 0, max: 0.2, step: 0.001,
      }),
      f.num("cpuCoresPerInstance", "CPU / instance (cœurs)", 2, "advanced", {
        min: 0.5, max: 64, step: 0.5,
      }),
      f.num("memoryGbPerInstance", "Mémoire / instance (Go)", 4, "advanced", {
        min: 0.5, max: 256, step: 0.5,
      }),
    ],
    defaults: {
      version: "node-22", instances: 3, avgServiceMs: 45, serviceVariability: 0.3,
      maxConcurrencyPerInstance: 64, timeoutMs: 3000, errorRate: 0.001,
      cpuCoresPerInstance: 2, memoryGbPerInstance: 4,
    },
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["instances"],
    learning: {
      role: "Cœur applicatif : exécute la logique métier de chaque requête.",
      howItWorks:
        "Chaque requête consomme un slot de concurrence pendant son traitement. Au-delà, les requêtes attendent dans une file. La capacité réelle = instances × concurrence / temps moyen.",
      pros: ["Scaling horizontal par ajout d'instances", "Isole la logique métier"],
      cons: [
        "Coût proportionnel aux instances",
        "Un temps de traitement élevé limite le débit par instance",
      ],
      useCases: ["API REST", "GraphQL", "Services métier"],
      pitfalls: [
        "Ajouter des instances sans mesurer : si une dépendance est saturée, cela ne change rien",
        "Concurrence trop élevée → contention CPU et latence qui explose",
      ],
      concepts: ["Loi de Little", "Concurrence", "Scaling horizontal"],
    },
  },
  {
    id: "redis",
    name: "Redis",
    category: "cache",
    icon: "Zap",
    description:
      "Cache en mémoire très rapide pour absorber les lectures répétées.",
    ports: { inputs: 1, outputs: 1 },
    fields: [
      f.sel("version", "Version", [
        { value: "7.2", label: "Redis 7.2" },
        { value: "6.2", label: "Redis 6.2" },
      ], "7.2", "general"),
      f.num("hitRatio", "Taux de hit (0-1)", 0.75, "capacity", {
        min: 0, max: 1, step: 0.05, help: "Fraction des lectures servies depuis le cache.",
      }),
      f.num("avgServiceMs", "Latence sur hit (ms)", 2, "capacity", {
        min: 0.1, max: 100, step: 0.1,
      }),
      f.num("maxConnections", "Connexions max", 10000, "capacity", {
        min: 100, max: 100000, step: 100,
      }),
      f.num("memoryGb", "Mémoire (Go)", 8, "advanced", {
        min: 0.25, max: 512, step: 0.25, help: "Dimensionne le working set cacheable.",
      }),
      f.sel("evictionPolicy", "Politique d'éviction", [
        { value: "allkeys-lru", label: "allkeys-lru" },
        { value: "volatile-lru", label: "volatile-lru" },
        { value: "no-eviction", label: "no-eviction" },
      ], "allkeys-lru", "advanced"),
    ],
    defaults: {
      version: "7.2", hitRatio: 0.75, avgServiceMs: 2, maxConnections: 10000,
      memoryGb: 8, evictionPolicy: "allkeys-lru",
    },
    maturity: "simulated",
    simRole: "cache",
    subtitleFields: [],
    learning: {
      role: "Absorbe les lectures répétées et protège la base de données.",
      howItWorks:
        "Lecture : sur hit, la valeur est servie en mémoire (~1 ms). Sur miss, la requête descend vers la base puis la valeur est mise en cache. Les écritures traversent vers la base (write-around par défaut).",
      pros: ["Latence sub-milliseconde", "Décharge la base", "Structures riches (listes, sets…)"],
      cons: [
        "Coût mémoire élevé",
        "Incohérences possibles avec la base",
        "Taux de hit faible = pure perte",
      ],
      useCases: ["Cache applicatif", "Sessions", "Compteurs", "Rate limiting"],
      pitfalls: [
        "Cacher des données à faible réutilisation",
        "Oublier l'invalidation",
        "S'attendre à ce qu'un cache accélère les écritures",
      ],
      concepts: ["Cache hit/miss", "TTL", "Éviction LRU", "Write-through / write-around"],
    },
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    category: "sql",
    icon: "Database",
    description:
      "Base relationnelle transactionnelle : persistance durable et requêtes structurées.",
    ports: { inputs: 1, outputs: 1 },
    fields: [
      f.sel("version", "Version", [
        { value: "pg-16", label: "PostgreSQL 16" },
        { value: "pg-15", label: "PostgreSQL 15" },
      ], "pg-16", "general"),
      f.num("avgReadMs", "Temps de lecture moyen (ms)", 12, "capacity", {
        min: 0.5, max: 500, step: 0.5, help: "SELECT indexé bien dimensionné.",
      }),
      f.num("avgWriteMs", "Temps d'écriture moyen (ms)", 35, "capacity", {
        min: 1, max: 1000, step: 1, help: "INSERT/UPDATE avec WAL + fsync.",
      }),
      f.num("maxConnections", "Connexions max", 200, "capacity", {
        min: 10, max: 5000, step: 10,
      }),
      f.num("dataGb", "Taille des données (Go)", 100, "capacity", {
        min: 1, max: 10000, step: 1,
      }),
      f.num("cpuCores", "CPU (cœurs)", 8, "advanced", { min: 1, max: 128, step: 1 }),
      f.num("memoryGb", "Mémoire (Go)", 16, "advanced", {
        min: 1, max: 1024, step: 1, help: "Dimensionne shared_buffers.",
      }),
      f.bool("internalCacheEnabled", "Cache interne actif", true, "advanced", {
        help: "Buffers PostgreSQL réduisent les lectures disque.",
      }),
      f.sel("replicationPolicy", "Politique de réplication", [
        { value: "async", label: "Asynchrone" },
        { value: "sync", label: "Synchrone" },
      ], "async", "advanced"),
    ],
    defaults: {
      version: "pg-16", avgReadMs: 12, avgWriteMs: 35, maxConnections: 200,
      dataGb: 100, cpuCores: 8, memoryGb: 16, internalCacheEnabled: true,
      replicationPolicy: "async",
    },
    maturity: "simulated",
    simRole: "database",
    subtitleFields: [],
    learning: {
      role: "Source de vérité durable du système.",
      howItWorks:
        "Chaque requête consomme une connexion et un temps dépendant du type (lecture vs écriture). Au-delà de maxConnections, les clients attendent. La capacité ≈ connexions / temps moyen.",
      pros: ["Transactions ACID", "Requêtes riches", "Écosystème mature"],
      cons: [
        "Scaling vertical coûteux",
        "Le sharding est complexe",
        "Souvent le premier goulot d'étranglement",
      ],
      useCases: ["Données transactionnelles", "Rapports", "Catalogues produits"],
      pitfalls: [
        "Saturer la base de lectures cacheables",
        "Oublier le pool de connexions côté application",
        "Ajouter des réplicas de lecture pour un flux d'écritures dominant",
      ],
      concepts: ["ACID", "WAL", "Réplication", "Pool de connexions", "Index"],
    },
  },
  {
    id: "read-replica",
    name: "Read Replica",
    category: "sql",
    icon: "Copy",
    description:
      "Réplique en lecture seule d'une base primaire pour absorber les lectures.",
    ports: { inputs: 1, outputs: 0 },
    fields: [
      f.num("instances", "Réplicas", 2, "general", {
        min: 1, max: 16, step: 1, help: "Nombre de réplicas de lecture.",
      }),
      f.num("avgReadMs", "Temps de lecture moyen (ms)", 14, "capacity", {
        min: 0.5, max: 500, step: 0.5,
      }),
      f.num("maxConnections", "Connexions max / réplica", 150, "capacity", {
        min: 10, max: 5000, step: 10,
      }),
      f.num("replicationLagMs", "Décalage de réplication (ms)", 200, "advanced", {
        min: 0, max: 5000, step: 50, help: "Les lectures peuvent servir des données légèrement anciennes.",
      }),
    ],
    defaults: { instances: 2, avgReadMs: 14, maxConnections: 150, replicationLagMs: 200 },
    maturity: "simulated",
    simRole: "replica",
    subtitleFields: ["instances"],
    learning: {
      role: "Déporte les lectures du primaire.",
      howItWorks:
        "Le primaire transmet ses écritures aux réplicas (asynchrone en général). Les lectures sont routées vers les réplicas, le primaire garde les écritures.",
      pros: ["Décharge le primaire", "Latence de lecture réduite", "Résilience en lecture"],
      cons: [
        "Inutile si le flux est dominé par des écritures",
        "Cohérence retardée (lag)",
        "Coût de réplication",
      ],
      useCases: ["Tableaux de bord", "Recherche", "Rapports"],
      pitfalls: [
        "Lire des données fraîchement écrites sur un réplica (read-your-writes cassé)",
        "Sous-estimer le lag",
      ],
      concepts: ["Réplication", "Read-your-writes", "Eventual consistency"],
    },
  },
  {
    id: "message-queue",
    name: "Message Queue",
    category: "messaging",
    icon: "Inbox",
    description:
      "File de messages asynchrones découplant producteurs et consommateurs.",
    ports: { inputs: 1, outputs: 1 },
    fields: [
      f.num("maxDepth", "Profondeur max (messages)", 10000, "capacity", {
        min: 100, max: 1000000, step: 100,
      }),
      f.num("partitions", "Partitions / shards", 3, "advanced", {
        min: 1, max: 128, step: 1,
      }),
      f.bool("persistMessages", "Persistance des messages", true, "advanced"),
    ],
    defaults: { maxDepth: 10000, partitions: 3, persistMessages: true },
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: ["partitions"],
    learning: {
      role: "Tampon asynchrone entre producteurs et consommateurs.",
      howItWorks:
        "Les messages sont accumulés dans la file ; les workers connectés en aval les consomment à leur rythme. Si la consommation est plus lente que la production, la file grossit (consumer lag).",
      pros: ["Absorbe les pics", "Découplage temporel", "Reprise après panne"],
      cons: ["Latence ajoutée", "Complexité opérationnelle", "Ordre à gérer"],
      useCases: ["Envoi d'e-mails", "Traitement d'images", "Événements"],
      pitfalls: [
        "Aucun consommateur connecté : la file déborde",
        "Traiter de manière synchrone ce qui pourrait être asynchrone",
      ],
      concepts: ["Asynchronisme", "Consumer lag", "At-least-once", "DLQ"],
    },
  },
  {
    id: "worker",
    name: "Worker",
    category: "compute",
    icon: "Boxes",
    description: "Consommateur asynchrone traitant les messages d'une file.",
    ports: { inputs: 1, outputs: 1 },
    fields: [
      f.num("instances", "Instances", 4, "general", { min: 1, max: 200, step: 1 }),
      f.num("avgProcessingMs", "Temps de traitement moyen (ms)", 150, "capacity", {
        min: 1, max: 60000, step: 1,
      }),
      f.num("maxConcurrencyPerInstance", "Messages simultanés / instance", 10, "capacity", {
        min: 1, max: 500, step: 1,
      }),
      f.num("timeoutMs", "Timeout (ms)", 5000, "advanced", {
        min: 100, max: 60000, step: 100,
      }),
    ],
    defaults: {
      instances: 4, avgProcessingMs: 150, maxConcurrencyPerInstance: 10, timeoutMs: 5000,
    },
    maturity: "simulated",
    simRole: "worker",
    subtitleFields: ["instances"],
    learning: {
      role: "Traite les tâches différées hors du chemin critique des requêtes.",
      howItWorks:
        "Chaque worker consomme des messages de la file et les traite (durée configurable). La vitesse de consommation dépend du nombre d'instances et du temps de traitement.",
      pros: ["Pic de charge absorbé", "Chemin utilisateur rapide"],
      cons: ["Résultats différés", "Observabilité plus difficile"],
      useCases: ["E-mails", "Exports", "Traitement média", "Intégrations"],
      pitfalls: ["Trop peu de workers : le lag s'accumule indéfiniment"],
      concepts: ["Consumer group", "Backpressure", "Idempotence"],
    },
  },
  {
    id: "circuit-breaker",
    name: "Circuit Breaker",
    category: "resilience",
    icon: "HeartPulse",
    description:
      "Coupe l'appel vers une dépendance défaillante pour éviter l'effet cascade.",
    ports: { inputs: 1, outputs: 1 },
    fields: [
      f.num("errorThreshold", "Seuil d'erreur (0-1)", 0.5, "capacity", {
        min: 0.05, max: 1, step: 0.05,
      }),
      f.num("minRequestsToTrip", "Requêtes min. avant déclenchement", 20, "capacity", {
        min: 5, max: 1000, step: 5,
      }),
      f.num("cooldownMs", "Durée d'ouverture (ms)", 5000, "advanced", {
        min: 500, max: 60000, step: 500,
      }),
      f.num("halfOpenProbes", "Sondes en demi-ouverture", 3, "advanced", {
        min: 1, max: 20, step: 1,
      }),
    ],
    defaults: { errorThreshold: 0.5, minRequestsToTrip: 20, cooldownMs: 5000, halfOpenProbes: 3 },
    maturity: "simulated",
    simRole: "circuit-breaker",
    subtitleFields: [],
    learning: {
      role: "Stoppe les appels vers une dépendance qui échoue.",
      howItWorks:
        "Fermé : les appels passent. Si le taux d'erreur dépasse le seuil sur la fenêtre, le circuit s'ouvre : les appels échouent instantanément. Après le cooldown, quelques sondes testent la dépendance (demi-ouvert) avant de refermer.",
      pros: ["Évite la cascade de timeouts", "Libère des ressources", "Reprise progressive"],
      cons: ["Requêtes rejetées pendant l'ouverture", "Seuils à régler finement"],
      useCases: ["Dépendances externes fragiles", "Microservices"],
      pitfalls: ["Cooldown trop court : tempête de sondes", "Seuil trop bas : ouvertures intempestives"],
      concepts: ["Effet cascade", "Fail fast", "Half-open"],
    },
  },
];

export const CORE_COMPONENT_MAP: Record<string, CatalogComponent> = Object.fromEntries(
  CORE_COMPONENTS.map((c) => [c.id, c]),
);
