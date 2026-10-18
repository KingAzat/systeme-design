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
  RefreshCw,
  Rocket,
  Timer,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { NodeMetrics, SimulationResult } from "@/types";
import { useAppStore } from "@/stores/app-store";
import { useSimulationStore } from "@/stores/simulation-store";
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
import { CHARTS_CSS } from "./chart-theme";
import { DiagnosticsSection } from "./diagnostics-section";
import { KpiCard } from "./kpi-card";
import { LoadMap } from "./load-map";
import { NodeMetricsTable } from "./node-metrics-table";
import { ResultsCharts } from "./time-charts";

function modeLabel(mode: SimulationResult["mode"]): string {
  return mode === "event-sampled" ? "Simulation événementielle" : "Estimation analytique";
}

function modePhrase(mode: SimulationResult["mode"]): string {
  return mode === "event-sampled" ? "événementielle échantillonnée" : "analytique";
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
  const simStatus = useSimulationStore((s) => s.status);
  const runSimulation = useSimulationStore((s) => s.run);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  /* ---------- État vide ---------- */
  if (!currentResult) {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-center gap-5 p-6 py-28 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl border bg-card shadow-sm">
          <Inbox className="size-8 text-muted-foreground" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">Aucun résultat</h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Aucun résultat — lancez une simulation depuis l&apos;éditeur pour afficher ici le
            débit, les latences, la carte de charge et les diagnostics.
          </p>
        </div>
        <Button onClick={() => setView("editor")}>
          <Rocket className="size-4" />
          Ouvrir l&apos;éditeur
        </Button>
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

  const handleRerun = async () => {
    if (running) return;
    try {
      await runSimulation(
        {
          name: r.architectureName,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          zones: snapshot.zones,
          scenario,
        },
        r.architectureId !== "local" ? r.architectureId : null,
      );
    } catch (error) {
      toast.error("Relance impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue du moteur.",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] p-6 pb-16">
      <style>{CHARTS_CSS}</style>

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
          <Button variant="outline" size="sm" onClick={() => openCompare(r, r)}>
            <GitCompare className="size-4" />
            Comparer
          </Button>
          <Button variant="outline" size="sm" onClick={() => setView("history")}>
            <History className="size-4" />
            Historique
          </Button>
        </div>
      </header>

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
            accent={overall.p95Ms > 800 ? "warning" : "default"}
            sub={overall.p95Ms > 800 ? "Au-delà de l'objectif de 800 ms" : "Objectif : < 800 ms"}
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
            accent={overall.errorRate > 0.02 ? "destructive" : "default"}
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
              (maxUtilNode?.utilizationMax ?? 0) >= 0.85
                ? "destructive"
                : (maxUtilNode?.utilizationMax ?? 0) >= 0.6
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
          Cliquez sur un en-tête pour trier ; cliquez sur une ligne (ou un nœud de la carte) pour
          la mettre en évidence.
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
    </div>
  );
}
