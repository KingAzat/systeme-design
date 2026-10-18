import { COMPONENT_MAP } from "@/data/catalog";
import type {
  ArchEdge,
  ArchNode,
  ArchZone,
  ArchitectureData,
  ArchitectureTemplate,
  Protocol,
  ScenarioConfig,
  ZoneColor,
} from "@/types";

/**
 * SystemLab — Modèles d'architecture préconfigurés.
 * Chaque modèle est un graphe valide (componentId existants, connexions
 * autorisées par validateConnection) prêt à simuler.
 */

type ConfigValue = number | string | boolean;

export const DEFAULT_SCENARIO: ScenarioConfig = {
  activeUsers: 5000,
  requestsPerSecond: 3500,
  durationSec: 120,
  readRatio: 0.8,
  networkLatencyMs: 20,
  baseErrorRate: 0.001,
  requestSizeKb: 8,
  profile: "constant",
  mode: "load",
  seed: 42,
  budgetPerMonthUsd: 2000,
  failure: null,
};

function scenario(overrides: Partial<ScenarioConfig>): ScenarioConfig {
  return { ...DEFAULT_SCENARIO, ...overrides };
}

function node(
  id: string,
  componentId: string,
  label: string,
  x: number,
  y: number,
  config: Record<string, ConfigValue> = {},
  zoneId?: string,
): ArchNode {
  const base = COMPONENT_MAP[componentId]?.defaults ?? {};
  return {
    id,
    componentId,
    label,
    config: { ...base, ...config },
    position: { x, y },
    zoneId,
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  protocol: Protocol = "http",
  networkLatencyMs = 2,
  bandwidthMbps = 100,
  label?: string,
): ArchEdge {
  return { id, source, target, protocol, networkLatencyMs, bandwidthMbps, label };
}

function zone(
  id: string,
  label: string,
  color: ZoneColor,
  x: number,
  y: number,
  width: number,
  height: number,
): ArchZone {
  return { id, label, color, position: { x, y }, size: { width, height } };
}

function data(
  name: string,
  description: string,
  nodes: ArchNode[],
  edges: ArchEdge[],
  zones: ArchZone[],
  scenarioConfig: ScenarioConfig,
): ArchitectureData {
  return { name, description, nodes, edges, zones, scenario: scenarioConfig };
}

export const TEMPLATES: ArchitectureTemplate[] = [
  /* ------------------------------------------------------------------
   * 1. API scalable — reproduit la maquette officielle
   * ------------------------------------------------------------------ */
  {
    id: "api-scalable",
    name: "API scalable",
    description:
      "Architecture de référence : CDN + Load Balancer L7 devant trois serveurs API, cache Redis et PostgreSQL. Le niveau API tourne à ~85 % d'utilisation sous 3 500 req/s — un goulot pédagogique idéal.",
    difficulty: "intermédiaire",
    tags: ["api", "cache", "load balancing", "référence"],
    data: data(
      "API scalable",
      "Modèle de référence SystemLab : edge, répartition, pool applicatif, cache et persistance.",
      [
        node("n1", "user", "Utilisateur", 80, 90, {}, "z1"),
        node("n2", "cdn", "CDN", 420, 90, { cacheHitRatio: 0.35 }, "z1"),
        node("n3", "load-balancer-l7", "Load Balancer L7", 760, 90, {}, "z1"),
        node("n4", "api-server", "API Server 1", 680, 350, { instances: 1, avgServiceMs: 45 }, "z2"),
        node("n5", "api-server", "API Server 2", 680, 450, { instances: 1, avgServiceMs: 45 }, "z2"),
        node("n6", "api-server", "API Server 3", 680, 550, { instances: 1, avgServiceMs: 45 }, "z2"),
        node("n7", "redis", "Redis", 920, 450, { hitRatio: 0.75 }, "z2"),
        node("n8", "postgresql", "PostgreSQL", 920, 930, {}, "z4"),
        node("n9", "logs", "Logs", 70, 920, {}, "z3"),
        node("n10", "metriques", "Métriques", 210, 920, {}, "z3"),
        node("n11", "traces-distribuees", "Traces distribuées", 340, 920, {}, "z3"),
        node("n12", "alertes", "Alertes", 470, 920, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "https", 5, 200),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n3", "n5", "http", 2, 200),
        edge("e5", "n3", "n6", "http", 2, 200),
        edge("e6", "n4", "n7", "redis", 2, 100),
        edge("e7", "n5", "n7", "redis", 2, 100),
        edge("e8", "n6", "n7", "redis", 2, 100),
        edge("e9", "n7", "n8", "sql", 4, 100, "miss"),
      ],
      [
        zone("z1", "Clients", "indigo", 40, 40, 1100, 200),
        zone("z2", "Backend", "cyan", 620, 300, 520, 500),
        zone("z3", "Observabilité", "violet", 40, 860, 520, 220),
        zone("z4", "Données", "emerald", 620, 860, 520, 220),
      ],
      DEFAULT_SCENARIO,
    ),
  },

  /* ------------------------------------------------------------------
   * 2. API simple
   * ------------------------------------------------------------------ */
  {
    id: "api-simple",
    name: "API simple",
    description:
      "Le trio minimal : un utilisateur, un serveur applicatif, une base PostgreSQL. Point de départ pour comprendre la latence de bout en bout et la capacité d'un serveur.",
    difficulty: "débutant",
    tags: ["api", "sql", "minimal"],
    data: data(
      "API simple",
      "Chaîne applicative minimale : requête, traitement, persistance.",
      [
        node("n1", "user", "Utilisateur", 100, 200),
        node("n2", "api-server", "API Server", 400, 200, { instances: 2 }),
        node("n3", "postgresql", "PostgreSQL", 700, 200),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "sql", 4, 100),
      ],
      [],
      scenario({ activeUsers: 800, requestsPerSecond: 500 }),
    ),
  },

  /* ------------------------------------------------------------------
   * 3. Trois tiers
   * ------------------------------------------------------------------ */
  {
    id: "three-tier",
    name: "Application trois tiers",
    description:
      "Architecture web classique : Load Balancer L7 répartissant la charge sur deux serveurs API partagant une base. Première étape du scaling horizontal.",
    difficulty: "débutant",
    tags: ["api", "load balancing", "sql"],
    data: data(
      "Application trois tiers",
      "Répartiteur, pool applicatif redondé et base partagée.",
      [
        node("n1", "user", "Utilisateur", 80, 200),
        node("n2", "load-balancer-l7", "Load Balancer L7", 360, 200),
        node("n3", "api-server", "API Server 1", 640, 120, { instances: 2 }, "z1"),
        node("n4", "api-server", "API Server 2", 640, 320, { instances: 2 }, "z1"),
        node("n5", "postgresql", "PostgreSQL", 920, 220),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "http", 2, 200),
        edge("e3", "n2", "n4", "http", 2, 200),
        edge("e4", "n3", "n5", "sql", 4, 100),
        edge("e5", "n4", "n5", "sql", 4, 100),
      ],
      [zone("z1", "Serveurs applicatifs", "emerald", 600, 80, 340, 360)],
      scenario({ activeUsers: 2500, requestsPerSecond: 1500 }),
    ),
  },

  /* ------------------------------------------------------------------
   * 4. Application de messagerie
   * ------------------------------------------------------------------ */
  {
    id: "messagerie-app",
    name: "Application de messagerie",
    description:
      "Parcours mixte synchrone/asynchrone : l'API persiste le message et l'empile dans une file ; un worker consomme à son rythme et déclenche l'e-mail de notification.",
    difficulty: "intermédiaire",
    tags: ["asynchrone", "file", "worker"],
    data: data(
      "Application de messagerie",
      "Écriture synchrone, notifications asynchrones via file et worker.",
      [
        node("n1", "user", "Utilisateur", 80, 240),
        node("n2", "api-server", "API messages", 360, 240, { instances: 2, avgServiceMs: 40 }),
        node("n3", "message-queue", "File de messages", 640, 120, {}, "z1"),
        node("n4", "worker", "Worker d'envoi", 920, 120, { instances: 2 }, "z1"),
        node("n5", "service-email", "Service e-mail", 1200, 120, {}, "z1"),
        node("n6", "postgresql", "PostgreSQL", 640, 400),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "amqp", 3, 100, "événements"),
        edge("e3", "n3", "n4", "amqp", 3, 100),
        edge("e4", "n4", "n5", "https", 10, 50, "notification"),
        edge("e5", "n2", "n6", "sql", 4, 100),
      ],
      [zone("z1", "Chemin asynchrone", "amber", 600, 80, 850, 144)],
      scenario({ activeUsers: 1200, requestsPerSecond: 800 }),
    ),
  },

  /* ------------------------------------------------------------------
   * 5. Marketplace
   * ------------------------------------------------------------------ */
  {
    id: "marketplace",
    name: "Marketplace",
    description:
      "Boutique complète : CDN et Load Balancer L7, deux API derrière Redis/PostgreSQL, et une branche asynchrone (file + worker + e-mails) pour les commandes.",
    difficulty: "intermédiaire",
    tags: ["e-commerce", "cache", "asynchrone", "cdn"],
    data: data(
      "Marketplace",
      "Frontal complet, données cacheables et traitement différé des commandes.",
      [
        node("n1", "user", "Utilisateur", 80, 300, {}, "z1"),
        node("n2", "cdn", "CDN", 360, 300, { cacheHitRatio: 0.85 }, "z1"),
        node("n3", "load-balancer-l7", "Load Balancer L7", 640, 300, {}, "z2"),
        node("n4", "api-server", "API 1", 920, 180, { instances: 3, avgServiceMs: 45 }, "z2"),
        node("n5", "api-server", "API 2", 920, 420, { instances: 3, avgServiceMs: 45 }, "z2"),
        node("n6", "redis", "Redis", 1200, 80, { hitRatio: 0.75 }, "z3"),
        node("n7", "postgresql", "PostgreSQL", 1200, 240, {}, "z3"),
        node("n8", "message-queue", "File de commandes", 1200, 400, {}, "z4"),
        node("n9", "worker", "Worker commandes", 1480, 400, { instances: 3 }, "z4"),
        node("n10", "service-email", "Service e-mail", 1480, 560, {}, "z4"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "https", 5, 200),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n3", "n5", "http", 2, 200),
        edge("e5", "n4", "n6", "redis", 2, 100),
        edge("e6", "n5", "n6", "redis", 2, 100),
        edge("e7", "n4", "n7", "sql", 4, 100),
        edge("e8", "n5", "n7", "sql", 4, 100),
        edge("e9", "n4", "n8", "amqp", 3, 100, "commandes"),
        edge("e10", "n5", "n8", "amqp", 3, 100, "commandes"),
        edge("e11", "n8", "n9", "amqp", 3, 100),
        edge("e12", "n9", "n10", "https", 10, 50),
      ],
      [
        zone("z1", "Frontal", "indigo", 40, 260, 570, 144),
        zone("z2", "Backend", "cyan", 600, 140, 570, 400),
        zone("z3", "Données", "emerald", 1160, 40, 290, 310),
        zone("z4", "Asynchrone", "amber", 1160, 360, 570, 304),
      ],
      scenario({ activeUsers: 4000, requestsPerSecond: 2500, profile: "ramp" }),
    ),
  },

  /* ------------------------------------------------------------------
   * 6. Système de paiement
   * ------------------------------------------------------------------ */
  {
    id: "payment-system",
    name: "Système de paiement",
    description:
      "Paiement critique : passerelle API, service d'encaissement, PostgreSQL en réplication synchrone, réconciliation asynchrone et circuit breaker vers la notification externe.",
    difficulty: "avancé",
    tags: ["paiement", "résilience", "circuit breaker", "asynchrone"],
    data: data(
      "Système de paiement",
      "Encaissement synchrone sécurisé, réconciliation différée et protection anti-cascade.",
      [
        node("n1", "user", "Utilisateur", 80, 300),
        node("n2", "api-gateway", "API Gateway", 360, 300, {}, "z1"),
        node("n3", "service-paiement", "Service paiement", 640, 300, {}, "z1"),
        node("n4", "postgresql", "PostgreSQL", 920, 160, { replicationPolicy: "sync" }, "z4"),
        node("n5", "message-queue", "File de réconciliation", 920, 440, {}, "z2"),
        node("n6", "worker", "Worker de réconciliation", 1200, 440, { instances: 2 }, "z2"),
        node("n7", "circuit-breaker", "Circuit Breaker", 920, 620, {}, "z3"),
        node("n8", "service-notification", "Service notification", 1200, 620, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "grpc", 3, 100),
        edge("e3", "n3", "n4", "sql", 4, 100, "transaction"),
        edge("e4", "n3", "n5", "amqp", 3, 100, "écritures"),
        edge("e5", "n5", "n6", "amqp", 3, 100),
        edge("e6", "n3", "n7", "http", 5, 50),
        edge("e7", "n7", "n8", "https", 10, 50, "externe"),
      ],
      [
        zone("z1", "Cœur paiement", "rose", 340, 260, 570, 144),
        zone("z2", "Réconciliation", "cyan", 880, 400, 570, 144),
        zone("z3", "Dépendance externe", "amber", 880, 580, 570, 144),
        zone("z4", "Persistance", "emerald", 880, 120, 290, 144),
      ],
      scenario({ activeUsers: 900, requestsPerSecond: 600 }),
    ),
  },

  /* ------------------------------------------------------------------
   * 7. Plateforme de notifications
   * ------------------------------------------------------------------ */
  {
    id: "notifications-platform",
    name: "Plateforme de notifications",
    description:
      "Ingestion à 2 000 événements/s : l'API persiste puis publie dans Kafka ; un groupe de consommateurs dispatche vers e-mail et SMS. Le pic de campagne est le scénario type.",
    difficulty: "intermédiaire",
    tags: ["kafka", "asynchrone", "événements"],
    data: data(
      "Plateforme de notifications",
      "Ingestion événementielle sur Kafka et diffusion multi-canal.",
      [
        node("n1", "user", "Utilisateur", 80, 240),
        node("n2", "api-server", "API d'ingestion", 360, 240, { instances: 3, avgServiceMs: 30 }, "z1"),
        node("n3", "postgresql", "PostgreSQL", 360, 480, {}, "z1"),
        node("n4", "kafka", "Kafka", 640, 240, { partitions: 6 }, "z2"),
        node("n5", "consumer-group", "Groupe de consommateurs", 920, 240, { instances: 6 }, "z2"),
        node("n6", "service-email", "Service e-mail", 1200, 120, {}, "z2"),
        node("n7", "service-sms", "Service SMS", 1200, 360, {}, "z2"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "sql", 4, 100),
        edge("e3", "n2", "n4", "kafka", 3, 200, "événements"),
        edge("e4", "n4", "n5", "kafka", 3, 200),
        edge("e5", "n5", "n6", "https", 10, 50),
        edge("e6", "n5", "n7", "https", 10, 50),
      ],
      [
        zone("z1", "Ingestion", "cyan", 320, 200, 290, 390),
        zone("z2", "Diffusion", "amber", 600, 80, 850, 390),
      ],
      scenario({ activeUsers: 3000, requestsPerSecond: 2000, profile: "spike" }),
    ),
  },

  /* ------------------------------------------------------------------
   * 8. Plateforme vidéo
   * ------------------------------------------------------------------ */
  {
    id: "video-platform",
    name: "Plateforme vidéo",
    description:
      "Vidéo à la demande : CDN à 90 % de hit pour les segments, API de métadonnées, PostgreSQL et stockage objet pour les masters. 3 000 req/s de navigation.",
    difficulty: "intermédiaire",
    tags: ["vidéo", "cdn", "stockage objet"],
    data: data(
      "Plateforme vidéo",
      "Edge vidéo, API de métadonnées et stockage objet.",
      [
        node("n1", "user", "Utilisateur", 80, 240, {}, "z1"),
        node("n2", "cdn", "CDN", 360, 240, { cacheHitRatio: 0.9 }, "z1"),
        node("n3", "load-balancer-l7", "Load Balancer L7", 640, 240, {}),
        node("n4", "api-server", "API métadonnées", 920, 240, { instances: 4, avgServiceMs: 35 }),
        node("n5", "postgresql", "PostgreSQL", 1200, 120, {}, "z2"),
        node("n6", "stockage-objet", "Stockage vidéo", 1200, 360, {}, "z2"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 100),
        edge("e2", "n2", "n3", "https", 5, 200),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n4", "n5", "sql", 4, 100),
        edge("e5", "n4", "n6", "https", 8, 200, "segments"),
      ],
      [
        zone("z1", "Distribution", "indigo", 40, 200, 570, 144),
        zone("z2", "Stockage média", "emerald", 1160, 80, 290, 384),
      ],
      scenario({ activeUsers: 5000, requestsPerSecond: 3000, requestSizeKb: 16 }),
    ),
  },

  /* ------------------------------------------------------------------
   * 9. Pilotage événementiel (CQRS)
   * ------------------------------------------------------------------ */
  {
    id: "event-driven",
    name: "Architecture événementielle",
    description:
      "CQRS en action : les commandes passent par Kafka et un worker de projection alimente l'index de lecture ; les requêtes de lecture interrogent directement cet index.",
    difficulty: "avancé",
    tags: ["cqrs", "kafka", "event driven", "recherche"],
    data: data(
      "Architecture événementielle",
      "Chemin d'écriture par événements, chemin de lecture sur index projeté.",
      [
        node("n1", "user", "Utilisateur", 80, 300),
        node("n2", "api-server", "API commandes", 360, 160, { instances: 2, avgServiceMs: 30 }, "z1"),
        node("n3", "kafka", "Kafka", 640, 160, { partitions: 6 }, "z1"),
        node("n4", "worker", "Worker de projection", 920, 160, { instances: 3, avgProcessingMs: 80 }, "z1"),
        node("n5", "elasticsearch", "Index de lecture", 1200, 280, {}, "z3"),
        node("n6", "api-server", "API lectures", 360, 480, { instances: 3, avgServiceMs: 25 }, "z2"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "kafka", 3, 200, "commandes"),
        edge("e3", "n3", "n4", "kafka", 3, 200),
        edge("e4", "n4", "n5", "http", 5, 100, "projection"),
        edge("e5", "n1", "n6", "https", 20, 50),
        edge("e6", "n6", "n5", "http", 5, 100, "recherche"),
      ],
      [
        zone("z1", "Chemin d'écriture", "cyan", 320, 120, 850, 144),
        zone("z2", "Chemin de lecture", "indigo", 320, 440, 290, 144),
        zone("z3", "Index de recherche", "violet", 1160, 240, 290, 144),
      ],
      scenario({ activeUsers: 2000, requestsPerSecond: 1200, readRatio: 0.9 }),
    ),
  },

  /* ------------------------------------------------------------------
   * 10. Multi-région
   * ------------------------------------------------------------------ */
  {
    id: "multi-region",
    name: "Déploiement multi-région",
    description:
      "Routage global vers deux régions : primaire PostgreSQL en région A, réplique de lecture en région B. Les zones de disponibilité encadrent chaque région.",
    difficulty: "avancé",
    tags: ["multi-région", "réplication", "haute disponibilité"],
    data: data(
      "Déploiement multi-région",
      "Routage global, primaire en région A et réplique en région B.",
      [
        node("n1", "user", "Utilisateur", 80, 400, {}, "z1"),
        node("n2", "load-balancer-l7", "LB global", 360, 400, {}, "z1"),
        node("n3", "zone-disponibilite", "Zone A", 580, 160, {}, "z2"),
        node("n4", "api-server", "API région A", 580, 280, { instances: 2 }, "z2"),
        node("n5", "postgresql", "Primaire", 880, 280, {}, "z2"),
        node("n6", "zone-disponibilite", "Zone B", 580, 520, {}, "z3"),
        node("n7", "api-server", "API région B", 580, 640, { instances: 2 }, "z3"),
        node("n8", "read-replica", "Réplique lecture", 880, 640, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n4", "http", 15, 200, "région A"),
        edge("e3", "n2", "n7", "http", 15, 200, "région B"),
        edge("e4", "n4", "n5", "sql", 4, 100),
        edge("e5", "n5", "n8", "sql", 40, 50, "réplication"),
        edge("e6", "n7", "n8", "sql", 4, 100, "lectures"),
      ],
      [
        zone("z1", "Routage global", "indigo", 40, 360, 570, 144),
        zone("z2", "Région A", "emerald", 540, 120, 590, 270),
        zone("z3", "Région B", "cyan", 540, 480, 590, 270),
      ],
      scenario({ activeUsers: 1500, requestsPerSecond: 1000 }),
    ),
  },

  /* ------------------------------------------------------------------
   * 11. Pipeline RAG
   * ------------------------------------------------------------------ */
  {
    id: "rag-ai",
    name: "Pipeline RAG",
    description:
      "Assistant augmenté : l'API orchestrateur interroge le LLM (900 ms par génération), la base vectorielle, le modèle d'embedding et un cache de prompts Redis. Faible débit, forte latence.",
    difficulty: "intermédiaire",
    tags: ["ia", "rag", "llm", "vecteurs"],
    data: data(
      "Pipeline RAG",
      "Orchestration LLM, embeddings, recherche vectorielle et cache de prompts.",
      [
        node("n1", "user", "Utilisateur", 80, 240),
        node("n2", "api-server", "API orchestrateur", 360, 240, { instances: 2, avgServiceMs: 60 }),
        node("n3", "llm", "LLM", 640, 60, { avgServiceMs: 900, timeoutMs: 30000 }, "z1"),
        node("n4", "embedding-model", "Modèle d'embedding", 640, 180, {}, "z1"),
        node("n5", "vector-database", "Base vectorielle", 640, 300, {}, "z1"),
        node("n6", "redis", "Cache de prompts", 640, 420, { hitRatio: 0.4 }, "z1"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "http", 5, 100, "génération"),
        edge("e3", "n2", "n4", "http", 5, 100, "encodage"),
        edge("e4", "n2", "n5", "http", 5, 100, "recherche"),
        edge("e5", "n2", "n6", "redis", 2, 100, "prompts"),
      ],
      [zone("z1", "Pipeline IA", "violet", 600, 20, 290, 510)],
      scenario({
        activeUsers: 80,
        requestsPerSecond: 50,
        readRatio: 0.9,
        requestSizeKb: 4,
        durationSec: 120,
      }),
    ),
  },
];

export const TEMPLATE_MAP: Record<string, ArchitectureTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

export function getTemplateById(id: string): ArchitectureTemplate | undefined {
  return TEMPLATE_MAP[id];
}
