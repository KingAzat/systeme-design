import type { CatalogComponent } from "@/types";
import { databaseFields } from "../field";

/** Catégorie NoSQL — familles de stockage non relationnelles. */

const mongodb = databaseFields({
  versions: [
    { value: "mongo-7", label: "MongoDB 7" },
    { value: "mongo-6", label: "MongoDB 6" },
  ],
  version: "mongo-7",
  avgReadMs: 8,
  avgWriteMs: 10,
  maxConnections: 500,
  dataGb: 500,
  cpuCores: 8,
  memoryGb: 32,
  internalCacheEnabled: true,
  replicationPolicy: "async",
  readHelp: "Lecture de document par clé ou index (cache WiredTiger incluant).",
  writeHelp: "Écriture de document reconnue par le replica set (write concern majoritaire).",
});

const cassandra = databaseFields({
  versions: [
    { value: "cassandra-5", label: "Cassandra 5" },
    { value: "cassandra-4.1", label: "Cassandra 4.1" },
  ],
  version: "cassandra-5",
  avgReadMs: 4,
  avgWriteMs: 20,
  maxConnections: 1000,
  dataGb: 2000,
  cpuCores: 16,
  memoryGb: 64,
  internalCacheEnabled: true,
  replicationPolicy: "async",
  readHelp: "Lecture par clé de partition : le chemin optimisé du modèle de données.",
  writeHelp: "Écriture dans le commit log et les memtables — coût amplifier par la réplication multi-nœuds.",
});

const dynamodb = databaseFields({
  versions: [
    { value: "ondemand", label: "Mode à la demande" },
    { value: "provisioned", label: "Capacité provisionnée" },
  ],
  version: "ondemand",
  avgReadMs: 5,
  avgWriteMs: 8,
  maxConnections: 1000,
  dataGb: 100,
  cpuCores: 16,
  memoryGb: 32,
  internalCacheEnabled: true,
  replicationPolicy: "async",
  readHelp: "GetItem par clé : latence stable à un chiffre en conditions nominales.",
  writeHelp: "Écriture répliquée sur plusieurs zones de disponibilité.",
});

const cockroachdb = databaseFields({
  versions: [
    { value: "crdb-24.2", label: "CockroachDB 24.2" },
    { value: "crdb-23.2", label: "CockroachDB 23.2" },
  ],
  version: "crdb-24.2",
  avgReadMs: 8,
  avgWriteMs: 20,
  maxConnections: 300,
  dataGb: 500,
  cpuCores: 32,
  memoryGb: 64,
  internalCacheEnabled: true,
  replicationPolicy: "sync",
  readHelp: "Lecture locale ou par quorum de réplicas.",
  writeHelp: "Validation Raft sur plusieurs nœuds : le prix de la cohérence forte.",
});

const baseCleValeur = databaseFields({
  versions: [
    { value: "kv-v3", label: "Moteur KV v3" },
    { value: "kv-v2", label: "Moteur KV v2" },
  ],
  version: "kv-v3",
  avgReadMs: 2,
  avgWriteMs: 4,
  maxConnections: 1000,
  dataGb: 50,
  cpuCores: 4,
  memoryGb: 16,
  internalCacheEnabled: true,
  replicationPolicy: "async",
  readHelp: "Accès direct par clé : le chemin le plus court possible.",
  writeHelp: "Écriture légère, sans index secondaire ni transaction multi-clés.",
});

const baseDistribuee = databaseFields({
  versions: [
    { value: "distributed-v3", label: "Couche distribuée v3" },
    { value: "distributed-v2", label: "Couche distribuée v2" },
  ],
  version: "distributed-v3",
  avgReadMs: 15,
  avgWriteMs: 40,
  maxConnections: 400,
  dataGb: 2000,
  cpuCores: 32,
  memoryGb: 128,
  internalCacheEnabled: true,
  replicationPolicy: "sync",
  readHelp: "Lecture potentiellement multi-nœuds (agrégats, quorum).",
  writeHelp: "Écriture coordonnée entre nœuds : consensus et sérialisation inclus.",
});

