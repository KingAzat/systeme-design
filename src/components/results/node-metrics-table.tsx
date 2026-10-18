"use client";

/**
 * SystemLab — tableau des métriques par nœud (tri par colonne, goulot
 * surligné, ligne sélectionnée synchronisée avec la carte de charge).
 */
import { useMemo, useState } from "react";
import type { NodeMetrics } from "@/types";
import { getComponentById } from "@/data/catalog";
import { getCategoryStyle, getIcon } from "@/lib/icons";
import { formatCost, formatMs, formatNumber, formatPercent, formatRps } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SortKey =
  | "label"
  | "arrivals"
  | "throughputRps"
  | "rejected"
  | "errorRate"
  | "utilization"
  | "maxQueueLength"
  | "p95WaitMs"
  | "costPerMonthUsd";

type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "label", label: "Nœud", numeric: false },
  { key: "arrivals", label: "Arrivées", numeric: true },
  { key: "throughputRps", label: "Traités (req/s)", numeric: true },
  { key: "rejected", label: "Rejetés", numeric: true },
  { key: "errorRate", label: "Erreurs %", numeric: true },
  { key: "utilization", label: "Utilisation", numeric: true },
  { key: "maxQueueLength", label: "File max", numeric: true },
  { key: "p95WaitMs", label: "Attente p95", numeric: true },
  { key: "costPerMonthUsd", label: "Coût", numeric: true },
];

function utilColorHex(u: number): string {
  if (u >= 0.85) return "#DC2626";
  if (u >= 0.6) return "#D97706";
  return "#16A34A";
}

export interface NodeMetricsTableProps {
  nodes: NodeMetrics[];
  bottleneckNodeId: string | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

export function NodeMetricsTable({
  nodes,
  bottleneckNodeId,
  selectedNodeId,
  onSelectNode,
}: NodeMetricsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("utilization");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...nodes];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "label") {
        cmp = a.label.localeCompare(b.label, "fr");
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [nodes, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : "desc");
    }
  };

  return (
    <div className="max-h-96 overflow-y-auto rounded-lg border">
      <Table className="min-w-[820px]">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((col) => {
              const active = sortKey === col.key;
              return (
                <TableHead
                  key={col.key}
                  className={cn("select-none", col.numeric && "text-right")}
                  aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded text-xs font-medium hover:text-foreground",
                      active ? "text-foreground" : "text-muted-foreground",
                      col.numeric && "w-full justify-end",
                    )}
                  >
                    {col.label}
                    <span aria-hidden className={cn("text-[10px]", !active && "opacity-30")}>
                      {active && sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((m) => {
            const component = getComponentById(m.componentId);
            const Icon = getIcon(component?.icon);
            const categoryStyle = getCategoryStyle(component?.category ?? "");
            const isBottleneck = bottleneckNodeId === m.nodeId;
            const isSelected = selectedNodeId === m.nodeId;
            return (
              <TableRow
                key={m.nodeId}
                onClick={() => onSelectNode(isSelected ? null : m.nodeId)}
                className={cn(
                  "cursor-pointer",
                  isBottleneck && "bg-warning/10",
                  isSelected && "bg-accent/50",
                )}
              >
                <TableCell className="max-w-[220px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md",
                        categoryStyle.icon,
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="truncate font-medium" title={m.label}>
                      {m.label}
                    </span>
                    {isBottleneck ? (
                      <Badge
                        variant="outline"
                        className="border-warning/40 bg-warning/10 text-warning"
                      >
                        Goulot
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatNumber(m.arrivals)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRps(m.throughputRps)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatNumber(m.rejected)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    m.errorRate > 0.05
                      ? "font-medium text-destructive"
                      : m.errorRate > 0.02
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                >
                  {formatPercent(m.errorRate)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, m.utilization * 100))}%`,
                          backgroundColor: utilColorHex(m.utilization),
                        }}
                      />
                    </div>
                    <span className="w-11 text-right tabular-nums text-muted-foreground">
                      {formatPercent(m.utilization, 0)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatNumber(m.maxQueueLength)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatMs(m.p95WaitMs)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCost(m.costPerMonthUsd)}
                </TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="py-8 text-center text-muted-foreground">
                Aucun nœud simulé.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
