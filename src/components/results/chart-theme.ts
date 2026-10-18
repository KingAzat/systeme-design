/**
 * SystemLab — thème commun des graphiques Recharts (vues résultats & comparaison).
 *
 * Palette hexadécimale stable (lisible en clair comme en sombre), grille rgba
 * neutre et textes d'axes pilotés par les tokens CSS (var(--muted-foreground))
 * via la feuille CHARTS_CSS injectée par les vues.
 */
import type { CSSProperties } from "react";

/** Palette graphique SystemLab (mapping local de var(--chart-1…5)). */
export const CHART_HEX = {
  indigo: "#4F46E5",
  success: "#16A34A",
  warning: "#D97706",
  destructive: "#DC2626",
  info: "#0284C7",
} as const;

/** Cycle de couleurs pour les séries multiples (files, utilisation par nœud). */
export const SERIES_PALETTE: readonly string[] = [
  CHART_HEX.indigo,
  CHART_HEX.info,
  CHART_HEX.warning,
  CHART_HEX.destructive,
  CHART_HEX.success,
];

/** Grille discrète, identique dans les deux thèmes. */
export const GRID_STROKE = "rgba(100, 116, 139, 0.25)";

export const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
  boxShadow: "0 8px 24px rgba(15, 20, 32, 0.14)",
  padding: "8px 12px",
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "var(--muted-foreground)",
  marginBottom: 4,
  fontWeight: 500,
};

export const TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "var(--foreground)",
  padding: 0,
};

/**
 * Style injecté une seule fois par vue : les ticks et légendes Recharts
 * héritent des tokens de thème (variables CSS), donc suivent le mode sombre.
 */
export const CHARTS_CSS = `
.sl-charts .recharts-cartesian-axis-tick text { fill: var(--muted-foreground); font-size: 11px; }
.sl-charts .recharts-cartesian-axis-line,
.sl-charts .recharts-cartesian-axis-tick-line { stroke: var(--border); }
.sl-charts .recharts-legend-item { font-size: 12px; }
.sl-charts .recharts-legend-item-text { color: var(--foreground) !important; }
.sl-charts .recharts-tooltip-wrapper { outline: none; }
`;

/** Axe X temporel : t (secondes simulées) → « 42 s ». */
export function formatTickSeconds(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)} s`;
}
