"use client";

/**
 * SystemLab — section Diagnostics : cartes pédagogiques triées par sévérité
 * (critique > avertissement > info) avec métriques justificatives, cause,
 * explication et pistes d'amélioration (conditions + compromis).
 */
import { CircleCheck, Lightbulb, Scale, Target } from "lucide-react";
import type { Diagnostic, DiagnosticSeverity } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_BORDER: Record<DiagnosticSeverity, string> = {
  critical: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-info",
};

const SEVERITY_BADGE: Record<DiagnosticSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning/10 text-warning",
  info: "border-info/40 bg-info/10 text-info",
};

const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = {
  critical: "Critique",
  warning: "Avertissement",
  info: "Info",
};

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function DiagnosticCard({ diagnostic }: { diagnostic: Diagnostic }) {
  return (
    <Card className={cn("gap-0 border-l-4 py-0", SEVERITY_BORDER[diagnostic.severity])}>
      <CardContent className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{diagnostic.title}</h3>
          {diagnostic.nodeLabel ? (
            <Badge variant="secondary" className="font-normal">
              {diagnostic.nodeLabel}
            </Badge>
          ) : null}
          <Badge variant="outline" className={SEVERITY_BADGE[diagnostic.severity]}>
            {SEVERITY_LABEL[diagnostic.severity]}
          </Badge>
        </div>

        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            {diagnostic.evidence.length > 0 ? (
              <div className="space-y-1.5">
                <SectionLabel>Métriques justificatives</SectionLabel>
                <ul className="space-y-1">
                  {diagnostic.evidence.map((item) => (
                    <li key={item.label} className="flex items-baseline gap-2 text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-mono font-medium">{item.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <SectionLabel>Cause probable</SectionLabel>
              <p className="text-sm">{diagnostic.cause}</p>
            </div>

            <div className="space-y-1.5">
              <SectionLabel>Explication</SectionLabel>
              <p className="text-sm text-muted-foreground">{diagnostic.explanation}</p>
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel>Pistes d&apos;amélioration</SectionLabel>
            {diagnostic.solutions.map((solution) => (
              <div
                key={solution.label}
                className="rounded-lg border bg-muted/30 px-3.5 py-3"
              >
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Lightbulb className="size-3.5 shrink-0 text-warning" />
                  {solution.label}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">{solution.how}</p>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Target className="mt-0.5 size-3.5 shrink-0 text-info" />
                  <span>
                    <span className="font-medium text-foreground">Quand l&apos;utiliser :</span>{" "}
                    {solution.conditions}
                  </span>
                </p>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Scale className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-medium text-foreground">Compromis :</span>{" "}
                    {solution.tradeoffs}
                  </span>
                </p>
              </div>
            ))}
            {diagnostic.solutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune piste proposée.</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DiagnosticsSection({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const sorted = [...diagnostics].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  if (sorted.length === 0) {
    return (
      <Card className="gap-0 border-success/30 bg-success/5 py-0">
        <CardContent className="flex items-center gap-3 px-5 py-4">
          <CircleCheck className="size-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-success">Aucun problème détecté</p>
            <p className="text-sm text-muted-foreground">
              L&apos;architecture absorbe la charge du scénario sans saturation ni dégradation
              notable sur la fenêtre simulée.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((diagnostic) => (
        <DiagnosticCard key={diagnostic.id} diagnostic={diagnostic} />
      ))}
    </div>
  );
}
