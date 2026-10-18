import type { CatalogComponent } from "@/types";
import { f, proxyFields, serverFields, visualFields, workerFields } from "../field";

/** Catégorie compute — styles de déploiement applicatif. */

const serveurApplicatif = serverFields({
  versions: [
    { value: "node-22", label: "Node.js 22" },
    { value: "jvm-21", label: "JVM 21" },
    { value: "go-1.23", label: "Go 1.23" },
    { value: "python-3.12", label: "Python 3.12" },
  ],
  version: "node-22",
  instances: 2,
  avgServiceMs: 60,
  serviceVariability: 0.35,
  maxConcurrencyPerInstance: 64,
  timeoutMs: 5000,
  errorRate: 0.002,
  cpuCoresPerInstance: 4,
  memoryGbPerInstance: 8,
});

const serveurWeb = proxyFields({
  capacityRps: 40000,
  latencyMs: 4,
  maxConnections: 20000,
  latencyHelp: "Traitement de fichiers statiques et compression (gzip/brotli).",
});

const monolithe = serverFields({
  versions: [
    { value: "node-22", label: "Node.js 22" },
    { value: "jvm-21", label: "JVM 21" },
    { value: "ruby-3.3", label: "Ruby 3.3" },
    { value: "python-3.12", label: "Python 3.12" },
  ],
  version: "jvm-21",
  instances: 2,
  avgServiceMs: 250,
  serviceVariability: 0.5,
  maxConcurrencyPerInstance: 128,
  timeoutMs: 10000,
  errorRate: 0.003,
  cpuCoresPerInstance: 8,
  memoryGbPerInstance: 16,
  instancesHelp: "Monolithes identiques derrière un répartiteur (scaling horizontal du bloc).",
  avgHelp: "Une requête traverse toutes les couches du bloc (ORM, métier, rendu).",
});

const microservice = serverFields({
  versions: [
    { value: "go-1.23", label: "Go 1.23" },
    { value: "node-22", label: "Node.js 22" },
    { value: "jvm-21", label: "JVM 21 (quarkus)" },
    { value: "rust-1.80", label: "Rust 1.80" },
  ],
  version: "go-1.23",
  instances: 3,
  avgServiceMs: 35,
  serviceVariability: 0.25,
  maxConcurrencyPerInstance: 64,
  timeoutMs: 2000,
  errorRate: 0.001,
  cpuCoresPerInstance: 2,
  memoryGbPerInstance: 4,
  avgHelp: "Logique du domaine uniquement — les dépendances sont appelées à part.",
});

const workerPool = workerFields({
  instances: 12,
  avgProcessingMs: 200,
  maxConcurrencyPerInstance: 8,
  timeoutMs: 10000,
});

const fonctionServerless = serverFields({
  versions: [
    { value: "node-22", label: "Node.js 22" },
    { value: "python-3.12", label: "Python 3.12" },
    { value: "jvm-graal", label: "JVM (GraalVM)" },
  ],
  version: "node-22",
  instances: 1,
  avgServiceMs: 80,
  serviceVariability: 0.4,
  maxConcurrencyPerInstance: 1000,
  timeoutMs: 10000,
  errorRate: 0.002,
  cpuCoresPerInstance: 1,
  memoryGbPerInstance: 1,
  instancesHelp: "Une seule « instance » logique : la plateforme en lance autant que nécessaire.",
  avgHelp: "Temps moyen hors cold start.",
});

const conteneur = proxyFields({
  capacityRps: 8000,
  latencyMs: 10,
  maxConnections: 5000,
  latencyHelp: "Surcoût d'isolation (namespaces, cgroups) — marginal face au traitement applicatif.",
});

const clusterKubernetes = visualFields([
  f.num("nodes", "Nœuds worker", 6, "general", {
    min: 1, max: 500, step: 1,
    help: "Machines exécutant réellement les pods (informatif).",
  }),
  f.num("replicas", "Réplicas par déploiement", 3, "capacity", {
    min: 1, max: 50, step: 1,
    help: "Nombre de pods identiques maintenu par le déploiement.",
  }),
]);

const autoscaler = visualFields([
  f.num("minInstances", "Instances min.", 2, "general", { min: 1, max: 100, step: 1 }),
  f.num("maxInstances", "Instances max.", 20, "capacity", { min: 1, max: 200, step: 1 }),
  f.num("targetCpuPercent", "CPU cible (%)", 65, "advanced", {
    min: 10, max: 95, step: 5,
    help: "Seuil de déclenchement de la montée en charge (informatif).",
  }),
]);

