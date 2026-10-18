"use client";

/**
 * SystemLab — graphiques temporels des résultats (Recharts).
 * Débit, latence, erreurs, files d'attente et utilisation par nœud.
 * Couleurs via chart-theme (hex stables), textes via tokens CSS (CHARTS_CSS).
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import type { SimulationSeries, TimePoint } from "@/types";
import { formatMs, formatNumber, formatPercent, formatRps } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHART_HEX,
  formatTickSeconds,
  GRID_STROKE,
  SERIES_PALETTE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./chart-theme";

/** Clés dynamiques (nodeId) présentes dans une série, hors « t », 5 max. */
function seriesKeys(points: TimePoint[]): string[] {
  const keys = new Set<string>();
  for (const point of points) {
    for (const key of Object.keys(point)) {
      if (key !== "t") keys.add(key);
    }
  }
  return [...keys].slice(0, 5);
}

function ChartCard({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty?: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        {empty ? (
          <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <div className="h-[240px]">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

const MARGIN = { top: 8, right: 12, left: 0, bottom: 0 } as const;

export interface ResultsChartsProps {
  series: SimulationSeries;
  /** nodeId → label affiché dans les légendes (files / utilisation). */
  nodeLabels: Map<string, string>;
}

export function ResultsCharts({ series, nodeLabels }: ResultsChartsProps) {
  const queueKeys = seriesKeys(series.queues);
  const utilKeys = seriesKeys(series.utilization);
  const labelOf = (id: string): string => nodeLabels.get(id) ?? id;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 1. Débit */}
      <ChartCard
        title="Débit (req/s)"
        description="Trafic entrant, servi et rejeté au fil du temps simulé."
        empty={series.throughput.length === 0 ? "Aucune donnée de débit." : undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series.throughput} margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={formatTickSeconds}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatRps(Number(v))}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ stroke: GRID_STROKE }}
              formatter={(value, name) => [formatRps(Number(value)), name]}
              labelFormatter={(label) => `t = ${formatTickSeconds(label)}`}
            />
            <Legend iconType="circle" iconSize={9} />
            <Area
              type="monotone"
              dataKey="inputRps"
              name="Entrant"
              stroke={CHART_HEX.info}
              fill={CHART_HEX.info}
              fillOpacity={0.12}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="servedRps"
              name="Traité"
              stroke={CHART_HEX.success}
              fill={CHART_HEX.success}
              fillOpacity={0.16}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="rejectedRps"
              name="Rejeté"
              stroke={CHART_HEX.destructive}
              fill={CHART_HEX.destructive}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 2. Latence */}
      <ChartCard
        title="Latence de bout en bout (ms)"
        description="Latence moyenne et p95 par intervalle simulé (p95 en pointillés)."
        empty={series.latency.length === 0 ? "Aucune donnée de latence." : undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series.latency} margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={formatTickSeconds}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatMs(Number(v))}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(value, name) => [formatMs(Number(value)), name]}
              labelFormatter={(label) => `t = ${formatTickSeconds(label)}`}
            />
            <Legend iconType="plainline" iconSize={14} />
            <Line
              type="monotone"
              dataKey="avgMs"
              name="Moyenne"
              stroke={CHART_HEX.indigo}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="p95Ms"
              name="p95"
              stroke={CHART_HEX.warning}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 3. Erreurs & rejets */}
      <ChartCard
        title="Erreurs et rejets (requêtes)"
        description="Volumes cumulés par intervalle : requêtes en erreur et requêtes rejetées."
        empty={series.errors.length === 0 ? "Aucune erreur ni rejet observé." : undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series.errors} margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={formatTickSeconds}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(Number(v))}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ fill: "rgba(100, 116, 139, 0.08)" }}
              formatter={(value, name) => [formatNumber(Number(value)), name]}
              labelFormatter={(label) => `t = ${formatTickSeconds(label)}`}
            />
            <Legend iconType="circle" iconSize={9} />
            <Bar
              dataKey="errors"
              name="Erreurs"
              stackId="volumes"
              fill={CHART_HEX.destructive}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              dataKey="rejects"
              name="Rejets"
              stackId="volumes"
              fill={CHART_HEX.warning}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 4. Files d'attente */}
      <ChartCard
        title="Files d'attente (longueur)"
        description="Longueur de file des nœuds les plus sollicités (5 max)."
        empty={
          queueKeys.length === 0
            ? "Aucune file d'attente observée — les nœuds absorbent la charge."
            : undefined
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series.queues} margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={formatTickSeconds}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={(v) => formatNumber(Number(v))}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(value, name) => [formatNumber(Number(value)), name]}
              labelFormatter={(label) => `t = ${formatTickSeconds(label)}`}
            />
            <Legend iconType="plainline" iconSize={14} />
            {queueKeys.map((nodeId, index) => (
              <Line
                key={nodeId}
                type="monotone"
                dataKey={nodeId}
                name={labelOf(nodeId)}
                stroke={SERIES_PALETTE[index % SERIES_PALETTE.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 5. Utilisation par nœud */}
      <ChartCard
        title="Utilisation par nœud (%)"
        description="Fraction de capacité utilisée pour les nœuds les plus chargés (hors générateurs)."
        empty={
          utilKeys.length === 0
            ? "Aucune donnée d'utilisation disponible."
            : undefined
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series.utilization} margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={formatTickSeconds}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              width={48}
              domain={[0, 1]}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatPercent(Number(v), 0)}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              formatter={(value, name) => [formatPercent(Number(value)), name]}
              labelFormatter={(label) => `t = ${formatTickSeconds(label)}`}
            />
            <Legend iconType="plainline" iconSize={14} />
            {utilKeys.map((nodeId, index) => (
              <Line
                key={nodeId}
                type="monotone"
                dataKey={nodeId}
                name={labelOf(nodeId)}
                stroke={SERIES_PALETTE[index % SERIES_PALETTE.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
