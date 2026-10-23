"use client";

/**
 * SystemLab — carte de charge : rendu SVG statique du snapshot d'architecture.
 * Zones en pointillés teintées, nœuds avec badge d'utilisation, edges bezier
 * fléchés. Clic sur un nœud → sélection partagée avec le tableau de métriques.
 */
import { useId, useMemo } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { ArchEdge, ArchNode, SimulationResult, ZoneColor } from "@/types";
import { formatPercent } from "@/lib/format";
import {
  ERROR_RATE_CRITICAL,
  UTILIZATION_CRITICAL,
  UTILIZATION_WARN,
} from "@/lib/thresholds";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const NODE_W = 150;
const NODE_H = 54;
const PAD = 36;

/** Couleurs de zones — mêmes teintes que l'éditeur (classes Tailwind). */
const ZONE_CLASSES: Record<ZoneColor, { rect: string; text: string }> = {
  indigo: {
    rect: "fill-indigo-500/10 stroke-indigo-400/70",
    text: "fill-indigo-600 dark:fill-indigo-300",
  },
  cyan: {
    rect: "fill-cyan-500/10 stroke-cyan-400/70",
    text: "fill-cyan-600 dark:fill-cyan-300",
  },
  emerald: {
    rect: "fill-emerald-500/10 stroke-emerald-400/70",
    text: "fill-emerald-600 dark:fill-emerald-300",
  },
  amber: {
    rect: "fill-amber-500/10 stroke-amber-400/70",
    text: "fill-amber-600 dark:fill-amber-300",
  },
  violet: {
    rect: "fill-violet-500/10 stroke-violet-400/70",
    text: "fill-violet-600 dark:fill-violet-300",
  },
  rose: {
    rect: "fill-rose-500/10 stroke-rose-400/70",
    text: "fill-rose-600 dark:fill-rose-300",
  },
};

