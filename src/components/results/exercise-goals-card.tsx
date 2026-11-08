"use client";

/**
 * SystemLab — Carte « objectifs de l'exercice » (vue résultats).
 *
 * Tient la promesse formulée dans les cours (« la plateforme évaluera vos
 * métriques simulées après exécution ») : lorsqu'une simulation est lancée
 * depuis un exercice de cours, chaque critère de réussite est confronté aux
 * métriques réelles du résultat — verdict global + détail par critère.
 */
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  Minus,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/stores/app-store";
import { COURSE_MAP } from "@/data/courses";
import { formatCost, formatMs, formatPercent, formatRps } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CourseExercise, SimulationResult } from "@/types";

const CRITERION_LABELS: Record<CourseExercise["successCriteria"][number]["metric"], string> = {
  p95Ms: "p95",
  errorRate: "taux d'erreur",
  servedRps: "débit servi",
  costPerMonthUsd: "coût",
  cacheHitRate: "hit cache",
};

function formatMetric(
  metric: CourseExercise["successCriteria"][number]["metric"],
  value: number,
): string {
  switch (metric) {
    case "p95Ms":
      return formatMs(value);
    case "errorRate":
      return formatPercent(value);
    case "servedRps":
      return formatRps(value);
    case "costPerMonthUsd":
      return formatCost(value);
    case "cacheHitRate":
      return formatPercent(value);
  }
}

interface EvaluatedCriterion {
  criterion: CourseExercise["successCriteria"][number];
  /** Valeur réelle mesurée (null : critère non évaluable sur ce graphe). */
  actual: number | null;
  ok: boolean;
}

/** Moyenne pondérée par les arrivées des taux de hit des nœuds cache. */
function aggregateCacheHitRate(result: SimulationResult): number | null {
  let weighted = 0;
  let total = 0;
  for (const n of result.nodes) {
    if (typeof n.cacheHitRate === "number") {
      const weight = Math.max(n.arrivals, 1);
      weighted += n.cacheHitRate * weight;
      total += weight;
    }
  }
  return total > 0 ? weighted / total : null;
}

function evaluateExercise(
  result: SimulationResult,
  exercise: CourseExercise,
): { criteria: EvaluatedCriterion[]; passed: boolean } {
  const criteria = exercise.successCriteria.map((criterion) => {
    let actual: number | null;
    switch (criterion.metric) {
      case "p95Ms":
        actual = result.overall.p95Ms;
        break;
      case "errorRate":
        actual = result.overall.errorRate;
        break;
      case "servedRps":
        actual = result.overall.servedRps;
        break;
      case "costPerMonthUsd":
        actual = result.overall.costPerMonthUsd;
        break;
      case "cacheHitRate":
        actual = aggregateCacheHitRate(result);
        break;
    }
    const ok =
      actual !== null &&
      (criterion.op === "<=" ? actual <= criterion.value : actual >= criterion.value);
    return { criterion, actual, ok };
  });
  // Les critères non évaluables (ex. « hit cache » sans nœud cache) ne
  // pèsent pas sur le verdict : ils sont signalés, jamais validés à la légère.
  const judged = criteria.filter((c) => c.actual !== null);
  return { criteria, passed: judged.length > 0 && judged.every((c) => c.ok) };
}

export function ExerciseGoalsCard({ result }: { result: SimulationResult }) {
  const activeExerciseSlug = useAppStore((s) => s.activeExerciseSlug);
  const openCourse = useAppStore((s) => s.openCourse);

  const course = activeExerciseSlug ? COURSE_MAP[activeExerciseSlug] : undefined;
  const exercise = course?.exercise;
  if (!course || !exercise) return null;

  const { criteria, passed } = evaluateExercise(result, exercise);
  const op = (o: CourseExercise["successCriteria"][number]["op"]) =>
    o === "<=" ? "≤" : "≥";

  return (
    <Card
      className={cn(
        "mt-6 gap-0 py-4",
        passed ? "border-success/40" : "border-warning/40",
      )}
    >
      <CardContent className="px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                passed
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning",
              )}
            >
              <Target className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                Exercice : {exercise.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Cours « {course.title} » — critères évalués sur ce résultat.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 gap-1 font-medium",
              passed
                ? "border-success/40 bg-success/5 text-success"
                : "border-warning/40 bg-warning/5 text-warning",
            )}
          >
            {passed ? <CircleCheck className="size-3.5" /> : <CircleX className="size-3.5" />}
            {passed ? "Objectif atteint" : "À retravailler"}
          </Badge>
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {criteria.map((entry, i) => (
            <li
              key={i}
              className="flex items-center gap-2.5 rounded-md border bg-muted/30 px-3 py-2"
            >
              {entry.actual === null ? (
                <Minus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : entry.ok ? (
                <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <CircleX className="size-4 shrink-0 text-destructive" aria-hidden />
              )}
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{CRITERION_LABELS[entry.criterion.metric]}</span>
                <span className="text-muted-foreground">
                  {" "}
                  {op(entry.criterion.op)} {formatMetric(entry.criterion.metric, entry.criterion.value)}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm tabular-nums",
                  entry.actual === null
                    ? "text-muted-foreground"
                    : entry.ok
                      ? "text-success"
                      : "text-destructive",
                )}
                title={entry.actual === null ? "Critère non évaluable sur ce graphe" : undefined}
              >
                {entry.actual === null
                  ? "non évalué"
                  : formatMetric(entry.criterion.metric, entry.actual)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-48 flex-1 text-xs leading-relaxed text-muted-foreground">
            Ajustez l&apos;architecture (cache, instances, dimensionnement) dans
            l&apos;éditeur puis relancez la simulation pour réévaluer ces critères.
          </p>
          <Button variant="outline" size="sm" onClick={() => openCourse(course.slug)}>
            <ArrowLeft aria-hidden />
            Reprendre le cours
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
