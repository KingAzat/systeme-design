import type { CatalogComponent } from "@/types";
import { f, visualFields } from "../field";

/** Catégorie observabilité — mesurer, tracer et alerter sur le système. */

const logs = visualFields([
  f.num("retentionDays", "Rétention (jours)", 30, "general", {
    min: 1, max: 3650, step: 1,
  }),
  f.num("volumeGbPerDay", "Volume (Go/jour)", 50, "capacity", {
    min: 1, max: 100000, step: 1,
    help: "Volume informatif produit par les services.",
  }),
]);

const metriques = visualFields([
  f.num("resolutionSec", "Résolution (s)", 15, "general", {
    min: 1, max: 300, step: 1,
    help: "Granularité informative des échantillons.",
  }),
  f.num("retentionDays", "Rétention (jours)", 90, "capacity", { min: 1, max: 3650, step: 1 }),
]);

const traces = visualFields([
  f.num("sampleRate", "Taux d'échantillonnage (0-1)", 0.1, "general", {
    min: 0.001, max: 1, step: 0.01,
    help: "Fraction des requêtes réellement tracées (informatif).",
  }),
  f.num("retentionDays", "Rétention (jours)", 7, "capacity", { min: 1, max: 365, step: 1 }),
]);

const opentelemetry = visualFields([
  f.sel("protocol", "Protocole d'export", [
    { value: "otlp-grpc", label: "OTLP sur gRPC" },
    { value: "otlp-http", label: "OTLP sur HTTP" },
  ], "otlp-grpc", "general"),
  f.num("batchTimeoutMs", "Envoi par lot (ms)", 5000, "advanced", {
    min: 100, max: 60000, step: 100,
    help: "Cadence informative d'exportation groupée.",
  }),
]);

const prometheus = visualFields([
  f.num("scrapeIntervalSec", "Intervalle de collecte (s)", 15, "general", {
    min: 5, max: 300, step: 5,
  }),
  f.num("retentionDays", "Rétention (jours)", 30, "capacity", { min: 1, max: 3650, step: 1 }),
]);

const grafana = visualFields([
  f.num("dashboards", "Tableaux de bord", 50, "general", {
    min: 1, max: 10000, step: 1,
  }),
  f.num("refreshSec", "Rafraîchissement (s)", 30, "capacity", { min: 5, max: 600, step: 5 }),
]);

const alertes = visualFields([
  f.num("evaluationSec", "Évaluation (s)", 30, "general", {
    min: 5, max: 600, step: 5,
    help: "Cadence informative d'évaluation des règles.",
  }),
  f.num("silenceMin", "Silence après déclenchement (min)", 5, "advanced", {
    min: 0, max: 1440, step: 1,
    help: "Anti-spam : la règle ne re-notifie pas pendant ce délai.",
  }),
]);

