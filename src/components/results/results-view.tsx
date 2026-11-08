"use client";

/**
 * SystemLab — vue Résultats : KPI, graphiques temporels, carte de charge,
 * métriques par nœud, diagnostics et hypothèses du moteur.
 * Données exclusivement réelles issues de SimulationResult (moteur interne).
 */
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CircleX,
  Gauge,
  GitCompare,
  HeartPulse,
  History,
  Hourglass,
  Inbox,
  Info,
  Loader2,
  RefreshCw,
  Rocket,
  Timer,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { NodeMetrics, SimulationResult, SimulationSummary } from "@/types";
import { useAppStore } from "@/stores/app-store";
import { useSimulationStore } from "@/stores/simulation-store";
import { storage } from "@/lib/persistence";
import {
  RESULT_MODE_LABELS,
  RESULT_MODE_LONG_LABELS,
  RESULT_MODE_PHRASES,
  type ResultMode,
} from "@/lib/labels";
import {
  ERROR_RATE_WARN,
  P95_WARN_MS,
  UTILIZATION_CRITICAL,
  UTILIZATION_WARN,
} from "@/lib/thresholds";
import { EmptyState } from "@/components/shared/empty-state";
import {
  formatCost,
  formatDateTime,
  formatMs,
  formatNumber,
  formatPercent,
  formatRequests,
  formatRps,
} from "@/lib/format";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiagnosticsSection } from "./diagnostics-section";
import { ExerciseGoalsCard } from "./exercise-goals-card";
import { KpiCard } from "./kpi-card";
import { LoadMap } from "./load-map";
import { NodeMetricsTable } from "./node-metrics-table";
import { ResultsCharts } from "./time-charts";

/* Libellés du mode d'exécution — source unique @/lib/labels. */
function modeLabel(mode: ResultMode): string {
  return RESULT_MODE_LONG_LABELS[mode];
}

function modeBadgeLabel(mode: ResultMode): string {
  return RESULT_MODE_LABELS[mode];
}

function modePhrase(mode: ResultMode): string {
  return RESULT_MODE_PHRASES[mode];
}

function maxBy<T>(items: T[], value: (item: T) => number): T | null {
  let best: T | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const v = value(item);
    if (v > bestValue) {
      best = item;
      bestValue = v;
    }
  }
  return best;
}

