import type { CatalogComponent } from "@/types";
import { cacheFields, cdnFields } from "../field";

/** Catégorie cache — étages de mémoire rapide devant les données. */

const memcached = cacheFields({
  hitRatio: 0.7,
  avgServiceMs: 1,
  maxConnections: 20000,
  memoryGb: 16,
  evictionPolicy: "allkeys-lru",
});

const cacheLocal = cacheFields({
  hitRatio: 0.3,
  avgServiceMs: 0.5,
  maxConnections: 10000,
  memoryGb: 1,
  evictionPolicy: "allkeys-lru",
  hitHelp: "Taux de hit local : élevé sur les données immuables, faible sinon.",
});

const cacheDistribue = cacheFields({
  versions: [
    { value: "v3", label: "Cluster v3" },
    { value: "v2", label: "Cluster v2" },
  ],
  version: "v3",
  hitRatio: 0.8,
  avgServiceMs: 3,
  maxConnections: 15000,
  memoryGb: 32,
  evictionPolicy: "allkeys-lru",
});

const cdnCache = cdnFields({ cacheHitRatio: 0.9, hitLatencyMs: 8, capacityRps: 50000 });

export const CACHE_COMPONENTS: CatalogComponent[] = [
  {
    id: "memcached",
    name: "Memcached",
    category: "cache",
    icon: "MemoryStick",
    description:
      "Cache mémoire multi-instances : simple, multithreadé, sans structures complexes.",
    ports: { inputs: 1, outputs: 1 },
    fields: memcached.fields,
    defaults: memcached.defaults,
    maturity: "simulated",
    simRole: "cache",
    subtitleFields: ["hitRatio"],
    learning: {
      role: "Tampon mémoire simple entre l'application et la base de données.",
      howItWorks:
        "Chaque instance gère une table de hachage en mémoire et évique par LRU quand la mémoire est pleine. Le client calcule lui-même l'instance par hachage de la clé : pas de coordination entre nœuds, donc pas de réplication — une instance perdue vide son tiers du cache.",
      pros: [
        "Latence sub-milliseconde et très haut débit (multithread)",
        "Modèle simple : get/set/delete suffisent",
      ],
      cons: [
        "Aucune réplication : un redémarrage vide le cache",
        "Pas de structures riches (pas de sets, listes, streams)",
      ],
      useCases: ["Cache d'objets sérialisés", "Résultats de requêtes", "Compteurs éphémères"],
      pitfalls: [
        "Compter sur la persistance : Memcached est volatile par conception.",
        "Taille des valeurs trop grosse : fragmentation mémoire et latence.",
      ],
      concepts: ["LRU", "Client-side sharding", "Volatilité"],
    },
  },
  {
    id: "cache-local",
    name: "Cache local",
    category: "cache",
    icon: "Cpu",
    description:
      "Cache dans le processus même : nanosecondes d'accès, mais par instance et vite obsolète.",
    ports: { inputs: 1, outputs: 1 },
    fields: cacheLocal.fields,
    defaults: cacheLocal.defaults,
    maturity: "simulated",
    simRole: "cache",
    subtitleFields: ["hitRatio", "avgServiceMs"],
    learning: {
      role: "Premier étage de cache : dans la mémoire du processus applicatif.",
      howItWorks:
        "Une simple table en mémoire (Map, LRU local) évite même le saut réseau. Le taux de hit est plus faible qu'un cache partagé : chaque instance ne voit que les requêtes qu'elle reçoit. L'invalidation est le vrai problème — comment prévenir toutes les instances qu'une valeur a changé ?",
      pros: [
        "Accès quasi gratuit (pas de réseau)",
        "Excellente protection contre les hot keys",
      ],
      cons: [
        "Taux de hit plus faible (cache par instance)",
        "Invalidation distribuée difficile à faire correctement",
      ],
      useCases: ["Hot keys", "Données de référence quasi immuables", "Anti-cache-stampede local"],
      pitfalls: [
        "TTL long sur des données qui changent : chaque instance sert des valeurs différentes.",
        "Taille non bornée : fuite mémoire garantie.",
      ],
      concepts: ["Cache stampede", "Invalidation", "Hot key", "TTL"],
    },
  },
  {
    id: "cache-distribue",
    name: "Cache distribué",
    category: "cache",
    icon: "Network",
    description:
      "Cache partagé en cluster : cohérent entre instances applicatives, tolérant aux pannes.",
    ports: { inputs: 1, outputs: 1 },
    fields: cacheDistribue.fields,
    defaults: cacheDistribue.defaults,
    maturity: "simulated",
    simRole: "cache",
    subtitleFields: ["hitRatio"],
    learning: {
      role: "Étage de cache partagé par toutes les instances applicatives.",
      howItWorks:
        "Les clés sont réparties par hachage cohérent sur les nœuds du cluster ; certains mode opèrent des réplicas par clé. Toutes les instances voient donc la même vue du cache : une valeur invalidée l'est pour tout le monde. Le saut réseau coûte quelques millisecondes contre nanosecondes en local.",
      pros: [
        "Vue cohérente pour toutes les instances",
        "Capacité additionnée des nœuds, redimensionnable",
      ],
      cons: [
        "Saut réseau systématique (~1-3 ms)",
        "Resharding et reprise après panne à maîtriser",
      ],
      useCases: ["Sessions partagées", "Cache applicatif global", "Compteurs distribués"],
      pitfalls: [
        "Un seul nœud sans réplication : la panne du cache emporte la disponibilité applicative.",
        "Hot key sur un seul nœud : le cluster ne répartit pas une clé populaire.",
      ],
      concepts: ["Hachage cohérent", "Resharding", "Hot key"],
    },
  },
  {
    id: "cdn-cache",
    name: "Cache d'edge",
    category: "cache",
    icon: "Globe",
    description:
      "Cache au plus près des utilisateurs : sert le contenu avant même d'entrer dans le système.",
    ports: { inputs: 1, outputs: 1 },
    fields: cdnCache.fields,
    defaults: cdnCache.defaults,
    maturity: "simulated",
    simRole: "cdn",
    subtitleFields: ["cacheHitRatio"],
    learning: {
      role: "Étage de cache géographique : la requête ne traverse pas l'Internet jusqu'à l'origine.",
      howItWorks:
        "Le premier accès va chercher l'objet à l'origine et le stocke dans le nœud edge de la région ; les accès suivants sont servis localement. Le TTL des réponses (headers Cache-Control) pilote la fraîcheur. Un bon hit ratio (0.9+) est atteint sur du contenu statique ou personalisé par fragment.",
      pros: [
        "Latence perçue divisée par la distance",
        "L'origine ne voit qu'une fraction du trafic",
      ],
      cons: [
        "Contenu dynamique non cacheable : ratio qui s'effondre",
        "Invalidation mondiale lente et approximative",
      ],
      useCases: ["Assets web", "Vidéo à la demande", "Réponses API cacheables"],
      pitfalls: [
        "Cache-Control absent sur les réponses API : soit tout est caché (données périmées), soit rien.",
        "Espérer un hit ratio élevé sur du contenu unique par utilisateur.",
      ],
      concepts: ["Edge", "Cache-Control", "TTL", "Invalidation"],
    },
  },
];
