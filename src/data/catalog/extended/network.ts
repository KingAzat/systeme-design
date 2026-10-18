import type { CatalogComponent } from "@/types";
import { balancerFields, proxyFields, rateLimiterFields } from "../field";

/** Catégorie réseau — routage, protection et répartition du trafic. */

const dns = proxyFields({
  capacityRps: 200000,
  latencyMs: 8,
  capacityHelp: "Résolutions par seconde du resolver (cache inclus).",
  latencyHelp: "Latence moyenne de résolution, cache OS/application pris en compte.",
});

const lbL4 = balancerFields({ layer: "l4", instances: 2, capacityRps: 100000, latencyMs: 1 });
const lbL7 = balancerFields({ layer: "l7", instances: 2, capacityRps: 50000, latencyMs: 2 });

const reverseProxy = proxyFields({
  capacityRps: 30000,
  latencyMs: 3,
  maxConnections: 10000,
});

const apiGateway = proxyFields({
  capacityRps: 25000,
  latencyMs: 8,
  maxConnections: 20000,
  latencyHelp: "Surcoût d'authentification, de quota et de routage.",
});

const waf = proxyFields({
  capacityRps: 15000,
  latencyMs: 5,
  maxConnections: 50000,
  latencyHelp: "Surcoût de l'inspection des charges utiles (règles, regex).",
});

const firewall = proxyFields({
  capacityRps: 200000,
  latencyMs: 0.5,
  capacityHelp: "Capacité de filtrage étatique en paquets/connexions par seconde.",
  latencyHelp: "Coût du filtrage étatique, quasi nul sur matériel moderne.",
});

const rateLimiter = rateLimiterFields({ limit: 1000, burst: 200, algorithm: "token-bucket" });