export const NOSQL_COMPONENTS: CatalogComponent[] = [
  {
    id: "mongodb",
    name: "MongoDB",
    category: "nosql",
    icon: "FileJson",
    description:
      "Base de documents JSON flexibles : écritures rapides et schémas évolutifs.",
    ports: { inputs: 1, outputs: 1 },
    fields: mongodb.fields,
    defaults: mongodb.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["version"],
    learning: {
      role: "Persistance de documents semi-structurés quand le schéma évolue vite.",
      howItWorks:
        "Les documents BSON sont lus et écrits entiers ; le cache WiredTiger garde les documents chauds en mémoire. Les écritures sont répliquées vers le replica set (write concern réglable : 1 pour la vitesse, majority pour la durabilité). Les index secondaires accélèrent les requêtes par champ.",
      pros: [
        "Écritures rapides : pas de jointures ni de schéma figé",
        "Schéma flexible : les champs arrivent sans migration",
        "Réplication et failover automatique natifs",
      ],
      cons: [
        "Pas de jointures riches : l'agrégation se fait applicativement ou en pipeline",
        "Documents très gros = lectures entières coûteuses",
      ],
      useCases: ["Catalogues produits", "Profils utilisateurs", "Contenu éditorial", "IOT"],
      pitfalls: [
        "Concevoir comme du relationnel avec jointures : performances désastreuses.",
        "Write concern à 1 sur des données critiques : une panne perd des écritures confirmées.",
      ],
      concepts: ["Document", "Replica set", "Write concern", "Index secondaire"],
    },
  },
  {
    id: "cassandra",
    name: "Cassandra",
    category: "nosql",
    icon: "Grid2x2",
    description:
      "Base colonne distribuée : lectures par clé très rapides et linéarité de montée en charge.",
    ports: { inputs: 1, outputs: 1 },
    fields: cassandra.fields,
    defaults: cassandra.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["version"],
    learning: {
      role: "Stockage massivement distribué, à disponibilité privilégiée sur la cohérence immédiate.",
      howItWorks:
        "Les données sont réparties par clé de partition sur un anneau de nœuds (consistent hashing) et répliquées. Écrire revient à journaliser sur les réplicas concernés ; lire interroge les réplicas selon le niveau de cohérence (ONE pour la vitesse, QUORUM pour la justesse). Il n'y a pas de maître : chaque nœud accepte les écritures.",
      pros: [
        "Montée en charge linéaire par ajout de nœuds",
        "Aucun point de défaillance (pas de maître)",
        "Excellent sur les charges massives par clé",
      ],
      cons: [
        "Modèle de données à concevoir autour des requêtes (pas d'ad-hoc)",
        "Cohérence réglable : lectures anciennes possibles (stale reads)",
        "Opérations de cluster (rééquilibrage, réparations) délicates",
      ],
      useCases: ["Séries temporelles", "Messagerie", "Données capteurs", "Profils à très grande échelle"],
      pitfalls: [
        "Requêtes ad-hoc sans clé de partition : scan massif et timeouts.",
        "Niveau de cohérence ONE sur des données lues-juste-after-write.",
      ],
      concepts: ["Clé de partition", "Consistent hashing", "QUORUM", "Stale read"],
    },
  },
  {
    id: "dynamodb",
    name: "DynamoDB",
    category: "nosql",
    icon: "Zap",
    description:
      "Base clé-valeur managée : latence à un chiffre et scaling invisible.",
    ports: { inputs: 1, outputs: 1 },
    fields: dynamodb.fields,
    defaults: dynamodb.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["version"],
    learning: {
      role: "Stockage clé-valeur sans infrastructure : la plateforme gère partitions et réplicas.",
      howItWorks:
        "Les éléments sont répartis par clé de partition sur des partitions gérées par AWS ; la capacité est soit provisionnée (RWC/WCU) soit à la demande. Les écritures sont répliquées sur trois zones de disponibilité. En mode provisionné, dépasser la capacité se traduit par des rejets explicites (throttling).",
      pros: [
        "Latence stable à un chiffre à toute échelle",
        "Aucune opération d'infrastructure (patchs, réplicas, pannes)",
        "Facturation précise par requête en mode à la demande",
      ],
      cons: [
        "Requêtes par clé ou index uniquement : pas d'ad-hoc",
        "Coût qui grimpe vite sur les gros volumes scannés",
        "Throttling brutal si la capacité est mal calibrée",
      ],
      useCases: ["Paniers e-commerce", "Sessions", "Jeux en ligne", "Backends serverless"],
      pitfalls: [
        "Hot partition : une clé ultra-populaire sature une seule partition.",
        "Scans au lieu de requêtes par clé : la facture et les rejets suivent.",
      ],
      concepts: ["Partition", "Hot key", "Throttling", "RCU/WCU"],
    },
  },
  {
    id: "cockroachdb",
    name: "CockroachDB",
    category: "nosql",
    icon: "GitBranch",
    description:
      "SQL distribué avec transactions sérialisables et survie à la perte d'une zone entière.",
    ports: { inputs: 1, outputs: 1 },
    fields: cockroachdb.fields,
    defaults: cockroachdb.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["version"],
    learning: {
      role: "SQL distribué : la cohérence forte et la survie de zone sans renoncer aux requêtes.",
      howItWorks:
        "Les données sont découpées en ranges répliqués sur plusieurs nœuds ; chaque écriture passe par un consensus Raft avant confirmation. Les transactions distribuées utilisent un horloge hybride et des relais de commit. Résultat : SQL familier + résilience de datacenter, au prix d'écritures plus lentes qu'une base mono-site.",
      pros: [
        "Transactions ACID distribuées (sérialisables)",
        "Survie à la perte d'une zone/région entière",
        "Repartition automatique des plages chaudes",
      ],
      cons: [
        "Écritures plus lentes (consensus multi-nœuds)",
        "Complexité opérationnelle et coût de réplication",
      ],
      useCases: ["Données financières multi-régions", "Systèmes réglementés", "Catalogues globaux cohérents"],
      pitfalls: [
        "Lignes très chaudes : chaque écriture traverse un consensus sur une seule plage.",
        "Sous-estimer le surcoût d'écriture par rapport à une base mono-site.",
      ],
      concepts: ["Raft", "Range", "Horloge hybride", "Cohérence forte"],
    },
  },
  {
    id: "base-cle-valeur",
    name: "Base clé-valeur",
    category: "nosql",
    icon: "KeyRound",
    description:
      "Stockage minimaliste : une clé, une valeur, des accès ultra-courts.",
    ports: { inputs: 1, outputs: 1 },
    fields: baseCleValeur.fields,
    defaults: baseCleValeur.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["avgReadMs"],
    learning: {
      role: "Le stockage le plus simple possible : retrieval par clé, rien d'autre.",
      howItWorks:
        "Le moteur maintient une table de hachage (ou un LSM-tree) clé → valeur. Aucune jointure, aucune requête par champ : la latence de lecture se compte en millisecondes, voire moins. Tout ce qui n'est pas « get/set » relève de l'application.",
      pros: [
        "Latence minimale et prévisible",
        "Modèle mental trivial à dimensionner",
      ],
      cons: [
        "Aucune requête par contenu : tout passe par la clé",
        "Modélisation à faire côté application (dénormalisation manuelle)",
      ],
      useCases: ["Préférences utilisateur", "Compteurs", "Petites données attachées à une clé"],
      pitfalls: [
        "Vouloir retrouver les données sans connaître la clé : impossible par construction.",
        "Valeurs énormes : la latence redevient celle du réseau.",
      ],
      concepts: ["Table de hachage", "LSM-tree", "Dénormalisation"],
    },
  },
  {
    id: "base-donnees-distribuee",
    name: "Base distribuée",
    category: "nosql",
    icon: "Network",
    description:
      "Couche de stockage répartie sur plusieurs nœuds : cohérence par consensus.",
    ports: { inputs: 1, outputs: 1 },
    fields: baseDistribuee.fields,
    defaults: baseDistribuee.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["replicationPolicy"],
    learning: {
      role: "Stockage réparti : les données vivent sur plusieurs nœuds à la fois.",
      howItWorks:
        "Chaque lecture/écriture est routée vers les nœuds responsables du fragment concerné. Selon le niveau de cohérence, une écriture attend un quorum de réplicas (synchrone) ou se propage en tâche de fond (asynchrone). La latence inclut le détour réseau et, en synchrone, le consensus.",
      pros: [
        "Volume et disponibilité au-delà d'une seule machine",
        "Pannes de nœuds absorbées sans intervention",
      ],
      cons: [
        "Latence supérieure à une base locale (réseau + coordination)",
        "Cohérence et performance : un arbitrage permanent",
      ],
      useCases: ["Données régionalisées", "Volumes au-delà du teraoctet", "Disponibilité continue"],
      pitfalls: [
        "Espérer la latence d'une base mono-serveur : la distribution a un coût incompressible.",
        "Cohérence asynchrone sur des données critiques : divergence silencieuse.",
      ],
      concepts: ["Quorum", "Consensus", "Réplication", "Partitionnement"],
    },
  },
];
