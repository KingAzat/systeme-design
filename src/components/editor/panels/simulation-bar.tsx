"use client";

/**
 * SystemLab — Barre de simulation (bas de l'éditeur, repliable).
 * Configuration du scénario (grille de champs), section « Panne simulée »,
 * section « Avancé », bouton de lancement et état de la simulation.
 */
import { memo, useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Gauge,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Square,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMs, formatPercent, formatRps } from "@/lib/format";
import { MODE_OPTIONS as SCENARIO_MODE_OPTIONS } from "@/lib/labels";
import { useEditorStore } from "@/stores/editor-store";
import { useSimulationStore } from "@/stores/simulation-store";
import { useAppStore } from "@/stores/app-store";
import type {
  FailureScenario,
  ScenarioConfig,
  SimulationMode,
  TrafficProfile,
} from "@/types";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { launchSimulation } from "../run-simulation";

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

const PROFILE_OPTIONS: { value: TrafficProfile; label: string }[] = [
  { value: "constant", label: "Constant" },
  { value: "ramp", label: "Progressif" },
  { value: "spike", label: "Pic soudain" },
  { value: "waves", label: "En vagues" },
  { value: "random", label: "Aléatoire" },
];

const MODE_OPTIONS = SCENARIO_MODE_OPTIONS;

function defaultFailure(nodeId: string): FailureScenario {
  return {
    nodeId,
    startSec: 30,
    durationSec: 20,
    kind: "outage",
    severity: 0.5,
    recoverySec: 15,
  };
}

/* ------------------------------------------------------------------ */
/* Champs                                                              */
/* ------------------------------------------------------------------ */

interface ScenarioFieldProps {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  help?: string;
}

function ScenarioField({ id, label, icon: Icon, children, help }: ScenarioFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </Label>
      {children}
      {help && <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>}
    </div>
  );
}

