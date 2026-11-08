import type { CatalogComponent, CategoryId } from "@/types";
import { CATEGORIES, CATEGORY_MAP } from "./categories";
import { CORE_COMPONENTS } from "./components-core";
import { CLIENTS_COMPONENTS } from "./extended/clients";
import { NETWORK_COMPONENTS } from "./extended/network";
import { COMPUTE_COMPONENTS } from "./extended/compute";
import { SQL_COMPONENTS } from "./extended/sql";
import { NOSQL_COMPONENTS } from "./extended/nosql";
import { CACHE_COMPONENTS } from "./extended/cache";
import { MESSAGING_COMPONENTS } from "./extended/messaging";
import { STORAGE_COMPONENTS } from "./extended/storage";
import { SEARCH_COMPONENTS } from "./extended/search";
import { COMMUNICATION_COMPONENTS } from "./extended/communication";
import { SECURITY_COMPONENTS } from "./extended/security";
import { RESILIENCE_COMPONENTS } from "./extended/resilience";
import { OBSERVABILITY_COMPONENTS } from "./extended/observability";
import { DISTRIBUTED_COMPONENTS } from "./extended/distributed";
import { JOBS_COMPONENTS } from "./extended/jobs";
import { AI_COMPONENTS } from "./extended/ai";
import { BUSINESS_COMPONENTS } from "./extended/business";
import { INFRASTRUCTURE_COMPONENTS } from "./extended/infrastructure";

/**
 * Registre du catalogue — façade unique pour toute l'application.
 * Les signatures ci-dessous restent stables ; seul le contenu du registre
 * a été étendu (cœur + 18 catégories).
 */

export { CATEGORIES, CATEGORY_MAP };
export { CORE_COMPONENTS };

export const COMPONENTS: CatalogComponent[] = [
  ...CORE_COMPONENTS,
  ...CLIENTS_COMPONENTS,
  ...NETWORK_COMPONENTS,
  ...COMPUTE_COMPONENTS,
  ...SQL_COMPONENTS,
  ...NOSQL_COMPONENTS,
  ...CACHE_COMPONENTS,
  ...MESSAGING_COMPONENTS,
  ...STORAGE_COMPONENTS,
  ...SEARCH_COMPONENTS,
  ...COMMUNICATION_COMPONENTS,
  ...SECURITY_COMPONENTS,
  ...RESILIENCE_COMPONENTS,
  ...OBSERVABILITY_COMPONENTS,
  ...DISTRIBUTED_COMPONENTS,
  ...JOBS_COMPONENTS,
  ...AI_COMPONENTS,
  ...BUSINESS_COMPONENTS,
  ...INFRASTRUCTURE_COMPONENTS,
];

export const COMPONENT_MAP: Record<string, CatalogComponent> = Object.fromEntries(
  COMPONENTS.map((c) => [c.id, c]),
);

export function getComponentById(id: string): CatalogComponent | undefined {
  return COMPONENT_MAP[id];
}

export function getComponentsByCategory(categoryId: CategoryId): CatalogComponent[] {
  return COMPONENTS.filter((c) => c.category === categoryId);
}

export function getComponentCountByCategory(categoryId: CategoryId): number {
  return getComponentsByCategory(categoryId).length;
}

/** Configuration par défaut clonée en profondeur. */
export function getDefaultConfig(componentId: string): Record<string, number | string | boolean> {
  const c = COMPONENT_MAP[componentId];
  if (!c) return {};
  return { ...c.defaults };
}

/** Recherche insensible à la casse et aux accents sur nom + description + concepts. */
export function searchComponents(query: string): CatalogComponent[] {
  const q = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!q) return COMPONENTS;
  return COMPONENTS.filter((c) => {
    const haystack = [c.name, c.description, ...(c.learning.concepts ?? [])]
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return haystack.includes(q);
  });
}

/* ------------------------------------------------------------------
 * Validation des connexions (règles explicites, messages français)
 * ------------------------------------------------------------------ */

interface EdgeLike {
  source: string;
  target: string;
}

const FRONT_LINE_TARGETS = new Set([
  "cdn", "balancer", "rate-limiter", "circuit-breaker", "proxy",
  "server", "pass-through", "storage",
]);

export interface ConnectionValidation {
  valid: boolean;
  reason?: string;
}

export function validateConnection(
  sourceComponentId: string,
  targetComponentId: string,
  sourceNodeId: string,
  targetNodeId: string,
  existingEdges: EdgeLike[],
): ConnectionValidation {
  if (sourceNodeId === targetNodeId) {
    return { valid: false, reason: "Un composant ne peut pas être relié à lui-même." };
  }
  if (existingEdges.some((e) => e.source === sourceNodeId && e.target === targetNodeId)) {
    return { valid: false, reason: "Cette connexion existe déjà." };
  }
  const source = COMPONENT_MAP[sourceComponentId];
  const target = COMPONENT_MAP[targetComponentId];
  if (!source || !target) return { valid: true };

  if (source.ports.outputs < 1) {
    return { valid: false, reason: `${source.name} ne possède pas de port de sortie.` };
  }
  if (target.ports.inputs < 1) {
    return { valid: false, reason: `${target.name} ne possède pas de port d'entrée.` };
  }

  const sRole = source.simRole;
  const tRole = target.simRole;

  // Un générateur vise un composant d'entrée
  if (sRole === "generator" && tRole && !FRONT_LINE_TARGETS.has(tRole)) {
    return {
      valid: false,
      reason: "Une source de trafic doit viser un composant d'entrée (CDN, Load Balancer, Rate Limiter, serveur…).",
    };
  }
  // Les réplicas et le stockage sont des puits
  if (sRole === "replica" || sRole === "storage") {
    return { valid: false, reason: `${source.name} est un point final : il n'émet pas de trafic.` };
  }
  // Une base ne rejoint qu'un réplica (flux de réplication)
  if (sRole === "database" && tRole !== "replica") {
    return { valid: false, reason: "Une base primaire ne diffuse que vers ses réplicas de lecture." };
  }
  // Un worker consomme des files mais peut écrire vers bases/queues
  return { valid: true };
}

/** Version backend : validation d'un graphe complet (délégée au moteur pour l'analyse fine). */
export function validateArchitectureGraph(
  nodes: { id: string; componentId: string }[],
  edges: EdgeLike[],
): ConnectionValidation[] {
  const problems: ConnectionValidation[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) {
      problems.push({ valid: false, reason: "Connexion vers un composant inexistant." });
      continue;
    }
    const v = validateConnection(
      s.componentId,
      t.componentId,
      e.source,
      e.target,
      // L'arête candidate doit être exclue des arêtes existantes, sinon le
      // test de doublon « Cette connexion existe déjà » la rejette elle-même
      // et la fonction déclare invalide 100 % des graphes existants.
      edges.filter((other) => other !== e),
    );
    if (!v.valid) problems.push(v);
  }
  return problems;
}
