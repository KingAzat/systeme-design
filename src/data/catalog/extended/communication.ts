import type { CatalogComponent } from "@/types";
import { f, visualFields } from "../field";

/** Catégorie communication — styles d'interaction entre clients et services. */

const restApi = visualFields([
  f.sel("style", "Style", [
    { value: "resources", label: "Orienté ressources" },
    { value: "actions", label: "Orienté actions (RPC-like)" },
  ], "resources", "general", {
    help: "Style informatif : ressources REST classiques ou verbes métier.",
  }),
]);

const graphql = visualFields([
  f.num("maxDepth", "Profondeur max de requête", 5, "general", {
    min: 1, max: 20, step: 1,
    help: "Limite de profondeur informative contre les requêtes explosives.",
  }),
  f.bool("introspection", "Introspection publique", true, "advanced", {
    help: "Actif en développement ; souvent fermé en production.",
  }),
]);

const grpc = visualFields([
  f.sel("mode", "Mode d'échange", [
    { value: "unary", label: "Unaire (requête/réponse)" },
    { value: "server-stream", label: "Flux serveur" },
    { value: "bidirectional", label: "Bidirectionnel" },
  ], "unary", "general"),
  f.num("keepaliveMs", "Keep-alive (ms)", 30000, "advanced", {
    min: 1000, max: 300000, step: 1000,
    help: "Cadence informative des pings de connexion.",
  }),
]);

const websocket = visualFields([
  f.num("maxClients", "Connexions simultanées", 50000, "capacity", {
    min: 100, max: 1000000, step: 100,
    help: "Les connexions ouvertes occupent la mémoire du serveur.",
  }),
  f.num("heartbeatSec", "Battement de cœur (s)", 30, "advanced", {
    min: 1, max: 300, step: 1,
    help: "Détection des connexions mortes (informatif).",
  }),
]);

const webhook = visualFields([
  f.num("retries", "Tentatives de remise", 3, "general", {
    min: 0, max: 20, step: 1,
    help: "Nombre informatif de reprises en cas d'échec.",
  }),
  f.num("timeoutMs", "Timeout du destinataire (ms)", 5000, "advanced", {
    min: 100, max: 60000, step: 100,
  }),
]);

const sse = visualFields([
  f.num("maxConnections", "Connexions simultanées", 10000, "capacity", {
    min: 100, max: 1000000, step: 100,
  }),
  f.num("reconnectSec", "Reconnexion auto (s)", 5, "advanced", {
    min: 1, max: 120, step: 1,
    help: "Le navigateur se reconnecte seul (informatif).",
  }),
]);

