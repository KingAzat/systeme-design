import type { CatalogComponent } from "@/types";
import { f, visualFields } from "../field";

/** Catégorie architecture distribuée — motifs de coordination entre nœuds (visuels). */

const sharding = visualFields([
  f.num("shards", "Shards", 8, "general", {
    min: 1, max: 1024, step: 1,
    help: "Nombre de fragments indépendants (informatif).",
  }),
  f.sel("strategy", "Stratégie de répartition", [
    { value: "hash", label: "Par hachage de clé" },
    { value: "range", label: "Par plage de clé" },
    { value: "directory", label: "Par annuaire" },
  ], "hash", "capacity"),
]);

const partitionnement = visualFields([
  f.num("partitions", "Partitions", 16, "general", {
    min: 1, max: 1024, step: 1,
  }),
  f.sel("clePartition", "Clé de partition", [
    { value: "user", label: "Identifiant utilisateur" },
    { value: "date", label: "Date" },
    { value: "region", label: "Région" },
  ], "user", "capacity"),
]);

const replicationMultiRegion = visualFields([
  f.num("regions", "Régions", 3, "general", {
    min: 2, max: 20, step: 1,
  }),
  f.num("factor", "Facteur de réplication", 3, "capacity", {
    min: 1, max: 7, step: 1,
  }),
]);

const leaderElection = visualFields([
  f.num("termSec", "Durée d'un bail (s)", 10, "general", {
    min: 1, max: 300, step: 1,
    help: "Le meneur doit renouveler son bail avant expiration (informatif).",
  }),
  f.num("candidates", "Candidats", 3, "capacity", { min: 2, max: 20, step: 1 }),
]);

const consensus = visualFields([
  f.num("quorumSize", "Taille du quorum", 2, "general", {
    min: 1, max: 10, step: 1,
    help: "Majorité de votes nécessaire pour valider une décision (informatif).",
  }),
  f.sel("protocol", "Protocole", [
    { value: "raft", label: "Raft" },
    { value: "paxos", label: "Paxos" },
  ], "raft", "capacity"),
]);

const distributedLock = visualFields([
  f.num("ttlMs", "TTL du verrou (ms)", 30000, "general", {
    min: 100, max: 600000, step: 100,
    help: "Expiration automatique : un détenteur mort ne bloque pas tout (informatif).",
  }),
  f.sel("backend", "Backend", [
    { value: "redis", label: "Redis (SETNX)" },
    { value: "etcd", label: "etcd / ZooKeeper" },
  ], "redis", "capacity"),
]);

const serviceDiscovery = visualFields([
  f.num("heartbeatSec", "Battement de cœur (s)", 5, "general", {
    min: 1, max: 60, step: 1,
  }),
  f.num("services", "Services suivis", 20, "capacity", {
    min: 1, max: 10000, step: 1,
  }),
]);

const saga = visualFields([
  f.num("steps", "Étapes", 5, "general", {
    min: 2, max: 50, step: 1,
    help: "Nombre d'étapes locales de la transaction distribuée (informatif).",
  }),
  f.bool("compensations", "Compensations implémentées", true, "capacity", {
    help: "Chaque étape définit son annulation (informatif).",
  }),
]);

const eventSourcing = visualFields([
  f.num("eventStoreGb", "Magasin d'événements (Go)", 500, "general", {
    min: 1, max: 100000, step: 1,
  }),
  f.num("projections", "Projections", 3, "capacity", {
    min: 1, max: 50, step: 1,
    help: "Vues matérialisées reconstruites depuis les événements (informatif).",
  }),
]);

const cqrs = visualFields([
  f.num("readModels", "Modèles de lecture", 3, "general", {
    min: 1, max: 50, step: 1,
  }),
  f.num("syncMs", "Délai de propagation (ms)", 500, "capacity", {
    min: 10, max: 60000, step: 10,
    help: "Retard entre écriture et visibilité dans les vues (informatif).",
  }),
]);

