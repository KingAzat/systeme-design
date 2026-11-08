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
        node("n12", "alertes", "Alertes", 300, 990, {}, "z3"),
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
   *
   * Routage moteur : lectures → cache (miss → PostgreSQL), écritures →
   * file → worker → e-mail. L'ancienne forme (API → [file, PostgreSQL])
   * laissait la file et le worker morts : la priorité d'écriture du rôle
   * serveur envoie tout vers la base quand elle est présente.
   * ------------------------------------------------------------------ */
  {
    id: "messagerie-app",
    name: "Application de messagerie",
    description:
      "Parcours mixte synchrone/asynchrone : les lectures passent par le cache (miss → PostgreSQL), les envois partent dans une file ; un worker consomme à son rythme et déclenche l'e-mail de notification.",
    difficulty: "intermédiaire",
    tags: ["asynchrone", "file", "cache", "worker"],
    data: data(
      "Application de messagerie",
      "Lectures servies par le cache, envois asynchrones via file et worker.",
      [
        node("n1", "user", "Utilisateur", 80, 240),
        node("n2", "api-server", "API messages", 340, 240, { instances: 2, avgServiceMs: 40 }),
        node("n3", "message-queue", "File de messages", 620, 400, {}, "z2"),
        node("n4", "worker", "Worker d'envoi", 900, 400, { instances: 2, avgProcessingMs: 80 }, "z2"),
        node("n5", "service-email", "Service e-mail", 1180, 400, {}, "z2"),
        node("n6", "postgresql", "PostgreSQL", 900, 120, {}, "z1"),
        node("n7", "redis", "Cache de conversations", 620, 120, { hitRatio: 0.75 }, "z1"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n7", "redis", 2, 100, "lectures"),
        edge("e3", "n7", "n6", "sql", 4, 100, "miss"),
        edge("e4", "n2", "n3", "amqp", 3, 100, "envois"),
        edge("e5", "n3", "n4", "amqp", 3, 100),
        edge("e6", "n4", "n5", "https", 10, 50, "notification"),
      ],
      [
        zone("z1", "Chemin de lecture", "cyan", 580, 80, 610, 144),
        zone("z2", "Chemin asynchrone", "amber", 580, 360, 850, 144),
      ],
      scenario({ activeUsers: 1200, requestsPerSecond: 800 }),
    ),
  },

  /* ------------------------------------------------------------------
   * 5. Marketplace
   *
   * API catalogue : lectures → Redis (miss → PostgreSQL), écritures →
   * PostgreSQL. API commandes : tout passe par la file (acquittement 202,
   * worker + e-mail de confirmation) — la file n'est plus court-circuitée
   * par la priorité d'écriture base > file.
   * ------------------------------------------------------------------ */
  {
    id: "marketplace",
    name: "Marketplace",
    description:
      "Boutique complète : CDN et Load Balancer L7, l'API catalogue sert les lectures via Redis (miss → PostgreSQL), et l'API commandes passe par la branche asynchrone (file + worker + e-mails de confirmation).",
    difficulty: "intermédiaire",
    tags: ["e-commerce", "cache", "asynchrone", "cdn"],
    data: data(
      "Marketplace",
      "Frontal complet, catalogue cacheable et traitement différé des commandes.",
      [
        node("n1", "user", "Utilisateur", 80, 300, {}, "z1"),
        node("n2", "cdn", "CDN", 360, 300, { cacheHitRatio: 0.85 }, "z1"),
        node("n3", "load-balancer-l7", "Load Balancer L7", 640, 300, {}, "z2"),
        node("n4", "api-server", "API catalogue", 920, 180, { instances: 3, avgServiceMs: 45 }, "z2"),
        node("n5", "api-server", "API commandes", 920, 420, { instances: 3, avgServiceMs: 45 }, "z2"),
        node("n6", "redis", "Redis", 1200, 80, { hitRatio: 0.75 }, "z3"),
        node("n7", "postgresql", "PostgreSQL", 1200, 240, {}, "z3"),
        node("n8", "message-queue", "File de commandes", 1200, 400, {}, "z4"),
        node("n9", "worker", "Worker commandes", 1480, 400, { instances: 4, avgProcessingMs: 25 }, "z4"),
        node("n10", "service-email", "Service e-mail", 1480, 560, {}, "z4"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "https", 5, 200),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n3", "n5", "http", 2, 200),
        edge("e5", "n4", "n6", "redis", 2, 100, "lectures"),
        edge("e6", "n6", "n7", "sql", 4, 100, "miss"),
        edge("e7", "n4", "n7", "sql", 4, 100, "écritures"),
        edge("e8", "n5", "n8", "amqp", 3, 100, "commandes"),
        edge("e9", "n8", "n9", "amqp", 3, 100),
        edge("e10", "n9", "n10", "https", 10, 50, "confirmation"),
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
   *
   * L'API d'ingestion est un PROXY (api-gateway) : il relaie chaque
   * événement vers le journal PostgreSQL ET vers Kafka (fan-out moteur),
   * au lieu que la priorité d'écriture serveur n'envoie tout dans la base.
   * ------------------------------------------------------------------ */
  {
    id: "notifications-platform",
    name: "Plateforme de notifications",
    description:
      "Ingestion à 2 000 événements/s : l'API d'ingestion journalise chaque événement dans PostgreSQL et le publie dans Kafka (acquittement 202) ; un groupe de consommateurs dispatche vers e-mail et SMS. Le pic de campagne est le scénario type.",
    difficulty: "intermédiaire",
    tags: ["kafka", "asynchrone", "événements"],
    data: data(
      "Plateforme de notifications",
      "Ingestion événementielle sur Kafka et diffusion multi-canal.",
      [
        node("n1", "user", "Utilisateur", 80, 240),
        node("n2", "api-gateway", "API d'ingestion", 360, 240, { latencyMs: 8 }, "z1"),
        node("n3", "postgresql", "PostgreSQL", 360, 480, {}, "z1"),
        node("n4", "kafka", "Kafka", 640, 240, { partitions: 6 }, "z2"),
        node("n5", "consumer-group", "Groupe de consommateurs", 920, 240, { instances: 8 }, "z2"),
        node("n6", "service-email", "Service e-mail", 1200, 120, {}, "z2"),
        node("n7", "service-sms", "Service SMS", 1200, 360, {}, "z2"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "sql", 4, 100, "journal"),
        edge("e3", "n2", "n4", "kafka", 3, 200, "événements"),
        edge("e4", "n4", "n5", "kafka", 3, 200),
        edge("e5", "n5", "n6", "https", 10, 50),
        edge("e6", "n5", "n7", "https", 10, 50),
      ],
      [
        zone("z1", "Ingestion", "cyan", 320, 200, 290, 390),
        zone("z2", "Diffusion", "amber", 600, 80, 850, 390),
      ],
      scenario({ activeUsers: 3000, requestsPerSecond: 2000, readRatio: 0.2, profile: "spike" }),
    ),
  },

  /* ------------------------------------------------------------------
   * 8. Plateforme vidéo
   *
   * L'API d'origine est un PROXY : chaque requête d'origine consulte les
   * métadonnées (PostgreSQL) ET sert le média (stockage objet) — le
   * stockage n'est plus court-circuité par la priorité de lecture.
   * ------------------------------------------------------------------ */
  {
    id: "video-platform",
    name: "Plateforme vidéo",
    description:
      "Vidéo à la demande : 90 % des segments servis par le CDN ; les requêtes d'origine touchent l'API d'origine, qui consulte les métadonnées (PostgreSQL) et sert les médias depuis le stockage objet. 3 000 req/s de navigation.",
    difficulty: "intermédiaire",
    tags: ["vidéo", "cdn", "stockage objet"],
    data: data(
      "Plateforme vidéo",
      "Edge vidéo, API de métadonnées et stockage objet.",
      [
        node("n1", "user", "Utilisateur", 80, 240, {}, "z1"),
        node("n2", "cdn", "CDN", 360, 240, { cacheHitRatio: 0.9 }, "z1"),
        node("n3", "load-balancer-l7", "Load Balancer L7", 640, 240, {}),
        node("n4", "api-gateway", "API d'origine", 920, 240, {}),
        node("n5", "postgresql", "PostgreSQL", 1200, 120, {}, "z2"),
        node("n6", "stockage-objet", "Stockage vidéo", 1200, 360, {}, "z2"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 100),
        edge("e2", "n2", "n3", "https", 5, 200),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n4", "n5", "sql", 4, 100, "métadonnées"),
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
        node("n4", "worker", "Worker de projection", 920, 160, { instances: 6, avgProcessingMs: 80 }, "z1"),
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
   *
   * Les zones de disponibilité sont sur le chemin du trafic (relais
   * pass-through) : le répartiteur global-route vers la Zone A ou la
   * Zone B, qui relaient vers l'API de leur région.
   * ------------------------------------------------------------------ */
  {
    id: "multi-region",
    name: "Déploiement multi-région",
    description:
      "Routage global vers deux régions : primaire PostgreSQL en région A, réplique de lecture en région B. Les zones de disponibilité encadrent chaque région et relaient le trafic.",
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
        edge("e2", "n2", "n3", "http", 15, 200, "région A"),
        edge("e3", "n2", "n6", "http", 15, 200, "région B"),
        edge("e4", "n3", "n4", "http", 2, 100),
        edge("e5", "n4", "n5", "sql", 4, 100),
        edge("e6", "n6", "n7", "http", 2, 100),
        edge("e7", "n7", "n8", "sql", 4, 100, "lectures"),
        edge("e8", "n5", "n8", "sql", 40, 50, "réplication"),
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
        node("n2", "api-gateway", "Orchestrateur RAG", 360, 240, { latencyMs: 40, capacityRps: 2000 }),
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

  /* ==================================================================
   * GÉANTS DE LA TECH — architectures inspirées des systèmes réels
   * emblématiques (YouTube, Facebook, WhatsApp, Netflix, Twitter/X,
   * Uber). Formes de graphes compatibles avec le routage du moteur :
   * fan-out des proxys, chemins lecture/écriture séparés, files
   * alimentées par des workers dédiés.
   * ================================================================== */

  /* ------------------------------------------------------------------
   * 12. YouTube — diffusion vidéo
   * ------------------------------------------------------------------ */
  {
    id: "youtube-video",
    name: "YouTube — diffusion vidéo",
    description:
      "La chaîne complète de YouTube : 92 % des segments servis par le CDN ; côté créateurs, l'API d'ingestion persiste les métadonnées dans Cassandra, dépose le master sur le stockage objet et publie un événement de transcodage dans Kafka. Les workers de transcodage (400 ms par vidéo) prennent du retard dès que la mise en ligne décolle.",
    difficulty: "avancé",
    tags: ["vidéo", "cdn", "transcodage", "kafka", "stockage objet"],
    data: data(
      "YouTube — diffusion vidéo",
      "Distribution edge, ingestion créateurs et pipeline de transcodage asynchrone.",
      [
        node("n1", "user", "Spectateurs", 80, 100, { weight: 19 }, "z1"),
        node("n2", "cdn", "CDN vidéo", 360, 100, { cacheHitRatio: 0.92, capacityRps: 100000 }, "z1"),
        node("n3", "load-balancer-l7", "LB edge", 640, 100, {}, "z1"),
        node("n4", "api-gateway", "API vidéo", 920, 100, {}, "z1"),
        node("n5", "cassandra", "Cassandra — métadonnées", 1240, 60, {}, "z2"),
        node("n6", "stockage-objet", "Stockage — masters & segments", 1240, 260, {}, "z2"),
        node("n7", "user", "Créateurs", 80, 480, { weight: 1 }, "z3"),
        node("n8", "api-gateway", "API d'ingestion", 360, 480, {}, "z3"),
        node("n9", "kafka", "Kafka — pipeline de transcodage", 680, 480, { partitions: 12 }, "z4"),
        node("n10", "consumer-group", "Workers de transcodage", 920, 480, { instances: 8, avgProcessingMs: 400, timeoutMs: 10000 }, "z4"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 100),
        edge("e2", "n2", "n3", "https", 5, 200, "miss"),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n4", "n5", "grpc", 4, 100, "métadonnées"),
        edge("e5", "n4", "n6", "https", 8, 200, "segments"),
        edge("e6", "n7", "n8", "https", 20, 50),
        edge("e7", "n8", "n5", "grpc", 4, 100, "métadonnées"),
        edge("e8", "n8", "n6", "https", 10, 200, "master"),
        edge("e9", "n8", "n9", "kafka", 3, 200, "transcodage"),
        edge("e10", "n9", "n10", "kafka", 3, 100),
        edge("e11", "n10", "n6", "https", 10, 200, "renditions"),
      ],
      [
        zone("z1", "Distribution", "indigo", 40, 40, 1120, 190),
        zone("z2", "Données", "emerald", 1200, 20, 330, 340),
        zone("z3", "Ingestion créateurs", "cyan", 40, 420, 620, 190),
        zone("z4", "Transcodage", "amber", 660, 420, 620, 190),
      ],
      scenario({
        activeUsers: 40000,
        requestsPerSecond: 9000,
        readRatio: 0.85,
        requestSizeKb: 16,
        budgetPerMonthUsd: 12000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 13. Facebook — fil d'actualité
   * ------------------------------------------------------------------ */
  {
    id: "facebook-feed",
    name: "Facebook — fil d'actualité",
    description:
      "Le fil d'actualité façon Facebook : le CDN absorbe les médias et vignettes, l'API web sert les fils dynamiques, le cache type TAO décharge la réplique de lecture et les écritures tombent dans le MySQL partitionné. Au pic du soir, le tier web sature bien avant la base — leçon classique des couches de cache.",
    difficulty: "intermédiaire",
    tags: ["réseau social", "cache", "cdn", "réplication"],
    data: data(
      "Facebook — fil d'actualité",
      "Edge média, cache TAO, réplique de lecture et MySQL partitionné.",
      [
        node("n1", "user", "Utilisateurs", 80, 140, {}, "z1"),
        node("n2", "cdn", "CDN — médias & vignettes", 360, 140, { cacheHitRatio: 0.78, capacityRps: 100000 }, "z1"),
        node("n3", "load-balancer-l7", "LB web", 640, 140, {}, "z1"),
        node("n4", "api-server", "API web", 920, 140, { instances: 5, avgServiceMs: 40 }, "z1"),
        node("n5", "memcached", "Cache TAO — social graph", 1200, 40, { hitRatio: 0.9 }, "z2"),
        node("n6", "read-replica", "Réplique de lecture", 1200, 200, {}, "z2"),
        node("n7", "mysql", "MySQL partitionné — posts", 1200, 400, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "https", 5, 200, "miss"),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n4", "n5", "redis", 2, 100, "lectures"),
        edge("e5", "n5", "n6", "sql", 2, 100, "miss"),
        edge("e6", "n4", "n7", "sql", 4, 100, "écritures"),
        edge("e7", "n7", "n6", "sql", 40, 50, "réplication"),
      ],
      [
        zone("z1", "Frontal", "indigo", 40, 80, 1120, 190),
        zone("z2", "Lectures", "cyan", 1160, 0, 330, 300),
        zone("z3", "Écritures", "rose", 1160, 360, 330, 160),
      ],
      scenario({
        activeUsers: 60000,
        requestsPerSecond: 24000,
        readRatio: 0.9,
        profile: "spike",
        budgetPerMonthUsd: 8000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 14. WhatsApp — messagerie temps réel
   * ------------------------------------------------------------------ */
  {
    id: "whatsapp-messagerie",
    name: "WhatsApp — messagerie temps réel",
    description:
      "Le cœur de WhatsApp : les clients mobiles gardent une connexion persistante (WebSocket) derrière un rate limiter anti-spam ; chaque message est persisté dans Cassandra et publié dans la file de livraison, dont les workers poussent les notifications. Au pic du soir, la livraison prend du retard avant la persistance.",
    difficulty: "intermédiaire",
    tags: ["messagerie", "temps réel", "kafka", "file"],
    data: data(
      "WhatsApp — messagerie temps réel",
      "Connexions persistantes, persistance Cassandra et livraison asynchrone.",
      [
        node("n1", "application-mobile", "Clients mobiles", 80, 220, {}, "z1"),
        node("n2", "websocket", "Passerelle WebSocket", 340, 220, { maxClients: 500000 }, "z1"),
        node("n3", "rate-limiter", "Rate limiter anti-spam", 600, 220, { limit: 8000, burst: 2000 }, "z1"),
        node("n4", "cassandra", "Cassandra — boîtes de réception", 880, 100, {}, "z2"),
        node("n5", "kafka", "Kafka — file de livraison", 880, 380, { partitions: 12 }, "z3"),
        node("n6", "consumer-group", "Workers de livraison", 1160, 380, { instances: 8, avgProcessingMs: 12 }, "z3"),
        node("n7", "service-notification", "Passerelle push", 1440, 380, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "websocket", 20, 50),
        edge("e2", "n2", "n3", "tcp", 2, 100),
        edge("e3", "n3", "n4", "tcp", 4, 100, "messages"),
        edge("e4", "n3", "n5", "kafka", 3, 200, "livraison"),
        edge("e5", "n5", "n6", "kafka", 2, 100),
        edge("e6", "n6", "n7", "https", 10, 50, "push"),
      ],
      [
        zone("z1", "Temps réel", "cyan", 40, 160, 770, 190),
        zone("z2", "Persistance", "emerald", 840, 40, 330, 160),
        zone("z3", "Livraison", "amber", 840, 320, 810, 190),
      ],
      scenario({
        activeUsers: 25000,
        requestsPerSecond: 5000,
        readRatio: 0.1,
        profile: "spike",
        budgetPerMonthUsd: 2000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 15. Netflix — streaming résilient
   * ------------------------------------------------------------------ */
  {
    id: "netflix-streaming",
    name: "Netflix — streaming résilient",
    description:
      "La chaîne Netflix : CDN Open Connect, circuit breaker Hystrix devant l'origine, API edge (Zuul) déléguant au service de personnalisation, cache catalogue devant Cassandra et journal de visionnage sur Kafka. Architecture saine en régime nominal — injectez une panne sur le service de personnalisation pour voir le circuit breaker contenir la cascade.",
    difficulty: "avancé",
    tags: ["vidéo", "résilience", "circuit breaker", "microservices"],
    data: data(
      "Netflix — streaming résilient",
      "Edge protégé par circuit breaker, services chaînés et télémétrie événementielle.",
      [
        node("n1", "user", "Spectateurs", 80, 160, {}, "z1"),
        node("n2", "cdn", "CDN Open Connect", 360, 160, { cacheHitRatio: 0.8, capacityRps: 100000 }, "z1"),
        node("n3", "circuit-breaker", "Circuit Breaker — Hystrix", 640, 160, {}, "z1"),
        node("n4", "load-balancer-l7", "LB edge — Zuul", 900, 160, {}, "z1"),
        node("n5", "microservice", "API edge", 1180, 160, { instances: 6, avgServiceMs: 20 }, "z2"),
        node("n6", "microservice", "Service de personnalisation", 1180, 400, { instances: 4, avgServiceMs: 35 }, "z2"),
        node("n7", "memcached", "Cache catalogue", 1460, 240, { hitRatio: 0.85 }, "z3"),
        node("n8", "cassandra", "Cassandra — catalogue & visionnages", 1460, 460, {}, "z3"),
        node("n9", "kafka", "Kafka — journal de visionnage", 640, 580, { partitions: 8 }, "z4"),
        node("n10", "consumer-group", "Workers de télémétrie", 900, 580, { instances: 10, avgProcessingMs: 80 }, "z4"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 100),
        edge("e2", "n2", "n3", "https", 5, 200, "miss"),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n4", "n5", "http", 2, 200),
        edge("e5", "n5", "n6", "grpc", 3, 100),
        edge("e6", "n6", "n7", "redis", 2, 100, "lectures"),
        edge("e7", "n7", "n8", "sql", 2, 100, "miss"),
        edge("e8", "n6", "n9", "kafka", 3, 200, "visionnages"),
        edge("e9", "n9", "n10", "kafka", 3, 100),
        edge("e10", "n10", "n8", "tcp", 4, 100, "écritures"),
      ],
      [
        zone("z1", "Edge", "indigo", 40, 100, 1120, 190),
        zone("z2", "Services", "violet", 1140, 100, 330, 420),
        zone("z3", "Données", "emerald", 1420, 180, 330, 420),
        zone("z4", "Événementiel", "amber", 600, 520, 620, 190),
      ],
      scenario({
        activeUsers: 30000,
        requestsPerSecond: 15000,
        readRatio: 0.9,
        profile: "waves",
        budgetPerMonthUsd: 10000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 16. Twitter/X — timelines
   * ------------------------------------------------------------------ */
  {
    id: "twitter-timeline",
    name: "Twitter/X — timelines",
    description:
      "Le fan-out à l'écriture de Twitter/X : les lectures servent les timelines précalculées depuis Redis (95 % de hit, miss → Cassandra) ; chaque tweet part dans le journal Kafka et les workers de fan-out matérialisent les timelines des abonnés dans le cache. Un tweet viral suffit à faire dériver les workers — le fameux problème des célébrités.",
    difficulty: "avancé",
    tags: ["réseau social", "fan-out", "kafka", "cache"],
    data: data(
      "Twitter/X — timelines",
      "Timelines précalculées, journal de tweets et workers de fan-out.",
      [
        node("n1", "user", "Utilisateurs actifs", 80, 240, {}, "z1"),
        node("n2", "load-balancer-l7", "LB", 360, 240, {}, "z1"),
        node("n3", "api-server", "API timeline", 640, 240, { instances: 8, avgServiceMs: 25 }, "z1"),
        node("n4", "redis", "Redis — timelines précalculées", 920, 120, { hitRatio: 0.95 }, "z2"),
        node("n5", "cassandra", "Cassandra — tweets & profils", 1280, 120, {}, "z3"),
        node("n6", "kafka", "Kafka — journal de tweets", 920, 400, { partitions: 8 }, "z4"),
        node("n7", "consumer-group", "Workers de fan-out", 1200, 400, { instances: 4, avgProcessingMs: 60 }, "z4"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "http", 2, 200),
        edge("e3", "n3", "n4", "redis", 2, 100, "lectures"),
        edge("e4", "n4", "n5", "tcp", 4, 100, "miss"),
        edge("e5", "n3", "n6", "kafka", 3, 200, "tweets"),
        edge("e6", "n6", "n7", "kafka", 3, 100),
        edge("e7", "n7", "n4", "redis", 2, 100, "matérialisation"),
      ],
      [
        zone("z1", "Frontal", "indigo", 40, 180, 830, 190),
        zone("z2", "Timelines", "cyan", 880, 60, 330, 160),
        zone("z3", "Données", "emerald", 1240, 60, 330, 160),
        zone("z4", "Fan-out", "amber", 880, 340, 690, 190),
      ],
      scenario({
        activeUsers: 20000,
        requestsPerSecond: 12000,
        readRatio: 0.95,
        profile: "spike",
        budgetPerMonthUsd: 2000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 17. Uber — appariement en temps réel
   * ------------------------------------------------------------------ */
  {
    id: "uber-matching",
    name: "Uber — appariement en temps réel",
    description:
      "Le marché d'Uber : les passagers demandent, les chauffeurs publient leur position en continu (flux dominant) à travers la passerelle temps réel ; l'API sert les positions depuis Redis et publie les événements dans Kafka, dont les workers d'appariement maintiennent l'index géographique dans Cassandra. À l'heure de pointe (montée en charge), l'appariement frôle la saturation.",
    difficulty: "avancé",
    tags: ["géo", "temps réel", "kafka", "appariement"],
    data: data(
      "Uber — appariement en temps réel",
      "Flux GPS massif, positions en cache et appariement différé sur Kafka.",
      [
        node("n1", "application-mobile", "Clients — passagers", 80, 100, { weight: 3 }, "z1"),
        node("n2", "application-mobile", "Chauffeurs — flux GPS", 80, 340, { weight: 7 }, "z1"),
        node("n3", "websocket", "Passerelle temps réel", 360, 220, { maxClients: 300000 }, "z2"),
        node("n4", "load-balancer-l4", "LB de connexions", 620, 170, {}, "z2"),
        node("n5", "api-server", "API courses", 620, 270, { instances: 8, avgServiceMs: 15 }, "z2"),
        node("n6", "redis", "Redis — positions en mémoire", 1180, 100, { hitRatio: 0.9 }, "z4"),
        node("n7", "cassandra", "Cassandra — historique courses", 1180, 380, {}, "z4"),
        node("n8", "kafka", "Kafka — journal des positions", 900, 560, { partitions: 12 }, "z3"),
        node("n9", "consumer-group", "Workers d'appariement", 1180, 560, { instances: 6, avgProcessingMs: 8 }, "z3"),
      ],
      [
        edge("e1", "n1", "n3", "websocket", 20, 50),
        edge("e2", "n2", "n3", "websocket", 20, 50, "GPS"),
        edge("e3", "n3", "n4", "tcp", 2, 100),
        edge("e4", "n4", "n5", "http", 2, 200),
        edge("e5", "n5", "n6", "redis", 2, 100, "positions"),
        edge("e6", "n6", "n7", "tcp", 4, 100, "miss"),
        edge("e7", "n5", "n8", "kafka", 3, 200, "événements"),
        edge("e8", "n8", "n9", "kafka", 3, 100),
        edge("e9", "n9", "n7", "tcp", 4, 100, "appariements"),
      ],
      [
        zone("z1", "Clients mobiles", "indigo", 40, 40, 290, 420),
        zone("z2", "Temps réel", "cyan", 340, 160, 560, 220),
        zone("z3", "Appariement", "amber", 860, 500, 610, 190),
        zone("z4", "Données", "emerald", 1140, 20, 330, 460),
      ],
      scenario({
        activeUsers: 15000,
        requestsPerSecond: 10000,
        readRatio: 0.3,
        profile: "ramp",
        budgetPerMonthUsd: 2500,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 18. Instagram — fil photo
   *
   * Routage moteur : les lecteurs (poids 19) déroulent le fil via le CDN
   * puis le cache (miss → PostgreSQL) ; les publications (poids 1)
   * traversent la passerelle PROXY qui relaie métadonnées ET pipeline —
   * la voie Kafka n'est pas court-circuitée par la priorité d'écriture.
   * ------------------------------------------------------------------ */
  {
    id: "instagram-photo",
    name: "Instagram — fil photo",
    description:
      "Le fil d'Instagram : 90 % du poids des requêtes est servi par le CDN photo, les lectures passent par le cache des profils (miss → PostgreSQL), et le chemin d'écriture — minuscule en débit — déclenche un pipeline : chaque publication part dans Kafka et les workers de redimensionnement poussent les renditions vers le stockage objet. À la simulation, le front de lecture écrase tout, jusqu'à ce que les publications décollent et que le pipeline s'engorge.",
    difficulty: "intermédiaire",
    tags: ["médias", "cdn", "pipeline", "kafka", "stockage objet"],
    data: data(
      "Instagram — fil photo",
      "Front photo à 90 % CDN, lectures par le cache, publications asynchrones.",
      [
        node("n1", "user", "Spectateurs du fil", 80, 100, { weight: 19 }, "z1"),
        node("n2", "cdn", "CDN photo", 360, 100, { cacheHitRatio: 0.9, capacityRps: 100000 }, "z1"),
        node("n3", "api-server", "API fil", 640, 100, { instances: 6, avgServiceMs: 30 }, "z1"),
        node("n4", "redis", "Cache profils & fils", 970, 100, { hitRatio: 0.8 }, "z2"),
        node("n5", "postgresql", "PostgreSQL — posts & profils", 970, 260, {}, "z2"),
        node("n6", "user", "Photographes", 80, 340, { weight: 1 }, "z3"),
        node("n7", "api-gateway", "API de publication", 360, 340, { capacityRps: 5000, latencyMs: 12 }, "z3"),
        node("n8", "kafka", "Kafka — pipeline média", 640, 340, { partitions: 12 }, "z3"),
        node("n9", "consumer-group", "Workers de redimensionnement", 360, 456, { instances: 8, avgProcessingMs: 250 }, "z3"),
        node("n10", "stockage-objet", "Stockage des renditions", 640, 456, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 100),
        edge("e2", "n2", "n3", "https", 5, 200, "miss"),
        edge("e3", "n3", "n4", "redis", 2, 100, "lectures"),
        edge("e4", "n4", "n5", "sql", 4, 100, "miss"),
        edge("e5", "n6", "n7", "https", 20, 50, "publications"),
        edge("e6", "n7", "n5", "grpc", 4, 100, "métadonnées"),
        edge("e7", "n7", "n8", "kafka", 3, 200, "pipeline média"),
        edge("e8", "n8", "n9", "kafka", 3, 100),
        edge("e9", "n9", "n10", "https", 10, 200, "renditions"),
      ],
      [
        zone("z1", "Frontal", "indigo", 40, 40, 850, 190),
        zone("z2", "Lectures", "cyan", 930, 40, 330, 340),
        zone("z3", "Écritures & pipeline", "amber", 40, 280, 850, 280),
      ],
      scenario({
        activeUsers: 50000,
        requestsPerSecond: 20000,
        readRatio: 0.92,
        requestSizeKb: 48,
        profile: "waves",
        budgetPerMonthUsd: 9000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 19. Google — recherche web
   *
   * Routage moteur : l'agrégateur est un PROXY — chaque miss de cache est
   * diffusé vers les DEUX shards d'index (fan-out), comme une requête
   * réellement shardée en parallèle.
   * ------------------------------------------------------------------ */
  {
    id: "google-search",
    name: "Google — recherche web",
    description:
      "La recherche web réduite à sa contrainte reine : la latence. Front L4 ultra-rapide, API au temps de traitement très court, cache de résultats volontairement éphémère (40 % de hit) ; chaque miss part vers l'agrégateur, qui interroge les deux shards d'index Cassandra en parallèle. À la simulation, la moindre remontée du temps de traitement se lit immédiatement sur le p95 — et le fan-out double la charge portée par l'index.",
    difficulty: "intermédiaire",
    tags: ["recherche", "cache", "sharding", "latence"],
    data: data(
      "Google — recherche web",
      "Front rapide, cache éphémère et fan-out vers deux shards d'index.",
      [
        node("n1", "user", "Internautes", 80, 140, {}, "z1"),
        node("n2", "load-balancer-l4", "LB — front de recherche", 360, 140, {}, "z1"),
        node("n3", "api-server", "API recherche", 640, 140, { instances: 8, avgServiceMs: 15 }, "z1"),
        node("n4", "redis", "Cache de résultats", 970, 140, { hitRatio: 0.4 }, "z2"),
        node("n5", "api-gateway", "Agrégateur d'index", 1370, 80, { capacityRps: 30000, latencyMs: 6 }, "z3"),
        node("n6", "cassandra", "Shard d'index A", 1370, 240, {}, "z3"),
        node("n7", "cassandra", "Shard d'index B", 1370, 400, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "http", 1, 200),
        edge("e3", "n3", "n4", "redis", 1, 100, "résultats"),
        edge("e4", "n4", "n5", "tcp", 2, 100, "miss"),
        edge("e5", "n5", "n6", "grpc", 8, 100, "shard A"),
        edge("e6", "n5", "n7", "grpc", 8, 100, "shard B"),
      ],
      [
        zone("z1", "Frontal", "indigo", 40, 80, 850, 190),
        zone("z2", "Cache résultats", "cyan", 930, 80, 330, 190),
        zone("z3", "Index fragmenté", "emerald", 1330, 20, 330, 500),
      ],
      scenario({
        activeUsers: 60000,
        requestsPerSecond: 30000,
        readRatio: 0.98,
        requestSizeKb: 4,
        profile: "waves",
        budgetPerMonthUsd: 15000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 20. Google Drive — stockage & synchronisation
   *
   * Routage moteur : l'API Drive est un PROXY — chaque opération est
   * relayée vers les métadonnées, le contenu ET le journal de synchro
   * (fan-out), comme une écriture réellement journalisée.
   * ------------------------------------------------------------------ */
  {
    id: "googledrive-sync",
    name: "Google Drive — stockage & synchronisation",
    description:
      "Google Drive en modèle réduit : l'API sépare radicalement les métadonnées (PostgreSQL : arborescence, permissions) du contenu (chunks sur le stockage objet), et chaque modification est consignée dans un journal Kafka que les workers de synchro transforment en notifications vers les autres appareils. À la simulation, deux régimes cohabitent — métadonnées légères et fréquentes, contenus lourds et rares — pendant que le journal encaisse les rafales de modifications.",
    difficulty: "intermédiaire",
    tags: ["stockage", "synchronisation", "kafka", "événements"],
    data: data(
      "Google Drive — stockage & synchronisation",
      "Métadonnées SQL, contenu objet et journal de synchronisation.",
      [
        node("n1", "navigateur", "Clients Drive", 80, 160, {}, "z1"),
        node("n2", "api-gateway", "API Drive", 360, 160, { capacityRps: 25000, latencyMs: 8 }, "z1"),
        node("n3", "postgresql", "PostgreSQL — métadonnées", 700, 100, {}, "z2"),
        node("n4", "stockage-objet", "Stockage objet — chunks", 980, 100, {}, "z2"),
        node("n5", "kafka", "Journal de modifications", 700, 340, { partitions: 12 }, "z3"),
        node("n6", "consumer-group", "Workers de synchro", 980, 340, { instances: 6, avgProcessingMs: 60 }, "z3"),
        node("n7", "service-notification", "Notifications multi-appareils", 1260, 340, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "grpc", 4, 100, "métadonnées"),
        edge("e3", "n2", "n4", "https", 10, 200, "chunks"),
        edge("e4", "n2", "n5", "kafka", 3, 200, "journal"),
        edge("e5", "n5", "n6", "kafka", 3, 100),
        edge("e6", "n6", "n7", "https", 10, 50, "notifications"),
      ],
      [
        zone("z1", "Clients & API", "indigo", 40, 100, 570, 190),
        zone("z2", "Métadonnées & contenu", "emerald", 660, 40, 610, 190),
        zone("z3", "Journal de synchro", "amber", 660, 280, 850, 190),
      ],
      scenario({
        activeUsers: 25000,
        requestsPerSecond: 8000,
        readRatio: 0.7,
        requestSizeKb: 64,
        profile: "ramp",
        budgetPerMonthUsd: 6000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 21. Airbnb — recherche & réservation
   * ------------------------------------------------------------------ */
  {
    id: "airbnb-booking",
    name: "Airbnb — recherche & réservation",
    description:
      "Airbnb condensé : la recherche d'annonces — lourde, massivement parallèle — traverse le service de recherche et l'index Elasticsearch, tandis que la réservation — légère en débit mais transactionnelle — passe par le service de réservation et PostgreSQL. À la simulation, observez les deux régimes : l'index encaisse des salves de recherches pendant que la base n'écoule qu'un filet de transactions, et la réplique suit la réplication avec son décalage.",
    difficulty: "intermédiaire",
    tags: ["recherche", "réservation", "transactions", "réplication"],
    data: data(
      "Airbnb — recherche & réservation",
      "Recherche sur index dédié, réservation transactionnelle en SQL.",
      [
        node("n1", "user", "Voyageurs", 80, 220, {}, "z1"),
        node("n2", "load-balancer-l7", "Load Balancer L7", 360, 220, {}, "z1"),
        node("n3", "api-server", "API recherche", 700, 100, { instances: 4, avgServiceMs: 25 }, "z2"),
        node("n4", "microservice", "Service de recherche", 980, 100, { instances: 4, avgServiceMs: 35 }, "z2"),
        node("n5", "elasticsearch", "Index des annonces", 1260, 100, {}, "z2"),
        node("n6", "api-server", "API réservation", 700, 340, { instances: 3, avgServiceMs: 40 }, "z3"),
        node("n7", "microservice", "Service de réservation", 980, 340, { instances: 3, avgServiceMs: 30 }, "z3"),
        node("n8", "postgresql", "PostgreSQL — réservations", 1260, 340, {}, "z3"),
        node("n9", "read-replica", "Réplique de lecture", 1260, 500, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "http", 2, 200),
        edge("e3", "n2", "n6", "http", 2, 200),
        edge("e4", "n3", "n4", "grpc", 3, 100),
        edge("e5", "n4", "n5", "http", 5, 100, "annonces"),
        edge("e6", "n6", "n7", "grpc", 3, 100),
        edge("e7", "n7", "n8", "sql", 4, 100, "transactions"),
        edge("e8", "n8", "n9", "sql", 40, 50, "réplication"),
      ],
      [
        zone("z1", "Frontal", "indigo", 40, 160, 570, 190),
        zone("z2", "Recherche", "cyan", 660, 40, 880, 190),
        zone("z3", "Réservations", "rose", 660, 280, 880, 340),
      ],
      scenario({
        activeUsers: 20000,
        requestsPerSecond: 9000,
        readRatio: 0.85,
        requestSizeKb: 8,
        profile: "waves",
        budgetPerMonthUsd: 5000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 22. Discord — messagerie de serveurs
   *
   * Routage moteur : la passerelle est un relais neutre (pass-through)
   * — chaque événement est diffusé vers la présence ET le bus de guilde
   * (fan-out), comme une passerelle réelle qui tient les deux rôles.
   * ------------------------------------------------------------------ */
  {
    id: "discord-guilds",
    name: "Discord — messagerie de serveurs",
    description:
      "Un serveur Discord en miniature : les clients maintiennent des connexions persistantes vers la passerelle, qui tient la présence et les sessions en mémoire Redis — données éphémères et reconstituables — pendant que chaque message transite par le bus d'événements de guilde avant d'être persisté dans Cassandra par les workers de distribution. À la simulation, Redis encaisse les pics de connexions sans broncher : c'est le fan-out vers les salons qui fixe la limite.",
    difficulty: "intermédiaire",
    tags: ["messagerie", "temps réel", "fan-out", "présence"],
    data: data(
      "Discord — messagerie de serveurs",
      "Connexions persistantes, présence éphémère et distribution événementielle.",
      [
        node("n1", "navigateur", "Clients desktop & web", 80, 100, {}, "z1"),
        node("n2", "application-mobile", "Clients mobiles", 80, 300, {}, "z1"),
        node("n3", "websocket", "Passerelle WebSocket", 360, 220, { maxClients: 500000 }, "z1"),
        node("n4", "redis", "Présence & sessions", 900, 100, { hitRatio: 0.9 }, "z2"),
        node("n5", "kafka", "Bus d'événements de guilde", 900, 340, { partitions: 12 }, "z3"),
        node("n6", "consumer-group", "Workers de distribution", 1180, 340, { instances: 8, avgProcessingMs: 15 }, "z3"),
        node("n7", "cassandra", "Cassandra — messages", 1180, 500, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n3", "websocket", 20, 50),
        edge("e2", "n2", "n3", "websocket", 20, 50, "messages"),
        edge("e3", "n3", "n4", "redis", 2, 100, "présence"),
        edge("e4", "n3", "n5", "kafka", 3, 200, "événements"),
        edge("e5", "n5", "n6", "kafka", 3, 100),
        edge("e6", "n6", "n7", "tcp", 4, 100, "messages"),
      ],
      [
        zone("z1", "Connexions", "indigo", 40, 40, 770, 380),
        zone("z2", "Présence", "cyan", 860, 40, 330, 190),
        zone("z3", "Distribution", "amber", 860, 280, 610, 340),
      ],
      scenario({
        activeUsers: 30000,
        requestsPerSecond: 15000,
        readRatio: 0.2,
        requestSizeKb: 2,
        profile: "spike",
        budgetPerMonthUsd: 4000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 23. Spotify — streaming audio
   *
   * Routage moteur : le service de recommandation porte les DEUX voies —
   * lectures vers le cache des profils, écritures vers le journal
   * d'écoutes — l'API de lecture reste un simple relais vers lui.
   * ------------------------------------------------------------------ */
  {
    id: "spotify-streaming",
    name: "Spotify — streaming audio",
    description:
      "Le streaming façon Spotify : l'audio part du CDN (85 % de hit), l'API de lecture consulte le service de recommandation, qui décharge les profils dans Redis ; en parallèle, chaque écoute est consignée dans le journal Kafka puis agrégée vers la bibliothèque par les workers. À la simulation, la boucle d'écoute tourne en continu sous le flux de lecture — et si les workers prennent du retard, c'est la personnalisation qui se refroidit, jamais la lecture elle-même.",
    difficulty: "intermédiaire",
    tags: ["streaming", "cdn", "recommandation", "kafka"],
    data: data(
      "Spotify — streaming audio",
      "Diffusion edge, recommandation par le cache et boucle d'écoute événementielle.",
      [
        node("n1", "user", "Auditeurs", 80, 140, {}, "z1"),
        node("n2", "cdn", "CDN audio", 360, 140, { cacheHitRatio: 0.85, capacityRps: 100000 }, "z1"),
        node("n3", "load-balancer-l7", "LB edge", 640, 140, {}, "z1"),
        node("n4", "microservice", "API de lecture", 970, 100, { instances: 6, avgServiceMs: 20 }, "z2"),
        node("n5", "microservice", "Service de recommandation", 1250, 100, { instances: 4, avgServiceMs: 35 }, "z2"),
        node("n6", "redis", "Cache des profils", 970, 260, { hitRatio: 0.85 }, "z2"),
        node("n7", "kafka", "Journal d'écoutes", 970, 500, { partitions: 8 }, "z3"),
        node("n8", "consumer-group", "Workers d'écoutes", 1250, 500, { instances: 6, avgProcessingMs: 80 }, "z3"),
        node("n9", "cassandra", "Bibliothèque d'écoutes", 1250, 660, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 100),
        edge("e2", "n2", "n3", "https", 5, 200, "miss"),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n4", "n5", "grpc", 3, 100, "personnalisation"),
        edge("e5", "n5", "n6", "redis", 2, 100, "profils"),
        edge("e6", "n5", "n7", "kafka", 3, 200, "écoutes"),
        edge("e7", "n7", "n8", "kafka", 3, 100),
        edge("e8", "n8", "n9", "tcp", 4, 100, "bibliothèque"),
      ],
      [
        zone("z1", "Diffusion", "indigo", 40, 80, 850, 190),
        zone("z2", "Services", "violet", 930, 40, 610, 340),
        zone("z3", "Boucle d'écoute", "amber", 930, 440, 610, 340),
      ],
      scenario({
        activeUsers: 40000,
        requestsPerSecond: 18000,
        readRatio: 0.95,
        requestSizeKb: 24,
        profile: "waves",
        budgetPerMonthUsd: 8000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 24. Zoom — visioconférence
   * ------------------------------------------------------------------ */
  {
    id: "zoom-rtc",
    name: "Zoom — visioconférence",
    description:
      "Zoom scindé en deux plans : le plan de contrôle — signalisation WebSocket, API réunions, sessions dans Redis — débite quelques milliers de requêtes légères, pendant que le plan de données route des flux média massifs vers les serveurs SFU derrière un LB L4. À la simulation, le goulot est inversé : ni l'API ni Redis ne saturent — ce sont les serveurs média qui cèdent quand les réunions s'ouvrent en rafale.",
    difficulty: "intermédiaire",
    tags: ["temps réel", "visioconférence", "média", "signalisation"],
    data: data(
      "Zoom — visioconférence",
      "Plan de contrôle léger, plan de données média massif.",
      [
        node("n1", "navigateur", "Postes & salles de réunion", 80, 100, {}, "z1"),
        node("n2", "websocket", "Signalisation", 360, 100, { maxClients: 300000 }, "z1"),
        node("n3", "api-server", "API réunions", 640, 100, { instances: 4, avgServiceMs: 20 }, "z1"),
        node("n4", "redis", "Sessions & routage", 920, 100, { hitRatio: 0.9 }, "z1"),
        node("n5", "load-balancer-l4", "LB média (UDP)", 80, 340, {}, "z2"),
        node("n6", "serveur-applicatif", "Serveur média SFU 1", 360, 340, { instances: 2, avgServiceMs: 15 }, "z2"),
        node("n7", "serveur-applicatif", "Serveur média SFU 2", 640, 340, { instances: 2, avgServiceMs: 15 }, "z2"),
      ],
      [
        edge("e1", "n1", "n2", "websocket", 20, 50, "signalisation"),
        edge("e2", "n2", "n3", "http", 2, 100),
        edge("e3", "n3", "n4", "redis", 2, 100, "sessions"),
        edge("e4", "n1", "n5", "tcp", 20, 500, "flux média"),
        edge("e5", "n5", "n6", "tcp", 1, 1000, "flux"),
        edge("e6", "n5", "n7", "tcp", 1, 1000, "flux"),
      ],
      [
        zone("z1", "Signalisation", "indigo", 40, 40, 1160, 190),
        zone("z2", "Données média", "rose", 40, 280, 850, 190),
      ],
      scenario({
        activeUsers: 8000,
        requestsPerSecond: 1500,
        readRatio: 0.5,
        requestSizeKb: 16,
        profile: "spike",
        budgetPerMonthUsd: 7000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 25. Ticketmaster — billetterie sous tension
   *
   * Routage moteur : le rate limiter relaie chaque requête admise vers
   * la file d'admission ET le registre des sessions (fan-out) ; les
   * contrôleurs écrivent ensuite vers l'API de réservation (relais
   * worker → serveur via le fan-out de sortie du worker).
   * ------------------------------------------------------------------ */
  {
    id: "ticketmaster-queue",
    name: "Ticketmaster — billetterie sous tension",
    description:
      "La mise en vente à la Ticketmaster : des dizaines de milliers de fans frappent à la porte en même temps, le rate limiter n'en laisse entrer qu'une fraction, et la file d'attente virtuelle transforme le pic en flux régulier que les contrôleurs d'admission libèrent par petites vagues vers l'API de réservation. À la simulation en profil de pic, la file se remplit en quelques secondes — l'art consiste à admettre exactement ce que l'inventaire peut absorber, ni plus ni moins.",
    difficulty: "avancé",
    tags: ["file d'attente", "pic", "backpressure", "billetterie"],
    data: data(
      "Ticketmaster — billetterie sous tension",
      "Admission contrôlée : rate limiter, file virtuelle et contrôleurs.",
      [
        node("n1", "user", "Fans en file", 80, 220, {}, "z1"),
        node("n2", "rate-limiter", "Admission contrôlée", 360, 220, { limit: 3000, burst: 6000 }, "z1"),
        node("n3", "redis", "Sessions de file", 700, 100, { hitRatio: 0.9 }, "z2"),
        node("n4", "message-queue", "File d'attente virtuelle", 700, 260, { maxDepth: 100000 }, "z2"),
        node("n5", "consumer-group", "Contrôleurs d'admission", 980, 260, { instances: 3, avgProcessingMs: 150 }, "z2"),
        node("n6", "api-server", "API réservation", 700, 500, { instances: 4, avgServiceMs: 60 }, "z3"),
        node("n7", "postgresql", "Inventaire", 980, 500, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n4", "amqp", 3, 100, "admission"),
        edge("e3", "n2", "n3", "redis", 2, 100, "sessions de file"),
        edge("e4", "n4", "n5", "amqp", 3, 100),
        edge("e5", "n5", "n6", "http", 2, 100, "admis"),
        edge("e6", "n6", "n7", "sql", 4, 100, "réservations"),
      ],
      [
        zone("z1", "Entrée", "indigo", 40, 160, 570, 190),
        zone("z2", "File d'admission", "amber", 660, 40, 610, 340),
        zone("z3", "Réservations", "rose", 660, 440, 610, 190),
      ],
      scenario({
        activeUsers: 50000,
        requestsPerSecond: 25000,
        readRatio: 0.1,
        requestSizeKb: 4,
        profile: "spike",
        budgetPerMonthUsd: 6000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 26. Stripe — paiements
   *
   * Routage moteur : la passerelle est un PROXY — chaque paiement est
   * contrôlé (clé d'idempotence) ET journalisé (fan-out) ; le journal
   * alimente ensuite deux groupes de consommateurs, le règlement et
   * les événements notifiés aux marchands.
   * ------------------------------------------------------------------ */
  {
    id: "stripe-payments",
    name: "Stripe — paiements",
    description:
      "Stripe en modèle réduit : l'API paiements acquitte chaque requête après contrôle de la clé d'idempotence (Redis) et journalise la transaction dans Kafka — le règlement est différé, assuré par les workers qui écrivent le ledger append-only, tandis que le groupe d'événements notifie les marchands par webhooks avec tentatives de remise. À la simulation, la latence ressentie est celle de l'acquittement, pas celle du règlement : c'est ce découplage qui rend le pic absorbable.",
    difficulty: "avancé",
    tags: ["paiement", "idempotence", "asynchrone", "webhooks"],
    data: data(
      "Stripe — paiements",
      "Acquittement idempotent, journal Kafka, règlement différé et webhooks.",
      [
        node("n1", "client-api", "Systèmes marchands", 80, 100, {}, "z1"),
        node("n2", "api-gateway", "API paiements — idempotence", 360, 100, { capacityRps: 20000, latencyMs: 6 }, "z1"),
        node("n3", "redis", "Clés d'idempotence", 640, 100, { hitRatio: 0.6 }, "z1"),
        node("n4", "kafka", "Journal des transactions", 970, 100, { partitions: 12 }, "z2"),
        node("n5", "consumer-group", "Workers de règlement", 1250, 100, { instances: 8, avgProcessingMs: 120 }, "z2"),
        node("n6", "consumer-group", "Workers d'événements", 970, 540, { instances: 6, avgProcessingMs: 40 }, "z3"),
        node("n7", "service-notification", "Webhooks sortants — retries", 1250, 540, {}, "z3"),
        node("n8", "postgresql", "Ledger append-only", 970, 260, {}, "z2"),
      ],
      [
        edge("e1", "n1", "n2", "https", 15, 100),
        edge("e2", "n2", "n3", "redis", 2, 100, "idempotence"),
        edge("e3", "n2", "n4", "kafka", 3, 200, "transactions"),
        edge("e4", "n4", "n5", "kafka", 3, 100),
        edge("e5", "n5", "n8", "sql", 4, 100, "ledger"),
        edge("e6", "n4", "n6", "kafka", 3, 100),
        edge("e7", "n6", "n7", "https", 10, 50, "webhooks"),
      ],
      [
        zone("z1", "API marchands", "indigo", 40, 40, 850, 190),
        zone("z2", "Règlement", "cyan", 930, 40, 610, 380),
        zone("z3", "Notifications", "amber", 930, 480, 610, 190),
      ],
      scenario({
        activeUsers: 12000,
        requestsPerSecond: 6000,
        readRatio: 0.3,
        requestSizeKb: 2,
        profile: "spike",
        budgetPerMonthUsd: 9000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 27. Twitch — direct & chat
   * ------------------------------------------------------------------ */
  {
    id: "twitch-live",
    name: "Twitch — direct & chat",
    description:
      "Twitch réunit deux systèmes aux logiques opposées : la vidéo en direct — one-to-many, servie à 97 % par le CDN — et le chat — many-to-many, où chaque message traverse le bus Kafka et les workers de fan-out qui poussent vers les salons abonnés. À la simulation, le CDN absorbe l'essentiel du débit sans transpirer pendant que le fan-out de chat sature dès qu'un stream très suivi déborde : deux goulots à surveiller séparément.",
    difficulty: "intermédiaire",
    tags: ["streaming", "chat", "fan-out", "temps réel"],
    data: data(
      "Twitch — direct & chat",
      "Vidéo one-to-many au CDN, chat many-to-many sur bus d'événements.",
      [
        node("n1", "user", "Spectateurs & chatters", 80, 100, {}, "z1"),
        node("n2", "cdn", "CDN — flux vidéo", 360, 100, { cacheHitRatio: 0.97, capacityRps: 100000 }, "z1"),
        node("n3", "microservice", "API chaînes", 640, 100, { instances: 4, avgServiceMs: 25 }, "z1"),
        node("n4", "websocket", "Chat — passerelle", 80, 340, { maxClients: 500000 }, "z2"),
        node("n5", "kafka", "Bus de chat", 360, 340, { partitions: 16 }, "z2"),
        node("n6", "consumer-group", "Workers de fan-out", 640, 340, { instances: 8, avgProcessingMs: 20 }, "z2"),
        node("n7", "redis", "Abonnements de salons", 880, 340, { hitRatio: 0.9 }, "z2"),
        node("n8", "cassandra", "Chaînes & abonnés", 970, 100, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 100, "vidéo"),
        edge("e2", "n2", "n3", "http", 2, 200, "miss"),
        edge("e3", "n1", "n4", "websocket", 20, 50, "chat"),
        edge("e4", "n4", "n5", "kafka", 3, 200, "messages"),
        edge("e5", "n5", "n6", "kafka", 3, 100),
        edge("e6", "n6", "n7", "redis", 2, 100, "fan-out"),
        edge("e7", "n3", "n8", "sql", 4, 100, "chaînes & abonnés"),
      ],
      [
        zone("z1", "Vidéo & chaînes", "indigo", 40, 40, 850, 190),
        zone("z2", "Chat", "cyan", 40, 280, 1120, 190),
        zone("z3", "Persistance", "emerald", 930, 40, 330, 190),
      ],
      scenario({
        activeUsers: 30000,
        requestsPerSecond: 20000,
        readRatio: 0.7,
        requestSizeKb: 12,
        profile: "spike",
        budgetPerMonthUsd: 7000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 28. Reddit — votes & commentaires
   *
   * Routage moteur : l'API n'a AUCUNE base en sortie — les écritures
   * partent donc dans le journal Kafka (la priorité d'écriture du rôle
   * serveur ne peut pas court-circuiter la file), et seuls les
   * agrégateurs écrivent les scores consolidés dans PostgreSQL.
   * ------------------------------------------------------------------ */
  {
    id: "reddit-votes",
    name: "Reddit — votes & commentaires",
    description:
      "Le vote façon Reddit : des millions d'écritures minuscules qui ne méritent pas chacune leur transaction — l'API pousse tout dans le journal Kafka, et les agrégateurs consolident les scores par lots d'une demi-seconde avant de les écrire dans PostgreSQL. À la simulation, le score affiché prend du retard sur le vote émis dès que les agrégateurs saturent : la cohérence à terme, lisible au compteur de retard.",
    difficulty: "intermédiaire",
    tags: ["votes", "agrégation", "lots", "cohérence à terme"],
    data: data(
      "Reddit — votes & commentaires",
      "Écritures massives par lots, scores agrégés en cohérence à terme.",
      [
        node("n1", "user", "Redditeurs", 80, 220, {}, "z1"),
        node("n2", "load-balancer-l7", "Load Balancer L7", 360, 220, {}, "z1"),
        node("n3", "api-server", "API votes & commentaires", 640, 220, { instances: 6, avgServiceMs: 15 }, "z1"),
        node("n4", "redis", "Cache des scores", 970, 100, { hitRatio: 0.85 }, "z2"),
        node("n5", "read-replica", "Réplique de lecture", 970, 260, {}, "z2"),
        node("n6", "kafka", "Journal des votes", 80, 460, { partitions: 12 }, "z3"),
        node("n7", "consumer-group", "Agrégateurs par lots", 360, 460, { instances: 4, avgProcessingMs: 500, timeoutMs: 30000 }, "z3"),
        node("n8", "postgresql", "Scores agrégés", 640, 460, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "http", 2, 200),
        edge("e3", "n3", "n4", "redis", 2, 100, "scores"),
        edge("e4", "n4", "n5", "sql", 4, 100, "miss"),
        edge("e5", "n3", "n6", "kafka", 3, 200, "votes"),
        edge("e6", "n6", "n7", "kafka", 3, 100),
        edge("e7", "n7", "n8", "sql", 4, 100, "lots"),
        edge("e8", "n8", "n5", "sql", 40, 50, "réplication"),
      ],
      [
        zone("z1", "Frontal", "indigo", 40, 160, 850, 190),
        zone("z2", "Cache des scores", "cyan", 930, 40, 330, 340),
        zone("z3", "Agrégation", "amber", 40, 400, 850, 190),
      ],
      scenario({
        activeUsers: 25000,
        requestsPerSecond: 12000,
        readRatio: 0.4,
        requestSizeKb: 2,
        profile: "spike",
        budgetPerMonthUsd: 3000,
      }),
    ),
  },

  /* ------------------------------------------------------------------
   * 29. Shopify — pic e-commerce
   *
   * Routage moteur : deux API derrière le LB — la vitrine lit l'index,
   * l'API commandes porte cache + file (les commandes partent dans la
   * file, la base n'étant atteinte que par les workers de traitement).
   * ------------------------------------------------------------------ */
  {
    id: "shopify-blackfriday",
    name: "Shopify — pic e-commerce",
    description:
      "Le Black Friday façon Shopify : le CDN sert 90 % des pages produit, les paniers vivent dans Redis, et les commandes quittent le chemin critique — l'API les dépose dans la file, les workers les transforment en commandes PostgreSQL à un rythme soutenable. À la simulation en profil de pic, la vitrine reste réactive pendant que la file digère la marée : on achète la disponibilité avec une file.",
    difficulty: "avancé",
    tags: ["e-commerce", "pic", "cdn", "asynchrone", "black friday"],
    data: data(
      "Shopify — pic e-commerce",
      "Catalogue au CDN, paniers en cache, commandes asynchrones.",
      [
        node("n1", "user", "Acheteurs", 80, 260, {}, "z1"),
        node("n2", "cdn", "CDN — pages produit", 360, 260, { cacheHitRatio: 0.9, capacityRps: 100000 }, "z1"),
        node("n3", "load-balancer-l7", "Load Balancer L7", 640, 260, {}, "z1"),
        node("n4", "api-server", "API vitrine & recherche", 970, 100, { instances: 6, avgServiceMs: 25 }, "z2"),
        node("n5", "elasticsearch", "Recherche catalogue", 1250, 100, {}, "z2"),
        node("n6", "api-server", "API panier & commandes", 970, 260, { instances: 6, avgServiceMs: 30 }, "z2"),
        node("n7", "redis", "Paniers & sessions", 1250, 260, { hitRatio: 0.9 }, "z2"),
        node("n8", "kafka", "File de commandes", 970, 580, { partitions: 12 }, "z3"),
        node("n9", "consumer-group", "Traitement des commandes", 1250, 580, { instances: 8, avgProcessingMs: 100 }, "z3"),
        node("n10", "postgresql", "Commandes", 1530, 580, {}, "z3"),
      ],
      [
        edge("e1", "n1", "n2", "https", 20, 50),
        edge("e2", "n2", "n3", "https", 5, 200, "miss"),
        edge("e3", "n3", "n4", "http", 2, 200),
        edge("e4", "n3", "n6", "http", 2, 200),
        edge("e5", "n4", "n5", "http", 5, 100, "recherche"),
        edge("e6", "n6", "n7", "redis", 2, 100, "paniers"),
        edge("e7", "n6", "n8", "kafka", 3, 200, "commandes"),
        edge("e8", "n8", "n9", "kafka", 3, 100),
        edge("e9", "n9", "n10", "sql", 4, 100, "commandes"),
      ],
      [
        zone("z1", "Frontal", "indigo", 40, 200, 850, 190),
        zone("z2", "Boutique", "cyan", 930, 40, 610, 420),
        zone("z3", "Traitement des commandes", "amber", 930, 520, 850, 190),
      ],
      scenario({
        activeUsers: 50000,
        requestsPerSecond: 25000,
        readRatio: 0.85,
        requestSizeKb: 16,
        profile: "spike",
        budgetPerMonthUsd: 12000,
      }),
    ),
  },
];

export const TEMPLATE_MAP: Record<string, ArchitectureTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

/* ------------------------------------------------------------------
 * Métadonnées « géants de la tech » : modèles inspirés d'architectures
 * réelles emblématiques. La galerie s'en sert pour le filtre et le badge
 * entreprise ; les données de graphe restent des abstractions
 * pédagogiques (échelle réduite, composants du catalogue).
 * ------------------------------------------------------------------ */
export const BIG_TECH_META: Record<
  string,
  { company: string; inspiration: string; logo: string; fact: string }
> = {
  "youtube-video": {
    company: "YouTube",
    inspiration: "la chaîne de mise en ligne et de diffusion vidéo de YouTube",
    logo: "youtube",
    fact: "≈ 500 heures de vidéo mises en ligne chaque minute",
  },
  "facebook-feed": {
    company: "Facebook",
    inspiration: "le fil d'actualité de Facebook et ses couches de cache TAO",
    logo: "facebook",
    fact: "plus de 3 milliards d'utilisateurs actifs chaque mois",
  },
  "whatsapp-messagerie": {
    company: "WhatsApp",
    inspiration: "la messagerie temps réel de WhatsApp (connexions persistantes)",
    logo: "whatsapp",
    fact: "≈ 100 milliards de messages échangés par jour",
  },
  "netflix-streaming": {
    company: "Netflix",
    inspiration: "la distribution vidéo résiliente de Netflix (Open Connect, Zuul, Hystrix)",
    logo: "netflix",
    fact: "≈ 15 % du trafic Internet mondial en heures de pointe",
  },
  "twitter-timeline": {
    company: "Twitter/X",
    inspiration: "les timelines de Twitter/X et le fan-out à l'écriture",
    logo: "x",
    fact: "un message d'un compte à 100 M d'abonnés déclenche 100 M d'écritures de cache",
  },
  "uber-matching": {
    company: "Uber",
    inspiration: "l'appariement temps réel d'Uber (flux GPS, index géographique)",
    logo: "uber",
    fact: "des millions de positions GPS ingérées chaque seconde",
  },
  "instagram-photo": {
    company: "Instagram",
    inspiration: "le fil photo d'Instagram et son pipeline de redimensionnement",
    logo: "instagram",
    fact: "≈ 95 millions de photos publiées chaque jour",
  },
  "google-search": {
    company: "Google",
    inspiration: "la recherche web de Google (shards d'index, latence p95 stricte)",
    logo: "google",
    fact: "≈ 99 000 requêtes traitées chaque seconde dans le monde",
  },
  "googledrive-sync": {
    company: "Google Drive",
    inspiration: "le stockage et la synchronisation multi-appareils de Google Drive",
    logo: "googledrive",
    fact: "des milliards de fichiers synchronisés en continu",
  },
  "airbnb-booking": {
    company: "Airbnb",
    inspiration: "la recherche d'annonces et la réservation d'Airbnb",
    logo: "airbnb",
    fact: "plus de 8 millions d'annonces actives dans le monde",
  },
  "discord-guilds": {
    company: "Discord",
    inspiration: "les serveurs de discussion de Discord (présence éphémère, fan-out de guilde)",
    logo: "discord",
    fact: "des salons réunissant plus de 500 000 membres simultanés",
  },
  "spotify-streaming": {
    company: "Spotify",
    inspiration: "le streaming audio de Spotify et sa boucle de personnalisation",
    logo: "spotify",
    fact: "plus de 100 millions de titres à recommander en temps réel",
  },
  "zoom-rtc": {
    company: "Zoom",
    inspiration: "la visioconférence de Zoom (signalisation vs serveurs média)",
    logo: "zoom",
    fact: "des centaines de milliers de réunions simultanées en pointe",
  },
  "ticketmaster-queue": {
    company: "Ticketmaster",
    inspiration: "la file d'attente virtuelle de Ticketmaster pour les mises en vente",
    logo: "ticketmaster",
    fact: "des mises en vente attirant plus de 10 millions de personnes en file",
  },
  "stripe-payments": {
    company: "Stripe",
    inspiration: "l'API de paiements de Stripe (idempotence, webhooks, règlement différé)",
    logo: "stripe",
    fact: "des centaines de milliards de dollars traités par an",
  },
  "twitch-live": {
    company: "Twitch",
    inspiration: "le direct et le chat de Twitch (vidéo one-to-many, chat many-to-many)",
    logo: "twitch",
    fact: "plus de 2 millions de spectateurs simultanés en moyenne",
  },
  "reddit-votes": {
    company: "Reddit",
    inspiration: "les votes et commentaires de Reddit (agrégation par lots)",
    logo: "reddit",
    fact: "des millions de votes par heure lors des pics",
  },
  "shopify-blackfriday": {
    company: "Shopify",
    inspiration: "les pics e-commerce de Shopify absorbés par des files de commandes",
    logo: "shopify",
    fact: "des pics Black Friday à des centaines de milliers de commandes par minute",
  },
};

export function isBigTechTemplate(id: string): boolean {
  return id in BIG_TECH_META;
}

export function getTemplateById(id: string): ArchitectureTemplate | undefined {
  return TEMPLATE_MAP[id];
}
