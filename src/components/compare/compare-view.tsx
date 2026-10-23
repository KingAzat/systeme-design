"use client";

/**
 * SystemLab — vue Comparaison A/B de deux simulations archivées.
 * Sélecteur si compareA/compareB absents, sinon tableau comparatif,
 * graphiques côte à côte et résumé des compromis généré depuis les deltas.
 */
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  CloudOff,
  GitCompare,
  Inbox,
  RefreshCw,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OverallMetrics, SimulationResult } from "@/types";
import { useAppStore } from "@/stores/app-store";
import { storage } from "@/lib/persistence";
import {
  formatCost,
  formatDateTime,
  formatMs,
  formatPercent,
  formatRequests,
  formatRps,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { RESULT_MODE_PHRASES } from "@/lib/labels";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricRow, type DeltaTone } from "./metric-row";
import {
  CHART_HEX,
  GRID_STROKE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "../results/chart-theme";

/* ============================================================
 * Définitions des métriques comparées
 * ============================================================ */

type Direction = "higher" | "lower" | "neutral";

/** Clés numériques de OverallMetrics (exclut bottleneckNodeId). */
type NumericMetricKey = {
  [K in keyof OverallMetrics]: OverallMetrics[K] extends number ? K : never;
}[keyof OverallMetrics];

interface MetricDef {
  key: NumericMetricKey;
  label: string;
  format: (n: number) => string;
  direction: Direction;
  deltaFormat: (n: number) => string;
}

const sign = (n: number): string => (n > 0 ? "+" : n < 0 ? "−" : "±");

const signed =
  (fmt: (n: number) => string) =>
  (n: number): string =>
    `${sign(n)}${fmt(Math.abs(n))}`;

const points = (n: number): string =>
  `${sign(n)}${(Math.abs(n) * 100).toFixed(1).replace(".", ",")} pt`;

const METRICS: MetricDef[] = [
  { key: "servedRps", label: "Débit traité", format: formatRps, direction: "higher", deltaFormat: signed(formatRps) },
  { key: "inputRps", label: "Débit entrant", format: formatRps, direction: "higher", deltaFormat: signed(formatRps) },
  { key: "latencyAvgMs", label: "Latence moyenne", format: formatMs, direction: "lower", deltaFormat: signed(formatMs) },
  { key: "p50Ms", label: "Latence p50", format: formatMs, direction: "lower", deltaFormat: signed(formatMs) },
  { key: "p95Ms", label: "Latence p95", format: formatMs, direction: "lower", deltaFormat: signed(formatMs) },
  { key: "p99Ms", label: "Latence p99", format: formatMs, direction: "lower", deltaFormat: signed(formatMs) },
  { key: "errorRate", label: "Taux d'erreur", format: formatPercent, direction: "lower", deltaFormat: points },
  { key: "rejectedRequests", label: "Requêtes rejetées", format: formatRequests, direction: "lower", deltaFormat: signed(formatRequests) },
  { key: "availability", label: "Disponibilité", format: formatPercent, direction: "higher", deltaFormat: points },
  { key: "costPerMonthUsd", label: "Coût estimé", format: formatCost, direction: "lower", deltaFormat: signed(formatCost) },
  { key: "totalRequests", label: "Requêtes totales", format: formatRequests, direction: "neutral", deltaFormat: signed(formatRequests) },
];

function toneOf(def: MetricDef, a: number, b: number): DeltaTone {
  if (def.direction === "neutral") return "neutral";
  const diff = b - a;
  if (Math.abs(diff) < 1e-9) return "neutral";
  const better = def.direction === "higher" ? diff > 0 : diff < 0;
  return better ? "better" : "worse";
}

/* ============================================================
 * Résumé des compromis (règles simples, déterministe)
 * ============================================================ */

interface SummaryAxis {
  key: NumericMetricKey;
  label: string;
  direction: "higher" | "lower";
  unit: "pct" | "points";
}

const SUMMARY_AXES: SummaryAxis[] = [
  { key: "latencyAvgMs", label: "la latence moyenne", direction: "lower", unit: "pct" },
  { key: "p95Ms", label: "la latence p95", direction: "lower", unit: "pct" },
  { key: "errorRate", label: "le taux d'erreur", direction: "lower", unit: "points" },
  { key: "rejectedRequests", label: "les requêtes rejetées", direction: "lower", unit: "pct" },
  { key: "servedRps", label: "le débit traité", direction: "higher", unit: "pct" },
  { key: "availability", label: "la disponibilité", direction: "higher", unit: "points" },
  { key: "costPerMonthUsd", label: "le coût estimé", direction: "lower", unit: "pct" },
];

function joinFr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function buildTradeoffSummary(a: SimulationResult, b: SimulationResult): string[] {
  const improved: string[] = [];
  const degraded: string[] = [];

  for (const axis of SUMMARY_AXES) {
    const va = a.overall[axis.key];
    const vb = b.overall[axis.key];
    const diff = vb - va;
    if (Math.abs(diff) < 1e-12) continue;
    const pct = va !== 0 ? diff / Math.abs(va) : null;
    if (axis.unit === "pct") {
      if (pct === null ? Math.abs(diff) < 1e-9 : Math.abs(pct) < 0.03) continue;
    } else if (Math.abs(diff) < 0.001) continue;

    const change =
      axis.unit === "pct"
        ? pct !== null
          ? `${Math.round(Math.abs(pct) * 100)} %`
          : formatRequests(Math.abs(diff))
        : `${(Math.abs(diff) * 100).toFixed(1).replace(".", ",")} points`;
    const item = `${axis.label} de ${change}`;
    const better = axis.direction === "higher" ? diff > 0 : diff < 0;
    (better ? improved : degraded).push(item);
  }

  const sentences: string[] = [];
  if (improved.length > 0 && degraded.length > 0) {
    sentences.push(
      `La version B améliore ${joinFr(improved)} mais dégrade ${joinFr(degraded)}.`,
    );
  } else if (improved.length > 0) {
    sentences.push(
      `La version B améliore ${joinFr(improved)} sans dégradation notable des autres indicateurs.`,
    );
  } else if (degraded.length > 0) {
    sentences.push(
      `La version B dégrade ${joinFr(degraded)} sans gain mesurable sur les autres indicateurs.`,
    );
  } else {
    sentences.push(
      "Les deux versions affichent des écarts non significatifs (< 3 %) sur l'ensemble des indicateurs suivis.",
    );
  }

  const p95Better = b.overall.p95Ms < a.overall.p95Ms;
  const costBetter = b.overall.costPerMonthUsd < a.overall.costPerMonthUsd;
  if (p95Better && costBetter) {
    sentences.push(
      "Verdict : la version B domine à la fois en latence et en coût — elle peut remplacer la version A.",
    );
  } else if (!p95Better && !costBetter) {
    sentences.push(
      "Verdict : la version A reste préférable sur la latence et le coût.",
    );
  } else if (p95Better) {
    sentences.push(
      "Verdict : le gain de latence se paie par un coût supérieur — pertinente si la priorité est la performance.",
    );
  } else {
    sentences.push(
      "Verdict : l'économie réalisée se paie en latence — pertinente si la priorité est le budget.",
    );
  }
  return sentences;
}

/* ============================================================
 * Écran de sélection (compareA ou compareB absent)
 * ============================================================ */

function CompareSelector() {
  const simulations = useAppStore((s) => s.simulations);
  const simulationsLoading = useAppStore((s) => s.simulationsLoading);
  const simulationsError = useAppStore((s) => s.simulationsError);
  const refreshSimulations = useAppStore((s) => s.refreshSimulations);
  const openCompare = useAppStore((s) => s.openCompare);
  const setView = useAppStore((s) => s.setView);
  const goBack = useAppStore((s) => s.goBack);
  const viewHistory = useAppStore((s) => s.viewHistory);

  const [idA, setIdA] = useState<string>("");
  const [idB, setIdB] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Garde !loading (lecture fraîche via getState) : évite de relancer un
  // chargement déjà en cours — le shell précharge au montage.
  useEffect(() => {
    const s = useAppStore.getState();
    if (s.simulations.length === 0 && !s.simulationsLoading) {
      void s.refreshSimulations();
    }
  }, [simulations.length, refreshSimulations]);

  const selectedA = simulations.find((s) => s.id === idA);
  const selectedB = simulations.find((s) => s.id === idB);

  const handleCompare = async () => {
    if (!idA || !idB || loading) return;
    setLoading(true);
    try {
      const [resultA, resultB] = await Promise.all([
        storage.simulations.get(idA),
        storage.simulations.get(idB),
      ]);
      if (!resultA || !resultB) {
        toast.error("Simulation introuvable", {
          description: "Elle a peut-être été supprimée — actualisez la liste.",
        });
        return;
      }
      openCompare(resultA, resultB);
    } catch (error) {
      toast.error("Comparaison impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderColumn = (tag: "A" | "B") => {
    const value = tag === "A" ? idA : idB;
    const other = tag === "A" ? idB : idA;
    const setValue = tag === "A" ? setIdA : setIdB;
    const selected = tag === "A" ? selectedA : selectedB;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Version {tag}
        </p>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choisir une simulation archivée…" />
          </SelectTrigger>
          <SelectContent>
            {simulations.map((sim) => (
              <SelectItem key={sim.id} value={sim.id} disabled={sim.id === other}>
                {sim.architectureName} · seed {sim.seed} · {formatDateTime(sim.createdAt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected ? (
          <p className="text-xs text-muted-foreground">
            {formatRps(selected.overall.servedRps)} · p95 {formatMs(selected.overall.p95Ms)} ·{" "}
            {formatPercent(selected.overall.errorRate)} d&apos;erreurs ·{" "}
            {formatCost(selected.overall.costPerMonthUsd)}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] p-6 pb-16">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparaison d&apos;architectures</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sélectionnez deux simulations archivées pour comparer leurs métriques côte à côte.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshSimulations()}
            disabled={simulationsLoading}
          >
            <RefreshCw className={simulationsLoading ? "size-4 animate-spin" : "size-4"} />
            Actualiser
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (viewHistory.length > 0 ? goBack() : setView("history"))}
          >
            <ArrowLeft className="size-4" />
            Retour
          </Button>
        </div>
      </header>

      {simulationsError ? (
        <div className="mt-16 flex justify-center">
          <div className="w-full max-w-md">
            <Alert variant="destructive" role="alert">
              <CloudOff aria-hidden />
              <AlertTitle>Serveur local injoignable</AlertTitle>
              <AlertDescription>
                Les simulations n&apos;ont pas pu être chargées — vos archives ne sont
                pas perdues. Réessayez plus tard.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      ) : simulationsLoading && simulations.length === 0 ? (
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : simulations.length === 0 ? (
        <EmptyState
          icon={Inbox}
          className="mt-16"
          title="Aucune simulation archivée"
          description="Lancez au moins deux simulations depuis l'éditeur pour pouvoir les comparer."
          action={<Button onClick={() => setView("editor")}>Ouvrir l&apos;éditeur</Button>}
        />
      ) : (
        <>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {renderColumn("A")}
            {renderColumn("B")}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button onClick={handleCompare} disabled={!idA || !idB || loading}>
              {loading ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <GitCompare className="size-4" />
              )}
              Comparer
            </Button>
            <p className="text-xs text-muted-foreground">
              {simulations.length} simulation{simulations.length > 1 ? "s" : ""} archivée
              {simulations.length > 1 ? "s" : ""} disponible
              {simulations.length > 1 ? "s" : ""}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
 * Écran de comparaison (A et B présents)
 * ============================================================ */

/* Libellé du mode d'exécution — source unique @/lib/labels. */
function modeLabelShort(mode: SimulationResult["mode"]): string {
  return RESULT_MODE_PHRASES[mode];
}

function truncateName(name: string, max = 20): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function VersionCard({ tag, result, tone }: { tag: string; result: SimulationResult; tone: "a" | "b" }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            tone === "a"
              ? "text-xs font-semibold uppercase tracking-wide text-primary"
              : "text-xs font-semibold uppercase tracking-wide text-info"
          }
        >
          Version {tag}
        </span>
        <span className="font-mono text-xs text-muted-foreground">seed {result.seed}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold" title={result.architectureName}>
        {result.architectureName}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {formatDateTime(result.startedAt)} · {modeLabelShort(result.mode)}
      </p>
    </div>
  );
}

function ComparisonScreen({ a, b }: { a: SimulationResult; b: SimulationResult }) {
  const openCompare = useAppStore((s) => s.openCompare);
  const setView = useAppStore((s) => s.setView);
  const openEditorWithCommand = useAppStore((s) => s.openEditorWithCommand);

  const nameA = truncateName(a.architectureName);
  const nameB = truncateName(b.architectureName);
  const summary = buildTradeoffSummary(a, b);

  const latencyData = [
    { name: "Moyenne", A: a.overall.latencyAvgMs, B: b.overall.latencyAvgMs },
    { name: "p50", A: a.overall.p50Ms, B: b.overall.p50Ms },
    { name: "p95", A: a.overall.p95Ms, B: b.overall.p95Ms },
    { name: "p99", A: a.overall.p99Ms, B: b.overall.p99Ms },
  ];
  const volumeData = [
    { name: "Traités", A: a.overall.servedRequests, B: b.overall.servedRequests },
    { name: "Rejetés", A: a.overall.rejectedRequests, B: b.overall.rejectedRequests },
    { name: "Erreurs", A: a.overall.errorRequests, B: b.overall.errorRequests },
  ];

  const loadInEditor = (result: SimulationResult) => {
    if (result.architectureId && result.architectureId !== "local") {
      openEditorWithCommand({ kind: "open-architecture", architectureId: result.architectureId });
    } else {
      toast.warning("Version non sauvegardée : impossible de la recharger", {
        description: "Cette simulation provient d'une architecture locale non persistée.",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] p-6 pb-16">
      {/* Les règles Recharts (.sl-charts) vivent dans globals.css. */}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparaison d&apos;architectures</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deux simulations confrontées métrique par métrique — les deltas sont orientés
            (vert = la version B progresse sur l&apos;axe).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openCompare(b, a)}>
            <ArrowUpDown className="size-4" />
            Échanger
          </Button>
          <Button variant="outline" size="sm" onClick={() => setView("editor")}>
            <ArrowLeft className="size-4" />
            Retour à l&apos;éditeur
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadInEditor(a)}>
            Charger A dans l&apos;éditeur
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadInEditor(b)}>
            Charger B
          </Button>
        </div>
      </header>

      <div className="mt-6 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <VersionCard tag="A" result={a} tone="a" />
        <div className="flex items-center justify-center">
          <Badge variant="secondary">vs</Badge>
        </div>
        <VersionCard tag="B" result={b} tone="b" />
      </div>

      {/* ---------- Tableau comparatif ---------- */}
      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Métriques comparées</h2>
        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Métrique</TableHead>
                <TableHead className="max-w-[200px] truncate text-right" title={a.architectureName}>
                  {nameA}
                </TableHead>
                <TableHead className="max-w-[200px] truncate text-right" title={b.architectureName}>
                  {nameB}
                </TableHead>
                <TableHead className="text-right">Δ (B − A)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRICS.map((def) => {
                const va = a.overall[def.key];
                const vb = b.overall[def.key];
                const diff = vb - va;
                const pct = va !== 0 ? diff / Math.abs(va) : null;
                const relative =
                  pct !== null && Math.abs(pct) >= 0.01
                    ? `${pct > 0 ? "+" : "−"}${Math.round(Math.abs(pct) * 100)} %`
                    : undefined;
                return (
                  <MetricRow
                    key={def.key}
                    label={def.label}
                    valueA={def.format(va)}
                    valueB={def.format(vb)}
                    delta={def.deltaFormat(diff)}
                    relative={relative}
                    tone={toneOf(def, va, vb)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ---------- Graphiques ---------- */}
      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Graphiques</h2>
        <div className="sl-charts grid gap-4 lg:grid-cols-2">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm font-semibold">Latences (ms)</CardTitle>
              <CardDescription className="text-xs">
                Moyenne et percentiles par version.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <div
                className="h-[240px]"
                role="img"
                aria-label="Comparaison des latences par version, en millisecondes : moyenne et percentiles p50, p95 et p99"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latencyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis
                      width={56}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => formatMs(Number(v))}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={{ fill: "rgba(100, 116, 139, 0.08)" }}
                      formatter={(value, name) => [formatMs(Number(value)), name]}
                    />
                    <Legend iconType="circle" iconSize={9} />
                    <Bar dataKey="A" name={nameA} fill={CHART_HEX.indigo} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="B" name={nameB} fill={CHART_HEX.info} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm font-semibold">Volumétrie (requêtes)</CardTitle>
              <CardDescription className="text-xs">
                Requêtes traitées, rejetées et en erreur par version.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <div
                className="h-[240px]"
                role="img"
                aria-label="Comparaison de la volumétrie par version, en nombre de requêtes : traitées, rejetées et en erreur"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis
                      width={56}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => formatRequests(Number(v))}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={{ fill: "rgba(100, 116, 139, 0.08)" }}
                      formatter={(value, name) => [formatRequests(Number(value)), name]}
                    />
                    <Legend iconType="circle" iconSize={9} />
                    <Bar dataKey="A" name={nameA} fill={CHART_HEX.indigo} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="B" name={nameB} fill={CHART_HEX.info} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------- Résumé des compromis ---------- */}
      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Résumé des compromis</h2>
        <Card className="gap-3 py-4">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Scale className="size-4 text-info" />
              Lecture des écarts
            </CardTitle>
            <CardDescription className="text-xs">
              Généré à partir des deltas entre les deux versions (seuil de significativité : 3 %).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-5">
            {summary.map((sentence, index) => (
              <p
                key={index}
                className={
                  index === summary.length - 1
                    ? "rounded-lg border bg-muted/40 px-4 py-2.5 text-sm font-medium"
                    : "text-sm leading-relaxed text-muted-foreground"
                }
              >
                {sentence}
              </p>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ============================================================
 * Vue publique
 * ============================================================ */

export function CompareView() {
  const compareA = useAppStore((s) => s.compareA);
  const compareB = useAppStore((s) => s.compareB);

  if (!compareA || !compareB) {
    return <CompareSelector />;
  }
  return <ComparisonScreen a={compareA} b={compareB} />;
}