/** Teinte du badge d'utilisation (utilisation max du nœud, seuils unifiés). */
function utilTone(u: number): { pill: string; text: string } {
  if (u >= UTILIZATION_CRITICAL) return { pill: "fill-destructive/15", text: "fill-destructive" };
  if (u >= UTILIZATION_WARN) return { pill: "fill-warning/15", text: "fill-warning" };
  return { pill: "fill-success/15", text: "fill-success" };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

interface Anchor {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  axis: "h" | "v";
  dir: 1 | -1;
}

function anchorOf(source: ArchNode, target: ArchNode): Anchor {
  const scx = source.position.x + NODE_W / 2;
  const scy = source.position.y + NODE_H / 2;
  const dcx = target.position.x + NODE_W / 2;
  const dcy = target.position.y + NODE_H / 2;
  if (dcx > scx + 8) {
    return { x1: source.position.x + NODE_W, y1: scy, x2: target.position.x, y2: dcy, axis: "h", dir: 1 };
  }
  if (dcx < scx - 8) {
    return { x1: source.position.x, y1: scy, x2: target.position.x + NODE_W, y2: dcy, axis: "h", dir: -1 };
  }
  if (dcy > scy) {
    return { x1: scx, y1: source.position.y + NODE_H, x2: dcx, y2: target.position.y, axis: "v", dir: 1 };
  }
  return { x1: scx, y1: source.position.y, x2: dcx, y2: target.position.y + NODE_H, axis: "v", dir: -1 };
}

function bezierPath(a: Anchor): string {
  if (a.axis === "h") {
    const c = Math.max(30, Math.abs(a.x2 - a.x1) / 2);
    return `M ${a.x1} ${a.y1} C ${a.x1 + c * a.dir} ${a.y1}, ${a.x2 - c * a.dir} ${a.y2}, ${a.x2} ${a.y2}`;
  }
  const c = Math.max(24, Math.abs(a.y2 - a.y1) / 2);
  return `M ${a.x1} ${a.y1} C ${a.x1} ${a.y1 + c * a.dir}, ${a.x2} ${a.y2 - c * a.dir}, ${a.x2} ${a.y2}`;
}

export interface LoadMapProps {
  result: SimulationResult;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

export function LoadMap({ result, selectedNodeId, onSelectNode }: LoadMapProps) {
  const markerId = `sl-arrow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { snapshot, nodes: nodeMetrics, scenario } = result;

  const metricsById = useMemo(
    () => new Map(nodeMetrics.map((m) => [m.nodeId, m])),
    [nodeMetrics],
  );
  const nodeById = useMemo(
    () => new Map(snapshot.nodes.map((n) => [n.id, n])),
    [snapshot.nodes],
  );

  const viewBox = useMemo(() => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    const include = (x: number, y: number, w: number, h: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    };
    for (const zone of snapshot.zones) {
      include(zone.position.x, zone.position.y, zone.size.width, zone.size.height);
    }
    for (const node of snapshot.nodes) {
      include(node.position.x, node.position.y, NODE_W, NODE_H);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return "0 0 800 500";
    }
    const x = minX - PAD;
    const y = minY - PAD;
    return `${x} ${y} ${maxX - minX + PAD * 2} ${maxY - minY + PAD * 2}`;
  }, [snapshot.nodes, snapshot.zones]);

  const failingNode = (nodeId: string): boolean => {
    const m = metricsById.get(nodeId);
    if (!m) return false;
    if (m.errorRate > ERROR_RATE_CRITICAL) return true;
    return scenario.failure !== null && scenario.failure.nodeId === nodeId && m.availability < 1;
  };

  const edgePath = (edge: ArchEdge): string | null => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return null;
    return bezierPath(anchorOf(source, target));
  };

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-6">
        <CardTitle className="text-base font-semibold">Carte de charge</CardTitle>
        <CardDescription>
          Snapshot de l&apos;architecture simulée — la couleur indique l&apos;utilisation maximale
          de chaque nœud. Cliquez sur un nœud (ou Tab + Entrée au clavier) pour le repérer
          dans le tableau.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <svg
          viewBox={viewBox}
          className="h-auto max-h-[560px] w-full select-none"
          preserveAspectRatio="xMidYMid meet"
          onClick={() => onSelectNode(null)}
          role="group"
          aria-label="Carte de charge de l'architecture simulée — chaque nœud est sélectionnable"
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
            </marker>
          </defs>

          {/* Zones logiques */}
          {snapshot.zones.map((zone) => (
            <g key={zone.id}>
              <rect
                x={zone.position.x}
                y={zone.position.y}
                width={zone.size.width}
                height={zone.size.height}
                rx={12}
                strokeDasharray="8 6"
                strokeWidth={1.2}
                className={ZONE_CLASSES[zone.color].rect}
              />
              <text
                x={zone.position.x + 12}
                y={zone.position.y + 18}
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wide",
                  ZONE_CLASSES[zone.color].text,
                )}
              >
                {truncate(zone.label.toUpperCase(), 32)}
              </text>
            </g>
          ))}

          {/* Connexions */}
          {snapshot.edges.map((edge) => {
            const d = edgePath(edge);
            if (!d) return null;
            const highlighted =
              selectedNodeId !== null &&
              (edge.source === selectedNodeId || edge.target === selectedNodeId);
            return (
              <path
                key={edge.id}
                d={d}
                fill="none"
                strokeWidth={highlighted ? 2 : 1.5}
                className={cn(
                  highlighted ? "stroke-primary" : "stroke-muted-foreground/45",
                )}
                markerEnd={`url(#${markerId})`}
              />
            );
          })}

          {/* Nœuds */}
          {snapshot.nodes.map((node) => {
            const m = metricsById.get(node.id);
            const util = m?.utilizationMax ?? 0;
            const tone = utilTone(util);
            const selected = selectedNodeId === node.id;
            const failing = failingNode(node.id);
            const handleSelect = (event: MouseEvent) => {
              event.stopPropagation();
              onSelectNode(selected ? null : node.id);
            };
            // Accessibilité clavier : chaque nœud est un bouton focusable —
            // Entrée/Espace déclenchent la même sélection que le clic.
            const handleNodeKeyDown = (event: KeyboardEvent<SVGGElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onSelectNode(selected ? null : node.id);
              }
            };
            return (
              <g
                key={node.id}
                transform={`translate(${node.position.x}, ${node.position.y})`}
                className="sl-svg-focus cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${node.label} — utilisation max ${formatPercent(util, 0)}${
                  failing ? " — en erreur" : ""
                }`}
                aria-pressed={selected}
                onClick={handleSelect}
                onKeyDown={handleNodeKeyDown}
              >
                {selected ? (
                  <rect
                    x={-4}
                    y={-4}
                    width={NODE_W + 8}
                    height={NODE_H + 8}
                    rx={13}
                    className="fill-none stroke-primary/40"
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                ) : null}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={9}
                  strokeWidth={selected ? 2 : failing ? 2 : 1.25}
                  className={cn(
                    "fill-card",
                    selected ? "stroke-primary" : failing ? "stroke-destructive" : "stroke-border",
                  )}
                />
                <text x={10} y={20} className="fill-foreground text-[11px] font-medium">
                  {truncate(node.label, 20)}
                </text>
                <rect x={10} y={30} width={64} height={17} rx={8.5} className={tone.pill} />
                <text
                  x={42}
                  y={42}
                  textAnchor="middle"
                  className={cn("text-[10px] font-semibold tabular-nums", tone.text)}
                >
                  {formatPercent(util, 0)}
                </text>
                {m && m.maxQueueLength > 0 ? (
                  <text
                    x={NODE_W - 10}
                    y={42}
                    textAnchor="end"
                    className="fill-muted-foreground text-[9px] tabular-nums"
                  >
                    file {formatQueue(m.maxQueueLength)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* Légende */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-success" />
            util. max &lt; {Math.round(UTILIZATION_WARN * 100)} %
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-warning" />
            {Math.round(UTILIZATION_WARN * 100)}–{Math.round(UTILIZATION_CRITICAL * 100)} %
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-destructive" />
            ≥ {Math.round(UTILIZATION_CRITICAL * 100)} %
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border-2 border-destructive" />
            erreurs &gt; {Math.round(ERROR_RATE_CRITICAL * 100)} % ou panne simulée
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground/60" />
            zone logique
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Longueur de file compacte (k pour milliers). */
function formatQueue(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return String(Math.round(n));
}