export const OBSERVABILITY_COMPONENTS: CatalogComponent[] = [
  {
    id: "logs",
    name: "Journaux",
    category: "observability",
    icon: "FileText",
    description:
      "Événements horodatés émis par les services : la matière première du diagnostic.",
    ports: { inputs: 1, outputs: 1 },
    fields: logs.fields,
    defaults: logs.defaults,
    maturity: "visual",
    subtitleFields: ["retentionDays"],
    learning: {
      role: "Ce qui s'est passé, quand et où : la mémoire des faits du système.",
      howItWorks:
        "Chaque service émet des lignes structurées (JSON) avec horodatage, niveau et identifiants de corrélation (request id, utilisateur). Les journaux sont centralisés, indexés et cherchables. Le volume devient vite énorme : rétention courte pour le debug, agrégats longs pour l'audit.",
      pros: [
        "Recherche plein texte : trouver l'exception exacte",
        "Structure libre : chaque service documente son domaine",
      ],
      cons: [
        "Volume énorme : coût et rétention limitée",
        "Sans identifiant de corrélation : impossible de suivre une requête",
      ],
      useCases: ["Diagnostic après incident", "Audit de sécurité", "Suivi des erreurs métier"],
      pitfalls: [
        "Données personnelles en clair dans les journaux (mot de passe, IBAN) : bombe RGPD.",
        "Logs non structurés : la recherche devient de l'archéologie.",
      ],
      concepts: ["Log structuré", "Correlation id", "Niveau", "Indexation"],
    },
  },
  {
    id: "metriques",
    name: "Métriques",
    category: "observability",
    icon: "ChartLine",
    description:
      "Mesures numériques agrégées dans le temps : latence, débit, erreurs, saturation.",
    ports: { inputs: 1, outputs: 1 },
    fields: metriques.fields,
    defaults: metriques.defaults,
    maturity: "visual",
    subtitleFields: ["resolutionSec"],
    learning: {
      role: "Pouls chiffré du système : tendances, seuils et alertes objectives.",
      howItWorks:
        "Les compteurs, jauges et histogrammes sont échantillonnés à intervalle régulier puis stockés en séries temporelles. Les agrégats (p50/p95/p99, taux d'erreur) se calculent à peu de frais sur des millions de requêtes — c'est le pourquoi du « metrics first » : peu coûteux, très expressif.",
      pros: [
        "Coût marginal faible, rétention longue",
        "Alerting et tableaux de bord immédiats",
      ],
      cons: [
        "Agrégés : ne disent pas quelle requête précise a échoué",
        "Cartes de métriques mal choisies : coût et cardinalité explosent",
      ],
      useCases: ["Alerting SLO", "Tableaux de bord charge", "Capacité et tendances"],
      pitfalls: [
        "Moyennes seules : le p95 et le p99 racontent la souffrance utilisateur, pas la moyenne.",
        "Cardinalité non bornée (métrique par utilisateur) : la base temporelle s'effondre.",
      ],
      concepts: ["Série temporelle", "Percentiles", "Cardinalité", "RED/USE"],
    },
  },
  {
    id: "traces-distribuees",
    name: "Traces distribuées",
    category: "observability",
    icon: "Route",
    description:
      "Suivi d'une requête à travers tous les services : où passe le temps, où naissent les erreurs.",
    ports: { inputs: 1, outputs: 1 },
    fields: traces.fields,
    defaults: traces.defaults,
    maturity: "visual",
    subtitleFields: ["sampleRate"],
    learning: {
      role: "Radiographie d'une requête : chaque saut entre services, avec sa durée.",
      howItWorks:
        "Un identifiant de trace est propagé d'appel en appel ; chaque service enregistre ses segments (spans) avec début, fin et métadonnées. L'assemblage reconstitue la cascade complète. L'échantillonnage limite le coût : on trace 1 % des requêtes… mais 100 % des erreurs, idéalement.",
      pros: [
        "Localise précisément le maillon lent ou fautif d'une cascade",
        "Latence de bout en bout décomposée par saut",
      ],
      cons: [
        "Coût : échantillonnage obligatoire à fort débit",
        "Propagation à instrumenter partout : un service non instrumenté coupe la trace",
      ],
      useCases: ["Diagnostic de latence", "Cartographie des dépendances", "Analyse de pannes intermittentes"],
      pitfalls: [
        "Trace coupée au premier service non instrumenté : la moitié du système est aveugle.",
        "Échantillonnage aléatoire uniforme : les erreurs rares ne sont presque jamais tracées.",
      ],
      concepts: ["Trace id", "Span", "Propagation", "Échantillonnage"],
    },
  },
  {
    id: "opentelemetry",
    name: "OpenTelemetry",
    category: "observability",
    icon: "Radar",
    description:
      "Standard d'instrumentation unique : métriques, traces et journaux dans un même cadre.",
    ports: { inputs: 1, outputs: 1 },
    fields: opentelemetry.fields,
    defaults: opentelemetry.defaults,
    maturity: "visual",
    subtitleFields: ["protocol"],
    learning: {
      role: "Fabrique standardisée de télémétrie : instrumenter une fois, exporter partout.",
      howItWorks:
        "Les SDK OpenTelemetry interceptent bibliothèques et frameworks pour produire traces, métriques et journaux corrélés, exportés en OTLP vers le backend du choix. Le changement de backend devient une configuration, plus une réécriture d'instrumentation.",
      pros: [
        "Un seul cadre pour les trois signaux, corrélés entre eux",
        "Indépendance vis-à-vis du fournisseur d'analyse",
      ],
      cons: [
        "Instrumentation des bibliothèques à configurer finement",
        "Export par lots : quelques secondes de retard sur la fraîcheur",
      ],
      useCases: ["Télémétrie polyglotte", "Migration de backend", "Corrélation logs/traces"],
      pitfalls: [
        "Exporteur bloquant dans le chemin de la requête : la télémétrie ralentit le service.",
        "Taux d'échantillonnage global au lieu de le cibler (erreurs, requêtes lentes).",
      ],
      concepts: ["OTLP", "SDK", "Contexte", "Corrélation"],
    },
  },
  {
    id: "prometheus",
    name: "Prometheus",
    category: "observability",
    icon: "Gauge",
    description:
      "Base de métriques à modèle pull : collecte périodique auprès des services exposants.",
    ports: { inputs: 1, outputs: 1 },
    fields: prometheus.fields,
    defaults: prometheus.defaults,
    maturity: "visual",
    subtitleFields: ["scrapeIntervalSec"],
    learning: {
      role: "Entrepôt de séries temporelles standard de l'écosystème cloud natif.",
      howItWorks:
        "Chaque service expose ses métriques sur /metrics ; le serveur Prometheus les collecte à intervalle fixe et les stocke localement (avec réplication via Thanos/VictoriaMetrics au besoin). Le langage PromQL interroge et agrège les séries ; les règles d'alerte y sont évaluées en continu.",
      pros: [
        "Modèle pull simple et auto-descriptif (le service déclare ses métriques)",
        "PromQL très expressif pour les agrégations",
      ],
      cons: [
        "Collecte à intervalle fixe : pas d'événement entre deux collectes",
        "Stockage local : la longue rétention demande une extension",
      ],
      useCases: ["Métriques Kubernetes", "Alerting applicatif", "Tableaux Grafana"],
      pitfalls: [
        "Cible courte durée (jobs batch) invisible en modèle pull : utiliser PushGateway.",
        "Rétention locale par défaut trop courte pour l'analyse de tendance annuelle.",
      ],
      concepts: ["Pull", "PromQL", "Exporter", "Série temporelle"],
    },
  },
  {
    id: "grafana",
    name: "Grafana",
    category: "observability",
    icon: "ChartColumn",
    description:
      "Tableaux de bord et visualisation multi-sources : la vitrine de l'observabilité.",
    ports: { inputs: 1, outputs: 1 },
    fields: grafana.fields,
    defaults: grafana.defaults,
    maturity: "visual",
    subtitleFields: ["dashboards"],
    learning: {
      role: "Lecture visuelle des signaux : tableaux de bord partagés et explorables.",
      howItWorks:
        "Grafana interroge plusieurs sources (Prometheus, logs, traces) et restitue séries, histogrammes et cartes thermiques. Les tableaux vivent en code (JSON versionné) ou en base : la pratique saine les gère comme du code. Les annotations croisent déploiements et métriques : la corrélation cause-effet devient visuelle.",
      pros: [
        "Une vitrine unique pour toutes les sources de données",
        "Exploration interactive : zoom temporel, drill-down",
      ],
      cons: [
        "Tableaux de bord non versionnés : « qui a changé le graphe ? »",
        "Trop de tableaux, personne ne regarde : privilégier peu de vues pertinentes",
      ],
      useCases: ["Vue d'exploitation", "Post-mortem illustré", "Statut temps réel aux équipes"],
      pitfalls: [
        "Tableaux par service sans vue de bout en bout : on voit les pièces, jamais le trajet.",
        "Alertes définies dans les tableaux plutôt que comme code : elles partent avec l'auteur.",
      ],
      concepts: ["Dashboard as code", "Drill-down", "Annotation"],
    },
  },
  {
    id: "alertes",
    name: "Alertes",
    category: "observability",
    icon: "Bell",
    description:
      "Notification automatique quand un seuil est franchi : le système appelle au secours.",
    ports: { inputs: 1, outputs: 1 },
    fields: alertes.fields,
    defaults: alertes.defaults,
    maturity: "visual",
    subtitleFields: ["evaluationSec"],
    learning: {
      role: "Traduire les métriques en action humaine : avertir qui peut réagir, au bon moment.",
      howItWorks:
        "Des règles évaluent les métriques à intervalle régulier ; un franchissement durable (pas un pic isolé) déclenche la notification vers les astreints. La qualité d'une alerte se mesure à son ratio signal/bruit : une alerte qui se déclenche sans nécessiter d'action est du bruit qui endort la vigilance.",
      pros: [
        "Détection précoce sans surveillance humaine continue",
        "Routing par gravité et par équipe",
      ],
      cons: [
        "Trop d'alertes : fatigue d'alerte, les vraies passent inaperçues",
        "Seuils statiques sur des charges variables : fausses alertes nocturnes",
      ],
      useCases: ["SLO dégradé", "Saturation imminente", "Pannes de dépendances"],
      pitfalls: [
        "Alerter sur la cause (CPU élevé) plutôt que le symptôme utilisateur (p95 dégradé).",
        "Pages nocturnes pour des choses qui peuvent attendre 9 h : l'astreinte ne tient pas.",
      ],
      concepts: ["Seuil", "Burn rate", "Fatigue d'alerte", "Routing"],
    },
  },
];
