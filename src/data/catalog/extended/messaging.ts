import type { CatalogComponent } from "@/types";
import { f, queueFields, visualFields, workerFields } from "../field";

/** Catégorie messagerie — files, brokers et consommateurs d'événements. */

const kafka = queueFields({
  maxDepth: 1000000,
  partitions: 12,
  persistMessages: true,
  maxDepthHelp: "Messages tamponnés par partition avant que le producteur soit bloqué.",
  partitionsHelp: "L'ordre est garanti par partition, pas globalement.",
});

const rabbitmq = queueFields({
  maxDepth: 50000,
  partitions: 1,
  persistMessages: true,
  partitionsHelp: "AMQP : une file = un ordre ; la parallélisation vient des files multiples.",
});

const nats = queueFields({
  maxDepth: 10000,
  partitions: 1,
  persistMessages: false,
  maxDepthHelp: "Tampon mémoire : au-delà, les messages sont abandonnés (ou refusés).",
  partitionsHelp: "Sujet hiérarchique ; sans JetStream, la persistance est nulle.",
});

const redisStreams = queueFields({
  maxDepth: 100000,
  partitions: 8,
  persistMessages: true,
});

const messageBroker = queueFields({
  maxDepth: 20000,
  partitions: 4,
  persistMessages: true,
});

const deadLetterQueue = queueFields({
  maxDepth: 5000,
  partitions: 1,
  persistMessages: true,
  maxDepthHelp: "Capacité de la file des échecs avant alerte bloquante.",
});

const eventBus = queueFields({
  maxDepth: 50000,
  partitions: 8,
  persistMessages: true,
});

const producer = visualFields([
  f.num("messageSizeKb", "Taille moyenne (Ko)", 4, "general", {
    min: 1, max: 1024, step: 1,
    help: "Taille informative des messages émis (influe sur le débit réel).",
  }),
  f.bool("batching", "Envoi par lots", true, "capacity", {
    help: "Le batching améliore fortement le débit au prix d'une latence fixe.",
  }),
]);

const consumer = workerFields({
  instances: 2,
  avgProcessingMs: 100,
  maxConcurrencyPerInstance: 5,
  timeoutMs: 5000,
});

const consumerGroup = workerFields({
  instances: 6,
  avgProcessingMs: 80,
  maxConcurrencyPerInstance: 10,
  timeoutMs: 10000,
});