export const DISTRIBUTED_COMPONENTS: CatalogComponent[] = [
  {
    id: "sharding",
    name: "Sharding",
    category: "distributed",
    icon: "Grid2x2",
    description:
      "Découpage horizontal des données en fragments indépendants, servis par des machines distinctes.",
    ports: { inputs: 1, outputs: 1 },
    fields: sharding.fields,
    defaults: sharding.defaults,
    maturity: "visual",
    subtitleFields: ["shards", "strategy"],
    learning: {
      role: "Répartir les données elles-mêmes : chaque machine ne porte qu'un fragment du total.",
      howItWorks:
        "Une clé (identifiant utilisateur, commande) détermine le shard par hachage, plage ou annuaire. Chaque shard est une base complète et indépendante : la capacité devient additive. Le revers : les requêtes qui traversent les shards (jointures, tris globaux) coûtent N fois plus, et le rééquilibrage des données est une opération lourde.",
      pros: [
        "Capacité additive : on scale en ajoutant des shards",
        "Isolation : un shard chaud n'accable pas les autres",
      ],
      cons: [
        "Requêtes multi-shards coûteuses et complexes",
        "Hot shard si la clé répartit mal (un gros client)",
        "Rééquilibrage des données : opération longue et risquée",
      ],
      useCases: ["Données utilisateurs massives", "Séries temporelles par plage de dates", "Gros catalogues"],
      pitfalls: [
        "Clé de sharding mal choisie (auto-incrément séquentiel : tout atterrit sur le dernier shard).",
        "Besoin de transactions multi-shards fréquentes : le modèle est inadapté.",
      ],
      concepts: ["Clé de sharding", "Hot shard", "Resharding", "Hachage"],
    },
  },
  {
    id: "partitionnement",
    name: "Partitionnement",
    category: "distributed",
    icon: "Split",
    description:
      "Découpage logique des données (tables, sujets) : parallélisme et gestion par blocs.",
    ports: { inputs: 1, outputs: 1 },
    fields: partitionnement.fields,
    defaults: partitionnement.defaults,
    maturity: "visual",
    subtitleFields: ["partitions", "clePartition"],
    learning: {
      role: "Le découpage de base de toute distribution : des blocs plus petits, traitables en parallèle.",
      howItWorks:
        "Les enregistrements sont assignés à une partition selon une clé ; les partitions peuvent vivre sur le même nœud (parallélisme CPU) ou sur des nœuds distincts (distribution). Dans Kafka, la partition est aussi l'unité d'ordre et d'attribution aux consommateurs — un concept fondateur.",
      pros: [
        "Parallélisme immédiat des traitements",
        "Gestion fine (archivage d'une partition de vieux mois d'un coup)",
      ],
      cons: [
        "Ordre global perdu : garanti seulement au sein d'une partition",
        "Déséquilibre si la clé concentre les données",
      ],
      useCases: ["Tables partitionnées par date", "Sujets Kafka", "Files parallèles"],
      pitfalls: [
        "Requête sans clé de partition : toutes les partitions sont consultées (scatter-gather).",
        "Clé uniformément répartie mais métierment absurde : les requêtes naturelles traversent tout.",
      ],
      concepts: ["Clé de partition", "Ordre local", "Scatter-gather"],
    },
  },
  {
    id: "replication-multi-region",
    name: "Réplication multi-région",
    category: "distributed",
    icon: "Globe2",
    description:
      "Copies des données dans plusieurs régions géographiques : latence locale et survie aux sinistres.",
    ports: { inputs: 1, outputs: 1 },
    fields: replicationMultiRegion.fields,
    defaults: replicationMultiRegion.defaults,
    maturity: "visual",
    subtitleFields: ["regions", "factor"],
    learning: {
      role: "Rapprocher les données des utilisateurs et survivre à la perte d'une région entière.",
      howItWorks:
        "Les écritures sont propagées entre régions : de façon synchrone (cohérence forte, latence inter-région dans chaque écriture) ou asynchrone (rapide, mais une région peut être en retard). En actif-passif, une seule région sert ; en actif-actif, plusieurs régions servent en même temps et les conflits d'écriture doivent être résolus.",
      pros: [
        "Latence utilisateur réduite (données proches)",
        "Sinistre régional surmonté par bascule",
      ],
      cons: [
        "Latence inter-région incompressible (60-150 ms) dans chaque écriture synchrone",
        "Coût de sortie de données entre régions",
        "Résolution de conflits complexe en actif-actif",
      ],
      useCases: ["Service mondial", "Exigences de résidence des données", "PRA géographique"],
      pitfalls: [
        "Actif-actif sur les mêmes clés : conflits d'écriture à régler (dernier gagnant perd des données).",
        "Espérer la cohérence forte avec de la réplication asynchrone : les régions divergent.",
      ],
      concepts: ["Actif-actif", "Latence inter-région", "Conflit", "Résidence des données"],
    },
  },
  {
    id: "leader-election",
    name: "Élection de meneur",
    category: "distributed",
    icon: "Crown",
    description:
      "Désignation d'un nœud coordinateur parmi ses pairs, avec reprise automatique à sa chute.",
    ports: { inputs: 1, outputs: 1 },
    fields: leaderElection.fields,
    defaults: leaderElection.defaults,
    maturity: "visual",
    subtitleFields: ["termSec"],
    learning: {
      role: "Un seul chef à la fois : la coordination a un point de décision unique mais remplaçable.",
      howItWorks:
        "Les nœuds se disputent un bail : le meneur élu renouvelle son mandat avant expiration ; s'il meurt, les autres détectent l'expiration et relancent une élection. Selon le système, le meneur traite les écritures (bases) ou ne fait qu'orchestrer. La période sans meneur (élection) est une indisponibilité courte mais réelle.",
      pros: [
        "Décisions ordonnées sans conflit : un seul décideur",
        "Reprise automatique : le cluster survit à la mort du chef",
      ],
      cons: [
        "Fenêtre d'indisponibilité pendant chaque élection",
        "Split-brain si les délais sont mal réglés : deux chefs élus simultanément",
      ],
      useCases: ["Bases avec primaire", "Orchestrateurs", "Tâches planifiées singleton"],
      pitfalls: [
        "Bail trop court : élections en cascade sur un réseau instable.",
        "Deux meneurs acceptés (horloges divergentes, partitions réseau) : corruption de données.",
      ],
      concepts: ["Bail", "Split-brain", "Élection", "Quorum"],
    },
  },
  {
    id: "consensus",
    name: "Consensus",
    category: "distributed",
    icon: "Handshake",
    description:
      "Accord collectif sur une valeur malgré pannes et messages perdus : la brique de la cohérence.",
    ports: { inputs: 1, outputs: 1 },
    fields: consensus.fields,
    defaults: consensus.defaults,
    maturity: "visual",
    subtitleFields: ["quorumSize", "protocol"],
    learning: {
      role: "Faire tomber d'accord un groupe de machines dont certaines peuvent mentir ou disparaître.",
      howItWorks:
        "Un protocole (Raft, Paxos) fait voter les nœuds : une valeur est décidée quand une majorité (quorum) l'approuve. La majorité garantit que deux décisions concurrentes ne peuvent pas toutes deux exister — d'où la tolérance aux pannes de (N-1)/2 nœuds. Chaque écriture consolidée paie ce tour de votes : quelques millisecondes de coordination.",
      pros: [
        "Cohérence garantie malgré les pannes",
        "Fondation des systèmes répliqués fiables (etcd, CockroachDB, Kafka KRaft)",
      ],
      cons: [
        "Latence d'écriture majorée par la coordination",
        "Tolérance limitée : au-delà de la moitié de nœuds morts, plus rien ne se décide",
      ],
      useCases: ["Métadonnées de cluster", "Verrous distribués", "Bases cohérentes"],
      pitfalls: [
        "Quorum sans majorité réelle : le cluster se bloque silencieusement.",
        "Horloges physiques utilisées pour ordonner : le consensus exige des relations causales, pas l'heure murale.",
      ],
      concepts: ["Quorum", "Raft/Paxos", "Tolérance aux pannes", "Ordre total"],
    },
  },
  {
    id: "distributed-lock",
    name: "Verrou distribué",
    category: "distributed",
    icon: "LockKeyhole",
    description:
      "Exclusion mutuelle entre processus distribués : une seule exécution à la fois.",
    ports: { inputs: 1, outputs: 1 },
    fields: distributedLock.fields,
    defaults: distributedLock.defaults,
    maturity: "visual",
    subtitleFields: ["ttlMs", "backend"],
    learning: {
      role: "Un seul tenant à la fois pour une ressource partagée, entre machines différentes.",
      howItWorks:
        "Un backend partagé (Redis SETNX avec TTL, ZooKeeper) arbitre : le premier pose le verrou, les autres attendent ou abandonnent. Le TTL évite l'interblocage éternel si le détenteur meurt — mais introduit le risque de libération implicite pendant que le travail continue. Redlock et consort débattent de la solidité réelle de ces verrous.",
      pros: [
        "Exclusion mutuelle sans coordination centrale applicative",
        "TTL : les verrous des processus morts expirent seuls",
      ],
      cons: [
        "Correctness difficile : expirations pendant le traitement (deux « uniques » à la fois)",
        "Dépendance au backend de verrou, lui-même critique",
      ],
      useCases: ["Tâche singleton planifiée", "Migration unique", "Génération de cache coûteuse"],
      pitfalls: [
        "Verrou sans TTL : un crash verrouille la ressource pour toujours.",
        "Confiance aveule : le verrou a expiré, mais le premier processus continue son travail — vérifier le jeton (fencing).",
      ],
      concepts: ["SETNX", "Fencing token", "TTL", "Interblocage"],
    },
  },
  {
    id: "service-discovery",
    name: "Découverte de services",
    category: "distributed",
    icon: "Compass",
    description:
      "Annuaire vivant des instances disponibles : qui contacter, et est-il en bonne santé ?",
    ports: { inputs: 1, outputs: 1 },
    fields: serviceDiscovery.fields,
    defaults: serviceDiscovery.defaults,
    maturity: "visual",
    subtitleFields: ["heartbeatSec"],
    learning: {
      role: "Résoudre les noms logiques en instances concrètes et vivantes.",
      howItWorks:
        "Chaque instance s'enregistre et bat des cœurs ; l'annuaire (Consul, etcd, DNS de Kubernetes) marque les silencieux comme morts et sert la liste des saines. Côté client, la résolution se fait à chaque appel ; côté serveur, un maillage peut l'imposer. Sans découverte, chaque déploiement devrait reconfigurer tous les appelants.",
      pros: [
        "Ajouter/retirer des instances sans reconfiguration manuelle",
        "Intégration naturelle avec les health checks",
      ],
      cons: [
        "L'annuaire est une dépendance critique (tomber avec lui)",
        "Données d'annuaire toujours légèrement en retard sur la réalité",
      ],
      useCases: ["Microservices dynamiques", "Autoscaling", "Déploiements bleu/vert"],
      pitfalls: [
        "Cache client sans expiration : le trafic continue vers des instances mortes.",
        "Sans health check intégré : l'annuaire renvoie des zombies.",
      ],
      concepts: ["Annuaire", "Battement de cœur", "Résolution côté client/serveur"],
    },
  },
  {
    id: "saga",
    name: "Saga",
    category: "distributed",
    icon: "GitMerge",
    description:
      "Transaction répartie en étapes locales avec compensations : réussir ensemble ou annuler en ordre.",
    ports: { inputs: 1, outputs: 1 },
    fields: saga.fields,
    defaults: saga.defaults,
    maturity: "visual",
    subtitleFields: ["steps"],
    learning: {
      role: "Remplacer la transaction ACID globale par une suite de transactions locales compensables.",
      howItWorks:
        "Chaque service effectue sa transaction locale puis déclenche l'étape suivante ; en cas d'échec, les compensations s'exécutent en ordre inverse (annuler la réservation, recréditer le paiement). L'état d'avancement doit être durable : une saga interrompue reprend après redémarrage. La cohérence est à terme, pas immédiate.",
      pros: [
        "Transctions réparties sans verrous globaux de deux phases",
        "Chaque service garde l'autonomie de sa transaction locale",
      ],
      cons: [
        "Compensations à concevoir et à tester pour chaque étape",
        "Cohérence à terme : un observateur peut voir des états intermédiaires",
      ],
      useCases: ["Commande multi-services (stock, paiement, livraison)", "Parcours d'inscription", "Réservations"],
      pitfalls: [
        "Une étape sans compensation : la saga s'arrête au milieu sans retour arrière.",
        "Compensations non idempotentes : le rejeu crée des annulations en double.",
      ],
      concepts: ["Compensation", "Cohérence à terme", "Orchestration/chorégraphie"],
    },
  },
  {
    id: "event-sourcing",
    name: "Event sourcing",
    category: "distributed",
    icon: "History",
    description:
      "L'état est déduit d'un journal d'événements immuables : la mémoire devient l'histoire.",
    ports: { inputs: 1, outputs: 1 },
    fields: eventSourcing.fields,
    defaults: eventSourcing.defaults,
    maturity: "visual",
    subtitleFields: ["projections"],
    learning: {
      role: "Stocker les faits (événements) plutôt que l'état courant : tout état se reconstruit.",
      howItWorks:
        "Chaque changement est un événement ajouté au journal (jamais modifié) ; l'état courant s'obtient en rejouant les événements, et des projections matérialisent des vues pour la lecture. L'audit est parfait par construction — l'état à tout instant passé est recalculable. Le prix : lectures indirectes, schémas d'événements à versionner, replays à gérer.",
      pros: [
        "Piste d'audit native et complète",
        "Reconstruction de vues nouvelles depuis l'histoire complète",
        "Debug temporel : rejouer hier pour comprendre",
      ],
      cons: [
        "Lecture indirecte : il faut des projections à maintenir",
        "Versionnement des événements sur des années : inévitable",
        "Journal croissant : snapshots et compaction nécessaires",
      ],
      useCases: ["Comptes bancaires", "Commandes et logistique", "Systèmes d'audit stricts"],
      pitfalls: [
        "Événements pensés comme commandes (« crée ») au lieu de faits (« a été créé »).",
        "Aucune projection : relire toute l'histoire à chaque requête.",
      ],
      concepts: ["Journal immuable", "Projection", "Snapshot", "Rejeu"],
    },
  },
  {
    id: "cqrs",
    name: "CQRS",
    category: "distributed",
    icon: "ArrowLeftRight",
    description:
      "Séparer le modèle d'écriture du modèle de lecture : chacun optimisé pour son usage.",
    ports: { inputs: 1, outputs: 1 },
    fields: cqrs.fields,
    defaults: cqrs.defaults,
    maturity: "visual",
    subtitleFields: ["readModels"],
    learning: {
      role: "Deux chemins distincts : écrire d'un côté (normalisé, transactionnel), lire de l'autre (dénormalisé, rapide).",
      howItWorks:
        "Les écritures alimentent le modèle source ; des événements ou flux de synchronisation mettent à jour des modèles de lecture taillés pour chaque écran (recherche, tableau, fil). La lecture devient un simple accès indexé — très rapide. La contrepartie est le délai de propagation : l'interface peut montrer une donnère légèrement en retard sur l'écriture.",
      pros: [
        "Lectures ultra-rapides : la forme des données épouse les écrans",
        "Écritures et lectures dimensionnées indépendamment",
      ],
      cons: [
        "Cohérence à terme entre modèles : « read-your-writes » à gérer",
        "Deux modèles à maintenir et synchroniser",
      ],
      useCases: ["Catalogues complexes", "Tableaux de bord", "Recherche plein texte"],
      pitfalls: [
        "Utilisateur écrit puis relit immédiatement : il ne voit pas sa modification (délai de propagation).",
        "CQRS partout, y compris là où un simple CRUD suffisait : complexité gratuite.",
      ],
      concepts: ["Modèle de lecture", "Dénormalisation", "Read-your-writes", "Propagation"],
    },
  },
];