export const COMMUNICATION_COMPONENTS: CatalogComponent[] = [
  {
    id: "rest-api",
    name: "API REST",
    category: "communication",
    icon: "Globe",
    description:
      "Interface HTTP orientée ressources : verbes, URLs et codes de statut standardisés.",
    ports: { inputs: 1, outputs: 1 },
    fields: restApi.fields,
    defaults: restApi.defaults,
    maturity: "visual",
    subtitleFields: ["style"],
    learning: {
      role: "Contrat d'interface HTTP le plus répandu entre clients et services.",
      howItWorks:
        "Les ressources sont adressées par URL et manipulées par verbes (GET, POST, PUT, DELETE) ; le statut HTTP porte le résultat (200, 404, 429). REST profite de tout l'écosystème HTTP : caches, codes, méthodes idempotentes. Il privilégie la simplicité et la débogabilité sur la compacité.",
      pros: [
        "Universel : tout client HTTP parle REST sans SDK",
        "Sémantique HTTP réutilisée (cache, idempotence des verbes)",
      ],
      cons: [
        "Sérialisation verbeuse (JSON complet à chaque appel)",
        "Over/under-fetching : trop ou pas assez de données par appel",
      ],
      useCases: ["API publiques", "Applications web et mobile", "Intégrations simples"],
      pitfalls: [
        "Verbes non idempotents : un retry de POST crée la commande deux fois.",
        "Codes de statut détournés (200 avec erreur dans le corps) : les retries automatiques deviennent impossibles.",
      ],
      concepts: ["Ressource", "Idempotence", "Codes HTTP", "Cache"],
    },
  },
  {
    id: "graphql",
    name: "GraphQL",
    category: "communication",
    icon: "Braces",
    description:
      "Langage de requête de données : le client demande exactement les champs voulus.",
    ports: { inputs: 1, outputs: 1 },
    fields: graphql.fields,
    defaults: graphql.defaults,
    maturity: "visual",
    subtitleFields: ["maxDepth"],
    learning: {
      role: "API à la carte : une seule entrée, des réponses sur mesure par client.",
      howItWorks:
        "Le client décrit les champs souhaités dans une requête typée ; le serveur résout chaque champ (resolvers), y compris les imbriqués — potentiellement des dizaines d'accès base pour une seule requête. Les limites (profondeur, complexité) protègent le serveur des requêtes déraisonnables.",
      pros: [
        "Un seul appel pour un écran complet (fin de l'over-fetching)",
        "Schéma typé auto-documenté, typage vérifié",
      ],
      cons: [
        "Coût serveur imprévisible : les resolvers imbriqués se multiplient",
        "Cache HTTP classique inopérant (POST unique) : il faut du cache applicatif",
      ],
      useCases: ["Applications riches multi-écrans", "API fédérées", "Mobile à bande limitée"],
      pitfalls: [
        "Requêtes profondes non limitées : le serveur explose (DoS involontaire).",
        "N+1 resolvers sans dataloader : une requête déclenche des centaines d'accès base.",
      ],
      concepts: ["Resolver", "Schema", "Dataloader", "N+1"],
    },
  },
  {
    id: "grpc",
    name: "gRPC",
    category: "communication",
    icon: "Cable",
    description:
      "RPC binaire sur HTTP/2 : contrat protobuf, multiplexage et streaming natifs.",
    ports: { inputs: 1, outputs: 1 },
    fields: grpc.fields,
    defaults: grpc.defaults,
    maturity: "visual",
    subtitleFields: ["mode"],
    learning: {
      role: "Communication interne entre services : rapide et fortement typée.",
      howItWorks:
        "Les messages sont sérialisés en protobuf (binaire compact) sur une connexion HTTP/2 multiplexée. Le contrat (.proto) génère les clients et serveurs dans tous les langages. Les modes de flux (serveur, client, bidirectionnel) couvrent les cas que REST traite mal.",
      pros: [
        "Sérialisation binaire : moins de bande passante et de CPU",
        "Contrat strict et génération de code multi-langages",
        "Streaming natif dans les deux sens",
      ],
      cons: [
        "Illisible à la main (binaire) : debug plus exigeant",
        "Peu adapté aux navigateurs sans passerelle (grpc-web)",
      ],
      useCases: ["Microservices internes", "Échanges à fort débit", "Streaming de données"],
      pitfalls: [
        "Deadline (timeout) jamais propagée : les appels en cascade traînent sans fin.",
        "Compatibilité des champs protobuf ignorée : un renommage casse tous les clients.",
      ],
      concepts: ["Protobuf", "HTTP/2", "Streaming", "Deadline"],
    },
  },
  {
    id: "websocket",
    name: "WebSocket",
    category: "communication",
    icon: "Radio",
    description:
      "Connexion bidirectionnelle persistante : le serveur pousse vers le client en temps réel.",
    ports: { inputs: 1, outputs: 1 },
    fields: websocket.fields,
    defaults: websocket.defaults,
    maturity: "visual",
    subtitleFields: ["maxClients"],
    learning: {
      role: "Canal permanent entre client et serveur : la porte du temps réel.",
      howItWorks:
        "Après une poignée de main HTTP, la connexion reste ouverte et les messages circulent dans les deux sens avec très peu d'en-tête. Chaque connexion occupe mémoire et descripteur de fichier côté serveur : les battements de cœur détectent les connexions mortes (proxys, réseaux mobiles).",
      pros: [
        "Latence de diffusion minimale (pas de re-polling)",
        "Bidirectionnel : le client répond sans nouvelle connexion",
      ],
      cons: [
        "Chaque connexion coûte cher côté serveur (état, mémoire)",
        "Infrastructures intermédiaires (proxy, load balancer) à régler finement",
      ],
      useCases: ["Chat", "Tableaux en direct", "Jeux multijoueurs", "Notifications instantanées"],
      pitfalls: [
        "Sticky sessions oubliées derrière le load balancer : la connexion tombe à chaque bascule.",
        "Pas de reconnexion auto native : à coder côté client.",
      ],
      concepts: ["Handshake", "Frame", "Sticky session", "Heartbeat"],
    },
  },
  {
    id: "webhook",
    name: "Webhook",
    category: "communication",
    icon: "Webhook",
    description:
      "Appel HTTP sortant déclenché par un événement : le fournisseur pousse vers votre URL.",
    ports: { inputs: 1, outputs: 1 },
    fields: webhook.fields,
    defaults: webhook.defaults,
    maturity: "visual",
    subtitleFields: ["retries"],
    learning: {
      role: "Mode de notification inversé : c'est le service distant qui appelle votre système.",
      howItWorks:
        "Lors d'un événement (paiement reçu, dépôt pushé), le fournisseur envoie une requête HTTP POST vers l'URL enregistrée, avec tentatives de remise en cas d'échec. La sécurité exige la vérification de signature ; l'idempotence est indispensable car la même notification peut arriver deux fois.",
      pros: [
        "Temps quasi réel sans polling côté consommateur",
        "Zéro infrastructure d'attente : une simple route HTTP",
      ],
      cons: [
        "Le destinataire doit être public et disponible en permanence",
        "Livraison au moins une fois : doublons à tolérer",
      ],
      useCases: ["Paiements (Stripe)", "CI/CD (push)", "Intégrations SaaS"],
      pitfalls: [
        "Signature non vérifiée : n'importe qui peut simuler l'événement.",
        "Réponse lente du traitement : le fournisseur considère l'événement échoué et re-remet — accuser réception vite, traiter en asynchrone.",
      ],
      concepts: ["Signature HMAC", "At-least-once", "Idempotence", "Retry"],
    },
  },
  {
    id: "server-sent-events",
    name: "Server-Sent Events",
    category: "communication",
    icon: "Signal",
    description:
      "Flux unidirectionnel serveur → client sur HTTP : simple comme une réponse qui dure.",
    ports: { inputs: 1, outputs: 1 },
    fields: sse.fields,
    defaults: sse.defaults,
    maturity: "visual",
    subtitleFields: ["maxConnections"],
    learning: {
      role: "Diffusion en continu du serveur vers le navigateur, en HTTP pur.",
      howItWorks:
        "La réponse HTTP reste ouverte (Content-Type: text/event-stream) et le serveur pousse des événements au format texte. Le navigateur se reconnecte automatiquement (Last-Event-ID) — plus simple que WebSocket quand le flux est unidirectionnel. Chaque connexion consomme une place serveur comme pour le WebSocket.",
      pros: [
        "HTTP pur : proxys et CORS classiques, pas de nouveau protocole",
        "Reconnexion automatique native côté navigateur",
      ],
      cons: [
        "Unidirectionnel : le client doit passer par une autre route pour agir",
        "Connexions longues : attention aux timeouts des infrastructures",
      ],
      useCases: ["Fils d'actualité", "Progression de traitement", "Cotes en direct"],
      pitfalls: [
        "Buffers des proxys (nginx) non désactivés : les événements arrivent par paquets.",
        "Pas de reconnexion native côté clients non-navigateur : à gérer soi-même.",
      ],
      concepts: ["Event-stream", "Last-Event-ID", "Unidirectionnel"],
    },
  },
];
