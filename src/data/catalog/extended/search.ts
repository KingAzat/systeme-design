import type { CatalogComponent } from "@/types";
import { databaseFields, f, proxyFields, visualFields } from "../field";

/** Catégorie recherche et données — index de recherche et plateformes analytiques. */

const elasticsearch = databaseFields({
  versions: [
    { value: "es-8", label: "Elasticsearch 8" },
    { value: "es-7", label: "Elasticsearch 7" },
  ],
  version: "es-8",
  avgReadMs: 15,
  avgWriteMs: 30,
  maxConnections: 200,
  dataGb: 500,
  cpuCores: 16,
  memoryGb: 64,
  internalCacheEnabled: true,
  replicationPolicy: "async",
  readHelp: "Recherche par requête : dépend fortement du filtre et de la taille du résultat.",
  writeHelp: "Indexation : analyse du texte puis écriture dans les segments (refresh différé).",
});

const opensearch = databaseFields({
  versions: [
    { value: "os-2", label: "OpenSearch 2" },
    { value: "os-1", label: "OpenSearch 1" },
  ],
  version: "os-2",
  avgReadMs: 16,
  avgWriteMs: 32,
  maxConnections: 200,
  dataGb: 500,
  cpuCores: 16,
  memoryGb: 64,
  internalCacheEnabled: true,
  replicationPolicy: "async",
});

const dataWarehouse = visualFields([
  f.num("storageTb", "Volume stocké (To)", 50, "general", {
    min: 1, max: 100000, step: 1,
    help: "Taille informative de l'entrepôt.",
  }),
  f.num("queriesPerHour", "Requêtes / heure", 500, "capacity", {
    min: 1, max: 100000, step: 10,
    help: "Charge analytique informative.",
  }),
]);

const dataLake = visualFields([
  f.num("capacityTb", "Capacité (To)", 500, "general", {
    min: 1, max: 1000000, step: 1,
    help: "Volume brut informatif.",
  }),
  f.sel("format", "Format dominant", [
    { value: "parquet", label: "Parquet (colonnaire)" },
    { value: "json", label: "JSON (lignes)" },
  ], "parquet", "capacity"),
]);

const etlPipeline = proxyFields({
  capacityRps: 1000,
  latencyMs: 2000,
  capacityHelp: "Lots de lignes transformés par seconde.",
  latencyHelp: "Latence de bout en bout d'un lot (transformation + écriture destination).",
});

const cdc = proxyFields({
  capacityRps: 8000,
  latencyMs: 50,
  capacityHelp: "Événements de changement capturés par seconde.",
  latencyHelp: "Retard entre l'écriture en base et sa propagation (capture + transport).",
});