export const MESSAGING_COMPONENTS: CatalogComponent[] = [
  {
    id: "kafka",
    name: "Kafka",
    category: "messaging",
    icon: "Layers",
    description:
      "Journal distribué à très haut débit : flux d'événements rejouables et partitionnés.",
    ports: { inputs: 1, outputs: 1 },
    fields: kafka.fields,
    defaults: kafka.defaults,
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: ["partitions"],
    learning: {
      role: "Colonne vertébrale des architectures événementielles : un journal append-only distribué.",
      howItWorks:
        "Chaque sujet est découpé en partitions (fichiers append-only) répliquées entre brokers. Les producteurs écrivent à la fin ; les consumer groups lisent à leur rythme en conservant leur offset — le message n'est pas détruit après lecture, il est rejouable. Le débit est borné par partitions × vitesse d'écriture disque.",
      pros: [
        "Débit colossal (millions de messages/s) et rétention longue",
        "Rejeu possible : reconstruire une vue complète depuis le journal",
        "Ordre garanti par partition",
      ],
      cons: [
        "Latence de bout en bout (batch, flush, polling)",
        "Opérations de cluster non triviales (rééquilibrages, ISR)",
        "Pas de routage riche par message : c'est le sujet qui structure",
      ],
      useCases: ["Event sourcing", "Pipeline de données", "CDC", "Découplage producteur/consommateur"],
      pitfalls: [
        "Trop peu de partitions : les consommateurs restent inactifs (une partition = un consommateur actif par groupe).",
        "Clé de partition mal choisie : un compte gros émetteur concentre tout sur une partition.",
      ],
      concepts: ["Partition", "Offset", "Consumer group", "Rejeu", "Log append-only"],
    },
  },
  {
    id: "rabbitmq",
    name: "RabbitMQ",
    category: "messaging",
    icon: "Rabbit",
    description:
      "Broker de messages classique : routage riche, acquittements, files de travail.",
    ports: { inputs: 1, outputs: 1 },
    fields: rabbitmq.fields,
    defaults: rabbitmq.defaults,
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: ["maxDepth"],
    learning: {
      role: "Distributeur de tâches : chaque message est routé puis consommé une fois.",
      howItWorks:
        "Les producteurs publient vers des exchanges, qui routent vers des files selon des liaisons (direct, topic, headers). Le broker délivre aux consommateurs et attend l'acquittement — un message non acquitté revient à un autre consommateur. Le message disparaît après traitement : rien à rejouer.",
      pros: [
        "Routage par message très expressif",
        "Acquittements et re-remise : perte quasi impossible en mode durable",
        "Parfait pour les files de tâches",
      ],
      cons: [
        "Débit bien moindre que Kafka (routage et état par message)",
        "Pas de rétention : message consommé = message parti",
        "Files très profondes = broker sous tension (attention à la mémoire)",
      ],
      useCases: ["File de jobs", "Commandes à traiter", "Notifications individuelles"],
      pitfalls: [
        "Consommateur lent sans prefetch borné : la file est inondée d'unbounded unacked.",
        "Vouloir rejouer l'historique : impossible par conception, prévoir Kafka.",
      ],
      concepts: ["Exchange", "Binding", "Acquittement", "Prefetch"],
    },
  },
  {
    id: "nats",
    name: "NATS",
    category: "messaging",
    icon: "Bird",
    description:
      "Bus de messages ultra-léger : livraison instantanée, empreinte minimale.",
    ports: { inputs: 1, outputs: 1 },
    fields: nats.fields,
    defaults: nats.defaults,
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: [],
    learning: {
      role: "Courier express des messages : diffusion à des milliers d'abonnés en sub-milliseconde.",
      howItWorks:
        "En mode cœur (sans JetStream), NATS distribue le message aux abonnés présents à cet instant et l'oublie : au plus une fois, aucune persistance. Les « queue groups » répartissent la charge entre abonnés. C'est le compromis extrême : vitesse maximale, garanties minimales.",
      pros: [
        "Latence et empreinte ridicules (un seul binaire)",
        "Modèle pub/sub simple à raisonner",
      ],
      cons: [
        "Sans JetStream : perte de messages si personne n'écoute",
        "Pas d'historique, pas de rejeu",
      ],
      useCases: ["Télémétrie interne", "Discovery de microservices", "Signaux temps réel"],
      pitfalls: [
        "Départ d'un consommateur : les messages publiés pendant l'absence sont perdus (sans JetStream).",
        "Espérer des garanties de remise sur le mode cœur : il n'y en a aucune.",
      ],
      concepts: ["Pub/sub", "At-most-once", "Queue group", "JetStream"],
    },
  },
  {
    id: "redis-streams",
    name: "Redis Streams",
    category: "messaging",
    icon: "Zap",
    description:
      "Files persistantes dans Redis : consommateurs nommés, acquittements, faible latence.",
    ports: { inputs: 1, outputs: 1 },
    fields: redisStreams.fields,
    defaults: redisStreams.defaults,
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: ["partitions"],
    learning: {
      role: "Files de messages logées dans l'infrastructure Redis déjà présente.",
      howItWorks:
        "Un stream Redis est un journal append-only avec identifiants d'entrée ; les consumer groups suivent leur dernier identifiant lu et acquittent. La persistance suit celle de Redis (AOF/RDB). Compact et rapide, mais limité par la mémoire et les stratégies de troncature (MAXLEN).",
      pros: [
        "Une dépendance de moins si Redis existe déjà",
        "Latence très faible, consumer groups natifs",
      ],
      cons: [
        "Borné par la mémoire : la rétention doit être tronquée",
        "Moins d'outillage que Kafka pour les gros volumes",
      ],
      useCases: ["Tâches légères", "Buffres de télémétrie", "Files d'attente d'un service"],
      pitfalls: [
        "Rétention infinie : la mémoire Redis sature et tout le cache tombe avec.",
        "Reconnaissance (XACK) oubliée par un consommateur buggé : entrées pendantes sans fin.",
      ],
      concepts: ["Consumer group", "XACK", "MAXLEN", "AOF"],
    },
  },
  {
    id: "message-broker",
    name: "Message broker",
    category: "messaging",
    icon: "ArrowLeftRight",
    description:
      "Intermédiaire générique de messages : découple les producteurs des consommateurs.",
    ports: { inputs: 1, outputs: 1 },
    fields: messageBroker.fields,
    defaults: messageBroker.defaults,
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: ["maxDepth"],
    learning: {
      role: "Boîte aux lettres intermédiaire : les systèmes se parlent sans se connaître.",
      howItWorks:
        "Le broker reçoit les messages des producteurs, les stocke temporairement et les délivre aux consommateurs selon des règles d'abonnement. Ce découplage temporel permet au producteur de ne jamais attendre le consommateur — c'est toute la valeur de l'asynchronisme.",
      pros: [
        "Découplage temporel et technique des systèmes",
        "Absorption des pics de production",
      ],
      cons: [
        "Latence ajoutée sur le chemin",
        "Un maillon de plus à opérer et surveiller",
      ],
      useCases: ["Intégration SI hétérogène", "Découplement de services", "Lissage de charge"],
      pitfalls: [
        "File sans consommateur branché : personne ne le remarque avant le débordement.",
        "Messages empoisonnés qui bouclent : prévoir DLQ et limite de re-remises.",
      ],
      concepts: ["Découplage", "At-least-once", "Poison message"],
    },
  },
  {
    id: "producer",
    name: "Producteur",
    category: "messaging",
    icon: "Send",
    description:
      "Émetteur d'événements vers un broker : existe pour documenter qui publie quoi.",
    ports: { inputs: 1, outputs: 1 },
    fields: producer.fields,
    defaults: producer.defaults,
    maturity: "visual",
    subtitleFields: ["messageSizeKb"],
    learning: {
      role: "Point d'émission des événements d'un domaine vers les files.",
      howItWorks:
        "Le producteur sérialise l'événement, choisit la partition (souvent par clé d'entité) et publie. En mode asynchrone il ne regarde la réponse qu'en tâche de fond : un broker saturé ne ralentit pas la requête utilisateur, mais le tampon local finit par déborder.",
      pros: [
        "Publication rapide : le traitement est différé chez les consommateurs",
        "Une source d'événement peut alimenter plusieurs consommateurs indépendants",
      ],
      cons: [
        "Publication non acquittée = événement perdu (selon la configuration d'attente)",
        "Schéma d'événement non versionné : les consommateurs cassent silencieusement",
      ],
      useCases: ["Publication d'événement métier", "Télémétrie", "Intégration sortante"],
      pitfalls: [
        "Fire-and-forget sur des événements critiques : vérifier l'acquittement d'écriture.",
        "Publier l'état interne au lieu de faits métier (« a changé » vs « a payé »).",
      ],
      concepts: ["Événement métier", "Partition par clé", "Fire-and-forget"],
    },
  },
  {
    id: "consumer",
    name: "Consommateur",
    category: "messaging",
    icon: "Inbox",
    description:
      "Processus qui lit une file et traite chaque message reçu.",
    ports: { inputs: 1, outputs: 1 },
    fields: consumer.fields,
    defaults: consumer.defaults,
    maturity: "simulated",
    simRole: "worker",
    subtitleFields: ["instances"],
    learning: {
      role: "Extrémité aval de l'asynchronisme : transforme les messages en effets.",
      howItWorks:
        "Le consommateur tire les messages et les traite un par un (ou par lots). Sa vitesse = instances × concurrence / temps de traitement. Chaque message devrait être idempotent : les brokers en mode at-least-once peuvent re-remettre un message déjà traité.",
      pros: [
        "Rythme maîtrisé : il absorbe à sa vitesse",
        "Redémarrable sans perdre de messages (offsets/acquittements)",
      ],
      cons: [
        "Retard visible (lag) quand la production dépasse la consommation",
        "Traitement des échecs à concevoir (retries, DLQ)",
      ],
      useCases: ["Envoi d'e-mails", "Mise à jour de vues", "Appels vers des services tiers"],
      pitfalls: [
        "Message non idempotent : la re-remise duplique les effets (double envoi, double facture).",
        "Crash sans acquittement : tout le lot repart pour un tour.",
      ],
      concepts: ["Idempotence", "Consumer lag", "At-least-once"],
    },
  },
  {
    id: "consumer-group",
    name: "Groupe de consommateurs",
    category: "messaging",
    icon: "Users",
    description:
      "Flotte de consommateurs se partageant les partitions d'un même sujet.",
    ports: { inputs: 1, outputs: 1 },
    fields: consumerGroup.fields,
    defaults: consumerGroup.defaults,
    maturity: "simulated",
    simRole: "worker",
    subtitleFields: ["instances"],
    learning: {
      role: "Mise à l'échelle horizontale de la consommation : chaque partition sert un membre du groupe.",
      howItWorks:
        "Le broker attribue les partitions aux membres du groupe (rebalancing). Le parallélisme maximal = nombre de partitions : au-delà, les consommateurs supplémentaires restent inactifs. Un membre qui meurt déclenche un rééquilibrage — pendant lequel tout le groupe peut s'arrêter selon la configuration.",
      pros: [
        "Débit de consommation multiplié par les membres actifs",
        "Reprise automatique des partitions d'un membre perdu",
      ],
      cons: [
        "Plafond strict : un consommateur actif par partition",
        "Rééquilibrages coûteux (stop-the-world selon la configuration)",
      ],
      useCases: ["Consommation Kafka à fort débit", "Workers de projections", "Parallélisme par partition"],
      pitfalls: [
        "Plus de consommateurs que de partitions : des workers payés pour ne rien faire.",
        "Traitement long dans un membre : tout le groupe patine au rééquilibrage suivant.",
      ],
      concepts: ["Rebalancing", "Partition", "Parallélisme"],
    },
  },
  {
    id: "dead-letter-queue",
    name: "Dead Letter Queue",
    category: "messaging",
    icon: "Archive",
    description:
      "File des échecs : isole les messages impossibles à traiter après N tentatives.",
    ports: { inputs: 1, outputs: 1 },
    fields: deadLetterQueue.fields,
    defaults: deadLetterQueue.defaults,
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: ["maxDepth"],
    learning: {
      role: "Poubelle triée des messages en échec : le flux principal continue de tourner.",
      howItWorks:
        "Après un nombre de tentatives dépassé (ou une erreur non récupérable), le message est déplacé vers la DLQ au lieu de bloquer la file d'origine. Des outils dédiés permettent ensuite d'inspecter, corriger et rejouer ces messages à la main. Sans DLQ, un message empoisonné peut bloquer toute une file.",
      pros: [
        "Le flux principal ne s'arrête jamais sur un message en échec",
        "File d'attente d'inspection : les échecs deviennent visibles et traitables",
      ],
      cons: [
        "Une DLQ qui grossit en silence : incidents invisibles",
        "Rejeu manuel à concevoir (ordre, effets de bord)",
      ],
      useCases: ["Messages empoisonnés", "Destinataires en erreur", "Conformité (examen des rejets)"],
      pitfalls: [
        "Aucune alerte sur la profondeur de la DLQ : les pertes s'accumulent tranquillement.",
        "Rejouer en masse sans analyser la cause : les messages retombent en échec immédiatement.",
      ],
      concepts: ["Poison message", "Retry policy", "Rejeu"],
    },
  },
  {
    id: "event-bus",
    name: "Event bus",
    category: "messaging",
    icon: "Radio",
    description:
      "Canal de diffusion interne : les services publient et s'abonnent à des événements.",
    ports: { inputs: 1, outputs: 1 },
    fields: eventBus.fields,
    defaults: eventBus.defaults,
    maturity: "simulated",
    simRole: "queue",
    subtitleFields: ["partitions"],
    learning: {
      role: "Nerve de l'architecture événementielle : transport partagé des faits métier.",
      howItWorks:
        "Chaque service publie des événements (faits passés : « commande passée ») sur le bus ; les services intéressés s'y abonnent. Le bus peut être un simple broker in-process (monolithe) ou un Kafka géré (multi-services). Le couplage se fait par le schéma d'événement, plus par les appels directs.",
      pros: [
        "Ajouter un consommateur sans toucher aux producteurs",
        "Le temps long (batchs, projections) se sépare du temps réel",
      ],
      cons: [
        "Debugging plus difficile : qui a consommé quoi, quand ?",
        "Contrats d'événements à versionner soigneusement",
      ],
      useCases: ["Microservices découplés", "Audit par événements", "Projections temps réel"],
      pitfalls: [
        "Bus comme couche « intelligente » avec logique de routage métier : il devient le monolithe.",
        "Événements non versionnés : un changement de schéma casse tous les abonnés.",
      ],
      concepts: ["Pub/sub", "Schéma d'événement", "Versioning", "Couplage temporel"],
    },
  },
];
