import type { CatalogComponent } from "@/types";
import { databaseFields, proxyFields } from "../field";

/** Catégorie SQL — moteurs relationnels et mise en pool des connexions. */

const mysql = databaseFields({
  versions: [
    { value: "mysql-8.4", label: "MySQL 8.4" },
    { value: "mysql-8.0", label: "MySQL 8.0" },
  ],
  version: "mysql-8.4",
  avgReadMs: 10,
  avgWriteMs: 25,
  maxConnections: 150,
  dataGb: 200,
  cpuCores: 8,
  memoryGb: 16,
  internalCacheEnabled: true,
  replicationPolicy: "async",
});

const connectionPool = proxyFields({
  capacityRps: 20000,
  latencyMs: 1,
  maxConnections: 200,
  capacityHelp: "Requêtes/s pouvant transiter par le pool (recherche d'un slot libre incluse).",
  latencyHelp: "Surcoût de la gestion du pool, sub-milliseconde quand un slot est libre.",
});

export const SQL_COMPONENTS: CatalogComponent[] = [
  {
    id: "mysql",
    name: "MySQL",
    category: "sql",
    icon: "Database",
    description:
      "Base relationnelle très répandue : transactions ACID, réplication maître-réplicas éprouvée.",
    ports: { inputs: 1, outputs: 1 },
    fields: mysql.fields,
    defaults: mysql.defaults,
    maturity: "simulated",
    simRole: "database",
    subtitleFields: ["version"],
    learning: {
      role: "Source de vérité transactionnelle : le choix par défaut de nombreuses applications.",
      howItWorks:
        "Chaque requête consomme une connexion et un temps dépendant du type (lecture vs écriture). InnoDB bufferise les lectures chaudes en mémoire (cache interne) et journalise les écritures (redo log + fsync). Au-delà de max_connections, les clients attendent un slot — d'où le pool applicatif obligatoire.",
      pros: [
        "Transactions ACID avec niveaux d'isolation réglables",
        "Réplication maître-réplicas simple à opérer",
        "Écosystème outil immense (sauvegarde, monitoring, expertise)",
      ],
      cons: [
        "Montée en charge verticale d'abord : le sharding est artisanal",
        "Connexions coûteuses (un thread par connexion sans thread pooling)",
      ],
      useCases: ["Application web classique", "e-commerce transactionnel", "Rapports SQL"],
      pitfalls: [
        "Des centaines de connexions directes : passer par un pool (voir Connection Pool).",
        "Requêtes sans index sur de grosses tables : lectures qui passent de 10 ms à plusieurs secondes.",
      ],
      concepts: ["InnoDB", "Redo log", "fsync", "Réplication", "Index"],
    },
  },
  {
    id: "connection-pool",
    name: "Pool de connexions",
    category: "sql",
    icon: "ArrowLeftRight",
    description:
      "Bassin de connexions base de données réutilisées : évite le coût d'ouverture à chaque requête.",
    ports: { inputs: 1, outputs: 1 },
    fields: connectionPool.fields,
    defaults: connectionPool.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["maxConnections"],
    learning: {
      role: "Tampon régulateur entre les serveurs applicatifs et la base de données.",
      howItWorks:
        "Ouvrir une connexion SQL coûte cher (poignée de main TCP, TLS, auth, session). Le pool garde N connexions ouvertes et les prête le temps d'une requête. Saturé, il met les requêtes en attente : la file d'attente du pool devient le premier goulot visible côté application.",
      pros: [
        "Latence de requête réduite (pas de reconnexion)",
        "Protège la base : le nombre de connexions est plafonné par construction",
      ],
      cons: [
        "Un pool mal dimensionné déplace le goulot côté application (file d'attente)",
        "Connexions dormantes coupées par un pare-feu : erreurs de « stale connection »",
      ],
      useCases: ["Application serveur longue durée", "Fonctions avec réutilisation du pool", "Limitation par locataire"],
      pitfalls: [
        "Pool par instance × nombre d'instances > max_connections de la base : refus de connexion aléatoires.",
        "Oublier le keep-alive/validation : les connexions coupées en silence remontent en erreurs métier.",
      ],
      concepts: ["Connexion", "File d'attente", "Keep-alive", "Backpressure"],
    },
  },
];
