"use client";

/**
 * SystemLab — Panneau de configuration (droite).
 * Nœud sélectionné : onglets Configuration / Performance / Apprentissage.
 * Connexion sélectionnée : protocole, latence, bande passante.
 * Zone sélectionnée : libellé, couleur, dimensions.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleHelp,
  Info,
  LayoutGrid,
  Link2,
  Minus,
  MousePointerClick,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryStyle } from "@/lib/icons";
import {
  formatCost,
  formatMs,
  formatNumber,
  formatPercent,
  formatRps,
} from "@/lib/format";
import { estimateArchitecture, type NodeEstimate } from "@/engine";
import { getComponentById } from "@/data/catalog/registry";
import { useEditorStore } from "@/stores/editor-store";
import { useSimulationStore } from "@/stores/simulation-store";
import type {
  ArchEdge,
  ArchNode,
  CatalogField,
  Protocol,
  ZoneColor,
} from "@/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CatalogIcon } from "../catalog-icon";

/* ------------------------------------------------------------------ */
/* Données statiques                                                   */
/* ------------------------------------------------------------------ */

const PROTOCOL_OPTIONS: { value: Protocol; label: string }[] = [
  { value: "http", label: "HTTP" },
  { value: "https", label: "HTTPS" },
  { value: "tcp", label: "TCP" },
  { value: "grpc", label: "gRPC" },
  { value: "websocket", label: "WebSocket" },
  { value: "amqp", label: "AMQP" },
  { value: "kafka", label: "Kafka" },
  { value: "redis", label: "Redis" },
  { value: "sql", label: "SQL" },
];

const ZONE_COLOR_OPTIONS: { value: ZoneColor; label: string; dot: string }[] = [
  { value: "indigo", label: "Indigo", dot: "bg-indigo-400" },
  { value: "cyan", label: "Cyan", dot: "bg-cyan-400" },
  { value: "emerald", label: "Émeraude", dot: "bg-emerald-400" },
  { value: "amber", label: "Ambre", dot: "bg-amber-400" },
  { value: "violet", label: "Violet", dot: "bg-violet-400" },
  { value: "rose", label: "Rose", dot: "bg-rose-400" },
];

function utilizationColor(utilization: number): string {
  if (utilization >= 0.95) return "bg-destructive";
  if (utilization >= 0.8) return "bg-warning";
  return "bg-success";
}

function roundTo(v: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(v * factor) / factor;
}

/* ------------------------------------------------------------------ */
/* Champs réutilisables                                                */
/* ------------------------------------------------------------------ */