export const NETWORK_COMPONENTS: CatalogComponent[] = [
  {
    id: "dns",
    name: "DNS",
    category: "network",
    icon: "Globe2",
    description:
      "Résolution de noms de domaine : traduit le nom du service en adresse IP avant chaque connexion.",
    ports: { inputs: 1, outputs: 1 },
    fields: dns.fields,
    defaults: dns.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["latencyMs"],
    learning: {
      role: "Premier maillon de chaque connexion : trouve l'adresse IP derrière un nom de domaine.",
      howItWorks:
        "Le resolver met en cache les réponses pendant la durée du TTL : la latence observée est souvent celle du cache local (~1-10 ms), pas celle de la racine. Un TTL court permet de basculer rapidement vers une autre IP en cas de panne — au prix d'une charge DNS plus élevée.",
      pros: [
        "Cache par TTL : la majorité des résolutions est quasi instantanée",
        "DNS round-robin : répartition de secours sans infrastructure",
      ],
      cons: [
        "TTL court = plus de trafic DNS mais bascule plus rapide : arbitrage permanent",
        "Une panne DNS rend tout le système inaccessible même si les serveurs vont bien",
      ],
      useCases: ["Résolution publique", "Bascule géographique (GeoDNS)", "Blue/green via TTL"],
      pitfalls: [
        "TTL de plusieurs heures : impossible de réagir à une panne en moins d'une heure.",
        "Oublier que le DNS peut servir de répartiteur — avec ses limites de supervision.",
      ],
      concepts: ["TTL", "Resolver", "GeoDNS", "Anycast"],
    },
  },
  {
    id: "load-balancer-l4",
    name: "Load Balancer L4",
    category: "network",
    icon: "Network",
    description:
      "Répartiteur de transport (TCP/UDP) : très haut débit, sans visibilité sur le contenu HTTP.",
    ports: { inputs: 1, outputs: 1 },
    fields: lbL4.fields,
    defaults: lbL4.defaults,
    maturity: "simulated",
    simRole: "balancer",
    subtitleFields: ["layer", "capacityRps"],
    learning: {
      role: "Distribue les connexions TCP/UDP vers un pool de cibles, au niveau transport.",
      howItWorks:
        "Le L4 lit uniquement les en-têtes IP/TCP : il route une connexion entière vers une cible, sans regarder URLs, headers ou cookies. Cette simplicité lui donne un débit très élevé et une latence quasi nulle, mais aucune finesse (pas de routage par chemin, pas de sessions applicatives).",
      pros: [
        "Débit énorme et latence sub-milliseconde",
        "Indépendant du protocole applicatif (HTTP, gRPC, bases de données…)",
      ],
      cons: [
        "Aucune décision par route, header ou cookie",
        "Le sticky par IP client peut déséquilibrer derrière un NAT d'entreprise",
      ],
      useCases: ["Terminaison TCP brute", "Répartition de bases de données", "Étage devant des L7"],
      pitfalls: [
        "Attendre d'un L4 des règles HTTP (redirections, chemins) : il ne les voit pas.",
        "IP Hash derrière des NAT : quelques adresses génèrent l'essentiel du trafic.",
      ],
      concepts: ["L4 vs L7", "NAT", "Connexion", "Sticky sessions"],
    },
  },
  {
    id: "load-balancer-l7",
    name: "Load Balancer L7",
    category: "network",
    icon: "Network",
    description:
      "Répartiteur applicatif (HTTP/HTTPS) : routage par chemin, headers, cookies et health checks riches.",
    ports: { inputs: 1, outputs: 1 },
    fields: lbL7.fields,
    defaults: lbL7.defaults,
    maturity: "simulated",
    simRole: "balancer",
    subtitleFields: ["layer", "capacityRps"],
    learning: {
      role: "Point d'entrée applicatif : route chaque requête HTTP selon son contenu.",
      howItWorks:
        "Le L7 termine TLS, lit la requête complète et applique des règles : routage par chemin (/api vers un pool, /static vers un autre), sessions persistantes par cookie, réécriture d'URL. Les health checks applicatifs vérifient une vraie route (ex. /healthz) et pas seulement l'ouverture du port.",
      pros: [
        "Routage par chemin, hôte ou header",
        "Health checks applicatifs : failover précis",
        "Terminaison TLS centralisée (certificats gérés à un seul endroit)",
      ],
      cons: [
        "Plus coûteux en CPU que le L4 (parsing HTTP, TLS)",
        "Point de décision critique : à répliquer absolument",
      ],
      useCases: ["API multi-services", "Canary et blue/green", "Sessions persistantes"],
      pitfalls: [
        "Terminer TLS au bord mais laisser l'interne en clair : à évaluer selon l'exigence de sécurité.",
        "Health check trop permissif (200 sur l'accueil) alors que la dépendance critique est morte.",
      ],
      concepts: ["Terminaison TLS", "Routage par chemin", "Canary", "Health check"],
    },
  },
  {
    id: "reverse-proxy",
    name: "Reverse Proxy",
    category: "network",
    icon: "Share2",
    description:
      "Intermédiaire qui reçoit les requêtes au nom des serveurs internes : cache, TLS, filtrage.",
    ports: { inputs: 1, outputs: 1 },
    fields: reverseProxy.fields,
    defaults: reverseProxy.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "Représente les serveurs internes auprès du monde extérieur et masque la topologie.",
      howItWorks:
        "Le client ne parle qu'au reverse proxy (Nginx, HAProxy, Envoy…), qui transmet au serveur interne approprié. Il peut servir un cache statique, compresser, gérer les certificats et normaliser les en-têtes. Sans lui, chaque serveur applicatif devrait gérer TLS et l'exposition réseau.",
      pros: [
        "Masque la topologie interne (les serveurs ne sont jamais exposés)",
        "Centralise TLS, compression et cache statique",
      ],
      cons: [
        "Saut réseau supplémentaire : quelques millisecondes ajoutées",
        "Doit être dimensionné pour la totalité du trafic entrant",
      ],
      useCases: ["Publication d'applications internes", "Cache statique", "Normalisation TLS"],
      pitfalls: [
        "Oublier les en-têtes X-Forwarded-For : géolocalisation et rate limiting cassés.",
        "Timeouts du proxy plus longs que ceux des serveurs : il accumule des requêtes mortes.",
      ],
      concepts: ["X-Forwarded-For", "Terminaison TLS", "Cache statique", "Topologie"],
    },
  },
  {
    id: "api-gateway",
    name: "API Gateway",
    category: "network",
    icon: "Cable",
    description:
      "Porte d'entrée unique des API : authentification, quotas, routage vers les microservices.",
    ports: { inputs: 1, outputs: 1 },
    fields: apiGateway.fields,
    defaults: apiGateway.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps", "latencyMs"],
    learning: {
      role: "Façade unique des API : authentifie, applique les quotas et route vers les bons services.",
      howItWorks:
        "Toutes les requêtes API passent par la passerelle, qui vérifie le jeton d'accès, applique les quotas par client, transforme éventuellement la requête puis la route vers le microservice compétent. Elle agrège aussi la télémétrie : une seule place pour compter, tracer et limiter.",
      pros: [
        "Point unique de sécurité : auth, quotas, mTLS vers l'interne",
        "Découplage clients/services : les clients ignorent la topologie interne",
      ],
      cons: [
        "Devient un goulot unique : à dimensionner et répliquer avec soin",
        "Logique qui s'y accumule (« smart gateway, dumb services ») : difficile à tester",
      ],
      useCases: ["API publiques", "Microservices", "Monétisation par quota"],
      pitfalls: [
        "Mettre de la logique métier dans la gateway : elle devient un monolithe invisible.",
        "Oublier les quotas par client identifié — sinon les quotas globaux punissent tout le monde.",
      ],
      concepts: ["Quota", "OAuth", "Routage", "Façade"],
    },
  },
  {
    id: "waf",
    name: "WAF",
    category: "network",
    icon: "Flame",
    description:
      "Pare-feu applicatif : inspecte les charges HTTP pour bloquer injections, XSS et abus.",
    ports: { inputs: 1, outputs: 1 },
    fields: waf.fields,
    defaults: waf.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: ["capacityRps"],
    learning: {
      role: "Filtre les requêtes malveillantes avant qu'elles n'atteignent l'application.",
      howItWorks:
        "Le WAF analyse chaque requête HTTP (URL, en-têtes, corps) au regard de règles : signatures d'injection SQL, motifs XSS, anomalies de protocole. Une requête suspecte est bloquée (403) ou journalisée. Les règles managées (OWASP Core Rule Set) couvrent les grandes classes d'attaques.",
      pros: [
        "Bloque les attaques connues sans toucher au code applicatif",
        "Journalisation centralisée des tentatives d'attaque",
      ],
      cons: [
        "Faux positifs : une règle trop agressive rejette du trafic légitime",
        "Contournable : un WAF ne remplace ni validation, ni requêtes paramétrées",
      ],
      useCases: ["Protection OWASP Top 10", "API exposées publiquement", "Conformité PCI-DSS"],
      pitfalls: [
        "Compter uniquement sur le WAF : la défense en profondeur reste obligatoire.",
        "Règles en mode blocage dès le premier jour : commencer en mode détection.",
      ],
      concepts: ["OWASP Top 10", "Injection SQL", "XSS", "Défense en profondeur"],
    },
  },
  {
    id: "firewall",
    name: "Pare-feu",
    category: "network",
    icon: "Shield",
    description:
      "Filtrage réseau par règles IP/port : autorise uniquement les flux explicitement déclarés.",
    ports: { inputs: 1, outputs: 1 },
    fields: firewall.fields,
    defaults: firewall.defaults,
    maturity: "partial",
    simRole: "proxy",
    subtitleFields: [],
    learning: {
      role: "Garde-barrière réseau : bloque tout ce qui n'est pas explicitement autorisé.",
      howItWorks:
        "Le pare-feu applique une liste de règles sur les paquets (IP source/destination, port, protocole) avec suivi d'état des connexions. Dans le cloud, les security groups jouent ce rôle : une instance n'accepte que les flux déclarés, le reste est rejeté en silence.",
      pros: [
        "Latence et coût quasi nuls",
        "Réduit drastiquement la surface d'attaque (segmentation, ports inutiles fermés)",
      ],
      cons: [
        "Ne voit pas la charge HTTP : laisse passer une requête malveillante bien formée",
        "Règles qui pourrissent avec le temps : qui ose supprimer la règle de 2019 ?",
      ],
      useCases: ["Segmentation VPC", "NAT et accès sortant contrôlé", "Security groups cloud"],
      pitfalls: [
        "Règle 0.0.0.0/0 sur le port de la base de données : l'incident classique.",
        "Aucune revue des règles : la matrice de flux ne reflète plus la réalité.",
      ],
      concepts: ["Security group", "Stateful", "Segmentation", "Moindre privilège"],
    },
  },
  {
    id: "rate-limiter",
    name: "Rate Limiter",
    category: "network",
    icon: "Gauge",
    description:
      "Limite le débit autorisé pour protéger le système en aval contre la surcharge et les abus.",
    ports: { inputs: 1, outputs: 1 },
    fields: rateLimiter.fields,
    defaults: rateLimiter.defaults,
    maturity: "simulated",
    simRole: "rate-limiter",
    subtitleFields: ["limit"],
    learning: {
      role: "Bouclier de protection contre la surcharge et les abus.",
      howItWorks:
        "Les jetons se reconstituent à vitesse fixe ; chaque requête en consomme un. Sans jeton disponible, la requête est rejetée immédiatement (429) sans toucher l'aval. Placé en amont (edge, gateway), il protège aussi l'utilisateur légitime en évitant l'effondrement complet.",
      pros: [
        "Protège l'aval en rejetant tôt (peu de ressources consommées)",
        "Rejets explicites (429 + Retry-After) : les clients peuvent s'adapter",
      ],
      cons: [
        "Rejette des requêtes légitimes si la limite est mal calibrée",
        "Répartition multi-instances : compteur partagé (Redis) ou limite multipliée",
      ],
      useCases: ["API publiques", "Protection anti-abus", "Fair use par client"],
      pitfalls: [
        "Limite trop basse : l'API rejette le trafic utile aux heures de pointe.",
        "Rate limiter par instance sans état partagé : la limite réelle est multipliée par le nombre d'instances.",
      ],
      concepts: ["Token bucket", "429 Too Many Requests", "Backpressure", "Fenêtre glissante"],
    },
  },
];