export const SEARCH_COMPONENTS: CatalogComponent[] = [
  {
    id: "elasticsearch",
    name: "Elasticsearch",
    category: "search",
    icon: "Search",
    description:
      "Moteur de recherche plein texte distribué : recherche et agrégations rapides à grande échelle.",
    ports: { inputs: 1, outputs: 1 },
    fields: elasticsearch.fields,
    defaults: elasticsearch.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["version"],
    learning: {
      role: "Recherche et analytics sur documents : là où le LIKE SQL rend l'âme.",
      howItWorks:
        "Les documents sont analysés (tokenisation) puis écrits dans des segments inversés — structures qui rendent la recherche par mot quasi instantanée. Le cache de requêtes et le page cache OS accélèrent les recherches répétées. Les écritures deviennent visibles au refresh (~1 s par défaut) : un write-then-search immédiat peut rater.",
      pros: [
        "Recherche plein texte et facettes très rapides",
        "Agrégations analytiques sur de gros volumes",
        "Distribution et réplication natives",
      ],
      cons: [
        "JVM gourmande : la mémoire est la ressource critique",
        "Frais d'indexation élevés (analyse, segments, merges)",
        "Ce n'est pas une base de transaction : source de vérité ailleurs",
      ],
      useCases: ["Recherche produit", "Logs applicatifs", "Autocomplétion", "Tableaux de bord"],
      pitfalls: [
        "Utiliser Elasticsearch comme base principale : la cohérence et les transactions manquent.",
        "Mapping dynamique débridé : explosion du nombre de champs et mappings cassés.",
      ],
      concepts: ["Index inversé", "Analyse/tokenisation", "Refresh", "Agrégations"],
    },
  },
  {
    id: "opensearch",
    name: "OpenSearch",
    category: "search",
    icon: "Search",
    description:
      "Fourche communautaire d'Elasticsearch : mêmes usages de recherche et d'analytique.",
    ports: { inputs: 1, outputs: 1 },
    fields: opensearch.fields,
    defaults: opensearch.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["version"],
    learning: {
      role: "Moteur de recherche open source : indexation, recherche, agrégations et dashboards.",
      howItWorks:
        "Architecture identique à Elasticsearch (Lucene, index inversé, shards/réplicas) : la différence est la licence et la gouvernance. Les performances se raisonnent pareil : mémoire pour le cache JVM/OS, frais d'indexation en écriture, latence de recherche gouvernée par le filtre et la taille du résultat.",
      pros: [
        "Licence open source permissive",
        "Compatibilité d'usage avec l'écosystème Elasticsearch",
      ],
      cons: [
        "Écosystème d'outils commerciaux un peu plus fin",
        "Mêmes exigences de dimensionnement (JVM, mémoire)",
      ],
      useCases: ["Recherche applicative", "Observabilité (logs, traces)", "Analyse de sécurité"],
      pitfalls: [
        "Shards trop petits ou trop nombreux : overhead de cluster par shard.",
        "Requêtes sans pagination bornée (deep paging) : coût mémoire énorme.",
      ],
      concepts: ["Index inversé", "Shard", "Réplica", "Lucene"],
    },
  },
  {
    id: "data-warehouse",
    name: "Entrepôt de données",
    category: "search",
    icon: "ChartColumn",
    description:
      "Entrepôt analytique colonne : requêtes SQL massives pour la décision.",
    ports: { inputs: 1, outputs: 1 },
    fields: dataWarehouse.fields,
    defaults: dataWarehouse.defaults,
    maturity: "visual",
    subtitleFields: ["storageTb"],
    learning: {
      role: "Référentiel analytique structuré : l'histoire agrégée de l'entreprise.",
      howItWorks:
        "Les données sont transformées (modèle en étoile/flocon) puis chargées dans un moteur colonne qui compresse et balaye des milliards de lignes par seconde. Le OLAP s'oppose au OLTP : peu d'utilisateurs, requêtes lourdes, latence en secondes — jamais dans le chemin utilisateur.",
      pros: [
        "Agrégations massives très rapides (vectorisation, colonne)",
        "SQL complet et sémantique stable pour la BI",
      ],
      cons: [
        "Latence en secondes : inutilisable en temps réel",
        "Coût élevé des entrepôts managés à gros volume",
      ],
      useCases: ["Reporting décisionnel", "Cohortes marketing", "Finance consolidée"],
      pitfalls: [
        "Brancher le back-office utilisateur directement dessus : chaque clic coûte des secondes.",
        "Modélisation au fil de l'eau : l'entrepôt devient un lac ininterrogeable.",
      ],
      concepts: ["OLAP vs OLTP", "Modèle en étoile", "Colonne", "BI"],
    },
  },
  {
    id: "data-lake",
    name: "Data lake",
    category: "search",
    icon: "DatabaseBackup",
    description:
      "Dépôt brut multi-format de toutes les données : le lac avant les traitements.",
    ports: { inputs: 1, outputs: 1 },
    fields: dataLake.fields,
    defaults: dataLake.defaults,
    maturity: "visual",
    subtitleFields: ["capacityTb", "format"],
    learning: {
      role: "Zone d'atterrissage universelle : données brutes à moindre coût, formats libres.",
      howItWorks:
        "Le lac stocke fichiers et objets dans leur format d'origine (JSON, Parquet, binaire) sur du stockage objet bon marché. Les traitements (Spark, requêteurs type Presto/Trino/Athena) lisent le lac à la demande. La valeur vient des tables cataloguées (métadonnées) — sans catalogue, un lac est un dépotoir.",
      pros: [
        "Coût au To imbattable",
        "Aucun schéma imposé à l'ingestion : tout est conservable",
      ],
      cons: [
        "Sans gouvernance : « data swamp », introuvable et ininterrogeable",
        "Performances de requête très inférieures à un entrepôt structuré",
      ],
      useCases: ["Archivage brut", "Machine learning", "Exploration avant modélisation"],
      pitfalls: [
        "Aucun catalogue ni aucune couche de métadonnées : plus personne ne sait ce qui est où.",
        "Répondre aux questions métier en direct sur le lac : requêtes de dizaines de minutes.",
      ],
      concepts: ["Catalogue", "Parquet", "Zone brute/curée", "Data swamp"],
    },
  },
  {
    id: "etl-pipeline",
    name: "Pipeline ETL",
    category: "search",
    icon: "Workflow",
    description:
      "Chaîne d'extraction, transformation et chargement des données entre systèmes.",
    ports: { inputs: 1, outputs: 1 },
    fields: etlPipeline.fields,
    defaults: etlPipeline.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps", "latencyMs"],
    learning: {
      role: "Le convoyeur de données : extrait ici, transforme, charge là-bas.",
      howItWorks:
        "Par étapes planifiées ou événementielles : lecture des sources (bases, files, APIs), transformations (nettoyage, jointures, agrégations), écriture vers la destination (entrepôt, lake). Le débit et la latence dépendent de l'ordonnancement : un batch horaire fait économiser du calcul au prix de données en retard d'une heure.",
      pros: [
        "Transformations centralisées et rejouables",
        "Découplage des sources et destinations",
      ],
      cons: [
        "Latence de bout en bout (minutes à heures)",
        "Pipelines fragiles : un changement de schéma en amont casse la chaîne",
      ],
      useCases: ["Alimentation d'entrepôt", "Synchronisation entre systèmes", "Rapports planifiés"],
      pitfalls: [
        "Pipelines sans tests ni rejouabilité : une erreur silencieuse pollue l'entrepôt.",
        "Cacher de la logique métier dans le ETL : le SI devient le code le plus critique et le moins visible.",
      ],
      concepts: ["Batch", "Idempotence", "Ordonnancement", "ELT"],
    },
  },
  {
    id: "cdc",
    name: "CDC",
    category: "search",
    icon: "GitPullRequest",
    description:
      "Capture des changements de données : propage chaque écriture en flux d'événements.",
    ports: { inputs: 1, outputs: 1 },
    fields: cdc.fields,
    defaults: cdc.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["latencyMs"],
    learning: {
      role: "Miroir temps réel d'une base : chaque INSERT/UPDATE/DELETE devient un événement.",
      howItWorks:
        "Le connecteur lit le journal de transactions (WAL, binlog) et publie chaque changement ordonné dans un bus (souvent Kafka). Les consommateurs maintiennent des copies à jour (recherche, cache, entrepôt) sans double écriture applicative. Le lag du CDC mesure le retard de toutes les vues dérivées.",
      pros: [
        "Une seule écriture applicative : le flux propage tout",
        "Ordre et exhaustivité garantis par le journal",
      ],
      cons: [
        "Retard de propagation (lag) : les vues sont toujours légèrement en retard",
        "Opérations avancées à gérer (DDL, troncatures, resnapshots)",
      ],
      useCases: ["Synchroniser recherche et cache", "Audit des changements", "Alimenter un entrepôt"],
      pitfalls: [
        "Supposer la cohérence forte des vues dérivées : c'est de la cohérence à terme.",
        "Schéma évolutif sans contrat : le connecteur interrompt sur surprise.",
      ],
      concepts: ["WAL/binlog", "Lag", "Cohérence à terme", "Log-based replication"],
    },
  },
];
