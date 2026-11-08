"use client";

/**
 * SystemLab — Nœud système du canvas (carte 208×64).
 * Pastille icône catégorie + nom + sous-texte (subtitleFields) + badge statut
 * de simulation + poignées source/target + bouton supprimer au survol.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryStyle } from "@/lib/icons";
import { formatNumber, formatRps } from "@/lib/format";
import {
  ERROR_RATE_CRITICAL,
  UTILIZATION_CRITICAL,
  UTILIZATION_WARN,
} from "@/lib/thresholds";
import { useEditorStore } from "@/stores/editor-store";
import type { CatalogComponent, CatalogField } from "@/types";
import { NODE_CARD_HEIGHT, NODE_CARD_WIDTH } from "../constants";
import { CatalogIcon } from "../catalog-icon";
import type { NodeStatus, SystemNodeData, SystemNodeType } from "./types";

const STATUS_META: Record<NodeStatus, { label: string; dot: string; title: string }> = {
  healthy: {
    label: "Sain",
    dot: "bg-success",
    title: "Sain : utilisation et taux d'erreur sous contrôle",
  },
  saturated: {
    label: "Saturé",
    dot: "bg-warning",
    title: `Saturé : utilisation ≥ ${Math.round(UTILIZATION_WARN * 100)} % — à surveiller, la charge approche des limites`,
  },
  critical: {
    label: "Critique",
    dot: "bg-destructive",
    title: `Critique : utilisation ≥ ${Math.round(UTILIZATION_CRITICAL * 100)} % ou taux d'erreur > ${Math.round(ERROR_RATE_CRITICAL * 100)} %`,
  },
};

/** Sous-texte du nœud : valeurs des subtitleFields (valeur + unité) ou description tronquée. */
function computeSubtitle(
  config: Record<string, number | string | boolean>,
  component: CatalogComponent | undefined,
): string {
  const keys = component?.subtitleFields ?? [];
  const parts: string[] = [];
  for (const key of keys) {
    const field: CatalogField | undefined = component?.fields.find((f) => f.key === key);
    const value = config[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number") {
      const unit = field?.unit;
      if (unit === "req/s" || key.toLowerCase().endsWith("rps")) {
        parts.push(formatRps(value));
      } else if (unit) {
        parts.push(`${formatNumber(value)} ${unit}`);
      } else {
        parts.push(formatNumber(value));
      }
    } else if (typeof value === "boolean") {
      if (value) parts.push(field?.label ?? key);
    } else {
      const option = field?.options?.find((o) => o.value === value);
      parts.push(option?.label ?? value);
    }
  }
  if (parts.length > 0) return parts.join(" · ");
  const description = component?.description ?? "";
  return description.length > 34 ? `${description.slice(0, 33)}…` : description;
}

function SystemNodeInner({ id, data, selected }: NodeProps<SystemNodeType>) {
  const { archNode, component, status } = data as SystemNodeData;
  const selectNode = useEditorStore((s) => s.selectNode);
  const deleteSelection = useEditorStore((s) => s.deleteSelection);

  const categoryStyle = getCategoryStyle(component?.category ?? "");
  const subtitle = computeSubtitle(archNode.config, component);
  const statusMeta = status ? STATUS_META[status] : null;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg border bg-card px-2.5 shadow-sm transition-shadow hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/60 shadow-md" : "border-border",
      )}
      style={{ width: NODE_CARD_WIDTH, height: NODE_CARD_HEIGHT }}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          categoryStyle.icon,
        )}
      >
        <CatalogIcon name={component?.icon} componentId={component?.id} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium">{archNode.label}</p>
        <p className="truncate text-xs leading-tight text-muted-foreground" title={subtitle}>
          {subtitle}
        </p>
      </div>

      {statusMeta && (
        <span
          title={statusMeta.title}
          aria-label={`Statut : ${statusMeta.label}`}
          className={cn(
            "absolute -top-1.5 -left-1.5 size-3 rounded-full border-2 border-card",
            statusMeta.dot,
          )}
        />
      )}

      <button
        type="button"
        aria-label={`Supprimer « ${archNode.label} »`}
        className="absolute -top-2 -right-2 hidden size-5 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive hover:bg-destructive hover:text-white group-hover:flex focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          selectNode(id);
          deleteSelection();
        }}
      >
        <X className="size-3" />
      </button>

      {(component?.ports.inputs ?? 1) > 0 && (
        <Handle type="target" position={Position.Left} isConnectable />
      )}
      {(component?.ports.outputs ?? 1) > 0 && (
        <Handle type="source" position={Position.Right} isConnectable />
      )}
    </div>
  );
}

/**
 * Comparateur de memo : SystemNodeInner ne consomme QUE `id`, `selected` et
 * `data` (archNode / component / statut de simulation). Les autres props du
 * wrapper React Flow (position, dragging, zIndex, dimensions…) sont gérées
 * par le wrapper lui-même — un changement de position d'un AUTRE nœud (ou une
 * nouvelle enveloppe `data` recréée à l'identique) ne doit PAS re-render ce
 * composant. La comparaison par identité d'`archNode` suffit : le store ne
 * recrée l'objet nœud que lorsque CE nœud change (moveNode/updateNodeConfig/
 * renameNode/…), et le cache rfNodes du canvas préserve l'enveloppe data des
 * nœuds inchangés.
 */
function systemNodePropsEqual(
  prev: NodeProps<SystemNodeType>,
  next: NodeProps<SystemNodeType>,
): boolean {
  return (
    prev.id === next.id &&
    prev.selected === next.selected &&
    prev.data?.archNode === next.data?.archNode &&
    prev.data?.component === next.data?.component &&
    prev.data?.status === next.data?.status
  );
}

export const SystemNode = memo(SystemNodeInner, systemNodePropsEqual);
