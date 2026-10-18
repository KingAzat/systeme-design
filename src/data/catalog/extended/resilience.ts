import type { CatalogComponent } from "@/types";
import { f, visualFields } from "../field";

/** Catégorie résilience — motifs de survie aux pannes (visuels, pédagogiques). */

const retry = visualFields([
  f.num("maxAttempts", "Tentatives max", 3, "general", {
    min: 1, max: 10, step: 1,
    help: "Nombre total de tentatives (informatif).",
  }),
  f.num("backoffMs", "Délai initial (ms)", 200, "capacity", {
    min: 10, max: 60000, step: 10,
    help: "Croissance exponentielle avec jitter depuis cette base (informatif).",
  }),
  f.sel("strategy", "Stratégie", [
    { value: "exponential", label: "Exponentielle + jitter" },
    { value: "fixed", label: "Fixe" },
  ], "exponential", "advanced"),
]);

const timeout = visualFields([
  f.num("timeoutMs", "Timeout (ms)", 2000, "general", {
    min: 100, max: 60000, step: 100,
    help: "Délai max avant abandon de l'appel (informatif).",
  }),
]);

const bulkhead = visualFields([
  f.num("maxConcurrent", "Appels simultanés max", 100, "capacity", {
    min: 1, max: 10000, step: 1,
    help: "Cloison : au-delà, rejet immédiat plutôt que file infinie (informatif).",
  }),
  f.num("queueSize", "File d'attente du cloison", 50, "advanced", {
    min: 0, max: 10000, step: 10,
  }),
]);

const failover = visualFields([
  f.num("targets", "Cibles de repli", 2, "general", {
    min: 1, max: 10, step: 1,
    help: "Nombre de copies prêtes à prendre le relais (informatif).",
  }),
  f.num("switchMs", "Temps de bascule (ms)", 5000, "capacity", {
    min: 100, max: 600000, step: 100,
    help: "Détection + promotion d'une cible saine (informatif).",
  }),
]);

const healthCheck = visualFields([
  f.num("intervalSec", "Intervalle (s)", 10, "general", {
    min: 1, max: 300, step: 1,
  }),
  f.num("timeoutMs", "Timeout du contrôle (ms)", 2000, "capacity", {
    min: 100, max: 30000, step: 100,
  }),
  f.num("healthyThreshold", "Succès pour déclarer sain", 3, "advanced", {
    min: 1, max: 10, step: 1,
  }),
]);

const replication = visualFields([
  f.num("factor", "Facteur de réplication", 3, "general", {
    min: 1, max: 7, step: 1,
    help: "Nombre de copies de chaque donnée (informatif).",
  }),
  f.sel("mode", "Mode", [
    { value: "async", label: "Asynchrone" },
    { value: "sync", label: "Synchrone (quorum)" },
  ], "async", "capacity"),
]);

const strategieReprise = visualFields([
  f.num("rpoMinutes", "RPO (min)", 15, "general", {
    min: 0, max: 1440, step: 1,
    help: "Perte de données maximale admissible (informatif).",
  }),
  f.num("rtoMinutes", "RTO (min)", 60, "capacity", {
    min: 1, max: 10080, step: 1,
    help: "Temps maximal de reprise du service (informatif).",
  }),
]);

