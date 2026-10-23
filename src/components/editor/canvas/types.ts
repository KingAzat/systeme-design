/**
 * SystemLab — types des nœuds/edges React Flow de l'éditeur.
 *
 * Le canvas est en MODE CONTRÔLÉ : les ArchNode/ArchEdge du store sont
 * convertis en nœuds/edges React Flow au rendu (useMemo). Ce choix permet
 * de conserver l'état du document dans un store Zustand hors composant —
 * le shell démonte/remonte les vues, le document survit aux changements de
 * vue, et la réinitialisation du viewport se fait via fitView sur docEpoch.
 */
import type { Edge, Node } from "@xyflow/react";
import type { ArchEdge, ArchNode, ArchZone, CatalogComponent } from "@/types";
import {
  ERROR_RATE_CRITICAL,
  UTILIZATION_CRITICAL,
  UTILIZATION_WARN,
} from "@/lib/thresholds";

/** Statut dérivé des métriques simulées (badge du nœud). */
export type NodeStatus = "healthy" | "saturated" | "critical";

export type SystemNodeData = {
  archNode: ArchNode;
  component: CatalogComponent | undefined;
  status?: NodeStatus;
};

export type SystemNodeType = Node<SystemNodeData, "system">;

export type ZoneNodeData = {
  zone: ArchZone;
};

export type ZoneNodeType = Node<ZoneNodeData, "zone">;

export type SystemEdgeData = {
  edge: ArchEdge;
};

export type SystemEdgeType = Edge<SystemEdgeData, "system">;

export type AppNode = SystemNodeType | ZoneNodeType;
export type AppEdge = SystemEdgeType;

/** Statut d'un nœud à partir de ses métriques simulées (seuils unifiés). */
export function nodeStatusFromMetrics(
  utilization: number,
  errorRate: number,
): NodeStatus {
  if (utilization >= UTILIZATION_CRITICAL || errorRate > ERROR_RATE_CRITICAL) {
    return "critical";
  }
  if (utilization >= UTILIZATION_WARN) return "saturated";
  return "healthy";
}