export function ResultsView() {
  const currentResult = useAppStore((s) => s.currentResult);
  const setView = useAppStore((s) => s.setView);
  const openCompare = useAppStore((s) => s.openCompare);
  const simulations = useAppStore((s) => s.simulations);
  const activeExerciseSlug = useAppStore((s) => s.activeExerciseSlug);
  const simStatus = useSimulationStore((s) => s.status);
  const runSimulation = useSimulationStore((s) => s.run);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Sélection de la simulation à confronter (l'ancien comportement comparait
  // le résultat courant avec lui-même → deltas ±0).
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparingId, setComparingId] = useState<string | null>(null);

  /* ---------- État vide ---------- */
  if (!currentResult) {
    return (
      <div className="mx-auto w-full max-w-[1400px] p-6">
        <EmptyState
          icon={Inbox}
          title="Aucun résultat pour le moment"
          description="Lancez une simulation depuis l'éditeur : débit, latences, carte de charge et diagnostics s'afficheront ici."
          action={
            <Button onClick={() => setView("editor")}>
              <Rocket className="size-4" />
              Ouvrir l&apos;éditeur
            </Button>
          }
          className="py-28"
        />
      </div>
    );
  }

  const r = currentResult;
  const { overall, nodes, scenario, series, snapshot } = r;
  const nodeLabels = new Map(nodes.map((n) => [n.nodeId, n.label]));
  const maxUtilNode = maxBy(nodes, (n: NodeMetrics) => n.utilizationMax);
  const maxQueueNode = maxBy(nodes, (n: NodeMetrics) => n.maxQueueLength);
  const overBudget = overall.costPerMonthUsd > scenario.budgetPerMonthUsd;
  const running = simStatus === "running";

  // Autres simulations comparables : même architecture d'abord, puis plus
  // récentes d'abord. Le résultat courant (même id) est exclu. Calcul hors hook
  // (après l'état vide) : liste ≤ 100 entrées, tri négligeable au rendu.
  const compareCandidates = simulations
    .filter((s) => s.id !== r.id)
    .sort((a, b) => {
      const sameA = a.architectureId === r.architectureId ? 0 : 1;
      const sameB = b.architectureId === r.architectureId ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const handleCompareClick = () => {
    if (simulations.length < 2 || compareCandidates.length === 0) {
      toast.info("Aucune autre simulation à comparer", {
        description:
          "Relancez une simulation pour comparer deux scénarios côte à côte.",
      });
      return;
    }
    setCompareOpen(true);
  };

  const handleChooseCompare = async (summary: SimulationSummary) => {
    if (comparingId) return;
    setComparingId(summary.id);
    try {
      const full = await storage.simulations.get(summary.id);
      if (!full) {
        toast.error("Simulation introuvable", {
          description: "Elle a peut-être été supprimée — actualisez l'historique.",
        });
        return;
      }
      setCompareOpen(false);
      openCompare(r, full);
    } catch (error) {
      toast.error("Comparaison impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setComparingId(null);
    }
  };

  const handleRerun = async () => {
    if (running) return;
    try {
      // Une relance conserve le contexte d'exercice : les critères du cours
      // restent évalués après la nouvelle exécution.
      await runSimulation(
        {
          name: r.architectureName,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          zones: snapshot.zones,
          scenario,
        },
        r.architectureId !== "local" ? r.architectureId : null,
        activeExerciseSlug,
      );
    } catch (error) {
      toast.error("Relance impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue du moteur.",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] p-6 pb-16">
      {/* Les règles Recharts (.sl-charts) vivent dans globals.css. */}

      {/* ---------- En-tête ---------- */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            Résultats — {r.architectureName}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <Activity className="size-3" />
              {modeLabel(r.mode)}
            </Badge>
            {r.samplingRate < 1 ? (
              <Badge variant="secondary">
                Échantillonnage {Math.round(r.samplingRate * 100)} %
              </Badge>
            ) : null}
            <Badge variant="outline" className="font-mono">
              seed {r.seed}
            </Badge>
            <Badge variant="secondary">
              <CalendarClock className="size-3" />
              {formatDateTime(r.startedAt)}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("editor")}>
            <ArrowLeft className="size-4" />
            Retour à l&apos;éditeur
          </Button>
          <Button variant="outline" size="sm" onClick={handleRerun} disabled={running}>
            <RefreshCw className={running ? "size-4 animate-spin" : "size-4"} />
            Relancer
          </Button>
          <Button variant="outline" size="sm" onClick={handleCompareClick}>
            <GitCompare className="size-4" />
            Comparer
          </Button>
          <Button variant="outline" size="sm" onClick={() => setView("history")}>
            <History className="size-4" />
            Historique
          </Button>
        </div>
      </header>

      {/* ---------- Objectifs de l'exercice (si lancé depuis un cours) ---------- */}
      <ExerciseGoalsCard result={r} />

      {/* ---------- KPI ---------- */}
      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Indicateurs clés</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            icon={Activity}
            label="Débit traité"
            value={formatRps(overall.servedRps)}
            sub={`Entrant : ${formatRps(overall.inputRps)}`}
          />
          <KpiCard
            icon={Timer}
            label="Latence moyenne"
            value={formatMs(overall.latencyAvgMs)}
            sub="Latence de bout en bout"
          />
          <KpiCard
            icon={Timer}
            label="Latence p50"
            value={formatMs(overall.p50Ms)}
            sub="Médiane observée"
          />
          <KpiCard
            icon={Gauge}
            label="Latence p95"
            value={formatMs(overall.p95Ms)}
            accent={overall.p95Ms > P95_WARN_MS ? "warning" : "default"}
            sub={
              overall.p95Ms > P95_WARN_MS
                ? `Au-delà de l'objectif de ${P95_WARN_MS} ms`
                : `Objectif : < ${P95_WARN_MS} ms`
            }
          />
          <KpiCard
            icon={Hourglass}
            label="Latence p99"
            value={formatMs(overall.p99Ms)}
            sub="1 % des requêtes au-delà"
          />
          <KpiCard
            icon={TriangleAlert}
            label="Taux d'erreur"
            value={formatPercent(overall.errorRate)}
            accent={overall.errorRate > ERROR_RATE_WARN ? "destructive" : "default"}
            sub={`${formatNumber(overall.errorRequests)} requêtes en erreur`}
          />
          <KpiCard
            icon={CircleX}
            label="Requêtes rejetées"
            value={formatRequests(overall.rejectedRequests)}
            sub={`Sur ${formatRequests(overall.totalRequests)} requêtes entrantes`}
          />
          <KpiCard
            icon={HeartPulse}
            label="Disponibilité"
            value={formatPercent(overall.availability)}
            accent={
              overall.availability >= 0.999
                ? "success"
                : overall.availability < 0.99
                  ? "destructive"
                  : "warning"
            }
            sub="Sur la fenêtre simulée"
          />
          <KpiCard
            icon={Gauge}
            label="Utilisation max"
            value={formatPercent(maxUtilNode?.utilizationMax ?? 0)}
            sub={maxUtilNode ? `Nœud : ${maxUtilNode.label}` : undefined}
            accent={
              (maxUtilNode?.utilizationMax ?? 0) >= UTILIZATION_CRITICAL
                ? "destructive"
                : (maxUtilNode?.utilizationMax ?? 0) >= UTILIZATION_WARN
                  ? "warning"
                  : "default"
            }
          />
          <KpiCard
            icon={Wallet}
            label="Coût estimé"
            value={formatCost(overall.costPerMonthUsd)}
            sub={`Budget : ${formatCost(scenario.budgetPerMonthUsd)}`}
            accent={overBudget ? "destructive" : "default"}
            badge={
              overBudget ? (
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                  Budget dépassé
                </Badge>
              ) : (
                <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                  Budget OK
                </Badge>
              )
            }
          />
          <KpiCard
            icon={Hourglass}
            label="Files d'attente max"
            value={formatNumber(maxQueueNode?.maxQueueLength ?? 0)}
            sub={maxQueueNode ? `Nœud : ${maxQueueNode.label}` : "Aucune file observée"}
          />
        </div>
      </section>

      {/* ---------- Graphiques temporels ---------- */}
      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Évolution temporelle</h2>
        <div className="sl-charts">
          <ResultsCharts series={series} nodeLabels={nodeLabels} />
        </div>
      </section>

      {/* ---------- Carte de charge ---------- */}
      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Architecture simulée</h2>
        <LoadMap result={r} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
      </section>

      {/* ---------- Métriques par nœud ---------- */}
      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Métriques par nœud</h2>
        <NodeMetricsTable
          nodes={nodes}
          bottleneckNodeId={overall.bottleneckNodeId}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
        <p className="text-xs text-muted-foreground">
          Cliquez sur un en-tête pour trier ; cliquez sur une ligne (ou un nœud de la carte,
          au clavier comme à la souris) pour la mettre en évidence.
        </p>
      </section>

      {/* ---------- Diagnostics ---------- */}
      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Diagnostics</h2>
        <DiagnosticsSection diagnostics={r.diagnostics} />
      </section>

      {/* ---------- Hypothèses du modèle ---------- */}
      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Transparence du modèle</h2>
        <Card className="gap-0 py-0">
          <Accordion type="single" collapsible>
            <AccordionItem value="hypotheses" className="border-b-0">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Info className="size-4 text-info" />
                  Hypothèses du modèle ({r.hypotheses.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                  {r.hypotheses.map((hypothesis, index) => (
                    <li key={index}>{hypothesis}</li>
                  ))}
                </ul>
                <p className="mt-4 rounded-lg border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  Ces résultats proviennent du moteur de simulation interne SystemLab
                  v{r.engineVersion} — mode {modePhrase(r.mode)},{" "}
                  {formatRequests(r.requestsSimulated)} requêtes simulées (échantillonnage{" "}
                  {Math.round(r.samplingRate * 100)} %).
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>
      </section>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Simulation locale — aucune donnée réelle n&apos;a été mesurée.
      </p>

      {/* ---------- Sélection de la simulation à comparer ---------- */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comparer avec…</DialogTitle>
            <DialogDescription>
              Choisissez une autre simulation archivée à confronter à «&nbsp;{r.architectureName}
              &nbsp;». Les simulations de la même architecture sont proposées en premier.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {compareCandidates.map((sim) => (
              <button
                key={sim.id}
                type="button"
                disabled={comparingId !== null}
                onClick={() => void handleChooseCompare(sim)}
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{sim.architectureName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3" aria-hidden />
                      {formatDateTime(sim.createdAt)}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="font-mono">seed {sim.seed}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge
                    variant="outline"
                    className={
                      sim.mode === "analytical"
                        ? "border-info/40 bg-info/10 font-normal text-info"
                        : "border-primary/30 bg-primary/10 font-normal text-primary"
                    }
                  >
                    {modeBadgeLabel(sim.mode)}
                  </Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    p95 {formatMs(sim.overall.p95Ms)} · {formatPercent(sim.overall.availability)}
                  </span>
                </div>
                {comparingId === sim.id && (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