function LabelWithHelp({ field }: { field: CatalogField }) {
  return (
    <span className="flex items-center gap-1.5">
      <Label htmlFor={`field-${field.key}`} className="text-xs font-medium">
        {field.label}
      </Label>
      {field.unit && (
        <span className="text-[10px] text-muted-foreground">{field.unit}</span>
      )}
      {field.help && (
        <Tooltip>
          <TooltipTrigger asChild>
            <CircleHelp
              className="size-3.5 cursor-help text-muted-foreground"
              aria-label={`Aide : ${field.label}`}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-56 text-xs">
            {field.help}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

interface NumberInputProps {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
  onCommit: (value: number) => void;
}

/** Saisie numérique avec ± ; commit sur blur/Entrée (les +/- commitent direct). */
function NumberInput({ id, value, min, max, step, ariaLabel, onCommit }: NumberInputProps) {
  const [draft, setDraft] = useState<string>(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onCommit(roundTo(next));
  };

  const stepBy = (direction: 1 | -1) => {
    const s = step ?? 1;
    const current = Number(draft.replace(",", ".")) || 0;
    let next = roundTo(current + direction * s);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    onCommit(next);
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 shrink-0"
        aria-label={`Diminuer ${ariaLabel}`}
        onClick={() => stepBy(-1)}
      >
        <Minus className="size-3" />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(draft);
        }}
        className="h-8 text-center text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 shrink-0"
        aria-label={`Augmenter ${ariaLabel}`}
        onClick={() => stepBy(1)}
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Champ de configuration de nœud                                      */
/* ------------------------------------------------------------------ */

function ConfigField({ node, field }: { node: ArchNode; field: CatalogField }) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const value = node.config[field.key];
  const fieldId = `node-${node.id}-${field.key}`;

  const commit = (next: number | string | boolean) => {
    useEditorStore.getState().updateNodeConfig(node.id, field.key, next);
  };

  if (field.type === "boolean") {
    const checked = Boolean(value);
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <LabelWithHelp field={field} />
        <Switch
          id={fieldId}
          checked={checked}
          onCheckedChange={commit}
          aria-label={field.label}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        <LabelWithHelp field={field} />
        <Select
          value={typeof value === "string" ? value : String(value)}
          onValueChange={(next) => commit(next)}
        >
          <SelectTrigger id={fieldId} className="h-8 w-full" aria-label={field.label}>
            <SelectValue placeholder={field.label} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "text") {
    return (
      <div className="space-y-1.5">
        <LabelWithHelp field={field} />
        <Input
          id={fieldId}
          value={typeof value === "string" ? value : String(value ?? "")}
          onChange={(event) => commit(event.target.value)}
          aria-label={field.label}
          className="h-8"
        />
      </div>
    );
  }

  // type === "number"
  const numeric = typeof value === "number" ? value : Number(value) || 0;
  const hasBounds = field.min !== undefined && field.max !== undefined;
  return (
    <div className="space-y-1.5">
      <LabelWithHelp field={field} />
      <NumberInput
        id={fieldId}
        value={numeric}
        min={field.min}
        max={field.max}
        step={field.step}
        ariaLabel={field.label}
        onCommit={commit}
      />
      {hasBounds && (
        <div className="flex items-center gap-3 pt-0.5">
          <Slider
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={[numeric]}
            onValueChange={(values) =>
              useEditorStore
                .getState()
                .updateNodeConfig(node.id, field.key, values[0])
            }
            onValueCommit={(values) => commit(values[0])}
            aria-label={field.label}
            className="flex-1"
          />
          <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {formatNumber(numeric)}
          </span>
        </div>
      )}
    </div>
  );
}

function FieldGroupSection({
  title,
  fields,
  node,
}: {
  title: string;
  fields: CatalogField[];
  node: ArchNode;
}) {
  if (fields.length === 0) return null;
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <div className="space-y-3">{fields.map((field) => (
        <ConfigField key={field.key} node={node} field={field} />
      ))}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Performance : métriques réelles ou estimations                      */
/* ------------------------------------------------------------------ */

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function UtilizationBar({ utilization }: { utilization: number }) {
  const clamped = Math.min(1, Math.max(0, utilization));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">Utilisation</span>
        <span className="text-sm font-medium tabular-nums">
          {formatPercent(clamped)}
        </span>
      </div>
      <Progress
        value={clamped * 100}
        aria-label="Utilisation"
        className={cn(
          "h-2",
          utilization >= 0.95
            ? "[&_[data-slot=progress-indicator]]:bg-destructive"
            : utilization >= 0.8
              ? "[&_[data-slot=progress-indicator]]:bg-warning"
              : "[&_[data-slot=progress-indicator]]:bg-success",
        )}
      />
    </div>
  );
}

/** Estimations analytiques, débouncées 300 ms et mémoïsées par graphe. */
function useNodeEstimate(nodeId: string): NodeEstimate | null | "pending" {
  const graphKey = useEditorStore((s) => JSON.stringify([s.nodes, s.edges, s.scenario]));
  const cache = useRef(new Map<string, NodeEstimate[]>());
  const [state, setState] = useState<{ estimate: NodeEstimate | null; ready: boolean }>({
    estimate: null,
    ready: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cached = cache.current.get(graphKey);
      if (cached) {
        setState({ estimate: cached.find((e) => e.nodeId === nodeId) ?? null, ready: true });
        return;
      }
      const doc = useEditorStore.getState();
      const computed = estimateArchitecture({
        name: doc.name,
        nodes: doc.nodes,
        edges: doc.edges,
        zones: doc.zones,
        scenario: doc.scenario,
      });
      if (cache.current.size > 24) cache.current.clear();
      cache.current.set(graphKey, computed);
      setState({ estimate: computed.find((e) => e.nodeId === nodeId) ?? null, ready: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [graphKey, nodeId]);

  return state.ready ? state.estimate : "pending";
}

function RealMetricsContent({ nodeId }: { nodeId: string }) {
  const metrics = useSimulationStore((s) =>
    s.result?.nodes.find((m) => m.nodeId === nodeId) ?? null,
  );
  if (!metrics) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge className="border-transparent bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          Résultats de simulation
        </Badge>
      </div>
      <div className="divide-y divide-border">
        <MetricRow label="Débit traité" value={formatRps(metrics.throughputRps)} />
        <div className="py-1">
          <UtilizationBar utilization={metrics.utilization} />
        </div>
        <MetricRow label="Attente moyenne" value={formatMs(metrics.avgWaitMs)} />
        <MetricRow label="Taux d'erreur" value={formatPercent(metrics.errorRate)} />
        <MetricRow label="File d'attente moyenne" value={formatNumber(metrics.avgQueueLength)} />
        {metrics.cacheHitRate !== undefined && (
          <MetricRow label="Taux de cache hit" value={formatPercent(metrics.cacheHitRate)} />
        )}
        <MetricRow label="Disponibilité" value={formatPercent(metrics.availability)} />
        <MetricRow label="Coût estimé" value={formatCost(metrics.costPerMonthUsd)} />
      </div>
    </div>
  );
}

function EstimateContent({ nodeId }: { nodeId: string }) {
  const estimate = useNodeEstimate(nodeId);

  if (estimate === "pending") {
    return (
      <p className="text-xs text-muted-foreground">Calcul des estimations…</p>
    );
  }
  if (!estimate) {
    return (
      <p className="text-xs text-muted-foreground">
        Pas d'estimation pour ce composant (visuel, hors moteur de simulation).
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge className="border-transparent bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
          <Info className="size-3" />
          Estimations initiales
        </Badge>
      </div>
      <div className="divide-y divide-border">
        <MetricRow label="Capacité théorique" value={formatRps(estimate.capacityRps)} />
        <MetricRow label="Débit offert estimé" value={formatRps(estimate.offeredRps)} />
        <div className="py-1">
          <UtilizationBar utilization={estimate.utilization} />
        </div>
        <MetricRow label="Latence locale estimée" value={formatMs(estimate.estLatencyMs)} />
      </div>
      {estimate.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {estimate.warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Ces valeurs sont des estimations analytiques, pas des résultats de
        simulation. Lancez la simulation pour obtenir des métriques complètes.
      </p>
    </div>
  );
}

function PerformanceTab({ nodeId }: { nodeId: string }) {
  const status = useSimulationStore((s) => s.status);
  const hasMetrics = useSimulationStore((s) =>
    Boolean(s.result?.nodes.some((m) => m.nodeId === nodeId)),
  );
  if (status === "done" && hasMetrics) {
    return <RealMetricsContent nodeId={nodeId} />;
  }
  return <EstimateContent nodeId={nodeId} />;
}

/* ------------------------------------------------------------------ */
/* Onglet Apprentissage                                                */
/* ------------------------------------------------------------------ */

function LearningTab({ node }: { node: ArchNode }) {
  const liveNode = useEditorStore(
    (s) => s.nodes.find((n) => n.id === node.id) ?? node,
  );
  const learning = learningOf(liveNode);

  if (!learning) {
    return <p className="text-xs text-muted-foreground">Contenu indisponible.</p>;
  }

  return (
    <div className="space-y-5">
      <section className="space-y-1.5">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Rôle
        </h4>
        <p className="text-sm leading-relaxed">{learning.role}</p>
      </section>

      <section className="space-y-1.5">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Fonctionnement
        </h4>
        <p className="text-sm leading-relaxed">{learning.howItWorks}</p>
      </section>

      {learning.pros.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Avantages
          </h4>
          <ul className="space-y-1">
            {learning.pros.map((pro) => (
              <li key={pro} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                {pro}
              </li>
            ))}
          </ul>
        </section>
      )}

      {learning.cons.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Inconvénients
          </h4>
          <ul className="space-y-1">
            {learning.cons.map((con) => (
              <li key={con} className="flex items-start gap-2 text-sm">
                <Minus className="mt-0.5 size-3.5 shrink-0 text-destructive/70" />
                {con}
              </li>
            ))}
          </ul>
        </section>
      )}

      {learning.useCases.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Cas d&apos;utilisation
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {learning.useCases.map((useCase) => (
              <Badge key={useCase} variant="secondary" className="text-[11px]">
                {useCase}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {learning.pitfalls.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Erreurs fréquentes
          </h4>
          <ul className="space-y-1.5">
            {learning.pitfalls.map((pitfall) => (
              <li
                key={pitfall}
                className="flex items-start gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {pitfall}
              </li>
            ))}
          </ul>
        </section>
      )}

      {learning.concepts.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Concepts associés
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {learning.concepts.map((concept) => (
              <Badge key={concept} variant="outline" className="text-[11px]">
                {concept}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau nœud                                                        */
/* ------------------------------------------------------------------ */

/** Résolution du document pédagogique via le catalogue. */
function learningOf(node: ArchNode) {
  return getComponentById(node.componentId)?.learning ?? null;
}

function NodePanelHeader({ node }: { node: ArchNode }) {
  const component = getComponentById(node.componentId);
  const style = getCategoryStyle(component?.category ?? "");
  const metrics = useSimulationStore((s) =>
    s.status === "done" ? s.result?.nodes.find((m) => m.nodeId === node.id) : undefined,
  );
  const healthy =
    metrics !== undefined &&
    metrics.utilization < 0.8 &&
    metrics.errorRate <= 0.05;

  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          style.icon,
        )}
      >
        <CatalogIcon name={component?.icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{node.label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {healthy && (
            <Badge className="border-transparent bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              Healthy
            </Badge>
          )}
          {component && (
            <Badge variant="secondary" className="text-[10px]">
              {component.maturity === "simulated"
                ? "Simulé"
                : component.maturity === "partial"
                  ? "Partiel"
                  : "Visuel"}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeConfigPanel({ node }: { node: ArchNode }) {
  const renameNode = useEditorStore((s) => s.renameNode);
  const resetNodeConfig = useEditorStore((s) => s.resetNodeConfig);
  const configTab = useEditorStore((s) => s.configTab);
  const setConfigTab = useEditorStore((s) => s.setConfigTab);
  const component = getComponentById(node.componentId);

  const groups = useMemo(
    () => ({
      general: component?.fields.filter((f) => f.group === "general") ?? [],
      capacity: component?.fields.filter((f) => f.group === "capacity") ?? [],
      advanced: component?.fields.filter((f) => f.group === "advanced") ?? [],
    }),
    [component],
  );

  return (
    <Tabs
      value={configTab}
      onValueChange={(value) => setConfigTab(value as typeof configTab)}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="configuration" className="text-xs">
          Configuration
        </TabsTrigger>
        <TabsTrigger value="performance" className="text-xs">
          Performance
        </TabsTrigger>
        <TabsTrigger value="learning" className="text-xs">
          Apprentissage
        </TabsTrigger>
      </TabsList>

      <TabsContent value="configuration" className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`node-name-${node.id}`} className="text-xs font-medium">
              Nom
            </Label>
            <Input
              id={`node-name-${node.id}`}
              value={node.label}
              onChange={(event) => renameNode(node.id, event.target.value)}
              onBlur={(event) => {
                const trimmed = event.target.value.trim();
                if (!trimmed || trimmed !== event.target.value) {
                  renameNode(node.id, trimmed || (component?.name ?? node.label));
                }
              }}
              aria-label="Nom du composant"
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`node-type-${node.id}`} className="text-xs font-medium">
              Type
            </Label>
            <Input
              id={`node-type-${node.id}`}
              readOnly
              value={component?.name ?? node.componentId}
              aria-label="Type de composant (non modifiable)"
              className="h-8 cursor-default text-muted-foreground"
            />
          </div>

          <FieldGroupSection title="Informations générales" fields={groups.general} node={node} />
          <FieldGroupSection
            title="Capacité et performances"
            fields={groups.capacity}
            node={node}
          />

          {groups.advanced.length > 0 && (
            <Accordion type="single" defaultValue="advanced" className="border-t border-border">
              <AccordionItem value="advanced" className="border-b-0">
                <AccordionTrigger className="py-3 text-xs hover:no-underline">
                  Configuration avancée
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {groups.advanced.map((field) => (
                    <ConfigField key={field.key} node={node} field={field} />
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          <Button
            type="button"
            variant="secondary"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/80"
            onClick={() => resetNodeConfig(node.id)}
          >
            Réinitialiser les paramètres
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="performance" className="min-h-0 flex-1 overflow-y-auto">
        <PerformanceTab nodeId={node.id} />
      </TabsContent>

      <TabsContent value="learning" className="min-h-0 flex-1 overflow-y-auto">
        <LearningTab node={node} />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau connexion                                                   */
/* ------------------------------------------------------------------ */

function EdgePanel({ edge, nodes }: { edge: ArchEdge; nodes: ArchNode[] }) {
  const updateEdge = useEditorStore((s) => s.updateEdge);
  const deleteEdge = useEditorStore((s) => s.deleteEdge);
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MousePointerClick className="size-3.5" />
        {source?.label ?? edge.source}
        <span aria-hidden>→</span>
        {target?.label ?? edge.target}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`edge-protocol-${edge.id}`} className="text-xs font-medium">
          Protocole
        </Label>
        <Select
          value={edge.protocol}
          onValueChange={(value) => updateEdge(edge.id, { protocol: value as Protocol })}
        >
          <SelectTrigger id={`edge-protocol-${edge.id}`} className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROTOCOL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`edge-latency-${edge.id}`} className="text-xs font-medium">
          Latence réseau <span className="text-[10px] text-muted-foreground">ms</span>
        </Label>
        <NumberInput
          id={`edge-latency-${edge.id}`}
          value={edge.networkLatencyMs}
          min={0}
          step={1}
          ariaLabel="Latence réseau de la connexion"
          onCommit={(value) => updateEdge(edge.id, { networkLatencyMs: value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`edge-bandwidth-${edge.id}`} className="text-xs font-medium">
          Bande passante <span className="text-[10px] text-muted-foreground">Mbps</span>
        </Label>
        <NumberInput
          id={`edge-bandwidth-${edge.id}`}
          value={edge.bandwidthMbps}
          min={1}
          step={10}
          ariaLabel="Bande passante de la connexion"
          onCommit={(value) => updateEdge(edge.id, { bandwidthMbps: value })}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
        onClick={() => deleteEdge(edge.id)}
      >
        Supprimer la connexion
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau zone                                                        */
/* ------------------------------------------------------------------ */

function ZonePanel({ zoneId }: { zoneId: string }) {
  const zones = useEditorStore((s) => s.zones);
  const updateZone = useEditorStore((s) => s.updateZone);
  const deleteZone = useEditorStore((s) => s.deleteZone);
  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) return null;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <div className="space-y-1.5">
        <Label htmlFor={`zone-label-${zone.id}`} className="text-xs font-medium">
          Libellé
        </Label>
        <Input
          id={`zone-label-${zone.id}`}
          value={zone.label}
          onChange={(event) => updateZone(zone.id, { label: event.target.value.slice(0, 60) })}
          aria-label="Libellé de la zone"
          className="h-8"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`zone-color-${zone.id}`} className="text-xs font-medium">
          Couleur
        </Label>
        <Select
          value={zone.color}
          onValueChange={(value) => updateZone(zone.id, { color: value as ZoneColor })}
        >
          <SelectTrigger id={`zone-color-${zone.id}`} className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ZONE_COLOR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full", option.dot)} />
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`zone-width-${zone.id}`} className="text-xs font-medium">
            Largeur <span className="text-[10px] text-muted-foreground">px</span>
          </Label>
          <NumberInput
            id={`zone-width-${zone.id}`}
            value={zone.size.width}
            min={160}
            step={20}
            ariaLabel="Largeur de la zone"
            onCommit={(value) =>
              updateZone(zone.id, { size: { ...zone.size, width: value } })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`zone-height-${zone.id}`} className="text-xs font-medium">
            Hauteur <span className="text-[10px] text-muted-foreground">px</span>
          </Label>
          <NumberInput
            id={`zone-height-${zone.id}`}
            value={zone.size.height}
            min={120}
            step={20}
            ariaLabel="Hauteur de la zone"
            onCommit={(value) =>
              updateZone(zone.id, { size: { ...zone.size, height: value } })
            }
          />
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
        onClick={() => deleteZone(zone.id)}
      >
        Supprimer la zone
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panneau racine                                                      */
/* ------------------------------------------------------------------ */

export interface ConfigPanelProps {
  className?: string;
  /** Appelé en plus du store à la fermeture (Sheet mobile). */
  onCloseExtra?: () => void;
}

export function ConfigPanel({ className, onCloseExtra }: ConfigPanelProps) {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectedEdgeId = useEditorStore((s) => s.selectedEdgeId);
  const selectedZoneId = useEditorStore((s) => s.selectedZoneId);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const setConfigOpen = useEditorStore((s) => s.setConfigOpen);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;
  const selectedEdge = selectedEdgeId
    ? edges.find((e) => e.id === selectedEdgeId) ?? null
    : null;

  const close = () => {
    setConfigOpen(false);
    onCloseExtra?.();
  };

  return (
    <aside
      className={cn(
        "flex w-80 shrink-0 flex-col border-l border-border bg-card",
        className,
      )}
      aria-label="Panneau de configuration"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          {selectedEdge ? (
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
          ) : selectedZoneId ? (
            <LayoutGrid className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
          <h2 className="truncate text-sm font-semibold">
            {selectedNode
              ? "Composant"
              : selectedEdge
                ? "Connexion"
                : selectedZoneId
                  ? "Zone"
                  : "Configuration"}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="Fermer le panneau de configuration"
          onClick={close}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        {selectedNode ? (
          <>
            <div className="shrink-0 pb-3">
              <NodePanelHeader node={selectedNode} />
            </div>
            <NodeConfigPanel node={selectedNode} />
          </>
        ) : selectedEdge ? (
          <EdgePanel edge={selectedEdge} nodes={nodes} />
        ) : selectedZoneId ? (
          <ZonePanel zoneId={selectedZoneId} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MousePointerClick className="size-4" />
            </span>
            <p className="text-sm font-medium">Aucune sélection</p>
            <p className="text-xs text-muted-foreground">
              Cliquez sur un composant du canvas pour configurer ses paramètres,
              ses performances et consulter sa fiche d&apos;apprentissage.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
