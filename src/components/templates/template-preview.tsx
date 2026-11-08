"use client";

import { useId } from "react";
import type { ArchitectureData, ZoneColor } from "@/types";
import { getComponentById } from "@/data/catalog/registry";
import { getComponentLogo } from "@/lib/brand-logos";

/** Classe de thème sombre d'un logo de marque dans l'aperçu SVG. */
function brandDarkClass(darkMode: "invert" | "brighten" | "none" | undefined): string | undefined {
  if (darkMode === "invert") return "dark:invert";
  if (darkMode === "brighten") return "dark:brightness-[1.9]";
  return undefined;
}

/**
 * SystemLab — Aperçu SVG statique d'un modèle d'architecture.
 *
 * Généré depuis les positions réelles des nœuds du modèle : zones en
 * rectangles pointillés teintés, nœuds en petits rectangles avec un point
 * coloré par catégorie, connexions en lignes fléchées coupées aux bordures.
 * Aucune dépendance à React Flow : rendu pur, léger, imprimable.
 */

const NODE_W = 132;
const NODE_H = 46;
const PAD = 30;

const ZONE_HEX: Record<ZoneColor, string> = {
  indigo: "#6366f1",
  cyan: "#06b6d4",
  emerald: "#10b981",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  rose: "#f43f5e",
};

/** Couleurs hexadécimales fixes par catégorie (harmonisées avec CATEGORY_STYLES). */
const CATEGORY_HEX: Record<string, string> = {
  clients: "#6366f1",
  network: "#0ea5e9",
  compute: "#8b5cf6",
  sql: "#3b82f6",
  nosql: "#14b8a6",
  cache: "#f43f5e",
  messaging: "#f59e0b",
  storage: "#64748b",
  search: "#ec4899",
  communication: "#06b6d4",
  security: "#10b981",
  resilience: "#f97316",
  observability: "#d946ef",
  distributed: "#a855f7",
  jobs: "#84cc16",
  ai: "#6366f1",
  business: "#22c55e",
  infrastructure: "#78716c",
};

/** Coupe un segment centre→centre aux bordures des rectangles de nœuds. */
function clipToNodeEdges(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { sx: number; sy: number; ex: number; ey: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return null;
  const len = Math.hypot(dx, dy);
  // Fractions du segment pour sortir du rectangle source / toucher la cible.
  const tx = dx !== 0 ? NODE_W / 2 / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? NODE_H / 2 / Math.abs(dy) : Infinity;
  const tOut = Math.min(tx, ty);
  const tIn = 1 - tOut;
  if (tOut >= tIn) return null; // rectangles superposés
  const gap = 4; // marge avant la pointe de flèche
  const tEnd = Math.max(tOut, tIn - gap / len);
  return {
    sx: x1 + dx * tOut,
    sy: y1 + dy * tOut,
    ex: x1 + dx * tEnd,
    ey: y1 + dy * tEnd,
  };
}

interface TemplatePreviewProps {
  data: ArchitectureData;
  /** Hauteur du cadre en pixels (la largeur est fluide). */
  height?: number;
  /** Affiche les libellés des zones (aperçu détaillé uniquement). */
  showZoneLabels?: boolean;
}

export function TemplatePreview({
  data,
  height = 140,
  showZoneLabels = false,
}: TemplatePreviewProps) {
  const markerId = `tpl-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));

  // Boîte englobante des nœuds et des zones → viewBox.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const z of data.zones) {
    consider(z.position.x, z.position.y);
    consider(z.position.x + z.size.width, z.position.y + z.size.height);
  }
  for (const n of data.nodes) {
    consider(n.position.x, n.position.y);
    consider(n.position.x + NODE_W, n.position.y + NODE_H);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 400;
    maxY = 200;
  }
  const vbX = minX - PAD;
  const vbY = minY - PAD;
  const vbW = maxX - minX + PAD * 2;
  const vbH = maxY - minY + PAD * 2;

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        role="img"
        aria-label="Aperçu de l'architecture"
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" className="fill-muted-foreground/60 dark:fill-muted-foreground/80" />
          </marker>
        </defs>

        {/* Zones — rectangles pointillés teintés */}
        {data.zones.map((z) => {
          const hex = ZONE_HEX[z.color] ?? "#6366f1";
          return (
            <g key={`zone-${z.id}`}>
              <rect
                x={z.position.x}
                y={z.position.y}
                width={z.size.width}
                height={z.size.height}
                rx={10}
                fill={hex}
                fillOpacity={0.07}
                stroke={hex}
                strokeOpacity={0.45}
                strokeWidth={1}
                strokeDasharray="6 4"
              />
              {showZoneLabels && (
                <text
                  x={z.position.x + 12}
                  y={z.position.y + 17}
                  fontSize={11}
                  fontWeight={500}
                  fill={hex}
                  fillOpacity={0.85}
                >
                  {z.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Connexions — lignes fléchées centre à centre, coupées aux bordures */}
        {data.edges.map((e) => {
          const s = nodeById.get(e.source);
          const t = nodeById.get(e.target);
          if (!s || !t) return null;
          const clipped = clipToNodeEdges(
            s.position.x + NODE_W / 2,
            s.position.y + NODE_H / 2,
            t.position.x + NODE_W / 2,
            t.position.y + NODE_H / 2,
          );
          if (!clipped) return null;
          return (
            <line
              key={`edge-${e.id}`}
              x1={clipped.sx}
              y1={clipped.sy}
              x2={clipped.ex}
              y2={clipped.ey}
              strokeWidth={1.4}
              className="stroke-muted-foreground/50 dark:stroke-muted-foreground/75"
              markerEnd={`url(#${markerId})`}
            />
          );
        })}

        {/* Nœuds — petits rectangles avec logo de marque ou point coloré */}
        {data.nodes.map((n) => {
          const component = getComponentById(n.componentId);
          const category = component?.category;
          const hex = (category && CATEGORY_HEX[category]) || "#64748b";
          const brand = getComponentLogo(n.componentId);
          return (
            <g key={`node-${n.id}`}>
              <rect
                x={n.position.x}
                y={n.position.y}
                width={NODE_W}
                height={NODE_H}
                rx={7}
                strokeWidth={1}
                className="fill-card stroke-muted-foreground/45 dark:fill-muted-foreground/25 dark:stroke-muted-foreground/85"
              />
              {brand ? (
                // Logo de marque 11×11 (viewBox 24) centré sur l'ancien point.
                <path
                  d={brand.path}
                  fill={brand.color}
                  className={brandDarkClass(brand.darkMode)}
                  transform={`translate(${n.position.x + 9.5}, ${n.position.y + NODE_H / 2 - 5.5}) scale(${11 / 24})`}
                />
              ) : (
                <circle
                  cx={n.position.x + 15}
                  cy={n.position.y + NODE_H / 2}
                  r={4}
                  fill={hex}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