export const COMPUTE_COMPONENTS: CatalogComponent[] = [
  {
    id: "serveur-applicatif",
    name: "Serveur applicatif",
    category: "compute",
    icon: "Server",
    description:
      "Serveur hébergeant la logique métier (application interne, back-office, service dédié).",
    ports: { inputs: 1, outputs: 1 },
    fields: serveurApplicatif.fields,
    defaults: serveurApplicatif.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["instances"],
    learning: {
      role: "Exécute la logique métier d'une application dédiée, derrière un répartiteur.",
      howItWorks:
        "Chaque requête occupe un slot de concurrence pendant son traitement. La capacité réelle d'une instance vaut concurrence / temps moyen : 64 slots et 60 ms donnent environ 1 000 req/s par instance. Ajouter des instances est linéaire… tant qu'aucune dépendance commune n'est saturée.",
      pros: [
        "Dimensionnement simple (règle de trois concurrence/temps)",
        "Redéploiement sans impact avec plusieurs instances",
      ],
      cons: [
        "Coût proportionnel au nombre d'instances, même la nuit",
        "Goulot possible des dépendances (base, cache) avant l'épuisement du CPU",
      ],
      useCases: ["Back-office", "Service métier interne", "API privée"],
      pitfalls: [
        "Surdimensionner « au cas où » : la facture suit.",
        "Scaler avant de mesurer : si la base est saturée, les instances ne changent rien.",
      ],
      concepts: ["Loi de Little", "Concurrence", "Scaling horizontal"],
    },
  },
  {
    id: "serveur-web",
    name: "Serveur web",
    category: "compute",
    icon: "Globe",
    description:
      "Serveur HTTP frontal (Nginx, Apache) : fichiers statiques, compression et proxification.",
    ports: { inputs: 1, outputs: 1 },
    fields: serveurWeb.fields,
    defaults: serveurWeb.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "Sert le contenu statique et relaie les requêtes dynamiques vers l'application.",
      howItWorks:
        "Le serveur web répond directement pour les fichiers statiques (images, JS, CSS) à un coût marginal, et passe le reste à l'application derrière lui. C'est le modèle de traitement (processus, threads ou boucles événementielles) qui détermine la capacité en connexions simultanées.",
      pros: [
        "Service statique ultra-rapide sans toucher au code applicatif",
        "Compression et headers de cache centralisés",
      ],
      cons: [
        "Double saut pour le dynamique (web → app)",
        "Capacité en connexions finie : les clients lents (mobiles) occupent des slots longtemps",
      ],
      useCases: ["Hébergement statique", "Frontal d'application", "Compression centralisée"],
      pitfalls: [
        "Laisser l'application servir les statiques : elle gaspille des slots précieux.",
        "Timeout keep-alive très long : des connexions fantômes saturent le serveur web.",
      ],
      concepts: ["Keep-alive", "Statique vs dynamique", "Compression", "Event loop"],
    },
  },
  {
    id: "monolithe",
    name: "Monolithe",
    category: "compute",
    icon: "Box",
    description:
      "Application unique déployée en bloc : toute la logique métier dans un même processus.",
    ports: { inputs: 1, outputs: 1 },
    fields: monolithe.fields,
    defaults: monolithe.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["instances", "avgServiceMs"],
    learning: {
      role: "Toute la logique métier dans un seul bloc déployable, mis à jour d'un tenant.",
      howItWorks:
        "Une requête traverse le routage interne, la logique métier et l'accès données au sein du même processus. Le temps de traitement est élevé mais les appels internes sont des appels de fonction (nanosecondes) : pas de saut réseau. Il se scale horizontalement par copies identiques, tant que la base suit.",
      pros: [
        "Appels internes quasi gratuits (pas de réseau, pas de sérialisation)",
        "Développement et debug simples : un seul déploiement, une seule transaction",
      ],
      cons: [
        "Mise à jour tout-ou-rien : même un correctif cosmétique redéploie tout",
        "Un module gourmand dégrade tout le monde (voisinage bruyant)",
        "La montée en charge bute presque toujours sur la base partagée",
      ],
      useCases: ["Startup (vitesse d'exécution)", "Petite équipe", "Domaine à couplage fort"],
      pitfalls: [
        "Croire que le monolithe interdit le scaling : il scale horizontalement très bien jusqu'à la base.",
        "Microserviciser par effet de mode avant d'avoir des limites de domaine claires.",
      ],
      concepts: ["Couplage", "Monolithe modulaire", "Voisinage bruyant", "Transaction locale"],
    },
  },
  {
    id: "microservice",
    name: "Microservice",
    category: "compute",
    icon: "Boxes",
    description:
      "Service autonome par domaine : déploiement, scaling et défaillance indépendants.",
    ports: { inputs: 1, outputs: 1 },
    fields: microservice.fields,
    defaults: microservice.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["instances"],
    learning: {
      role: "Un domaine métier entier, isolé dans son propre service déployable.",
      howItWorks:
        "Chaque service possède ses données, son déploiement et son scaling. Une requête utilisateur devient une chorégraphie d'appels réseau entre services : chaque saut ajoute de la latence (sérialisation + réseau) et un risque de panne supplémentaire — d'où timeouts, retries et circuit breakers obligatoires.",
      pros: [
        "Scaling et déploiement indépendants par domaine",
        "Une panne contenue dans un seul service",
      ],
      cons: [
        "Latence de bout en bout multipliée par les sauts réseau",
        "Coût opérationnel : observabilité, contrats d'API, données distribuées",
      ],
      useCases: ["Équipes multiples par domaine", "Besoins de scaling hétérogènes", "Isolation de pannes"],
      pitfalls: [
        "Microservices qui partagent la même base : distribution sans les bénéfices.",
        "Chaînes d'appels profonds sans timeouts ni circuit breakers.",
      ],
      concepts: ["Loi de Conway", "Couplage faible", "Résilience", "Contrat d'API"],
    },
  },
  {
    id: "worker-pool",
    name: "Pool de workers",
    category: "compute",
    icon: "Boxes",
    description:
      "Flotte importante de consommateurs traitant en parallèle les messages des files.",
    ports: { inputs: 1, outputs: 1 },
    fields: workerPool.fields,
    defaults: workerPool.defaults,
    maturity: "simulated",
    simRole: "worker",
    subtitleFields: ["instances"],
    learning: {
      role: "Capacité de traitement asynchrone massive, ajustable indépendamment du front.",
      howItWorks:
        "Le pool tire les messages des files à vitesse instances × concurrence / temps de traitement. Avec 12 instances, 8 messages simultanés et 200 ms, il absorbe environ 480 messages/s. On ajuste le pool au débit d'arrivée : c'est la soupape qui évite au lag de s'accumuler.",
      pros: [
        "Dimensionnement indépendant du trafic synchrone",
        "Ajustable en quelques minutes face à un pic",
      ],
      cons: [
        "Coût fixe si le pool reste dimensionné pour les pics",
        "Ordre des messages garanti seulement par partition/file",
      ],
      useCases: ["Traitement d'images", "Envois massifs d'e-mails", "Intégrations partenaires"],
      pitfalls: [
        "Pool trop petit : le lag croît indéfiniment et les messages expirent.",
        "Pool trop grand : on écrase la base de données aval (le goulot se déplace).",
      ],
      concepts: ["Consumer lag", "Throughput", "Backpressure"],
    },
  },
  {
    id: "fonction-serverless",
    name: "Fonction serverless",
    category: "compute",
    icon: "Zap",
    description:
      "Fonction exécutée à la demande par la plateforme : facturation et scaling à la requête.",
    ports: { inputs: 1, outputs: 1 },
    fields: fonctionServerless.fields,
    defaults: fonctionServerless.defaults,
    maturity: "simulated",
    simRole: "server",
    subtitleFields: ["maxConcurrencyPerInstance"],
    learning: {
      role: "Exécution à la demande : la plateforme instancie la fonction au rythme des requêtes.",
      howItWorks:
        "La concurrence est portée par la plateforme (des centaines d'invocations parallèles d'une même fonction). Le prix : les cold starts — une instance neuve doit démarrer (chargement du runtime, connexions aux dépendances), ce qui ajoute de 100 ms à plusieurs secondes sur les premières requêtes.",
      pros: [
        "Scaling quasi instantané, jusqu'à des milliers d'exécutions parallèles",
        "Aucun coût hors trafic : idéal pour les charges erratiques",
      ],
      cons: [
        "Cold starts : latence erratique à la montée en charge",
        "Durée d'exécution plafonnée et connexions à recréer entre invocations",
      ],
      useCases: ["Webhooks", "Traitement d'événements sporadiques", "API à trafic imprévisible"],
      pitfalls: [
        "Ouvrir une connexion à la base à chaque invocation : le pool explose côté base.",
        "Serverless pour du trafic soutenu : la facture dépasse vite celle de serveurs dédiés.",
      ],
      concepts: ["Cold start", "Facturation à l'usage", "Concurrency", "FaaS"],
    },
  },
  {
    id: "conteneur",
    name: "Conteneur",
    category: "compute",
    icon: "Container",
    description:
      "Unité de déploiement empaquetée avec ses dépendances, exécutable partout de façon identique.",
    ports: { inputs: 1, outputs: 1 },
    fields: conteneur.fields,
    defaults: conteneur.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "Enveloppe standardisée qui transporte l'application et ses dépendances.",
      howItWorks:
        "Le conteneur partage le noyau de l'hôte mais isole processus, réseau et système de fichiers (namespaces, cgroups). Le démarrage prend quelques centaines de millisecondes — assez rapide pour des déploiements et des mises à l'échelle en continu. L'overhead CPU reste faible face à une machine virtuelle.",
      pros: [
        "« Ça marche sur ma machine » devient « ça marche partout »",
        "Démarrage rapide et densité élevée sur l'hôte",
      ],
      cons: [
        "Isolation plus faible qu'une VM (noyau partagé)",
        "Images qui grossissent sans hygiène (layers inutiles)",
      ],
      useCases: ["Déploiement reproductible", "Densité par hôte", "CI/CD immuable"],
      pitfalls: [
        "Conteneur étatique : les données disparaissent au redémarrage — brancher un volume.",
        "Plusieurs processus par conteneur : le superviseur interne masque les pannes.",
      ],
      concepts: ["Namespace", "Cgroups", "Image", "Orchestration"],
    },
  },
  {
    id: "cluster-kubernetes",
    name: "Cluster Kubernetes",
    category: "compute",
    icon: "Grid3x3",
    description:
      "Orchestrateur de conteneurs : planifie, réplique et répare automatiquement les charges de travail.",
    ports: { inputs: 1, outputs: 1 },
    fields: clusterKubernetes.fields,
    defaults: clusterKubernetes.defaults,
    maturity: "visual",
    subtitleFields: ["nodes", "replicas"],
    learning: {
      role: "Chef d'orchestre : l'état souhaité est déclaré, le cluster le maintient en permanence.",
      howItWorks:
        "Le control plane compare l'état réel à l'état déclaré (réplicas, ressources, santé) et agit : un pod mort est relancé ailleurs, un nœud saturé voit ses pods déplacés. L'autoscaler horizontal (HPA) ajuste le nombre de réplicas selon le CPU ou une file d'attente.",
      pros: [
        "Auto-réparation : les pannes de pods/nœuds sont absorbées sans intervention",
        "Déploiements progressifs et rollbacks natifs",
      ],
      cons: [
        "Complexité opérationnelle réelle (réseau, stockage, mises à jour du cluster)",
        "Le control plane lui-même est une charge critique à sécuriser",
      ],
      useCases: ["Flotte de microservices", "Autoscaling par métriques", "Déploiements sans coupure"],
      pitfalls: [
        "Requests/limits non définies : les pods s'entretuent sur le CPU (throttling).",
        "Pods sans readiness probe : le service envoie du trafic vers des pods pas encore prêts.",
      ],
      concepts: ["Pod", "HPA", "Control plane", "Déclaratif"],
    },
  },
  {
    id: "autoscaler",
    name: "Autoscaler",
    category: "compute",
    icon: "TrendingUp",
    description:
      "Ajuste automatiquement le nombre d'instances selon la charge observée.",
    ports: { inputs: 1, outputs: 1 },
    fields: autoscaler.fields,
    defaults: autoscaler.defaults,
    maturity: "visual",
    subtitleFields: ["minInstances", "maxInstances"],
    learning: {
      role: "Boucle de régulation : plus de charge → plus d'instances, moins de charge → moins d'instances.",
      howItWorks:
        "Une métrique (CPU, longueur de file, RPS) est comparée à une cible ; l'autoscaler calcule le nombre d'instances idéal et l'applique. La réactivité est bornée par la période d'évaluation (souvent 15-60 s) et le temps de démarrage d'une instance : un pic brutal peut dépasser la capacité pendant la montée.",
      pros: [
        "La capacité suit la courbe de trafic sans intervention humaine",
        "Économies automatiques la nuit et le week-end",
      ],
      cons: [
        "Réactivité limitée : les pics instantanés passent au travers",
        "Oscillations (flapping) si les seuils sont trop serrés",
      ],
      useCases: ["Trafic diurne marqué", "Campagnes marketing", "Batchs nocturnes"],
      pitfalls: [
        "Scaler sur le CPU alors que le goulot est la base : ça ne fait qu'aggraver la file.",
        "Minimum à zéro : la première requête paie un cold start complet.",
      ],
      concepts: ["Boucle de rétroaction", "Flapping", "Scale-out / scale-in"],
    },
  },
];
