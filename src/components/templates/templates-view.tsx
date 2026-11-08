"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

import { Search, Sparkles } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LevelBadge } from "@/components/learn/level-badge";
import { TemplatePreview } from "@/components/templates/template-preview";
import { CatalogIcon, CompanyMark } from "@/components/editor/catalog-icon";
import { useAppStore } from "@/stores/app-store";
import { getComponentById } from "@/data/catalog/registry";
import { getCategoryStyle } from "@/lib/icons";
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
 * du modèle (logos de marque des composants inclus) ; le clic ouvre un dialogue
 * de détail (composants, scénario, fait marquant, cours liés).
 * Les 18 modèles « géants de la tech » (YouTube, Netflix, Stripe…) portent le
 * logo et la couleur de leur entreprise, sont filtrables et triés en tête.
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

/** Normalisation insensible à la casse et aux accents (comme le registre). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function filterTemplates(family: TemplateFamily, query: string): ArchitectureTemplate[] {
  const byFamily =
    family === "classics"
      ? SORTED_TEMPLATES.filter((t) => !(t.id in BIG_TECH_META))
      : family === "bigtech"
        ? SORTED_TEMPLATES.filter((t) => t.id in BIG_TECH_META)
        : SORTED_TEMPLATES;
  const q = normalize(query.trim());
  if (!q) return byFamily;
  return byFamily.filter((t) => {
    const company = BIG_TECH_META[t.id]?.company ?? "";
    const haystack = normalize(
      `${t.name} ${t.description} ${t.tags.join(" ")} ${company}`,
    );
    return haystack.includes(q);
  });
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

/** Cours dont l'exercice part de ce modèle, dans l'ordre du catalogue. */
function linkedCourses(templateId: string) {
  return COURSES.filter((c) => c.exercise?.templateId === templateId);
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
  const meta = BIG_TECH_META[template.id];

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetail();
    }
  }

  return (
    <Card
      className={cn(
        "gap-3 py-4 transition-colors hover:border-primary/40",
        meta && "border-primary/25",
      )}
    >
      {/* Zone cliquable : ouvre le détail (le pied de carte reste hors du
          rôle bouton pour ne pas imbriquer deux éléments interactifs). */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpenDetail}
        onKeyDown={handleKeyDown}
        aria-label={`Ouvrir le détail : ${template.name}`}
        className="cursor-pointer rounded-t-xl focus-visible:outline-none [&:focus-visible]:border-primary/40"
      >
        <CardHeader className="grid-cols-1 px-4">
          <CardTitle className="flex min-w-0 items-center gap-2.5 text-base leading-snug">
            {meta ? (
              <span
                title={meta.company}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card"
              >
                <CompanyMark logoKey={meta.logo} className="size-5" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate" title={template.name}>
              {template.name}
            </span>
            <span className="shrink-0">
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
      </div>
      <CardFooter className="mt-auto justify-between gap-2 px-4">
        <span className="min-w-0 truncate text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {template.data.nodes.length} composant{template.data.nodes.length > 1 ? "s" : ""} ·{" "}
          {template.data.edges.length} connexion{template.data.edges.length > 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => openTemplate(template.id)}
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
  const openCourse = useAppStore((s) => s.openCourse);

  const [family, setFamily] = useState<TemplateFamily>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId !== null ? TEMPLATES.find((t) => t.id === selectedId) ?? null : null;

  const bigTechCount = useMemo(() => TEMPLATES.filter((t) => t.id in BIG_TECH_META).length, []);
  const visibleTemplates = useMemo(
    () => filterTemplates(family, query),
    [family, query],
  );
  const inspiration = selected ? BIG_TECH_META[selected.id] : undefined;
  const linked = useMemo(
    () => (selected ? linkedCourses(selected.id) : []),
    [selected],
  );

  const componentGroups = useMemo(
    () => (selected ? groupComponents(selected) : []),
    [selected],
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modèles d&apos;architecture</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {TEMPLATES.length} architectures prêtes à explorer, modifier et simuler — dont{" "}
        {bigTechCount} inspirées des géants de la tech, avec leurs logos et
        leurs chiffres marquants.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={family}
          onValueChange={(value) => setFamily(value as TemplateFamily)}
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
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher (nom, techno, entreprise…)"
            aria-label="Rechercher un modèle"
            className="pl-8"
          />
        </div>
      </div>

      {query.trim() ? (
        <p className="mt-3 text-sm text-muted-foreground tabular-nums" role="status">
          {visibleTemplates.length} modèle{visibleTemplates.length > 1 ? "s" : ""} correspond
          {visibleTemplates.length > 1 ? "ent" : ""} à « {query.trim()} »
          {visibleTemplates.length === 0 && " — essayez un autre mot-clé (kafka, cdn, Netflix…)."}
        </p>
      ) : null}

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
              <DialogTitle className="flex min-w-0 flex-wrap items-center gap-3 pr-6 text-xl">
                {inspiration && (
                  <span
                    title={inspiration.company}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-card"
                  >
                    <CompanyMark logoKey={inspiration.logo} className="size-6" />
                  </span>
                )}
                <span className="min-w-0 flex-1">{selected.name}</span>
                <span className="shrink-0">
                  <LevelBadge level={selected.difficulty} />
                </span>
              </DialogTitle>
              <DialogDescription className="pt-1 leading-relaxed">
                {selected.description}
              </DialogDescription>
              {inspiration && (
                <p className="flex items-center gap-1.5 text-xs text-primary">
                  <CompanyMark logoKey={inspiration.logo} className="size-3.5 shrink-0" />
                  Inspiré de {inspiration.inspiration} — composants et échelle
                  adaptés au laboratoire.
                </p>
              )}
            </DialogHeader>

            <div className="space-y-4">
              {inspiration && (
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5">
                  <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">Le saviez-vous ? </span>
                    <span className="text-muted-foreground">{inspiration.fact}</span>
                  </p>
                </div>
              )}

              <TemplatePreview data={selected.data} height={240} showZoneLabels />

              <div>
                <p className="mb-2 text-sm font-medium">
                  Composants ({selected.data.nodes.length})
                </p>
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {componentGroups.map(({ component, count }) => {
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
                          <CatalogIcon
                            name={component.icon}
                            componentId={component.id}
                            className="size-4"
                          />
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
              {linked.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedId(null);
                    openCourse(linked[0].slug);
                  }}
                >
                  Cours lié{linked.length > 1 ? `s (${linked.length})` : ""} —{" "}
                  <span className="truncate">{linked[0].title}</span>
                </Button>
              ) : (
                <span className="self-center text-xs text-muted-foreground">
                  Aucun exercice lié pour ce modèle.
                </span>
              )}
              <Button
                onClick={() => {
                  setSelectedId(null);
                  openTemplate(selected.id);
                }}
              >
                Utiliser dans l&apos;éditeur
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
