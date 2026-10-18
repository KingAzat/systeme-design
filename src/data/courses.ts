import type { Course, CourseLevel } from "@/types";
import { TEMPLATE_MAP } from "@/data/templates";

/**
 * SystemLab — Parcours d'apprentissage : 23 cours de System Design en français.
 *
 * Structure : 7 cours débutant, 8 intermédiaires, 8 avancés.
 * Chaque cours contient des sections techniques réelles (définitions, ordres de
 * grandeur vérifiables, trade-offs), des concepts clés, un quiz de 3 questions
 * et — pour la plupart — un exercice practice branché sur un modèle
 * d'architecture de `src/data/templates.ts` (voir exercise.templateId).
 *
 * Invariant garanti ici : tout exercise.templateId existe dans TEMPLATE_MAP.
 */

export const COURSES: Course[] = [
  /* ================================================================
   * DÉBUTANT (7)
   * ================================================================ */
  {
    slug: "client-serveur",
    title: "Le modèle client-serveur",
    level: "débutant",
    durationMin: 15,
    summary:
      "Le modèle fondateur de tout le Web : un client demande, un serveur répond. Concurrence, état, et ce qui rend un serveur scalable dès le premier jour.",
    sections: [
      {
        title: "Demander, traiter, répondre",
        content:
          "Un client émet une requête, un serveur la traite et renvoie une réponse. Le client peut être un navigateur, une application mobile ou un autre service ; le serveur écoute sur un port et répond. Presque tout le Web repose sur ce dialogue requête/réponse, du site statique aux plateformes à millions d'utilisateurs.",
      },
      {
        title: "Concurrence : combien de requêtes à la fois",
        content:
          "Un serveur ne traite pas les requêtes une par une : il accepte plusieurs connexions simultanées (threads, event loop, workers). Sa capacité vaut environ concurrence × 1000 / temps de réponse en ms : 64 requêtes en cours à 50 ms chacune donnent ~1 280 req/s. Au-delà, les demandes s'accumulent dans une file d'attente.",
      },
      {
        title: "Stateless : la clé pour grandir",
        content:
          "Un serveur stateless ne garde aucune mémoire des requêtes précédentes : n'importe quelle instance peut traiter n'importe quelle requête. C'est ce qui permet d'ajouter des machines derrière un répartiteur. L'état (sessions, paniers) est déporté vers Redis ou une base ; un serveur stateful (WebSocket, cache local) contraint le routage.",
      },
    ],
    concepts: ["client-serveur", "requête/réponse", "stateless", "concurrence", "loi de Little"],
    quiz: [
      {
        question: "Que signifie « stateless » pour un serveur ?",
        choices: [
          "Il ne conserve aucune donnée entre deux requêtes",
          "Il ne répond jamais aux clients",
          "Il stocke toutes les sessions en mémoire locale",
          "Il refuse les connexions simultanées",
        ],
        answer: 0,
        explanation:
          "Stateless = aucune mémoire des requêtes précédentes. N'importe quelle instance peut servir n'importe quel client : condition du scaling horizontal.",
      },
      {
        question:
          "Un serveur traite en moyenne 40 ms par requête et accepte 50 requêtes simultanées. Sa capacité est d'environ…",
        choices: ["40 req/s", "50 req/s", "1 250 req/s", "2 000 req/s"],
        answer: 2,
        explanation:
          "Capacité ≈ concurrence / latence = 50 / 0,04 = 1 250 req/s. C'est la loi de Little appliquée au débit d'un serveur.",
      },
      {
        question: "Où stocker les sessions utilisateur pour scaler horizontalement ?",
        choices: [
          "Dans la mémoire du serveur applicatif",
          "Dans un stockage partagé type Redis ou base de données",
          "Dans un cookie non signé côté client uniquement",
          "Dans les logs applicatifs",
        ],
        answer: 1,
        explanation:
          "Un stockage partagé (Redis, base) rend toutes les instances interchangeables ; la mémoire locale imposerait des sessions collantes.",
      },
    ],
  },
  {
    slug: "http",
    title: "HTTP et HTTPS de fond en comble",
    level: "débutant",
    durationMin: 15,
    summary:
      "Méthodes, codes de statut, TLS, HTTP/2 : la grammaire des échanges qui portent vos requêtes, et les réflexes (timeouts, idempotence) qui évitent les catastrophes.",
    sections: [
      {
        title: "Anatomie d'un échange HTTP",
        content:
          "Chaque requête porte une méthode (GET, POST, PUT, PATCH, DELETE), un chemin, des en-têtes et parfois un corps ; la réponse renvoie un code de statut. Les codes se lisent par famille : 2xx succès, 3xx redirection, 4xx erreur du client, 5xx erreur du serveur. 200, 404 et 503 sont les plus fréquents en production.",
      },
      {
        title: "HTTPS : chiffrement et identité",
        content:
          "HTTPS encapsule HTTP dans TLS : le trafic est chiffré et le serveur prouve son identité via un certificat. Le handshake TLS 1.3 coûte un aller-retour (0-RTT en reprise). Chaque aller-retour réseau coûte 10 à 100 ms selon la distance : limiter les allers-retours compte autant que compresser les contenus.",
      },
      {
        title: "HTTP/1.1, HTTP/2, HTTP/3",
        content:
          "HTTP/1.1 sérialise les requêtes d'une même connexion (blocage en tête de file) ; HTTP/2 multiplexe plusieurs flux sur une seule connexion TCP ; HTTP/3 pose HTTP sur QUIC (UDP) pour supprimer le blocage au niveau transport. Les connexions persistantes (keep-alive) évitent de payer TCP + TLS complet à chaque requête.",
      },
      {
        title: "Timeouts et idempotence",
        content:
          "GET, PUT et DELETE sont idempotents : les rejouer donne le même état. POST ne l'est pas : un retry peut créer une commande en double — d'où les clés d'idempotence. Côté client, chaque requête doit avoir un timeout ; côté serveur, 408 et 504 signalent un dépassement, 429 une limitation de débit.",
      },
    ],
    concepts: ["HTTP", "codes de statut", "TLS", "HTTP/2", "idempotence"],
    quiz: [
      {
        question: "Un serveur renvoie 503. Que signifie ce code ?",
        choices: [
          "La ressource n'existe pas",
          "Le client n'est pas authentifié",
          "Le service est indisponible ou surchargé",
          "La requête est mal formée",
        ],
        answer: 2,
        explanation:
          "5xx = erreur côté serveur ; 503 Service Unavailable signale le plus souvent une saturation ou une maintenance.",
      },
      {
        question: "Quelle méthode n'est PAS idempotente ?",
        choices: ["GET", "PUT", "DELETE", "POST"],
        answer: 3,
        explanation:
          "Rejouer un POST peut dupliquer l'effet (double commande). GET, PUT et DELETE laissent l'état inchangé après un second appel.",
      },
      {
        question: "Le principal apport d'HTTP/2 est…",
        choices: [
          "Le chiffrement obligatoire",
          "Le multiplexage des requêtes sur une seule connexion",
          "La suppression des codes d'erreur",
          "Un en-tête User-Agent obligatoire",
        ],
        answer: 1,
        explanation:
          "HTTP/2 multiplexe plusieurs flux en parallèle sur une connexion TCP, supprimant le blocage en tête de file d'HTTP/1.1.",
      },
    ],
  },
  {
    slug: "api-rest",
    title: "Concevoir une API REST solide",
    level: "débutant",
    durationMin: 20,
    summary:
      "Concevoir une API que d'autres peuvent consommer sans souffrir : ressources, pagination, erreurs structurées, versioning — et le piège classique du N+1.",
    sections: [
      {
        title: "Des ressources et des verbes",
        content:
          "REST modélise l'API autour de ressources identifiées par des URI (/users/42/orders) manipulées avec les verbes HTTP. GET lit sans modifier, POST crée, PUT remplace, DELETE supprime. Une API REST bien conçue est prévisible : la structure de l'URI raconte la hiérarchie, les codes de statut racontent le résultat.",
      },
      {
        title: "Pagination, filtrage, tri",
        content:
          "Jamais de réponse non bornée : paginer, filtrer et trier côté serveur. L'offset re-scanne les premières lignes et devient lent au-delà de quelques milliers d'éléments ; la pagination par curseur (WHERE id > dernier_id) reste constante en temps. Une liste non paginée est un incident de production en sursis.",
      },
      {
        title: "Le problème N+1",
        content:
          "Récupérer une liste puis une ressource liée par élément multiplie les allers-retours : 1 liste + N détails = N+1 requêtes, chacune avec sa latence. On l'évite côté API avec des inclusions (?include=orders) ou côté consommateur avec un BFF. Le remède serveur : jointures, vues ou batch loading.",
      },
      {
        title: "Erreurs structurées et versioning",
        content:
          "Les erreurs doivent être stables et lisibles par machine : code, message humain, champs concernés. Versionner dès le premier consommateur externe (/v1/ ou en-tête) car retirer un champ casse des clients que vous ne contrôlez pas. 429 accompagne les quotas ; les clés d'idempotence sécurisent les POST rejoués.",
      },
    ],
    concepts: ["REST", "ressource", "pagination par curseur", "problème N+1", "versioning", "clé d'idempotence"],
    quiz: [
      {
        question: "GET /users/42 renvoie 200. Après DELETE /users/42, GET /users/42 renvoie…",
        choices: ["200 puis 500", "204 puis 404", "404 puis 404", "301 puis 200"],
        answer: 1,
        explanation:
          "La suppression réussit sans corps de réponse (204) ; ensuite la ressource n'existe plus : 404 Not Found.",
      },
      {
        question: "Une liste renvoie 10 000 objets en une seule réponse. Quel risque immédiat ?",
        choices: [
          "Aucun, c'est le travail de l'API",
          "Latence, mémoire et timeouts côté client comme serveur",
          "Un code 404 systématique",
          "La perte des en-têtes HTTP",
        ],
        answer: 1,
        explanation:
          "Sans pagination, charge réseau et mémoire, sérialisation et temps de réponse explosent des deux côtés : il faut paginer.",
      },
      {
        question: "Le problème N+1 se produit quand…",
        choices: [
          "Un seul appel renvoie N objets",
          "On boucle sur une liste en émettant une requête par élément",
          "La base contient N index",
          "N clients partagent une connexion",
        ],
        answer: 1,
        explanation:
          "Chaque élément déclenche sa propre requête : N+1 allers-retours cumulent la latence et chargent la base.",
      },
    ],
  },
  {
    slug: "bases-de-donnees",
    title: "Bases de données : ce qui décide de la vitesse",
    level: "débutant",
    durationMin: 25,
    summary:
      "Index, transactions, connexions : les mécanismes qui décident réellement de la vitesse d'une base, avec les ordres de grandeur à connaître avant de crier « la base est lente ».",
    sections: [
      {
        title: "SQL ou NoSQL : choisir selon les requêtes",
        content:
          "Une base relationnelle (PostgreSQL, MySQL) garantit des transactions ACID et des requêtes riches avec jointures : idéale pour les données transactionnelles. Le NoSQL spécialise : clé-valeur (Redis) pour la vitesse, document (MongoDB) pour les objets flexibles, wide-column (Cassandra) pour le volume d'écriture. On choisit selon les requêtes dominantes.",
      },
      {
        title: "Index : la différence entre 8 ms et 8 s",
        content:
          "Sans index, un SELECT parcourt toute la table (scan séquentiel). Un index B-tree répond en O(log n) : quelques lectures de pages suffisent, typiquement 1 à 10 ms par lecture indexée. Chaque index accélère les lectures mais ralentit chaque écriture et occupe de l'espace : on indexe les colonnes filtrées et triées, pas tout.",
      },
      {
        title: "Écritures et transactions",
        content:
          "Une écriture durable traverse le journal (WAL) avec fsync : 5 à 35 ms selon le stockage. Les transactions regroupent des opérations et les rendent atomiques ; le niveau d'isolation (read committed, serializable) définit ce que les transactions concurrentes peuvent voir. Verrous et dimensionnement des connexions font le reste.",
      },
      {
        title: "Connexions : le goulot silencieux",
        content:
          "Chaque instance n'accepte qu'un nombre limité de connexions (souvent 100 à 500) ; au-delà, les clients attendent. Un pool (PgBouncer, pool applicatif) multiplexe des milliers de requêtes clientes sur quelques dizaines de connexions réelles. Capacité d'une base ≈ connexions × 1000 / temps moyen en ms.",
      },
    ],
    concepts: ["ACID", "index B-tree", "WAL", "pool de connexions", "isolation"],
    quiz: [
      {
        question: "Qu'est-ce qu'une transaction ACID ?",
        choices: [
          "Une requête particulièrement rapide",
          "Un groupe d'opérations atomiques, cohérentes, isolées et durables",
          "Un index composite multi-colonnes",
          "Une sauvegarde planifiée",
        ],
        answer: 1,
        explanation:
          "Atomicity, Consistency, Isolation, Durability : tout ou rien, état valide, isolation entre transactions, persistance au commit.",
      },
      {
        question: "Pourquoi un index B-tree accélère-t-il les lectures ?",
        choices: [
          "Il compresse la table",
          "Il stocke les clés triées : la recherche descend en O(log n) au lieu de tout parcourir",
          "Il duplique la base en mémoire",
          "Il supprime les jointures",
        ],
        answer: 1,
        explanation:
          "La structure arborescente triée ne visite que quelques pages par requête, là où le scan séquentiel lit toute la table.",
      },
      {
        question: "À quoi sert un pool de connexions (PgBouncer) ?",
        choices: [
          "À sauvegarder la base",
          "À multiplexer des milliers de clients sur peu de connexions réelles",
          "À créer des index automatiquement",
          "À répliquer les écritures",
        ],
        answer: 1,
        explanation:
          "Le pool ouvre peu de connexions coûteuses vers la base et les partage entre clients, évitant l'attente au-delà de max_connections.",
      },
    ],
  },
  {
    slug: "cache-fondamental",
    title: "Le cache, fondamentalement",
    level: "débutant",
    durationMin: 20,
    summary:
      "Dix fois moins de latence sur les lectures chaudes : hits, misses, invalidation et éviction. Le cache est simple — jusqu'au jour où il ment.",
    sections: [
      {
        title: "Trois ordres de grandeur",
        content:
          "Lire en mémoire vive coûte environ 0,1 à 1 ms ; lire une ligne indexée sur disque via une base, 5 à 15 ms. Un cache en mémoire (Redis, Memcached) sert les lectures répétées 10 à 100 fois plus vite et protège la base : avec 75 % de hits, la base ne voit que le quart du trafic de lecture.",
      },
      {
        title: "Cache-aside : le pattern par défaut",
        content:
          "L'application lit d'abord le cache ; sur miss, elle interroge la base puis remplit le cache avec un TTL. Le TTL borne l'obsolescence et sert de filet de sécurité. Les écritures se négocient : write-through (cache et base synchrones, écritures lentes) ou write-around (base seule, le cache se réchauffe aux lectures).",
      },
      {
        title: "Invalidation : le problème difficile",
        content:
          "Un cache accélère en servant des données qui peuvent devenir fausses. Invalider trop tard : données obsolètes ; trop tôt : bénéfice perdu. Les invalidations ciblées (par clé, par tag) sont précises mais complexes ; le TTL est simple mais approximatif. Un cache qui tombe révèle 100 % de misses d'un coup : c'est la cache stampede.",
      },
      {
        title: "Éviction et working set",
        content:
          "Quand la mémoire est pleine, il faut chasser : LRU évince la clé la moins récemment utilisée, LFU la moins fréquente. allkeys-lru convient à un cache généraliste ; volatile-lru n'évince que les clés avec TTL ; no-eviction rejette les écritures. Même logique côté CDN : 85 % de hit veut dire 15 % du trafic statique atteint l'origine.",
      },
    ],
    concepts: ["cache-aside", "TTL", "éviction LRU", "taux de hit", "cache stampede"],
    quiz: [
      {
        question: "Le pattern cache-aside consiste à…",
        choices: [
          "Écrire systématiquement dans le cache et la base en même temps",
          "Lire le cache puis, sur miss, lire la base et remplir le cache",
          "Ne jamais écrire dans le cache",
          "Synchroniser les caches de toutes les instances",
        ],
        answer: 1,
        explanation:
          "Cache-aside : l'application gère la lecture et le remplissage, le TTL encadre l'obsolescence des données.",
      },
      {
        question: "Un Redis de 8 Go reçoit un working set de 20 Go. Que se passe-t-il ?",
        choices: [
          "Redis refuse toutes les écritures",
          "Les clés les moins utilisées sont évincées (LRU) : le taux de hit baisse",
          "Redis écrit le surplus sur disque automatiquement",
          "Rien : Redis compresse les données",
        ],
        answer: 1,
        explanation:
          "Avec allkeys-lru, l'excédent est évincé et des clés utiles disparaissent : il faut plus de mémoire ou un working set plus petit.",
      },
      {
        question: "Qu'est-ce qu'une cache stampede ?",
        choices: [
          "Une invalidation massive par erreur humaine",
          "Un pic soudain de misses qui frappe la base de plein fouet",
          "Un pic de hit rate",
          "Une corruption du cache",
        ],
        answer: 1,
        explanation:
          "Expiration simultanée ou panne du cache : des milliers de requêtes descendent d'un coup vers la base. On l'atténue par du jitter sur les TTL ou un verrou de rechargement.",
      },
    ],
    exercise: {
      title: "Réduire la latence avec un cache Redis",
      goal:
        "À partir du modèle « API scalable », régler le cache Redis (taux de hit, mémoire) pour absorber les lectures et faire chuter la latence p95 sous la barre des 600 ms.",
      constraints: [
        "Ne pas supprimer le composant Redis",
        "PostgreSQL conservé en bout de chaîne",
        "Scénario par défaut : 3 500 req/s, 80 % de lectures",
      ],
      templateId: "api-scalable",
      successCriteria: [
        { metric: "cacheHitRate", op: ">=", value: 0.7 },
        { metric: "p95Ms", op: "<=", value: 600 },
      ],
    },
  },
  {
    slug: "load-balancing",
    title: "Load balancing : répartir pour régner",
    level: "débutant",
    durationMin: 20,
    summary:
      "Répartir le trafic entre plusieurs serveurs : L4 contre L7, algorithmes de répartition et health checks — la première brique de toute architecture scalable.",
    sections: [
      {
        title: "Pourquoi un répartiteur",
        content:
          "Un load balancer place le trafic entrant sur plusieurs serveurs : capacité additionnée (N serveurs ≈ N fois le débit), redondance (une machine morte est évacuée) et déploiements sans coupure. Sans lui, le seul scaling possible est vertical : une machine plus grosse, vite plafonnée et jamais redondante. C'est la première brique qui fait grandir.",
      },
      {
        title: "L4 ou L7 : où lire la requête",
        content:
          "Un L7 (application) inspecte HTTP : il route par chemin, par en-tête, termine TLS et coûte 1 à 5 ms. Un L4 (transport) distribue les paquets TCP sans les lire : plus rapide, moins malin. Le L4 ne peut pas router /api vers un pool et /images vers un autre ; le L7 le fait mais consomme davantage. En pratique : L7 devant les services.",
      },
      {
        title: "Algorithmes de répartition",
        content:
          "Round Robin tourne circulairement — simple, mais ignore la charge réelle. Least Connections envoie vers le serveur le moins occupé : robuste quand les requêtes ont des durées variées. IP Hash dirige un même client vers le même serveur (sessions collantes) : pratique pour l'état local, risqué si la population cliente est déséquilibrée.",
      },
      {
        title: "Health checks : la santé avant tout",
        content:
          "Le répartiteur sonde ses cibles (HTTP /health, TCP) et retire celles qui échouent : le trafic bascule en quelques secondes. Sans health check, la moitié des requêtes part vers un serveur mort. Le répartiteur lui-même doit être redondé (paire active/passive) — sinon il devient le point de défaillance unique qu'il devait supprimer.",
      },
    ],
    concepts: ["L4 vs L7", "round-robin", "least-connections", "health check", "point de défaillance unique"],
    quiz: [
      {
        question: "Quelle différence entre un load balancer L4 et L7 ?",
        choices: [
          "Le L4 est plus lent",
          "Le L4 route au niveau TCP sans lire HTTP ; le L7 inspecte les requêtes applicatives",
          "Le L7 ne gère pas TLS",
          "Aucune, c'est du marketing",
        ],
        answer: 1,
        explanation:
          "L4 = transport (flux bruts, très rapide) ; L7 = application (routes, en-têtes, terminaison TLS, un peu plus de latence).",
      },
      {
        question: "Quel algorithme convient quand les requêtes ont des durées très variées ?",
        choices: ["Round Robin", "Least Connections", "IP Hash", "Random pur"],
        answer: 1,
        explanation:
          "Least Connections tient compte des requêtes en cours : les serveurs occupés par des traitements longs reçoivent moins de nouveau travail.",
      },
      {
        question: "Un load balancer unique devant 20 serveurs est…",
        choices: [
          "Optimal : simple et rapide",
          "Un point de défaillance unique",
          "Redondant par construction",
          "Impossible en HTTP",
        ],
        answer: 1,
        explanation:
          "S'il tombe, tout tombe. On le double (paire actif/passif) : le risque existe toujours mais il est maîtrisé, pas concentré.",
      },
    ],
    exercise: {
      title: "Équilibrer un pool applicatif",
      goal:
        "À partir du modèle « Application trois tiers », régler le Load Balancer L7 et le pool d'API pour absorber 1 500 req/s en gardant une p95 maîtrisée.",
      constraints: [
        "Conserver le Load Balancer L7",
        "Pas plus de 50 instances applicatives au total",
        "PostgreSQL unique en bout de chaîne",
      ],
      templateId: "three-tier",
      successCriteria: [
        { metric: "servedRps", op: ">=", value: 1400 },
        { metric: "p95Ms", op: "<=", value: 500 },
      ],
    },
  },
  {
    slug: "latence-et-debit",
    title: "Latence et débit : mesurer honnêtement",
    level: "débutant",
    durationMin: 15,
    summary:
      "p95, saturation, files d'attente : les métriques qui décrivent honnêtement un système, et la loi de Little qui relie tout.",
    sections: [
      {
        title: "Deux métriques, deux questions",
        content:
          "La latence mesure le temps d'une requête (ms) ; le débit compte les requêtes par seconde. On les confond parce qu'elles se dégradent ensemble : quand un serveur sature, sa file grandit et chaque requête attend plus. Un système peut être rapide et peu endurant, ou endurant et lent — il faut piloter les deux indicateurs.",
      },
      {
        title: "Percentiles : la vérité est dans la queue",
        content:
          "La moyenne masque les malheureux : p95 signifie que 95 % des requêtes sont plus rapides. Sur 10 000 requêtes, le p99 concerne 100 utilisateurs réels. Les SLO sérieux s'écrivent en percentiles (p95 < 300 ms). Attention : les percentiles ne se moyennent pas — agrégés naïvement, ils mentent.",
      },
      {
        title: "Saturation et files d'attente",
        content:
          "L'utilisation ρ = débit entrant / capacité. Tant que ρ < 0,7, l'attente reste faible ; à 0,9 elle explose : chaque requête arrive derrière d'autres. La loi de Little relie le tout : longueur de file = débit × attente. On dimensionne à 70-80 % d'utilisation, jamais à 100 %.",
      },
      {
        title: "La latence de bout en bout",
        content:
          "Une requête traverse le réseau, le répartiteur, le serveur, la base : la latence totale est la somme des étages, plus l'attente qui s'y accumule. On optimise d'abord le terme dominant — un appel base à 120 ms écrase tout le reste. Mesurer avant d'optimiser, et mesurer côté client : c'est là que vit l'utilisateur.",
      },
    ],
    concepts: ["latence", "débit", "percentiles p95/p99", "loi de Little", "saturation"],
    quiz: [
      {
        question: "p95 = 250 ms signifie…",
        choices: [
          "La requête moyenne prend 250 ms",
          "95 % des requêtes sont servies en 250 ms ou moins",
          "5 % des requêtes échouent",
          "Le serveur traite 250 req/s",
        ],
        answer: 1,
        explanation:
          "Le percentile 95 borne la queue de distribution : au-delà se trouvent les 5 % de requêtes les plus lentes.",
      },
      {
        question: "Un serveur affiche une utilisation de 0,95. Que se passe-t-il ?",
        choices: [
          "Rien, il reste de la marge",
          "L'attente en file explose : la latence dérive",
          "Le débit double",
          "Les erreurs disparaissent",
        ],
        answer: 1,
        explanation:
          "Près de la saturation, chaque requête attend derrière les précédentes : la file croît et la latence s'envole.",
      },
      {
        question: "Selon la loi de Little, avec 2 000 req/s et 100 ms d'attente moyenne…",
        choices: [
          "La file moyenne vaut 200 requêtes",
          "La file moyenne vaut 20 requêtes",
          "Le débit vaut 20 req/s",
          "La latence vaut 2 s",
        ],
        answer: 0,
        explanation: "Longueur = débit × temps = 2 000 × 0,1 s = 200 requêtes en attente en moyenne.",
      },
    ],
    exercise: {
      title: "Cibler une p95 acceptable",
      goal:
        "À partir du modèle « API simple », jouer sur le temps de traitement et le nombre d'instances pour tenir une p95 basse sous 500 req/s.",
      constraints: [
        "Garder la chaîne utilisateur → API → PostgreSQL",
        "Ne pas modifier le scénario de trafic",
        "Coût mensuel raisonné : pas de 50 instances",
      ],
      templateId: "api-simple",
      successCriteria: [{ metric: "p95Ms", op: "<=", value: 600 }],
    },
  },

  /* ================================================================
   * INTERMÉDIAIRE (8)
   * ================================================================ */
  {
    slug: "scaling-horizontal",
    title: "Scaling horizontal",
    level: "intermédiaire",
    durationMin: 25,
    summary:
      "Sortir l'état des serveurs, ajouter des machines, déplacer le goulot : la mécanique complète du scaling horizontal et ses limites.",
    sections: [
      {
        title: "En largeur plutôt qu'en hauteur",
        content:
          "Le scaling vertical achète une machine plus puissante : simple au début, plafonné vite (les plus grosses instances coûtent de façon super-linéaire) et sans redondance. Le scaling horizontal ajoute des machines standard derrière un répartiteur : capacité quasi linéaire, redondance incluse, coût prévisible. Contrepartie : l'état doit sortir des serveurs.",
      },
      {
        title: "Le pré-requis : stateless",
        content:
          "Pour que n'importe quelle instance serve n'importe quelle requête, l'état se partage : sessions dans Redis, fichiers dans le stockage objet, travaux dans des files. Un serveur qui garde de l'état local (cache mémoire, session) force les sessions collantes et ruine l'élasticité. Auditer l'état local est l'étape un de toute montée en charge.",
      },
      {
        title: "Le goulot se déplace",
        content:
          "Instances ajoutées, le répartiteur distribue… et la base sature : ses connexions et son CPU plafonnent avant l'applicatif. Réponses progressives : pool de connexions, cache pour les lectures, réplicas de lecture, puis sharding pour les écritures. Chaque étape déplace le goulot — il faut le mesurer à chaque fois pour savoir où frapper.",
      },
      {
        title: "Automatiser : autoscaling",
        content:
          "Un groupe d'instances s'étend selon une métrique (CPU, latence, file) et se réduit à vide. Pièges classiques : le délai de démarrage (1 à 3 minutes) laisse passer les pics courts ; le rétrécissement doit être progressif (drain des connexions). L'autoscaling optimise le coût, pas l'architecture : il multiplie ce qui existe, bon ou mauvais.",
      },
    ],
    concepts: ["stateless", "scaling vertical vs horizontal", "goulot d'étranglement", "autoscaling", "drain"],
    quiz: [
      {
        question: "Qu'est-ce qui bloque le scaling horizontal d'un serveur qui garde ses sessions en mémoire ?",
        choices: [
          "Rien du tout",
          "Toute instance ne peut pas servir tout client : il faut déporter l'état",
          "Le protocole HTTP l'interdit",
          "Le load balancer refuse les requêtes",
        ],
        answer: 1,
        explanation:
          "L'état local lie un client à une machine : on déporte les sessions (Redis) pour rendre les instances interchangeables.",
      },
      {
        question: "Après ajout d'instances, la p95 continue de monter. Où chercher ?",
        choices: [
          "Dans le répartiteur uniquement",
          "Dans la dépendance partagée (base, cache) devenue goulot",
          "Dans le navigateur des utilisateurs",
          "Nulle part : c'est normal",
        ],
        answer: 1,
        explanation:
          "Le goulot se déplace vers les ressources partagées : mesurer connexions, CPU et files côté base et cache.",
      },
      {
        question: "L'autoscaling règle surtout…",
        choices: [
          "La latence réseau entre régions",
          "Le coût et l'élasticité de la couche applicative",
          "La cohérence des données",
          "Les bugs applicatifs",
        ],
        answer: 1,
        explanation:
          "Il ajuste le nombre d'instances selon la charge ; il ne corrige ni le design, ni une dépendance saturée.",
      },
    ],
    exercise: {
      title: "Passer le cap des 3 000 req/s",
      goal:
        "À partir du modèle « API scalable », lever le goulot applicatif (instances, concurrence, cache) pour servir au moins 3 000 req/s sans dégrader la p95.",
      constraints: [
        "Conserver CDN et Load Balancer L7",
        "PostgreSQL et Redis uniques",
        "Coût mensuel ≤ 4 000 $",
      ],
      templateId: "api-scalable",
      successCriteria: [
        { metric: "servedRps", op: ">=", value: 3000 },
        { metric: "p95Ms", op: "<=", value: 800 },
        { metric: "errorRate", op: "<=", value: 0.02 },
      ],
    },
  },
  {
    slug: "replication",
    title: "Réplication des données",
    level: "intermédiaire",
    durationMin: 25,
    summary:
      "Copier les données pour lire plus et tomber moins : synchrone ou asynchrone, le lag, le failover — et les garanties qu'on achète ou qu'on perd.",
    sections: [
      {
        title: "Copier les données",
        content:
          "La réplication maintient des copies des données sur plusieurs nœuds : lectures réparties, tolérance aux pannes, latence géographique réduite. Le primaire reçoit les écritures et diffuse les changements aux réplicas (streaming, log shipping). Les lectures partent alors sur les réplicas — mais chaque copie introduit la question du décalage.",
      },
      {
        title: "Synchrone, asynchrone, semi-synchrone",
        content:
          "Asynchrone : le primaire confirme sans attendre les réplicas — rapide, mais une panne peut perdre les dernières écritures. Synchrone : le commit attend un ack de réplique — zéro perte (RPO 0), écriture plus lente, et si la réplique ne répond plus, tout bloque. Semi-synchrone : au moins un ack avec délai de grâce — le compromis courant.",
      },
      {
        title: "Le lag et ses illusions",
        content:
          "Le décalage de réplication va de quelques millisecondes à plusieurs secondes selon la charge. Conséquence vécue : l'utilisateur enregistre, recharge, et ne voit rien (read-your-writes cassé). Solutions : router ses propres lectures vers le primaire, attendre la position de réplication, ou garantir des lectures monotones par client.",
      },
      {
        title: "Failover : survivre au primaire",
        content:
          "Quand le primaire tombe, un réplique est promue (automatiquement via orchestrateur ou manuellement). Coûts : quelques secondes à quelques minutes d'indisponibilité d'écriture (RTO), éventuellement les transactions non répliquées (RPO). Pièges : split-brain (deux primaires) — d'où quorum et fencing — et la tempête de reconnexion après bascule.",
      },
    ],
    concepts: ["réplication synchrone/asynchrone", "RPO/RTO", "lag de réplication", "failover", "split-brain"],
    quiz: [
      {
        question: "Avec la réplication asynchrone, une panne du primaire peut…",
        choices: [
          "Corrompre tous les réplicas",
          "Perdre les dernières écritures non encore répliquées",
          "Accélérer les lectures",
          "Bloquer définitivement les écritures",
        ],
        answer: 1,
        explanation:
          "Les commits confirmés avant diffusion peuvent manquer aux réplicas : le RPO (perte maximale) n'est pas nul.",
      },
      {
        question: "RPO = 0 signifie…",
        choices: [
          "Aucune donnée ne peut être perdue lors d'une panne",
          "La panne dure zéro seconde",
          "Les réplicas sont en lecture seule",
          "Le lag est nul en permanence",
        ],
        answer: 0,
        explanation:
          "Recovery Point Objective nul : l'état répliqué inclut chaque écriture confirmée — ce qui exige une réplication synchrone.",
      },
      {
        question:
          "Un utilisateur écrit puis lit immédiatement sur un réplique en retard et ne voit pas sa donnée. C'est…",
        choices: [
          "Un bug du répartiteur",
          "Le problème read-your-writes",
          "Une transaction perdue",
          "Un split-brain",
        ],
        answer: 1,
        explanation:
          "Sa lecture est plus ancienne que son écriture : on route ses lectures vers le primaire ou on attend la position de réplication.",
      },
    ],
    exercise: {
      title: "Répliquer pour absorber les lectures",
      goal:
        "À partir du modèle « Déploiement multi-région », dimensionner les réplicas et le routage des lectures pour tenir 1 000 req/s avec un lag maîtrisé.",
      constraints: [
        "Le primaire PostgreSQL reste la source des écritures",
        "Réplique en lecture seule obligatoire en région B",
        "Ne pas toucher au routage global du Load Balancer",
      ],
      templateId: "multi-region",
      successCriteria: [
        { metric: "servedRps", op: ">=", value: 900 },
        { metric: "p95Ms", op: "<=", value: 700 },
      ],
    },
  },
  {
    slug: "sharding",
    title: "Sharding : couper les données en morceaux",
    level: "intermédiaire",
    durationMin: 30,
    summary:
      "Quand les écritures ne tiennent plus sur une machine : répartir les données en shards, choisir la clé, payer le prix des requêtes distribuées.",
    sections: [
      {
        title: "Pourquoi sharder",
        content:
          "Au-delà des réplicas, les écritures plafonnent : une seule machine ne peut pas tout absorber. Le sharding répartit les données entre nœuds selon une clé (user_id, hash de commande). Chaque shard ne voit qu'une fraction du volume — écritures et stockage se partagent. C'est la réponse des très gros systèmes, et le plus gros saut de complexité.",
      },
      {
        title: "Choisir la clé de sharding",
        content:
          "La clé détermine tout. Par intervalle (range) : requêtes par plage efficaces, mais zones chaudes (les utilisateurs récents sur le même shard). Par hash : répartition uniforme, mais les parcours ordonnés deviennent impossibles. Mauvaise clé = shard saturé pendant que les autres dorment. On duplique parfois les données sous plusieurs clés pour diverses requêtes.",
      },
      {
        title: "Le consistent hashing",
        content:
          "Répartir « clé → shard = hash % N » casse tout à chaque ajout de nœud. Le consistent hashing place clés et nœuds sur un anneau : ajouter un nœud ne déplace qu'environ 1/N des clés. Les nœuds virtuels (chaque serveur occupe plusieurs positions) affinent encore la répartition. C'est la mécanique derrière Cassandra et les partitions Kafka.",
      },
      {
        title: "Le prix à payer",
        content:
          "Les jointures cross-shard disparaissent : on dénormalise ou on agrège en scatter-gather (interroger tous les shards, fusionner) — coûteux. Les transactions multi-shard deviennent des sagas. Le re-sharding (re-équilibrer des millions de clés en production) est lourd : Vitess ou Citus l'automatisent partiellement. On sharde tard, mais volontairement.",
      },
    ],
    concepts: ["clé de sharding", "consistent hashing", "shard chaud", "scatter-gather", "re-sharding"],
    quiz: [
      {
        question: "Pourquoi hasher la clé plutôt que sharder par intervalles ?",
        choices: [
          "Pour accélérer les requêtes par plage",
          "Pour répartir uniformément les écritures entre shards",
          "Pour économiser du stockage",
          "Pour supprimer les index",
        ],
        answer: 1,
        explanation:
          "Le hash disperse les clés : pas de zone chaude. En contrepartie, les parcours ordonnés exigent un scatter-gather.",
      },
      {
        question: "Le consistent hashing résout…",
        choices: [
          "Les lectures sales",
          "La redistribution massive de clés à chaque ajout de nœud",
          "Les transactions distribuées",
          "La latence réseau",
        ],
        answer: 1,
        explanation:
          "Sur l'anneau, un nouveau nœud ne prend qu'une fraction contiguë : environ 1/N des clés migrent, pas toutes.",
      },
      {
        question: "Une requête doit agréger des données réparties sur tous les shards. Ce pattern s'appelle…",
        choices: ["Write-through", "Scatter-gather", "Cache-aside", "Bulkhead"],
        answer: 1,
        explanation:
          "On interroge chaque shard en parallèle puis on fusionne : latence = maximum des shards, coût = N requêtes.",
      },
    ],
    exercise: {
      title: "Partionner un flux d'événements",
      goal:
        "À partir du modèle « Plateforme de notifications », régler partitions et consommateurs pour absorber 2 000 événements/s malgré le profil de pic.",
      constraints: [
        "Le flux Kafka reste la colonne vertébrale",
        "Groupe de consommateurs avec au moins 4 instances",
        "Profil de trafic « spike » conservé",
      ],
      templateId: "notifications-platform",
      successCriteria: [
        { metric: "servedRps", op: ">=", value: 1800 },
        { metric: "errorRate", op: "<=", value: 0.02 },
      ],
    },
  },
  {
    slug: "files-de-messages",
    title: "Files de messages",
    level: "intermédiaire",
    durationMin: 25,
    summary:
      "Files et journaux pour découpler producteurs et consommateurs : lag, livraison au moins une fois, backpressure — le tampon entre deux rythmes.",
    sections: [
      {
        title: "Le tampon entre deux rythmes",
        content:
          "Une file de messages découple producteurs et consommateurs : le producteur dépose et repart ; le consommateur traite à son rythme. Le pic de 10 000 e-mails de campagne devient une file digérée par des workers — l'utilisateur, lui, a reçu sa confirmation en 50 ms. Prix à payer : le travail n'est pas fini quand la réponse part (cohérence à terme).",
      },
      {
        title: "File (queue) ou journal (log) ?",
        content:
          "Les queues (RabbitMQ, SQS) remettent un message à un consommateur du groupe, avec ack et ré-attribution : compétition, message traité une fois. Les logs (Kafka, Kinesis) gardent les messages dans des partitions ordonnées, relus autant que voulu pendant la rétention (typiquement 7 jours) : rejeu et consommateurs indépendants. On choisit la sémantique avant le produit.",
      },
      {
        title: "Livraison : au moins une fois",
        content:
          "Le couple pannes + ré-attribution rend la livraison « exactly-once » fragile et coûteuse : on assume au moins une fois et on rend les consommateurs idempotents (clé de déduplication, upsert). L'ordre est garanti par partition, pas globalement : les événements d'une même entité vont sur la même partition via la clé de partitionnement.",
      },
      {
        title: "Profondeur, backpressure et DLQ",
        content:
          "Une file a une profondeur maximale : au-delà, le producteur est rejeté (backpressure) — mieux vaut ralentir en amont que tout perdre. Les messages en échec répété (poison) finissent en file de lettres mortes (DLQ) pour inspection. Surveiller le consumer lag — profondeur restante / vitesse de consommation — est l'alerte numéro un.",
      },
    ],
    concepts: [
      "producteur/consommateur",
      "consumer lag",
      "at-least-once",
      "backpressure",
      "DLQ",
      "idempotence",
    ],
    quiz: [
      {
        question: "Que mesure le consumer lag ?",
        choices: [
          "La latence réseau des consommateurs",
          "Le nombre de messages en attente derrière la vitesse de consommation",
          "Le taux d'erreur des producteurs",
          "La taille des messages",
        ],
        answer: 1,
        explanation:
          "Lag = profondeur restante / débit de consommation : il croît quand les workers ne suivent plus — l'alerte clé d'un système asynchrone.",
      },
      {
        question: "Pourquoi l'ordre global des messages n'est-il pas garanti sur Kafka ?",
        choices: [
          "Kafka perd des messages",
          "L'ordre est garanti par partition, pas entre partitions",
          "Les producteurs écrivent en parallèle sur disque",
          "Les consommateurs désordonnent à la lecture",
        ],
        answer: 1,
        explanation:
          "Chaque partition est un journal ordonné ; l'ordre inter-partitions n'existe pas. On partitionne par entité pour l'ordre utile.",
      },
      {
        question: "Un message échoue systématiquement en consommation. Que faire ?",
        choices: [
          "Le réessayer indéfiniment",
          "L'envoyer en dead-letter queue et continuer",
          "Supprimer la file",
          "Redémarrer le broker",
        ],
        answer: 1,
        explanation:
          "Un poison message bloquerait la partition : la DLQ l'isole pour analyse pendant que le flux continue.",
      },
    ],
    exercise: {
      title: "Absorber un pic via une file",
      goal:
        "À partir du modèle « Application de messagerie », dimensionner la file et les workers pour que le chemin synchrone reste rapide malgré le volume d'événements.",
      constraints: [
        "La file de messages reste entre l'API et le worker",
        "Service e-mail conservé en sortie",
        "Scénario 800 req/s inchangé",
      ],
      templateId: "messagerie-app",
      successCriteria: [
        { metric: "p95Ms", op: "<=", value: 400 },
        { metric: "errorRate", op: "<=", value: 0.03 },
      ],
    },
  },
  {
    slug: "asynchronisme",
    title: "Asynchronisme : répondre maintenant, traiter plus tard",
    level: "intermédiaire",
    durationMin: 20,
    summary:
      "Répondre 202 et traiter en tâche de fond : polling, webhooks, cohérence à terme — et ce qui doit absolument rester synchrone.",
    sections: [
      {
        title: "Sortir le travail du chemin critique",
        content:
          "Traiter dans la requête HTTP (générer un PDF, appeler trois services) tient l'utilisateur et le serveur otages de la tâche la plus lente. L'asynchrone acquitte la demande (202 Accepted + identifiant de tâche) et traite en tâche de fond. La latence perçue passe de 12 s à 200 ms ; l'utilisateur suit la progression ou reçoit un webhook.",
      },
      {
        title: "Les patterns de complétion",
        content:
          "202 Accepted + ressource de statut (polling raisonnable avec backoff) ; webhook : le serveur appelle l'URL du client quand c'est fini (penser signature et idempotence) ; SSE/WebSocket pour le suivi en direct. Chaque pattern déplace la complexité : le polling garde le client simple, le webhook crée un point de rendez-vous à sécuriser.",
      },
      {
        title: "Ce que l'asynchrone ne règle pas",
        content:
          "Une chaîne asynchrone est cohérente à terme : états « en cours » visibles, échecs différés, retries à concevoir. La validation immédiate (formulaire invalide, paiement refusé) et les lectures attendent une réponse — les rendre asynchrones est une erreur. Règle : asynchrone pour le travail, synchrone pour la décision.",
      },
      {
        title: "Timeouts, retries, traçabilité",
        content:
          "Chaque appel garde son timeout, ses retries (backoff exponentiel + jitter) et sa clé d'idempotence. Les traces distribuées (trace ID propagé dans les messages) relient requête initiale et travaux différés — sans elles, déboguer un flux asynchrone relève de la spéléologie. Les files de priorité servent l'urgent avant les gros exports.",
      },
    ],
    concepts: ["202 Accepted", "webhook", "cohérence à terme", "retry backoff", "trace distribuée"],
    quiz: [
      {
        question: "Que répond une API qui accepte un travail sans le traiter immédiatement ?",
        choices: [
          "200 avec le résultat",
          "202 Accepted, souvent avec un identifiant de tâche",
          "404 immédiatement",
          "301 vers la file",
        ],
        answer: 1,
        explanation:
          "202 signifie « demande acceptée, traitement à venir » : le client suit ensuite la ressource de statut ou le webhook.",
      },
      {
        question: "Quel cas DOIT rester synchrone ?",
        choices: [
          "Générer un rapport de nuit",
          "Envoyer un e-mail de bienvenue",
          "Valider un paiement avant de confirmer la commande",
          "Redimensionner des images",
        ],
        answer: 2,
        explanation:
          "La décision (refuser/accepter) doit être immédiate et cohérente ; le travail différé ne convient pas à la validation.",
      },
      {
        question: "Pourquoi ajouter du jitter aux retries exponentiels ?",
        choices: [
          "Pour accélérer les retries",
          "Pour éviter que tous les clients réessaient en même temps",
          "Pour économiser la bande passante",
          "C'est un artefact des anciens protocoles",
        ],
        answer: 1,
        explanation:
          "Sans jitter, les retries synchronisés saturent la dépendance à chaque cycle (thundering herd) ; le hasard désynchronise.",
      },
    ],
    exercise: {
      title: "Sortir le travail du chemin critique",
      goal:
        "À partir du modèle « Application de messagerie », faire du chemin synchrone un simple acquittement : l'API persiste, la file et les workers font le reste.",
      constraints: [
        "L'API ne doit plus attendre le worker pour répondre",
        "Les notifications doivent partir via la file",
        "Aucune perte de messages acceptée",
      ],
      templateId: "messagerie-app",
      successCriteria: [
        { metric: "p95Ms", op: "<=", value: 350 },
        { metric: "errorRate", op: "<=", value: 0.02 },
      ],
    },
  },
  {
    slug: "rate-limiting",
    title: "Rate limiting",
    level: "intermédiaire",
    durationMin: 20,
    summary:
      "429 plutôt que 503 : plafonner le débit par client avec token bucket ou fenêtre glissante, et calibrer les seuils sur la capacité réelle du système.",
    sections: [
      {
        title: "Une porte à taille contrôlée",
        content:
          "Le rate limiting plafonne le débit par client (req/s, requêtes/jour) : protège les ressources, contient les abus, garantit l'équité. Un refus propre (429 Too Many Requests + Retry-After) vaut mieux qu'un 503 aléatoire trois minutes plus tard : le client saura quand revenir, le service restera debout.",
      },
      {
        title: "Les quatre algorithmes",
        content:
          "Fenêtre fixe : compteur remis à zéro par tranche — simple, mais rafale doublée à la frontière des fenêtres. Fenêtre glissante : moyenne sur la fenêtre — lisse. Token bucket : jetons ajoutés au taux r, seau de capacité b — autorise les rafales contrôlées. Leaky bucket : file vidée à débit fixe — lisse parfaitement la sortie.",
      },
      {
        title: "Limiter où, compter quoi",
        content:
          "À la passerelle (compteur global par clé d'API, en Redis avec INCR + EXPIRE ou fenêtre triée), par utilisateur, par route — les seuils diffèrent (lecture généreuse, écriture comptée). En distribué, les compteurs doivent être partagés : chaque instance qui compte seule en mémoire laisse passer N fois la limite.",
      },
      {
        title: "Dimensionner les seuils",
        content:
          "Le seuil se calibre sur la capacité avec marge : limiter à 70-80 % du débit réellement tenu (charge de référence + p95 cible). Quotas par palier (gratuit/premium) côté business, limites de sécurité côté système (taille de requête, connexions). Attention aux pics alignés sur la remise à zéro des quotas.",
      },
    ],
    concepts: ["token bucket", "fenêtre glissante", "429", "quota", "compteurs distribués"],
    quiz: [
      {
        question: "Que renvoie une API qui refuse une requête à cause du débit ?",
        choices: ["403 Forbidden", "429 Too Many Requests", "503 Service Unavailable", "400 Bad Request"],
        answer: 1,
        explanation:
          "429 signale la limite atteinte ; l'en-tête Retry-After indique au client quand réessayer.",
      },
      {
        question: "Le token bucket se caractérise par…",
        choices: [
          "Un compteur remis à zéro chaque minute",
          "Un débit moyen r et une capacité de rafale b",
          "Une file d'attente sans limite",
          "Une limite par adresse IP uniquement",
        ],
        answer: 1,
        explanation:
          "Les jetons se reconstituent à r/s ; le seau de b jetons absorbe les rafales : moyenne maîtrisée + pointes tolérées.",
      },
      {
        question: "Chaque instance compte ses requêtes en mémoire locale. La limite globale est…",
        choices: ["Respectée", "Multipliée par le nombre d'instances", "Divisée par le nombre d'instances", "Aléatoire"],
        answer: 1,
        explanation:
          "N compteurs indépendants = N fois la limite : il faut un comptoir partagé (Redis) pour une limite globale.",
      },
    ],
    exercise: {
      title: "Protéger un frontal e-commerce",
      goal:
        "À partir du modèle « Marketplace », ajouter et régler un limiteur de débit pour absorber les abus sans dégrader le trafic légitime.",
      constraints: [
        "Le chemin CDN → Load Balancer doit rester intact",
        "Ajouter un composant de limitation de débit",
        "Le profil ramp doit rester lissé",
      ],
      templateId: "marketplace",
      successCriteria: [
        { metric: "errorRate", op: "<=", value: 0.05 },
        { metric: "p95Ms", op: "<=", value: 800 },
      ],
    },
  },
  {
    slug: "resilience",
    title: "Résilience : concevoir pour la défaillance",
    level: "intermédiaire",
    durationMin: 30,
    summary:
      "Timeouts, retries, circuit breakers, bulkheads : la boîte à garde-fous qui transforme une panne de dépendance en ralentissement tolérable.",
    sections: [
      {
        title: "Tout tombe, tout le temps",
        content:
          "Une dépendance réseau échoue ou ralentit ; un déploiement dégrade un service ; un GC met un nœud en pause 3 s. Concevoir résilient, c'est supposer la défaillance et borner son impact : redondance des composants, isolation des dépendances, dégradation contrôlée plutôt que tout-ou-rien. La question n'est pas « si » mais « quand, et que se passe-t-il alors ».",
      },
      {
        title: "Timeouts et retries : le socle",
        content:
          "Pas d'appel sans timeout : une dépendance lente est une dépendance morte qui occupe des ressources. Les retries ne s'appliquent qu'aux opérations idempotentes, avec backoff exponentiel + jitter, et un budget (ex. max 10 % du trafic en retry). Sinon, on relance du carburant sur l'incendie au lieu de l'éteindre.",
      },
      {
        title: "Le circuit breaker",
        content:
          "Trois états : fermé (tout passe, on compte les erreurs), ouvert (au-delà du seuil — ex. 50 % d'erreurs sur 20 appels — tout échoue immédiatement), demi-ouvert (après le cooldown, quelques sondes testent). Effet : la dépendance malade n'est plus appelée, les ressources se libèrent, la cascade s'arrête. Fail-fast contre slow-death.",
      },
      {
        title: "Bulkheads et fallbacks",
        content:
          "Bulkhead : cloisonner les pools de ressources par dépendance — la panne du service A n'épuise pas les threads du service B. Fallback : répondre dégradé plutôt que rien — données en cache, valeurs par défaut, message honnête. Un mode dégradé assumé (page produit sans recommandations) vaut mieux qu'une page d'erreur globale.",
      },
    ],
    concepts: ["timeout", "backoff + jitter", "circuit breaker", "bulkhead", "fallback"],
    quiz: [
      {
        question: "À quoi sert un circuit breaker ?",
        choices: [
          "À éteindre le service la nuit",
          "À cesser d'appeler une dépendance défaillante pour éviter la cascade",
          "À redémarrer automatiquement les serveurs",
          "À chiffrer les appels internes",
        ],
        answer: 1,
        explanation:
          "Il détecte le taux d'erreur, ouvre le circuit (échec immédiat), puis teste la reprise progressivement : fail fast.",
      },
      {
        question: "Quand peut-on rejouer une requête en erreur ?",
        choices: [
          "Toujours, c'est sans risque",
          "Seulement si l'opération est idempotente, avec backoff et budget",
          "Jamais",
          "Uniquement les POST",
        ],
        answer: 1,
        explanation:
          "Un retry sur une opération non idempotente duplique l'effet ; sans budget ni jitter, les retries aggravent la surcharge.",
      },
      {
        question: "Le pattern bulkhead consiste à…",
        choices: [
          "Répliquer les données",
          "Cloisonner les ressources par dépendance pour limiter le rayon d'impact",
          "Équilibrer la charge",
          "Mettre en cache les erreurs",
        ],
        answer: 1,
        explanation:
          "Comme les compartiments étanches d'un navire : la panne d'une dépendance noie un pool, pas tout le navire.",
      },
    ],
    exercise: {
      title: "Empêcher la cascade",
      goal:
        "À partir du modèle « Système de paiement », régler timeouts et circuit breaker pour que la défaillance de la notification externe ne compromette pas l'encaissement.",
      constraints: [
        "Le Circuit Breaker doit protéger le service de notification",
        "L'écriture transactionnelle reste synchrone",
        "Injecter une panne (outage) sur la dépendance externe pendant la simulation",
      ],
      templateId: "payment-system",
      successCriteria: [
        { metric: "errorRate", op: "<=", value: 0.05 },
        { metric: "p95Ms", op: "<=", value: 900 },
      ],
    },
  },
  {
    slug: "observabilite",
    title: "Observabilité : voir son système vivre",
    level: "intermédiaire",
    durationMin: 25,
    summary:
      "Logs, métriques, traces : les trois piliers, les listes RED et USE, des alertes qui veulent dire quelque chose — débugger en production sans y être aveugle.",
    sections: [
      {
        title: "Les trois piliers",
        content:
          "Les logs capturent des événements discrets (requête rejetée, erreur applicative) — structurés en JSON, ils se requêtent. Les métriques agrègent dans le temps (req/s, p95, erreurs) — bon marché, idéales pour alerter. Les traces suivent une requête à travers les services, span par span. On débugge aux métriques, on comprend aux traces, on prouve aux logs.",
      },
      {
        title: "RED et USE : les listes de courses",
        content:
          "Pour chaque service : RED — Rate (req/s), Errors (taux), Duration (p95/p99). Pour chaque ressource : USE — Utilization (CPU, disque), Saturation (files, pleine capacité), Errors. Ces listes évitent le « tout mesurer » : chaque tableau de bord commence par RED par service, puis USE sur les ressources chaudes. Un service sans RED est un angle mort.",
      },
      {
        title: "Alerter sur les symptômes",
        content:
          "Alerter sur la cause (CPU élevé) réveille la nuit pour rien ; alerter sur le symptôme (p95 > SLO pendant 5 min, taux d'erreur multiplié) reflète la douleur utilisateur. Les SLO formalisent le niveau visé (99,9 % des requêtes < 400 ms) ; l'error budget arbitre vélocité contre fiabilité. Trop d'alertes = plus personne ne regarde.",
      },
      {
        title: "Traces distribuées et échantillonnage",
        content:
          "Le trace ID se propage d'appel en appel (en-tête W3C traceparent) : la trace complète reconstitue le chemin. Sur fort trafic, on échantillonne — de tête (décision au premier saut, simple) ou de queue (garder les traces lentes et en erreur, plus utile). Un bon compromis : 1 à 10 % de base + 100 % des erreurs. La span la plus lente désigne souvent le coupable.",
      },
    ],
    concepts: ["logs structurés", "métriques RED", "traces distribuées", "SLO et error budget", "échantillonnage"],
    quiz: [
      {
        question: "Que signifie RED pour un service ?",
        choices: [
          "Redundancy, Encryption, Delivery",
          "Rate, Errors, Duration",
          "Replication, Event sourcing, Dedup",
          "Retry, Exponential, Delay",
        ],
        answer: 1,
        explanation: "RED = débit, erreurs, latence : les trois métriques minimales à surveiller pour chaque service.",
      },
      {
        question: "Le trace ID sert à…",
        choices: [
          "Identifier un utilisateur",
          "Relier les spans d'une même requête à travers les services",
          "Trier les logs par niveau",
          "Compter les erreurs",
        ],
        answer: 1,
        explanation:
          "Propagé d'appel en appel, il reconstitue le chemin complet d'une requête et localise la span responsable.",
      },
      {
        question: "Un SLO de 99,9 % de disponibilité laisse quel error budget mensuel (30 jours) ?",
        choices: ["≈ 43 minutes", "≈ 4 minutes", "≈ 7 heures", "≈ 30 secondes"],
        answer: 0,
        explanation:
          "0,1 % de 43 200 minutes ≈ 43 minutes d'indisponibilité « autorisée » : c'est ce budget qui arbitre vitesse contre fiabilité.",
      },
    ],
    exercise: {
      title: "Instrumenter pour trouver le goulot",
      goal:
        "À partir du modèle « API scalable », utiliser la chaîne d'observabilité pour identifier et corriger le goulot sous 3 500 req/s.",
      constraints: [
        "Garder les quatre composants d'observabilité",
        "Ne pas supprimer le Redis ni le PostgreSQL",
        "Le diagnostic doit nommer le nœud responsable",
      ],
      templateId: "api-scalable",
      successCriteria: [
        { metric: "p95Ms", op: "<=", value: 700 },
        { metric: "errorRate", op: "<=", value: 0.02 },
      ],
    },
  },

  /* ================================================================
   * AVANCÉ (8)
   * ================================================================ */
  {
    slug: "coherence-distribuee",
    title: "Cohérence distribuée",
    level: "avancé",
    durationMin: 35,
    summary:
      "Linéarisable, causale, à terme : le spectre des cohérences distribuées, leurs garanties concrètes et leur prix en latence et en disponibilité.",
    sections: [
      {
        title: "Fort ou faible : le spectre",
        content:
          "La cohérence linéarisable promet que toute lecture voit la dernière écriture, comme si les opérations s'exécutaient une à une : puissante, chère (coordination, quorum) et fragile sous partition. La cohérence à terme accepte des copies divergentes qui convergent ensuite : rapide et disponible, mais la lecture peut servir une valeur ancienne.",
      },
      {
        title: "Les garanties intermédiaires",
        content:
          "Read-your-writes : vos propres lectures voient vos écritures (routage ou attente). Lectures monotones : ne jamais reculer dans le temps en changeant de réplique. Cohérence causale : les effets suivent leurs causes (la réponse après la question), via horloges vectorielles. Ces garanties de session coûtent peu et couvrent la plupart des besoins réels.",
      },
      {
        title: "Écrire en concurrence : conflits",
        content:
          "Deux réplicas acceptent des écritures concurrentes sur la même clé : conflit. Résolutions : dernier-arrivé-gagne — simple mais perd des écritures silencieusement ; merge applicatif ; CRDT — structures qui convergent mathématiquement (compteurs, ensembles) ; ou sérialiser via un leader unique élu par consensus. Chaque option est un compromis expressivité/complexité.",
      },
      {
        title: "Le prix de chaque niveau",
        content:
          "La cohérence forte ajoute de la coordination : un ack de quorum (majorité de 2f+1) coûte un aller-retour, et la minorité isolée doit refuser de servir. La cohérence à terme se paie en lectures anciennes, conflits à résoudre et UX à dessiner (« mise à jour en cours »). On choisit par type de donnée : solde bancaire fort, compteur de vues à terme.",
      },
    ],
    concepts: ["linéarisabilité", "cohérence à terme", "read-your-writes", "cohérence causale", "CRDT", "quorum"],
    quiz: [
      {
        question: "La cohérence à terme signifie…",
        choices: [
          "Les données ne changent jamais",
          "Les réplicas divergent pendant les écritures puis convergent une fois au repos",
          "Les écritures échouent toujours",
          "Les lectures sont toujours vides",
        ],
        answer: 1,
        explanation:
          "Les copies divergent temporairement puis convergent : l'incohérence est bornée dans le temps, pas nulle.",
      },
      {
        question: "Un CRDT est…",
        choices: [
          "Une base relationnelle",
          "Une structure de données qui converge malgré les écritures concurrentes",
          "Un protocole de consensus",
          "Un cache distribué",
        ],
        answer: 1,
        explanation:
          "Composants répliqués sans conflit : leurs opérations se commutent, donc toutes les copies convergent sans coordination.",
      },
      {
        question: "Pourquoi la cohérence linéarisable coûte-t-elle de la latence ?",
        choices: [
          "Elle chiffre les données",
          "Chaque opération doit être coordonnée (quorum ou leader) avant l'ack",
          "Elle exige plus de bande passante pour les logs",
          "Elle interdit le cache",
        ],
        answer: 1,
        explanation:
          "Il faut un ordre total reconnu par tous : l'ack attend la majorité ou le leader — un aller-retour de coordination.",
      },
    ],
  },
  {
    slug: "consensus",
    title: "Consensus : se mettre d'accord",
    level: "avancé",
    durationMin: 35,
    summary:
      "Raft, quorums, élections de leader : comment des machines se mettent d'accord malgré les pannes — et ce que coûte chaque accord.",
    sections: [
      {
        title: "Le problème",
        content:
          "Le consensus fait décider des nœuds (éventuellement défaillants) sur une même valeur, dans le même ordre. Sans lui, des réplicas divergent et la vérité se fracture. Le théorème FLP rend le consensus impossible à garantir en asynchrone pur avec une seule panne — les protocoles réels s'en sortent par des timeouts : en théorie ça peut ne jamais finir.",
      },
      {
        title: "Raft : le consensus lisible",
        content:
          "Raft élit un leader (mandat, majorité de votes), réplique le journal : le client écrit au leader, le leader diffuse, compte les acks de majorité, committe. Avec 2f+1 nœuds, on tolère f pannes : 3 nœuds tolèrent 1 panne, 5 nœuds en tolèrent 2. Toute décision passe par la majorité — deux majorités se chevauchent toujours, d'où la sûreté.",
      },
      {
        title: "Le prix de l'accord",
        content:
          "Chaque écriture coûte un aller-retour vers la majorité : quelques ms en local, 50 à 100 ms inter-région. Le leader borne le débit d'écriture : on le déplace par plage de clés ou on regroupe les écritures. L'élection après panne prend 1 à 10 s : pendant ce temps, les écritures attendent. Le consensus achète la cohérence en latence et disponibilité.",
      },
      {
        title: "Usages concrets",
        content:
          "etcd et ZooKeeper stockent configuration et élections de leader (Kubernetes s'appuie sur etcd). Kafka garde ses métadonnées de partitions via un contrôleur Raft. Les clusters de bases (Patroni, CockroachDB) décident du primaire par consensus. S'y ajoutent les leases (bail temporaire) pour verrouiller, et le fencing pour neutraliser les anciens détenteurs.",
      },
    ],
    concepts: ["consensus", "quorum 2f+1", "élection de leader", "Raft", "FLP", "lease"],
    quiz: [
      {
        question: "Avec 5 nœuds Raft, combien de pannes sont tolérées ?",
        choices: ["1", "2", "3", "5"],
        answer: 1,
        explanation: "2f+1 = 5 tolère f = 2 pannes : il faut une majorité (3 nœuds) pour élire et committer.",
      },
      {
        question: "Que garantit le chevauchement des majorités ?",
        choices: [
          "La vitesse des écritures",
          "Deux décisions successives partagent un nœud : impossible de décider deux valeurs contradictoires",
          "Le chiffrement des journaux",
          "L'ordre alphabétique des nœuds",
        ],
        answer: 1,
        explanation:
          "Toute majorité intersecte toute autre : un nœud ne peut pas approuver deux valeurs contradictoires — c'est la sûreté du protocole.",
      },
      {
        question: "Un usage typique d'etcd/ZooKeeper est…",
        choices: [
          "Stocker les gros volumes de données utilisateur",
          "Coordonner configuration, découverte de services et élections de leader",
          "Remplacer un CDN",
          "Faire du cache applicatif",
        ],
        answer: 1,
        explanation:
          "Petits états critiques à forte cohérence : la coordination est leur raison d'être, pas le stockage de masse.",
      },
    ],
  },
  {
    slug: "cap-theorem",
    title: "Le théorème CAP, enfin clair",
    level: "avancé",
    durationMin: 30,
    summary:
      "Ce que CAP dit vraiment, ce que PACELC ajoute, et comment décider par cas d'usage plutôt que par dogme.",
    sections: [
      {
        title: "L'énoncé exact",
        content:
          "CAP (Gilbert et Lynch, 2002) : pendant une partition réseau, un système répliqué ne peut garantir à la fois la cohérence (linéarisable) et la disponibilité totale. Sans partition, les deux sont atteignables — le théorème parle du moment où le réseau se coupe. Un système « CA » est donc un vœu pieux : les partitions arrivent toujours, un jour.",
      },
      {
        title: "CP ou AP : la carte des systèmes",
        content:
          "CP refuse les opérations sans quorum : etcd, ZooKeeper, une base synchrone — la minorité isolée rejette (indisponible), la majorité décide cohérente. AP sert tout et converge ensuite : Cassandra en niveau relâché, DynamoDB — disponible mais parfois obsolète. La plupart des systèmes règlent le curseur par requête (niveau de cohérence par lecture).",
      },
      {
        title: "PACELC : la version utile",
        content:
          "Le vrai choix ne se pose pas que pendant les pannes. PACELC : si Partition → choisir A ou C ; sinon (Else) → choisir Latence ou Cohérence. La cohérence forte coûte des acks de quorum même quand tout va bien. C'est ce compromis quotidien qui guide l'ingénierie : chaque milliseconde économisée achète un peu de cohérence en moins.",
      },
      {
        title: "Décider par cas d'usage",
        content:
          "Le fil rouge : le coût de l'erreur. Encaissement : incohérence = double charge ou perte → cohérence. Compteur de vues, flux social : quelques unités perdues sont invisibles → disponibilité. Panier : read-your-writes suffit. On découpe le même produit en sous-systèmes aux exigences distinctes, et on documente chaque choix — c'est le contrat de l'équipe.",
      },
    ],
    concepts: ["CAP", "partition réseau", "CP/AP", "PACELC", "niveau de cohérence"],
    quiz: [
      {
        question: "Que dit précisément le théorème CAP ?",
        choices: [
          "Cohérence et disponibilité sont incompatibles en permanence",
          "Pendant une partition, on ne peut garantir à la fois cohérence et disponibilité",
          "Trois nœuds suffisent toujours",
          "La latence est ignorée",
        ],
        answer: 1,
        explanation:
          "Le dilemme se pose sous partition ; sans partition, cohérence et disponibilité peuvent coexister.",
      },
      {
        question: "Un système CP isolé en minorité…",
        choices: [
          "Continue à servir les lectures",
          "Rejette les opérations plutôt que de risquer l'incohérence",
          "Bascule en lecture seule cohérente",
          "Accélère",
        ],
        answer: 1,
        explanation:
          "CP privilégie la cohérence : sans quorum, mieux vaut refuser que de servir une valeur divergente.",
      },
      {
        question: "PACELC ajoute à CAP l'idée que…",
        choices: [
          "Les partitions n'existent plus",
          "Même sans partition, la cohérence se paie en latence",
          "La disponibilité est gratuite",
          "Le SQL est obsolète",
        ],
        answer: 1,
        explanation:
          "Else : Latency vs Consistency — l'ack de quorum coûte un aller-retour permanent, pas seulement pendant les pannes.",
      },
    ],
  },
  {
    slug: "cqrs",
    title: "CQRS : séparer lecture et écriture",
    level: "avancé",
    durationMin: 30,
    summary:
      "Séparer le modèle d'écriture du modèle de lecture : projections dénormalisées, scalabilité indépendante, cohérence à terme assumée.",
    sections: [
      {
        title: "Deux modèles pour deux besoins",
        content:
          "Les écritures veulent l'intégrité (transactions, invariants) ; les lectures veulent la vitesse (dénormalisé, indexé, proche de l'affichage). CQRS sépare : un modèle de commande (write side) et un ou plusieurs modèles de requête (read side) alimentés par projections. Le ratio typique 10:1 lectures/écritures justifie d'évoluer chaque côté selon sa charge.",
      },
      {
        title: "Les projections : lecture optimisée",
        content:
          "Une projection transforme le flux d'événements en vue prête à lire : index de recherche, table dénormalisée pour le fil d'actualité, hash Redis pour les compteurs. La vue est reconstruisable : on la vide, on rejoue le flux. Le décalage entre écriture et projection se mesure en millisecondes à secondes — borné et surveillé.",
      },
      {
        title: "Ce qu'on y gagne",
        content:
          "Indépendance des échelles : 12 réplicas de lecture pour 2 nœuds d'écriture, sans complexifier le write side. Des lectures simples : pas de jointure au moment de lire, la projection a tout précalculé. Des modèles lisibles : le modèle de commande reste pur (règles métier), l'interface reçoit des formes adaptées. Et le repli : reconstruire une vue en rejouant.",
      },
      {
        title: "Ce qu'on y perd",
        content:
          "La cohérence à terme entre les deux côtés : écriture acceptée, lecture pas encore à jour — l'UX doit le dire (« en cours »). Deux pipelines à opérer, des projections à maintenir, des coûts doublés. CQRS n'est pas une architecture par défaut : sous quelques centaines de req/s, une base bien indexée fait le même travail pour moins de complexité.",
      },
    ],
    concepts: ["commande/requête", "projection", "dénormalisation", "scalabilité indépendante", "cohérence à terme"],
    quiz: [
      {
        question: "En CQRS, une projection sert à…",
        choices: [
          "Écrire dans la base primaire",
          "Construire une vue de lecture optimisée depuis le flux d'événements",
          "Chiffrer les données",
          "Répliquer les écritures",
        ],
        answer: 1,
        explanation:
          "La projection plie le flux en forme lisible (index, table dénormalisée) — reconstruisable en rejouant l'historique.",
      },
      {
        question: "Le décalage typique entre écriture et lecture CQRS est…",
        choices: [
          "Nul : synchronisation immédiate",
          "Borné : millisecondes à secondes selon le pipeline",
          "De plusieurs heures",
          "Impossible à mesurer",
        ],
        answer: 1,
        explanation:
          "La projection suit le flux avec un retard surveillé ; l'UX gère l'état intermédiaire (« en cours »).",
      },
      {
        question: "Quand CQRS n'est-il PAS recommandé ?",
        choices: [
          "Charge de lecture très supérieure à l'écriture",
          "Modèles de lecture radicalement différents de l'écriture",
          "Petite charge : un modèle unique suffit",
          "Besoin de reconstruire des vues",
        ],
        answer: 2,
        explanation:
          "Sous quelques centaines de req/s, la complexité de deux pipelines dépasse le bénéfice — un modèle CRUD bien indexé suffit.",
      },
    ],
    exercise: {
      title: "Scinder lecture et écriture",
      goal:
        "À partir du modèle « Architecture événementielle », faire grossir le chemin de lecture sans toucher au chemin de commande, jusqu'à 1 200 req/s.",
      constraints: [
        "Les commandes passent toujours par Kafka + worker de projection",
        "L'API de lecture interroge l'index projeté",
        "readRatio fixé à 0,9",
      ],
      templateId: "event-driven",
      successCriteria: [
        { metric: "servedRps", op: ">=", value: 1000 },
        { metric: "p95Ms", op: "<=", value: 600 },
      ],
    },
  },
  {
    slug: "event-sourcing",
    title: "Event sourcing : l'état comme historique",
    level: "avancé",
    durationMin: 40,
    summary:
      "Stocker des faits immuables plutôt que des états écrasés : audit gratuit, rejeu, snapshots — et les vraies difficultés de mise en œuvre.",
    sections: [
      {
        title: "L'état n'existe pas : il se calcule",
        content:
          "Au lieu d'écraser la dernière valeur (UPDATE), l'event sourcing empile des faits immuables : CommandePassée, CommandePayée, CommandeExpédiée. L'état courant = rejeu (fold) des événements d'une entité. La base devient un journal append-only, jamais modifié. L'audit n'est plus une fonctionnalité : c'est la structure même du stockage.",
      },
      {
        title: "Ce que ça débloque",
        content:
          "Requêtes temporelles : « l'état du panier hier à 14 h » = rejeu jusqu'à cet instant. Nouvelles vues rétroactives : un besoin analytique surgit, on rejoue le flux depuis le premier jour. Debugging : reproduire n'importe quel état passé. Couplage naturel avec CQRS : le journal écrit, les projections lisent. Les événements survivent aux schémas.",
      },
      {
        title: "Les difficultés réelles",
        content:
          "Faire évoluer les schémas d'événements (upcasting, versionnage) : un événement écrit il y a trois ans doit rester lisible. Le rejeu devient coûteux : snapshots tous les 100 à 1 000 événements. RGPD : effacer un utilisateur dans un journal immuable impose le crypto-shredding (chiffrer par clé utilisateur, détruire la clé).",
      },
      {
        title: "L'infrastructure du journal",
        content:
          "Kafka (rétention étendue, compaction par clé), EventStoreDB (conçu pour), ou table d'événements en base relationnelle. La consommation : groupes, positions, rejeux. L'écriture : append concurrentiel optimiste (numéro de séquence attendu). Le exactly-once est approché par idempotence — les doublons d'émission sont une donnée d'entrée, pas une exception.",
      },
    ],
    concepts: ["événement immuable", "rejeu", "snapshot", "projection", "upcasting", "crypto-shredding"],
    quiz: [
      {
        question: "En event sourcing, l'état courant d'un agrégat s'obtient par…",
        choices: [
          "Lecture de la dernière ligne mise à jour",
          "Rejeu (fold) de la séquence de ses événements",
          "Un calcul statistique",
          "Un snapshot obligatoire à chaque écriture",
        ],
        answer: 1,
        explanation:
          "Le journal ne stocke que des faits ; l'état est une fonction pure de la séquence — rejouable à tout instant.",
      },
      {
        question: "À quoi sert un snapshot ?",
        choices: [
          "À sauvegarder la base",
          "À raccourcir le rejeu en partant d'un état intermédiaire",
          "À supprimer les vieux événements",
          "À chiffrer le journal",
        ],
        answer: 1,
        explanation:
          "Rejouer 10 000 événements à chaque lecture coûte ; un snapshot tous les 100 à 1 000 événements borne le travail.",
      },
      {
        question: "Comment effacer un utilisateur d'un journal immuable (RGPD) ?",
        choices: [
          "UPDATE des événements concernés",
          "Crypto-shredding : détruire la clé qui chiffre ses données",
          "Restaurer une sauvegarde antérieure",
          "C'est impossible",
        ],
        answer: 1,
        explanation:
          "Les événements restent mais deviennent indéchiffrables : détruire la clé utilisateur efface effectivement les données.",
      },
    ],
  },
  {
    slug: "saga",
    title: "Le pattern saga",
    level: "avancé",
    durationMin: 35,
    summary:
      "Des transactions locales enchaînées avec compensations : la saga remplace 2PC pour les flux distribués, en chorégraphie ou en orchestration.",
    sections: [
      {
        title: "Le problème des transactions lointaines",
        content:
          "Une commande touche panier, paiement, stock, livraison, notification : cinq services, cinq bases. Une transaction 2PC distribuée verrouille tout le monde jusqu'au bout — et si le coordinateur meurt entre les deux phases, les verrous restent. La saga remplace la grande transaction par une séquence de transactions locales, chacune atomique chez soi.",
      },
      {
        title: "Chorégraphie ou orchestration",
        content:
          "Chorégraphie : chaque service réagit aux événements et publie le suivant — découplage maximal, mais le flux se lit dans quinze consommateurs différents. Orchestration : un chef d'orchestre (machine à états) commande chaque étape — le flux est visible en un endroit, mais le coordinateur devient un hub à fiabiliser. Orchestration au-delà de cinq étapes.",
      },
      {
        title: "Compenser : annuler proprement",
        content:
          "Chaque étape s'accompagne d'une compensation : paiement → remboursement, réservation → annulation. Une saga échouée rejoue les compensations en ordre inverse. Les compensations peuvent échouer aussi : retries, puis file des cas manuels. Les étapes doivent être idempotentes — les doublons d'événements sont garantis, pas exceptionnels.",
      },
      {
        title: "Isolement et expérience utilisateur",
        content:
          "Pendant la saga, le monde voit des états intermédiaires : « paiement validé, stock en cours ». Ces états sont des fonctionnalités : verrou sémantique (« en attente de confirmation »), étapes affichées, communication de progression. Sans isolement, deux sagas concurrentes peuvent vendre le même article — d'où les réservations aux points chauds.",
      },
    ],
    concepts: [
      "transaction distribuée",
      "2PC",
      "compensation",
      "orchestration et chorégraphie",
      "idempotence",
      "verrou sémantique",
    ],
    quiz: [
      {
        question: "Pourquoi éviter 2PC entre services ?",
        choices: [
          "Il est trop rapide",
          "Il bloque les participants et reste bloqué si le coordinateur meurt",
          "Il ne gère pas les COMMIT",
          "Il exige du NoSQL",
        ],
        answer: 1,
        explanation:
          "Entre prepare et commit, la panne du coordinateur laisse les verrous en place : la saga remplace le blocage par des compensations.",
      },
      {
        question: "Une compensation de saga sert à…",
        choices: [
          "Accélérer l'étape suivante",
          "Annuler l'effet d'une étape déjà validée quand la saga échoue plus loin",
          "Répliquer les données",
          "Journaliser les erreurs",
        ],
        answer: 1,
        explanation:
          "Remboursement, annulation, libération : chaque étape porte son undo — rejoués en sens inverse lors de l'échec.",
      },
      {
        question: "Dans une saga en chorégraphie, le flux métier est…",
        choices: [
          "Écrit dans un orchestrateur unique",
          "Disséminé dans les consommateurs d'événements de chaque service",
          "Invisible des logs",
          "Toujours cohérent en 100 ms",
        ],
        answer: 1,
        explanation:
          "Chaque service réagit et publie : comprendre le flux exige de lire tous les abonnés — d'où l'orchestration pour les flux longs.",
      },
    ],
    exercise: {
      title: "Orchestrer une commande distribuée",
      goal:
        "À partir du modèle « Marketplace », fiabiliser le flux de commande (API → file → worker → e-mail) pour qu'un échec partiel ne perde ni commande ni notification.",
      constraints: [
        "La persistance et le paiement restent dans le chemin synchrone",
        "La file de commandes doit se vider (consumer lag borné)",
        "Idempotence des envois d'e-mail : pas de doublons",
      ],
      templateId: "marketplace",
      successCriteria: [
        { metric: "errorRate", op: "<=", value: 0.05 },
        { metric: "servedRps", op: ">=", value: 2200 },
      ],
    },
  },
  {
    slug: "multi-region",
    title: "Déploiement multi-région",
    level: "avancé",
    durationMin: 40,
    summary:
      "Deux régions, du routage global, de la réplication inter-région : latence géographique, résilience et conflits — le sommet de la complexité opérationnelle.",
    sections: [
      {
        title: "Pourquoi quitter sa région",
        content:
          "Trois moteurs : la latence (un aller-retour transatlantique coûte 80 à 120 ms — la moitié du budget d'une page), la survie (une région entière tombe, cela s'est vu), et la loi (résidence des données : les Européens servent les Européens). Le multi-région commence par deux zones de disponibilité par région, puis deux régions — chaque saut double la complexité.",
      },
      {
        title: "Actif-passif ou actif-actif",
        content:
          "Actif-passif : une région sert, l'autre attend — bascule pilotée, RTO en minutes, RPO selon la réplication. Actif-actif : les deux servent — bascule instantanée, mais deux zones d'écriture concurrente : conflits à résoudre, cohérence à négocier. Intermédiaire courant : actif-actif en lecture, écriture unique (région mère par utilisateur).",
      },
      {
        title: "Routage global",
        content:
          "Anycast : une même IP annoncée depuis partout, BGP route au plus proche — parfait pour CDN et DNS. GeoDNS et routage par latence envoient la résolution vers le point le plus rapide. La session collante géographique garde un utilisateur sur sa région. La bascule d'urgence doit être répétée pour être crue : un runbook non testé est un runbook fictif.",
      },
      {
        title: "Les données entre régions",
        content:
          "Réplication inter-région asynchrone : 50 à 150 ms de propagation, lag borné en régime stable. Chaque utilisateur écrit dans sa région mère et lit localement — les lectures globales agrègent à terme. Les conflits d'écriture multi-maître demandent CRDT, horloges ou résolution métier. Le CDN absorbe le statique partout ; le dynamique se paie en cohérence.",
      },
    ],
    concepts: ["région et zone de disponibilité", "anycast", "actif-actif", "résidence des données", "réplication inter-région"],
    quiz: [
      {
        question: "Un aller-retour transatlantique coûte environ…",
        choices: ["8 ms", "80 à 120 ms", "800 ms", "8 s"],
        answer: 1,
        explanation:
          "La lumière dans la fibre prend 40 à 60 ms l'aller : la géographie est incompressible, d'où le multi-région.",
      },
      {
        question: "Le principal risque de l'actif-actif multi-maître est…",
        choices: [
          "La latence de lecture",
          "Les écritures concurrentes sur les mêmes données entre régions",
          "Le coût du DNS",
          "L'absence de CDN",
        ],
        answer: 1,
        explanation:
          "Deux maîtres acceptent des écritures concurrentes : conflits à résoudre (CRDT, résolution métier) — le vrai prix.",
      },
      {
        question: "L'anycast route le trafic…",
        choices: [
          "Vers la région la moins chère",
          "Vers le point de présence le plus proche au sens du routage BGP",
          "Aléatoirement",
          "Uniquement vers la région primaire",
        ],
        answer: 1,
        explanation:
          "Une même IP annoncée partout : le routage BGP envoie au point de présence topologiquement le plus proche.",
      },
    ],
    exercise: {
      title: "Servir deux régions",
      goal:
        "À partir du modèle « Déploiement multi-région », répartir lectures et écritures entre les régions pour tenir 1 000 req/s avec un basculement maîtrisé.",
      constraints: [
        "Chaque région garde ses serveurs API",
        "La réplication primaire → réplique reste en place",
        "Injecter une panne sur la région A pour tester la résilience",
      ],
      templateId: "multi-region",
      successCriteria: [
        { metric: "servedRps", op: ">=", value: 900 },
        { metric: "errorRate", op: "<=", value: 0.05 },
      ],
    },
  },
  {
    slug: "gestion-des-pannes",
    title: "Gestion des pannes",
    level: "avancé",
    durationMin: 45,
    summary:
      "Pannes en cascade, détection, dégradation contrôlée, reprise sans tempête : la discipline complète du system design en production.",
    sections: [
      {
        title: "Anatomie d'une cascade",
        content:
          "Le scénario type : une dépendance ralentit → les requêtes s'empilent côté appelant → le pool s'épuise → le service cesse de répondre → ses propres appelants s'empilent → l'incident devient global. La panne est rarement la cause première : c'est l'absence de garde-fous qui transforme un ralentissement local en outage.",
      },
      {
        title: "Détecter vite, alerter juste",
        content:
          "Les health checks et sondes synthétiques détectent l'indisponibilité ; les symptômes utilisateur (p95, taux d'erreur, saturation) détectent la dégradation avant l'indisponibilité. Les périodes de grâce évitent le clignotement des alertes. Une bonne détection nomme le service, le rayon d'impact et la métrique fautive — sinon l'équipe cherche pendant l'incident.",
      },
      {
        title: "Dégrader plutôt que tomber",
        content:
          "Feature flags pour couper les fonctions non essentielles ; lecture seule quand l'écriture est malade ; réponses en cache périmé plutôt que rien ; file d'attente côté client. Le failover automatique (réplique promue, instance relancée) applique la même discipline aux ressources. Un mode dégradé non documenté ni testé n'existe pas.",
      },
      {
        title: "Reprendre sans casser à nouveau",
        content:
          "Après la panne, le redémarrage massif crée sa propre tempête : cache froid (stampede), connexions simultanées, file qui se vide d'un coup. On réchauffe le cache (préchargement, single-flight), on ouvre les vagues progressivement, on borne les workers. Puis le post-mortem sans blâme : chronologie, cause racine, actions datées. L'error budget dépensé arbitre le rythme suivant.",
      },
    ],
    concepts: [
      "cascade de défaillances",
      "MTTR",
      "dégradation graduelle",
      "thundering herd",
      "post-mortem sans blâme",
      "error budget",
    ],
    quiz: [
      {
        question: "Le mécanisme typique d'une panne en cascade est…",
        choices: [
          "Un disque plein unique",
          "Un ralentissement qui épuise les pools de ressources des appelants en cascade",
          "Une attaque DDoS",
          "Une erreur de configuration DNS",
        ],
        answer: 1,
        explanation:
          "Timeouts absents + pools bornés : chaque étage s'asphyxie à son tour — d'où timeouts et circuit breakers partout.",
      },
      {
        question: "Le thundering herd au redémarrage vient de…",
        choices: [
          "Trop de logs",
          "Le cache froid : des milliers de requêtes frappent l'origine simultanément",
          "Le DNS qui expire",
          "Les sondes de santé",
        ],
        answer: 1,
        explanation:
          "Plus de cache = tout le monde descend sur la base : single-flight, préchauffage et vagues progressives l'atténuent.",
      },
      {
        question: "Un bon post-mortem contient…",
        choices: [
          "Le nom du coupable",
          "Chronologie, cause racine et actions datées — sans blâme individuel",
          "La liste des clients affectés uniquement",
          "La promesse « ne se reproduira plus »",
        ],
        answer: 1,
        explanation:
          "Sans blâme et actionnable : ce qui s'est passé, pourquoi, ce qui change — sinon l'incident revient avec intérêts.",
      },
    ],
    exercise: {
      title: "Surmonter une panne injectée",
      goal:
        "À partir du modèle « API scalable », injecter une panne sur un maillon du chemin critique, puis rendre l'architecture assez robuste pour maintenir le service malgré tout.",
      constraints: [
        "Injecter une panne d'au moins 30 s sur un nœud critique",
        "Ajouter les garde-fous nécessaires (redondance, cache, limites)",
        "Le service doit rester majoritairement disponible",
      ],
      templateId: "api-scalable",
      successCriteria: [
        { metric: "errorRate", op: "<=", value: 0.05 },
        { metric: "servedRps", op: ">=", value: 2500 },
      ],
    },
  },
];

/* ------------------------------------------------------------------
 * Helpers de consultation (utilisés par la vue apprentissage)
 * ------------------------------------------------------------------ */

export const COURSE_MAP: Record<string, Course> = Object.fromEntries(COURSES.map((c) => [c.slug, c]));

export function getCourseBySlug(slug: string): Course | undefined {
  return COURSE_MAP[slug];
}

export function getCoursesByLevel(level: CourseLevel): Course[] {
  return COURSES.filter((c) => c.level === level);
}

/** Exercices pratiques disponibles (cours avec exercise défini). */
export const COURSES_WITH_EXERCISE: Course[] = COURSES.filter((c) => c.exercise !== undefined);

/** Garde-fou de cohérence : chaque exercice référence un template existant. */
export const EXERCISE_TEMPLATE_IDS: string[] = COURSES_WITH_EXERCISE.map(
  (c) => c.exercise!.templateId,
).filter((id) => TEMPLATE_MAP[id] !== undefined);