export const RESILIENCE_COMPONENTS: CatalogComponent[] = [
  {
    id: "retry",
    name: "Retry",
    category: "resilience",
    icon: "RefreshCw",
    description:
      "Nouvelle tentative automatique d'un appel échoué, avec délai croissant.",
    ports: { inputs: 1, outputs: 1 },
    fields: retry.fields,
    defaults: retry.defaults,
    maturity: "visual",
    subtitleFields: ["maxAttempts"],
    learning: {
      role: "Absorber les échecs transitoires (réseau, redémarrage) sans remonter l'erreur à l'utilisateur.",
      howItWorks:
        "L'appel est relancé jusqu'à N fois, avec un délai qui double à chaque tentative, agrémenté d'un jitter aléatoire pour éviter que tous les clients réessaillent en même temps. Le retry ne convient qu'aux erreurs transitoires : persister sur une erreur métier (409) ou un bug ne fait que multiplier les dégâts.",
      pros: [
        "Les pannes brèves deviennent invisibles pour l'utilisateur",
        "Mise en œuvre locale, sans infrastructure",
      ],
      cons: [
        "Multiplie la charge en cas de panne réelle (jusqu'à 2^N tentatives)",
        "Peut dupliquer des effets si l'opération n'est pas idempotente",
      ],
      useCases: ["Appels réseau inter-services", "Intégrations tierces", "Connexions à la base"],
      pitfalls: [
        "Retry immédiat sans backoff : la dépendance à peine relevée est aussitôt frappée.",
        "Retrier un POST non idempotent : double facturation.",
      ],
      concepts: ["Backoff exponentiel", "Jitter", "Idempotence", "Tempête de retries"],
    },
  },
  {
    id: "timeout",
    name: "Timeout",
    category: "resilience",
    icon: "Timer",
    description:
      "Délai maximal d'attente d'une réponse : échouer vite plutôt que bloquer longtemps.",
    ports: { inputs: 1, outputs: 1 },
    fields: timeout.fields,
    defaults: timeout.defaults,
    maturity: "visual",
    subtitleFields: ["timeoutMs"],
    learning: {
      role: "Borne supérieure d'attente : la lenteur extrême est traitée comme une panne.",
      howItWorks:
        "Chaque appel démarre un chronomètre ; à expiration, l'appel est abandonné et la ressource libérée. Sans timeout, une dépendance lente consomme indéfiniment threads et connexions — la panne se propage par épuisement local. Le budget de temps se décompose : chaque saut garde sa part du temps total de la requête.",
      pros: [
        "Échec rapide : les ressources sont libérées pour d'autres requêtes",
        "La panne d'une dépendance n'asphyxie plus l'appelant",
      ],
      cons: [
        "Trop court : abandon de requêtes qui auraient abouti",
        "Trop long : l'utilisateur attend ce que sa propre patience n'admet pas",
      ],
      useCases: ["Appels entre services", "Requêtes utilisateur", "Intégrations tierces"],
      pitfalls: [
        "Timeout par défaut infini (ou de plusieurs minutes) du SDK.",
        "Timeouts empilés incohérents : celui du haut expire avant ceux du bas, qui continuent pour rien.",
      ],
      concepts: ["Fail fast", "Budget de latence", "Timeout en cascade"],
    },
  },
  {
    id: "bulkhead",
    name: "Bulkhead",
    category: "resilience",
    icon: "Split",
    description:
      "Cloisonnement des ressources par dépendance : une panne n'engloutit pas tout le pool.",
    ports: { inputs: 1, outputs: 1 },
    fields: bulkhead.fields,
    defaults: bulkhead.defaults,
    maturity: "visual",
    subtitleFields: ["maxConcurrent"],
    learning: {
      role: "Compartiments étanches : chaque dépendance dispose de sa quote-part de concurrence.",
      howItWorks:
        "Un pool dédié (threads, connexions, sémaphores) borne les appels vers chaque dépendance ; au-delà, les nouveaux appels sont rejetés immédiatement. Un service lent ne peut donc consommer que son compartiment — le reste du système conserve sa capacité. Comme sur un navire : une voie d'eau inonde une seule soute.",
      pros: [
        "Une dépendance lente ne draine plus toutes les ressources",
        "Rejets immédiats : l'utilisateur sait vite que ça n'ira pas",
      ],
      cons: [
        "Dimensionnement des compartiments à régler (tous n'ont pas le même besoin)",
        "Sous-utilisation : les capacités ne se partagent pas entre cloisons",
      ],
      useCases: ["Appels tiers lents", "Isolation de locataires", "Pools de connexions séparés"],
      pitfalls: [
        "Cloisons égales pour des dépendances à débits très inégaux : gaspillage et rejets.",
        "File d'attente du cloison trop profonde : elle recrée l'attente qu'elle devait éviter.",
      ],
      concepts: ["Cloisonnement", "Sémaphore", "Rejet rapide", "Isolation"],
    },
  },
  {
    id: "failover",
    name: "Failover",
    category: "resilience",
    icon: "LifeBuoy",
    description:
      "Bascule automatique vers une copie saine quand la cible principale tombe.",
    ports: { inputs: 1, outputs: 1 },
    fields: failover.fields,
    defaults: failover.defaults,
    maturity: "visual",
    subtitleFields: ["targets", "switchMs"],
    learning: {
      role: "Continuité par redondance : la panne d'une copie est résorbée par les autres.",
      howItWorks:
        "Les cibles saines sont surveillées ; à la détection d'une panne, le trafic est redirigé (load balancer, DNS, réélection de maître). La durée de bascule — détection plus promotion — est le temps d'indisponibilité constaté : elle se compte en secondes, pas en millisecondes.",
      pros: [
        "Indisponibilité bornée à la durée de bascule",
        "Sans intervention humaine (la nuit comme le jour)",
      ],
      cons: [
        "Redondance = coût des copies inactives",
        "Bascules imparfaites : données en retard, connexions à rétablir",
      ],
      useCases: ["Bases avec réplicas", "Load balancer multi-instances", "Multi-région"],
      pitfalls: [
        "Copies jamais testées en bascule : le failover échoue le jour J.",
        "Bascule automatique sans garde : oscillations quand la cible revient (flapping).",
      ],
      concepts: ["Détection de panne", "Promotion", "Flapping", "Redondance"],
    },
  },
  {
    id: "health-check",
    name: "Health check",
    category: "resilience",
    icon: "HeartPulse",
    description:
      "Sondes régulières de santé : signale l'état réel des composants au système.",
    ports: { inputs: 1, outputs: 1 },
    fields: healthCheck.fields,
    defaults: healthCheck.defaults,
    maturity: "visual",
    subtitleFields: ["intervalSec"],
    learning: {
      role: "Pouls du système : décider objectivement qui est sain et recevra du trafic.",
      howItWorks:
        "Une sonde interroge un point de contrôle (route dédiée, commande) à intervalle régulier. Les réponses alimentent les décisions : retrait du pool, alerte, déclenchement de bascule. Liveness (« le processus vit ») et readiness (« je peux servir ») se distinguent : un service qui démarre vit mais n'est pas prêt.",
      pros: [
        "Décisions automatiques fondées sur l'état réel, pas sur des hypothèses",
        "Détection précoce des dégradations",
      ],
      cons: [
        "Sondes trop simplistes : « 200 OK » alors que la base est morte",
        "Coût des sondes à très haute fréquence sur de grosses flottes",
      ],
      useCases: ["Pools de load balancer", "Orchestrateurs de conteneurs", "Alerting"],
      pitfalls: [
        "Health check qui vérifie son propre processus mais aucune dépendance : trafic envoyé à un service aveugle.",
        "Readiness faussement positive au démarrage : requêtes vers un service non initialisé.",
      ],
      concepts: ["Liveness", "Readiness", "Détection", "Retrait du pool"],
    },
  },
  {
    id: "replication",
    name: "Réplication",
    category: "resilience",
    icon: "Copy",
    description:
      "Copies synchronisées des données : survie à la perte d'un nœud et lectures réparties.",
    ports: { inputs: 1, outputs: 1 },
    fields: replication.fields,
    defaults: replication.defaults,
    maturity: "visual",
    subtitleFields: ["factor", "mode"],
    learning: {
      role: "Redondance des données : plusieurs copies physiques de la même information.",
      howItWorks:
        "Chaque écriture est propagée aux réplicas, soit après quorum (synchrone : cohérence au prix de la latence), soit en tâche de fond (asynchrone : rapide mais retard possible). Le facteur de réplication et le placement des copies déterminent ce que le système survit : un facteur 3 sur 3 zones résiste à une zone entière perdue.",
      pros: [
        "Perte d'un nœud sans perte de données",
        "Lectures réparties sur les copies",
      ],
      cons: [
        "Asynchrone : copies en retard (lectures périmées possibles)",
        "Coût de stockage et de bande passante multiplié",
      ],
      useCases: ["Bases de données", "Kafka (min.insync.replicas)", "Systèmes de fichiers distribués"],
      pitfalls: [
        "Réplication asynchrone considérée comme sauvegarde : la panne du primaire perd les dernières écritures.",
        "Facteur de réplication supérieur au nombre de zones : les copies se superposent sans bénéfice.",
      ],
      concepts: ["Quorum", "Facteur de réplication", "Lag", "RPO"],
    },
  },
  {
    id: "strategie-reprise",
    name: "Stratégie de reprise",
    category: "resilience",
    icon: "RotateCcw",
    description:
      "Plan de continuité : RPO et RTO cibles, procédures de reprise après sinistre.",
    ports: { inputs: 1, outputs: 1 },
    fields: strategieReprise.fields,
    defaults: strategieReprise.defaults,
    maturity: "visual",
    subtitleFields: ["rpoMinutes", "rtoMinutes"],
    learning: {
      role: "Cadre de survie de l'entreprise : combien de données et de temps peut-on perdre ?",
      howItWorks:
        "Le RPO (perte de données maximale) détermine la fréquence de sauvegarde/réplication ; le RTO (interruption maximale) détermine l'architecture de reprise (zone de secours chaude ou froide, bascule DNS, runbooks). Ces deux chiffres, fixés par le métier, dictent le budget de résilience bien plus que la technologie.",
      pros: [
        "Objectifs explicites et mesurables pour la résilience",
        "Décisions d'investissement rationnelles (le zéro perte coûte très cher)",
      ],
      cons: [
        "RPO/RTO très exigeants : architectures coûteuses (multi-région actif/actif)",
        "Plans jamais testés : papier rassurant, réalité défaillante",
      ],
      useCases: ["Paiement (RPO proche de 0)", "Site vitrine (RTO indulgent)", "Conformité réglementée"],
      pitfalls: [
        "« On a des sauvegardes » sans RPO/RTO définis : aucun engagement vérifiable.",
        "Exercice de reprise inexistant : le premier test est l'incident réel.",
      ],
      concepts: ["RPO", "RTO", "Zone chaude/froide", "Runbook"],
    },
  },
];