function ScenarioNumberInput({
  id,
  value,
  min,
  max,
  step,
  onCommit,
  ariaLabel,
}: {
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(String(value));
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
    onCommit(next);
  };
  return (
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
      className="h-8 tabular-nums"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Barre de simulation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Menu « Nœud cible » de la panne simulée : seul consommateur de la liste
 * complète des nœuds. Abonnement LOCAL à s.nodes — le composant n'est monté
 * que quand la section « Panne simulée » est dépliée avec une panne
 * configurée, la barre elle-même ne suit plus le tableau des nœuds.
 */
function FailureNodeSelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const nodes = useEditorStore((s) => s.nodes);
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id="failure-node" className="h-8 w-full" aria-label="Nœud cible de la panne">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {nodes.map((node) => (
          <SelectItem key={node.id} value={node.id}>
            {node.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// memo : coupe la cascade de re-render issue du parent (EditorView, réinscrit
// à `revision`) — la barre ne re-render plus du tout pendant un drag ; ses
// propres abonnements par valeur décident seuls des mises à jour.
export const SimulationBar = memo(function SimulationBar({ className }: { className?: string }) {
  const scenario = useEditorStore((s) => s.scenario);
  // Abonnements par VALEUR (nombre/chaîne) : la barre ne re-render pas à
  // chaque frame de drag de nœud (les positions ne changent ni le compte ni
  // le libellé du premier nœud). Les actions lisent l'état frais via
  // getState() au moment du clic.
  const nodeCount = useEditorStore((s) => s.nodes.length);
  const firstNodeLabel = useEditorStore((s) => s.nodes[0]?.label ?? null);
  const setScenario = useEditorStore((s) => s.setScenario);
  const open = useEditorStore((s) => s.simulationBarOpen);
  const setSimulationBarOpen = useEditorStore((s) => s.setSimulationBarOpen);

  const status = useSimulationStore((s) => s.status);
  const progress = useSimulationStore((s) => s.progress);
  const error = useSimulationStore((s) => s.error);
  const result = useSimulationStore((s) => s.result);
  const abort = useSimulationStore((s) => s.abort);

  const [manualFailureOpen, setManualFailureOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Section « Panne simulée » : dépliée d'office en mode « Test de panne »
  // (dérivé, sans effet) ou manuellement via « Configurer une panne ».
  const failureForced = scenario.mode === "failure";
  const failureOpen = failureForced || manualFailureOpen;

  const patchFailure = (patch: Partial<FailureScenario>) => {
    if (!scenario.failure) return;
    setScenario({ failure: { ...scenario.failure, ...patch } });
  };

  const running = status === "running";
  const modeLabel =
    MODE_OPTIONS.find((m) => m.value === scenario.mode)?.label ?? scenario.mode;

  return (
    <Collapsible open={open} onOpenChange={setSimulationBarOpen} className={className}>
      <div className="border-t border-border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                !open && "-rotate-90",
              )}
            />
            Configuration de la simulation
            <span className="ml-2 hidden items-center gap-2 text-xs font-normal text-muted-foreground sm:flex">
              <span>{modeLabel}</span>
              <span aria-hidden>·</span>
              <span>{formatRps(scenario.requestsPerSecond)}</span>
              <span aria-hidden>·</span>
              <span>{scenario.durationSec} s</span>
              <span aria-hidden>·</span>
              <span>{formatPercent(scenario.readRatio, 0)} lectures</span>
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid gap-5 border-t border-border px-3 py-3 lg:grid-cols-[1fr_340px]">
            {/* ------- Colonne gauche : scénario ------- */}
            <div className="min-w-0 space-y-5">
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                <ScenarioField
                  id="scenario-active-users"
                  label="Utilisateurs actifs"
                  icon={Users}
                >
                  <ScenarioNumberInput
                    id="scenario-active-users"
                    value={scenario.activeUsers}
                    min={1}
                    ariaLabel="Utilisateurs actifs"
                    onCommit={(value) => setScenario({ activeUsers: value })}
                  />
                </ScenarioField>

                <ScenarioField
                  id="scenario-rps"
                  label="Requêtes/s cibles"
                  icon={Gauge}
                  help="≠ utilisateurs : un utilisateur émet des requêtes par intermittence."
                >
                  <ScenarioNumberInput
                    id="scenario-rps"
                    value={scenario.requestsPerSecond}
                    min={1}
                    ariaLabel="Requêtes par seconde cibles"
                    onCommit={(value) => setScenario({ requestsPerSecond: value })}
                  />
                </ScenarioField>

                <ScenarioField id="scenario-duration" label="Durée (s)" icon={Clock}>
                  <ScenarioNumberInput
                    id="scenario-duration"
                    value={scenario.durationSec}
                    min={10}
                    max={600}
                    ariaLabel="Durée de simulation en secondes"
                    onCommit={(value) => setScenario({ durationSec: value })}
                  />
                </ScenarioField>

                <ScenarioField id="scenario-profile" label="Profil de trafic" icon={Gauge}>
                  <Select
                    value={scenario.profile}
                    onValueChange={(value) =>
                      setScenario({ profile: value as TrafficProfile })
                    }
                  >
                    <SelectTrigger
                      id="scenario-profile"
                      className="h-8 w-full"
                      aria-label="Profil de trafic"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROFILE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ScenarioField>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label
                      htmlFor="scenario-read-ratio"
                      className="flex items-center gap-1.5 text-xs font-medium"
                    >
                      <Users className="size-3.5 text-muted-foreground" />
                      Lecture / Écriture
                    </Label>
                    <span className="text-xs font-medium tabular-nums">
                      {formatPercent(scenario.readRatio, 0)} /{" "}
                      {formatPercent(1 - scenario.readRatio, 0)}
                    </span>
                  </div>
                  <Slider
                    id="scenario-read-ratio"
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(scenario.readRatio * 100)]}
                    onValueChange={(values) =>
                      setScenario({ readRatio: values[0] / 100 })
                    }
                    aria-label="Proportion de lectures"
                  />
                </div>

                <ScenarioField id="scenario-latency" label="Latence réseau (ms)" icon={Zap}>
                  <ScenarioNumberInput
                    id="scenario-latency"
                    value={scenario.networkLatencyMs}
                    min={0}
                    ariaLabel="Latence réseau de base en millisecondes"
                    onCommit={(value) => setScenario({ networkLatencyMs: value })}
                  />
                </ScenarioField>

                <ScenarioField
                  id="scenario-error-rate"
                  label="Taux d'erreur initial (%)"
                  icon={TriangleAlert}
                >
                  <ScenarioNumberInput
                    id="scenario-error-rate"
                    value={Math.round(scenario.baseErrorRate * 1000) / 10}
                    min={0}
                    max={100}
                    step={0.1}
                    ariaLabel="Taux d'erreur initial en pourcentage"
                    onCommit={(value) => setScenario({ baseErrorRate: value / 100 })}
                  />
                </ScenarioField>

                <ScenarioField id="scenario-mode" label="Mode" icon={CheckCircle2}>
                  <Select
                    value={scenario.mode}
                    onValueChange={(value) => setScenario({ mode: value as SimulationMode })}
                  >
                    <SelectTrigger
                      id="scenario-mode"
                      className="h-8 w-full"
                      aria-label="Mode de simulation"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ScenarioField>
              </div>

              {/* ------- Panne simulée ------- */}
              <Collapsible
                open={failureOpen}
                onOpenChange={(nextOpen) => {
                  setManualFailureOpen(nextOpen);
                  if (nextOpen && !scenario.failure) {
                    // État frais au moment de l'ouverture : pas d'abonnement
                    // au tableau des nœuds pour la barre entière.
                    const first = useEditorStore.getState().nodes[0];
                    if (first) setScenario({ failure: defaultFailure(first.id) });
                  }
                }}
              >
                <div className="rounded-lg border border-border">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      aria-expanded={failureOpen}
                    >
                      <TriangleAlert className="size-3.5 text-warning" />
                      Panne simulée
                      {scenario.failure ? (
                        <span className="font-normal text-muted-foreground">
                          — {scenario.failure.kind === "outage" ? "coupure" : "dégradation"}{" "}
                          configurée
                        </span>
                      ) : (
                        <span className="font-normal text-muted-foreground">
                          — configurer une panne
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "ml-auto size-3.5 text-muted-foreground transition-transform",
                          !failureOpen && "-rotate-90",
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-x-4 gap-y-3 border-t border-border px-3 py-3 sm:grid-cols-2 xl:grid-cols-3">
                      {scenario.failure ? (
                        <>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="failure-node"
                              className="flex items-center gap-1.5 text-xs font-medium"
                            >
                              <Gauge className="size-3.5 text-muted-foreground" />
                              Nœud cible
                            </Label>
                            <FailureNodeSelect
                              value={scenario.failure.nodeId}
                              onValueChange={(value) => patchFailure({ nodeId: value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="failure-start" className="text-xs font-medium">
                              Début (s)
                            </Label>
                            <ScenarioNumberInput
                              id="failure-start"
                              value={scenario.failure.startSec}
                              min={0}
                              ariaLabel="Début de la panne en secondes"
                              onCommit={(value) => patchFailure({ startSec: value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="failure-duration" className="text-xs font-medium">
                              Durée (s)
                            </Label>
                            <ScenarioNumberInput
                              id="failure-duration"
                              value={scenario.failure.durationSec}
                              min={1}
                              ariaLabel="Durée de la panne en secondes"
                              onCommit={(value) => patchFailure({ durationSec: value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="failure-kind" className="text-xs font-medium">
                              Type de panne
                            </Label>
                            <Select
                              value={scenario.failure.kind}
                              onValueChange={(value) =>
                                patchFailure({
                                  kind: value as FailureScenario["kind"],
                                })
                              }
                            >
                              <SelectTrigger
                                id="failure-kind"
                                className="h-8 w-full"
                                aria-label="Type de panne"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="outage">Coupure (indisponible)</SelectItem>
                                <SelectItem value="degradation">Dégradation (ralenti)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {scenario.failure.kind === "degradation" && (
                            <div className="space-y-1.5">
                              <div className="flex items-baseline justify-between">
                                <Label
                                  htmlFor="failure-severity"
                                  className="text-xs font-medium"
                                >
                                  Sévérité
                                </Label>
                                <span className="text-xs font-medium tabular-nums">
                                  {formatPercent(scenario.failure.severity, 0)}
                                </span>
                              </div>
                              <Slider
                                id="failure-severity"
                                min={0}
                                max={100}
                                step={5}
                                value={[Math.round(scenario.failure.severity * 100)]}
                                onValueChange={(values) =>
                                  patchFailure({ severity: values[0] / 100 })
                                }
                                aria-label="Sévérité de la dégradation"
                              />
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="failure-recovery"
                              className="text-xs font-medium"
                            >
                              Récupération (s)
                            </Label>
                            <ScenarioNumberInput
                              id="failure-recovery"
                              value={scenario.failure.recoverySec}
                              min={0}
                              ariaLabel="Temps de récupération en secondes"
                              onCommit={(value) => patchFailure({ recoverySec: value })}
                            />
                          </div>
                          <div className="sm:col-span-2 xl:col-span-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => {
                                setScenario({ failure: null });
                                setManualFailureOpen(false);
                              }}
                            >
                              Supprimer la panne
                            </Button>
                          </div>
                        </>
                      ) : nodeCount > 0 ? (
                        <div className="sm:col-span-2 xl:col-span-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              const first = useEditorStore.getState().nodes[0];
                              if (first) {
                                setScenario({ failure: defaultFailure(first.id) });
                              }
                            }}
                          >
                            Configurer une panne sur « {firstNodeLabel} »
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">
                          Ajoutez au moins un composant pour configurer une panne
                          simulée (coupure ou dégradation d&apos;un nœud).
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* ------- Avancé ------- */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <div className="rounded-lg border border-border">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      aria-expanded={advancedOpen}
                    >
                      <RefreshCw className="size-3.5 text-muted-foreground" />
                      Avancé
                      <ChevronDown
                        className={cn(
                          "ml-auto size-3.5 text-muted-foreground transition-transform",
                          !advancedOpen && "-rotate-90",
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-x-4 gap-y-3 border-t border-border px-3 py-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="scenario-seed" className="text-xs font-medium">
                          Seed (reproductibilité)
                        </Label>
                        <div className="flex items-center gap-1">
                          <ScenarioNumberInput
                            id="scenario-seed"
                            value={scenario.seed}
                            min={0}
                            ariaLabel="Graine aléatoire"
                            onCommit={(value) =>
                              setScenario({ seed: Math.floor(value) })
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 shrink-0"
                            aria-label="Seed aléatoire"
                            title="Générer une seed aléatoire"
                            onClick={() =>
                              setScenario({
                                seed: Math.floor(Math.random() * 1_000_000),
                              })
                            }
                          >
                            <RefreshCw className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="scenario-budget" className="text-xs font-medium">
                          Budget ($/mois)
                        </Label>
                        <ScenarioNumberInput
                          id="scenario-budget"
                          value={scenario.budgetPerMonthUsd}
                          min={0}
                          ariaLabel="Budget mensuel en dollars"
                          onCommit={(value) => setScenario({ budgetPerMonthUsd: value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="scenario-size" className="text-xs font-medium">
                          Taille requête (Ko)
                        </Label>
                        <ScenarioNumberInput
                          id="scenario-size"
                          value={scenario.requestSizeKb}
                          min={0.1}
                          step={1}
                          ariaLabel="Taille moyenne des requêtes en kilooctets"
                          onCommit={(value) => setScenario({ requestSizeKb: value })}
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>

            {/* ------- Colonne droite : lancement + état ------- */}
            <div className="flex flex-col gap-4 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
              <div className="space-y-2">
                <Button
                  type="button"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={running}
                  onClick={() => void launchSimulation()}
                >
                  <Play className="size-4" />
                  Lancer la simulation
                </Button>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Les résultats s&apos;ouvrent automatiquement à la fin du calcul ;
                  l&apos;éditeur conserve son état.
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  État de la simulation
                </h4>

                {/* Région live : progression, fin, erreur et dernier résultat
                    sont annoncés aux lecteurs d'écran sans vol de focus.
                    L'erreur porte en plus role="alert" (annonce immédiate). */}
                <div aria-live="polite" className="space-y-2.5">
                  {running ? (
                    <>
                      <p className="flex items-start gap-2 text-xs">
                        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                        <span>
                          Simulation en cours
                          {progress
                            ? ` — ${progress.phase} (${Math.round(progress.progress * 100)} %)`
                            : ""}
                        </span>
                      </p>
                      <Progress
                        value={(progress?.progress ?? 0) * 100}
                        aria-label="Progression de la simulation"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                        onClick={abort}
                      >
                        <Square className="size-3.5" />
                        Interrompre
                      </Button>
                    </>
                  ) : status === "error" ? (
                    <p
                      role="alert"
                      className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
                    >
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                      {error ?? "La simulation a échoué."}
                    </p>
                  ) : result ? (
                    <>
                      <p className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                        <span>
                          Dernier résultat : {formatRps(result.overall.servedRps)} servis ·
                          p95 {formatMs(result.overall.p95Ms)}
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => useAppStore.getState().openResult(result)}
                      >
                        Voir les résultats
                      </Button>
                    </>
                  ) : (
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0 text-info" />
                      Prêt à lancer la simulation.
                    </p>
                  )}

                  {!running && !result && (
                    <p className="text-xs text-muted-foreground/70">
                      Aucun résultat pour le moment.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
});
