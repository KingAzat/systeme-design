import type { CatalogComponent } from "@/types";
import { f, queueFields, visualFields, workerFields } from "../field";

/** Catégorie traitements différés — jobs, planification et orchestration. */

const jobQueue = queueFields({
  maxDepth: 20000,
  partitions: 1,
  persistMessages: true,
  maxDepthHelp: "Jobs en attente avant refus des producteurs.",
  partitionsHelp: "Une file unique : l'ordre d'arrivée est l'ordre de traitement.",
});

const cronScheduler = visualFields([
  f.num("jobsScheduled", "Jobs planifiés", 50, "general", {
    min: 1, max: 10000, step: 1,
  }),
  f.sel("granularity", "Granularité minimale", [
    { value: "minute", label: "À la minute" },
    { value: "hour", label: "À l'heure" },
  ], "minute", "capacity"),
]);

const taskScheduler = visualFields([
  f.num("parallelism", "Traitements parallèles", 8, "capacity", {
    min: 1, max: 1000, step: 1,
  }),
  f.num("maxAttempts", "Tentatives par tâche", 3, "advanced", {
    min: 1, max: 10, step: 1,
  }),
]);

const batchProcessing = workerFields({
  instances: 4,
  avgProcessingMs: 2000,
  maxConcurrencyPerInstance: 4,
  timeoutMs: 60000,
});

const workflowOrchestrator = visualFields([
  f.num("steps", "Étapes du flux", 10, "general", {
    min: 2, max: 200, step: 1,
  }),
  f.num("parallelBranches", "Branches parallèles", 3, "capacity", {
    min: 1, max: 50, step: 1,
  }),
]);

