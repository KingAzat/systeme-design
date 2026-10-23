"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

import { Landmark } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LevelBadge } from "@/components/learn/level-badge";
import { TemplatePreview } from "@/components/templates/template-preview";
import { useAppStore } from "@/stores/app-store";
import { getComponentById } from "@/data/catalog/registry";
import { getCategoryStyle, getIcon } from "@/lib/icons";
import { formatRps } from "@/lib/format";
import { MATURITY_LABELS, MODE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { COURSES } from "@/data/courses";
import { BIG_TECH_META, TEMPLATES } from "@/data/templates";
import type {
  ArchitectureTemplate,
  CatalogComponent,
  SimulationMaturity,
} from "@/types";

/**
 * SystemLab — Galerie des modèles d'architecture.
 * Chaque carte propose un aperçu SVG statique généré depuis les données réelles
 * du modèle ; le clic ouvre un dialogue de détail (composants, scénario, cours liés).
 * Les modèles « géants de la tech » (YouTube, Netflix, WhatsApp…) sont filtrables
 * et triés en tête de galerie.
 */

type TemplateFamily = "all" | "classics" | "bigtech";

const FAMILY_LABELS: Record<TemplateFamily, string> = {
  all: "Tous",
  classics: "Modèles classiques",
  bigtech: "Géants de la tech",
};

/** Géants d'abord (tri stable : l'ordre interne de chaque famille est conservé). */
const SORTED_TEMPLATES = [...TEMPLATES].sort(
  (a, b) => Number(b.id in BIG_TECH_META) - Number(a.id in BIG_TECH_META),
);

function filterTemplates(family: TemplateFamily): ArchitectureTemplate[] {
  if (family === "classics") return SORTED_TEMPLATES.filter((t) => !(t.id in BIG_TECH_META));
  if (family === "bigtech") return SORTED_TEMPLATES.filter((t) => t.id in BIG_TECH_META);
  return SORTED_TEMPLATES;
}

/* Libellés des modes — source unique @/lib/labels (MODE_LABELS). */

const MATURITY_STYLES: Record<SimulationMaturity, { className: string }> = {
  simulated: { className: "border-success/40 bg-success/5 text-success" },
  partial: { className: "border-warning/40 bg-warning/5 text-warning" },
  visual: { className: "text-muted-foreground" },
};

function MaturityBadge({ maturity }: { maturity: SimulationMaturity }) {
  const style = MATURITY_STYLES[maturity];
  return (
    <Badge variant="outline" className={cn("shrink-0 font-normal", style.className)}>
      {MATURITY_LABELS[maturity]}
    </Badge>
  );
}

/** Regroupe les nœuds d'un modèle par composant du catalogue. */
function groupComponents(template: ArchitectureTemplate): { component: CatalogComponent; count: number }[] {
  const groups = new Map<string, { component: CatalogComponent; count: number }>();
  for (const n of template.data.nodes) {
    const component = getComponentById(n.componentId);
    if (!component) continue;
    const existing = groups.get(component.id);
    if (existing) existing.count += 1;
    else groups.set(component.id, { component, count: 1 });
  }
  return [...groups.values()];
}

/* ------------------------------------------------------------------ */

function TemplateCard({
  template,
  onOpenDetail,
}: {
  template: ArchitectureTemplate;
  onOpenDetail: () => void;
}) {
  const openTemplate = useAppStore((s) => s.openTemplate);
  const company = BIG_TECH_META[template.id]?.company;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetail();
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-pointer gap-3 py-4 transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:outline-none",
        company && "border-primary/25",
      )}
    >
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between gap-2 text-base leading-snug">
          <span className="truncate">{template.name}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {company && (
              <Badge
                variant="outline"
                className="gap-1 border-primary/30 bg-primary/5 px-1.5 font-medium text-primary"
                title={`Inspiré de l'architecture de ${company}`}
              >
                <Landmark className="size-3" aria-hidden />
                {company}
              </Badge>
            )}
            <LevelBadge level={template.difficulty} />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <TemplatePreview data={template.data} height={140} />
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">
          {template.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {template.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-2 px-4">
        <span className="text-xs text-muted-foreground tabular-nums">
          {template.data.nodes.length} composant{template.data.nodes.length > 1 ? "s" : ""} ·{" "}
          {template.data.edges.length} connexion{template.data.edges.length > 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            openTemplate(template.id);
          }}
        >
          Utiliser ce modèle
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function TemplatesView() {
  const openTemplate = useAppStore((s) => s.openTemplate);
  const setView = useAppStore((s) => s.setView);
  const openCourse = useAppStore((s) => s.openCourse);

  const [family, setFamily] = useState<TemplateFamily>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId !== null ? TEMPLATES.find((t) => t.id === selectedId) ?? null : null;

  const visibleTemplates = useMemo(() => filterTemplates(family), [family]);
  const bigTechCount = useMemo(() => TEMPLATES.filter((t) => t.id in BIG_TECH_META).length, []);
  const inspiration = selected ? BIG_TECH_META[selected.id] : undefined;

  const componentGroups = useMemo(
    () => (selected ? groupComponents(selected) : []),
    [selected],
  );
  const linkedCourseCount = useMemo(
    () =>
      selected
        ? COURSES.filter((c) => c.exercise?.templateId === selected.id).length
        : 0,
    [selected],
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modèles d&apos;architecture</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {TEMPLATES.length} architectures prêtes à explorer, modifier et simuler — dont{" "}
        {bigTechCount} inspirées des géants de la tech.
      </p>

      <Tabs
        value={family}
        onValueChange={(value) => setFamily(value as TemplateFamily)}
        className="mt-5"
      >
        <TabsList
          aria-label="Filtrer les modèles par famille"
          className="h-auto w-full flex-wrap justify-start sm:h-9 sm:w-auto sm:justify-center"
        >
          {(Object.keys(FAMILY_LABELS) as TemplateFamily[]).map((key) => {
            const count =
              key === "all"
                ? TEMPLATES.length
                : key === "bigtech"
                  ? bigTechCount
                  : TEMPLATES.length - bigTechCount;
            return (
              <TabsTrigger key={key} value={key}>
                {FAMILY_LABELS[key]}
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                  {count}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onOpenDetail={() => setSelectedId(template.id)}
          />
        ))}
      </div>

      {/* Dialogue de détail */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        {selected && (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-xl">
                {selected.name}
                <LevelBadge level={selected.difficulty} />
              </DialogTitle>
              <DialogDescription className="pt-1 leading-relaxed">
                {selected.description}
              </DialogDescription>
              {inspiration && (
                <p className="flex items-center gap-1.5 text-xs text-primary">
                  <Landmark className="size-3.5 shrink-0" aria-hidden />
                  Inspiré de {inspiration.inspiration} — composants et échelle
                  adaptés au laboratoire.
                </p>
              )}
            </DialogHeader>

            <div className="space-y-4">
              <TemplatePreview data={selected.data} height={240} showZoneLabels />

              <div>
                <p className="mb-2 text-sm font-medium">
                  Composants ({selected.data.nodes.length})
                </p>
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {componentGroups.map(({ component, count }) => {
                    const Icon = getIcon(component.icon);
                    const style = getCategoryStyle(component.category);
                    return (
                      <div
                        key={component.id}
                        className="flex items-center gap-2.5 rounded-md border px-3 py-1.5"
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-md",
                            style.icon,
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {component.name}
                          {count > 1 && (
                            <span className="text-muted-foreground"> × {count}</span>
                          )}
                        </span>
                        <MaturityBadge maturity={component.maturity} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground tabular-nums">
                Scénario par défaut : {formatRps(selected.data.scenario.requestsPerSecond)} ·{" "}
                {selected.data.scenario.durationSec} s · mode{" "}
                {MODE_LABELS[selected.data.scenario.mode]} · seed{" "}
                {selected.data.scenario.seed}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setView("learn");
                  openCourse(null);
                }}
              >
                Voir les cours liés{linkedCourseCount > 0 ? ` (${linkedCourseCount})` : ""}
              </Button>
              <Button onClick={() => openTemplate(selected.id)}>
                Utiliser dans l&apos;éditeur
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