export const JOBS_COMPONENTS: CatalogComponent[] = [
  {
    id: "job-queue",
    name: "File de jobs",
    category: "jobs",
    icon: "ListTodo",
    description:
      "File des traitements différés : envoi d'e-mails, exports, recalculs lourds.",
    ports: { inputs: 1, outputs: 1 },
    fields: jobQueue.fields,
    defaults: jobQueue.defaults,
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: ["maxDepth"],
    learning: {
      role: "Attente organisée des travaux hors-ligne : la requête utilisateur repart sans attendre.",
      howItWorks:
        "L'application empile un job (avec ses données) dans la file et répond immédiatement ; des workers le dégagent dès que possible. Priorités et files distinctes évitent qu'un export massif retarde les e-mails transactionnels. La profondeur de file est l'indicateur clé : une file qui croît, c'est un traitement qui ne suit pas.",
      pros: [
        "Chemin utilisateur rapide : le lourd part en arrière-plan",
        "Reprises et priorités intégrées",
      ],
      cons: [
        "Latence de traitement (secondes à minutes)",
        "Jobs à rendre idempotents pour les reprises",
      ],
      useCases: ["E-mails transactionnels", "Génération de documents", "Recalculs périodiques"],
      pitfalls: [
        "Job sérialisant des données volumineuses dans la file : passer par une référence (clé d'objet).",
        "Une seule file sans priorité : les jobs critiques attendent derrière les exports nocturnes.",
      ],
      concepts: ["Priorité", "Idempotence", "Profondeur de file", "Worker"],
    },
  },
  {
    id: "cron-scheduler",
    name: "Planificateur cron",
    category: "jobs",
    icon: "CalendarClock",
    description:
      "Déclenche des travaux à heures fixes : maintenance, rapports, nettoyages.",
    ports: { inputs: 1, outputs: 1 },
    fields: cronScheduler.fields,
    defaults: cronScheduler.defaults,
    maturity: "visual",
    subtitleFields: ["jobsScheduled"],
    learning: {
      role: "L'horloge du système : lance ce qui doit arriver, à l'heure où ça doit arriver.",
      howItWorks:
        "Des expressions cron décrivent les horaires (« 0 3 * * * » = chaque nuit à 3 h) ; le planificateur déclenche les travaux correspondants. Le piège classique : tout le monde planifie à minuit pile — les dépendances communes (base, stockage) prennent tout le pic d'un coup. Un planificateur distribué doit aussi garantir l'unicité : un seul déclencheur, même avec plusieurs instances.",
      pros: [
        "Traitements de maintenance réguliers sans intervention",
        "Heures calmes exploitables (la nuit)",
      ],
      cons: [
        "Heures fixes : pics de charge synchronisés",
        "Unicité de déclenchement à garantir en multi-instances",
      ],
      useCases: ["Rapports nocturnes", "Nettoyage et archivage", "Synchronisations"],
      pitfalls: [
        "Tous les crons à la même minute : la base encaisse tous les jobs simultanément.",
        "Cron dans chaque conteneur : à trois réplicas, chaque job part en triple.",
      ],
      concepts: ["Expression cron", "Heure creuse", "Singleton", "Fenêtre de maintenance"],
    },
  },
  {
    id: "task-scheduler",
    name: "Ordonnanceur de tâches",
    category: "jobs",
    icon: "Clock",
    description:
      "Répartit les tâches entre exécutants disponibles : files de priorité, reprises.",
    ports: { inputs: 1, outputs: 1 },
    fields: taskScheduler.fields,
    defaults: taskScheduler.defaults,
    maturity: "visual",
    subtitleFields: ["parallelism"],
    learning: {
      role: "Chef d'atelier : attribuer les tâches aux exécutants libres, suivre les échecs.",
      howItWorks:
        "L'ordonnanceur maintient une file (souvent à priorités) et distribue les tâches aux workers libres, avec bornes de parallélisme par type de tâche. Les échecs sont relancés jusqu'à un plafond de tentatives puis mis de côté (DLQ). Le parallélisme se règle par type : dix exports simultanés, mais une seule migration de schéma.",
      pros: [
        "Utilisation optimale des exécutants disponibles",
        "Priorités et reprises intégrées",
      ],
      cons: [
        "Ordre d'arrivée globalement perdu (parallélisme)",
        "Une tâche qui bloque un exécutant gèle une part du parallélisme",
      ],
      useCases: ["Traitement de fichiers importés", "Recalculs en masse", "Intégrations en arrière-plan"],
      pitfalls: [
        "Parallélisme égale à l'infini : la base aval est écrasée par les tâches simultanées.",
        "Priorités jamais revues : les tâches de basse priorité n'aboutissent jamais (famine).",
      ],
      concepts: ["File de priorité", "Parallélisme", "Famine", "Reprise"],
    },
  },
  {
    id: "batch-processing",
    name: "Traitement par lots",
    category: "jobs",
    icon: "PackageSearch",
    description:
      "Traitement massif en bloc : millions d'enregistrements par fenêtres planifiées.",
    ports: { inputs: 1, outputs: 1 },
    fields: batchProcessing.fields,
    defaults: batchProcessing.defaults,
    maturity: "simulated",
    simRole: "worker",
    subtitleFields: ["instances", "avgProcessingMs"],
    learning: {
      role: "La masse ouvrière : traiter de gros volumes en fenêtres dédiées, hors heures de pointe.",
      howItWorks:
        "Les enregistrements sont lus par blocs (pagination, partitions), transformés puis écrits en écritures groupées. Les transactions couvrent le lot : un lot en échec est refait entier — la reprise doit être idempotente. La durée totale = volume / débit : dimensionner se fait par règle de trois sur des fenêtres disponibles.",
      pros: [
        "Efficacité maximale par enregistrement (opérations groupées)",
        "Fenêtres creuses exploitées, coût maîtrisé",
      ],
      cons: [
        "Fraîcheur faible : les données de la journée arrivent le lendemain",
        "Un lot en échec retarde toute la chaîne en aval",
      ],
      useCases: ["Facturation mensuelle", "Chargement d'entrepôt", "Recalculs de recommandation"],
      pitfalls: [
        "Lot monolithique non repreneur : trois heures de calcul perdues au dernier bloc.",
        "Fenêtre de batch qui déborde sur l'ouverture du service : les deux charges se marchent dessus.",
      ],
      concepts: ["Lot", "Fenêtre de traitement", "Reprise", "Écriture groupée"],
    },
  },
  {
    id: "workflow-orchestrator",
    name: "Orchestrateur de workflows",
    category: "jobs",
    icon: "Workflow",
    description:
      "Pilote des flux multi-étapes avec états durables : dépendances, parallélisme, reprises.",
    ports: { inputs: 1, outputs: 1 },
    fields: workflowOrchestrator.fields,
    defaults: workflowOrchestrator.defaults,
    maturity: "visual",
    subtitleFields: ["steps", "parallelBranches"],
    learning: {
      role: "Le chef de chantier des traitements longs : séquence les étapes, surveille, relance.",
      howItWorks:
        "Le flux est décrit en étapes avec dépendances ; l'orchestrateur persiste l'état d'avancement — un redémarrage reprend où il s'était arrêté. Les branches parallèles accélèrent, les reprises automatiques absorbent les échecs isolés, et les délais d'attente (attendre un paiement 24 h) se modélisent nativement.",
      pros: [
        "États durables : des flux de plusieurs jours, reproductibles",
        "Visibilité : chaque étape est inspectable",
      ],
      cons: [
        "Une plateforme de plus à opérer",
        "Logique métier attirée dans l'orchestrateur : dur à tester",
      ],
      useCases: ["Onboarding client", "Traitement de dossiers", "Pipelines de médias"],
      pitfalls: [
        "Étapes sans idempotence : une reprise rejoue des effets déjà produits.",
        "Orchestrateur central pour tout, y compris des enchaînements triviaux : complexité imméritée.",
      ],
      concepts: ["État durable", "DAG", "Reprise", "Attente longue"],
    },
  },
];
