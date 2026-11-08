"use client";

/**
 * SystemLab — Panneau bibliothèque de composants (gauche).
 * Recherche + onglets Tous/Favoris/Récents, catégories en accordéon,
 * cartes drag & drop (HTML5) + double-clic (ajout au centre du canvas),
 * favoris persistés (library-store).
 */
import { useMemo, useState } from "react";
import { ChevronDown, Filter, Search, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryStyle } from "@/lib/icons";
import { MATURITY_LABELS } from "@/lib/labels";
import {
  CATEGORIES,
  getComponentsByCategory,
  searchComponents,
  COMPONENTS,
} from "@/data/catalog/registry";
import { useLibraryStore } from "@/stores/library-store";
import { useEditorStore } from "@/stores/editor-store";
import type { CatalogComponent, SimulationMaturity } from "@/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ADD_COMPONENT_CENTER_EVENT, COMPONENT_DND_TYPE } from "../constants";
import { CatalogIcon } from "../catalog-icon";

type LibraryTab = "all" | "favorites" | "recents";

/** Limite d'affichage des résultats de recherche (60 premiers). */
const SEARCH_RESULTS_LIMIT = 60;

const MATURITY_META: Record<
  SimulationMaturity,
  { classes: string; title: string }
> = {
  simulated: {
    classes:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    title: "Composant entièrement simulé par le moteur",
  },
  partial: {
    // amber-700 (au lieu de amber-600) : contraste AA en mode clair.
    classes: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    title: "Modélisation partielle : latence et capacité génériques",
  },
  visual: {
    classes:
      "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
    title: "Composant visuel : non pris en compte par la simulation",
  },
};

function MaturityBadge({ maturity }: { maturity: SimulationMaturity }) {
  const meta = MATURITY_META[maturity];
  return (
    <span
      title={meta.title}
      className={cn("rounded px-1 py-px text-[10px] leading-4 font-medium", meta.classes)}
    >
      {MATURITY_LABELS[maturity]}
    </span>
  );
}

/** Demande d'ajout au centre du canvas (écouté par ArchitectureCanvas). */
function requestAddAtCenter(componentId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(ADD_COMPONENT_CENTER_EVENT, { detail: componentId }),
  );
}

interface ComponentCardProps {
  component: CatalogComponent;
  favorite: boolean;
  onToggleFavorite: (componentId: string) => void;
  compact?: boolean;
}

function ComponentCard({
  component,
  favorite,
  onToggleFavorite,
  compact = false,
}: ComponentCardProps) {
  const style = getCategoryStyle(component.category);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Ajouter ${component.name} au canvas`}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(COMPONENT_DND_TYPE, component.id);
            event.dataTransfer.effectAllowed = "copy";
          }}
          onDoubleClick={() => requestAddAtCenter(component.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              requestAddAtCenter(component.id);
            }
          }}
          className={cn(
            "group cursor-grab rounded-lg border border-border bg-card p-2 text-left transition-colors select-none hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
            compact ? "flex items-center gap-2" : "",
          )}
        >
          {compact ? (
            <>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md",
                  style.icon,
                )}
              >
                <CatalogIcon name={component.icon} componentId={component.id} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {component.name}
                </span>
                <span className="mt-0.5 block">
                  <MaturityBadge maturity={component.maturity} />
                </span>
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md",
                    style.icon,
                  )}
                >
                  <CatalogIcon name={component.icon} componentId={component.id} className="size-3.5" />
                </span>
                <p className="truncate text-xs font-medium">{component.name}</p>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <MaturityBadge maturity={component.maturity} />
                <FavoriteStar
                  favorite={favorite}
                  onToggle={() => onToggleFavorite(component.id)}
                  name={component.name}
                />
              </div>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-56 text-xs">
        <p className="font-medium">{component.name}</p>
        <p className="mt-0.5 opacity-90">{component.description}</p>
        <p className="mt-1 opacity-70">
          Glissez sur le canvas ou double-cliquez pour ajouter.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function FavoriteStar({
  favorite,
  onToggle,
  name,
}: {
  favorite: boolean;
  onToggle: () => void;
  name: string;
}) {
  return (
    <button
      type="button"
      aria-label={favorite ? `Retirer ${name} des favoris` : `Ajouter ${name} aux favoris`}
      aria-pressed={favorite}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="shrink-0 cursor-pointer rounded-sm p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Star
        className={cn(
          "size-3.5",
          favorite
            ? "fill-amber-400 text-amber-400"
            : "text-muted-foreground/40 hover:text-amber-400",
        )}
      />
    </button>
  );
}

function EmptyList({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

export interface ComponentLibraryProps {
  className?: string;
  /** Appelé par le bouton « replier » (fermeture Sheet sur mobile). */
  onCollapse?: () => void;
}

export function ComponentLibrary({ className, onCollapse }: ComponentLibraryProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<LibraryTab>("all");
  const [simulatedOnly, setSimulatedOnly] = useState(false);
  const [openCategories, setOpenCategories] = useState<string[]>(["clients"]);

  const favorites = useLibraryStore((s) => s.favorites);
  const recents = useLibraryStore((s) => s.recents);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const setLibraryOpen = useEditorStore((s) => s.setLibraryOpen);

  const categories = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        components: getComponentsByCategory(category.id),
      })).filter((group) => group.components.length > 0),
    [],
  );

  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return searchComponents(trimmed);
  }, [query]);

  // Affichage borné : les 60 premiers résultats suffisent à couvrir toute
  // recherche pertinente et gardent le panneau fluide sur petit écran.
  const visibleSearchResults = searchResults.slice(0, SEARCH_RESULTS_LIMIT);
  const searchTruncated = searchResults.length > SEARCH_RESULTS_LIMIT;

  const favoriteComponents = useMemo(
    () =>
      favorites
        .map((id) => COMPONENTS.find((c) => c.id === id))
        .filter((c): c is CatalogComponent => Boolean(c)),
    [favorites],
  );

  const recentComponents = useMemo(
    () =>
      recents
        .map((id) => COMPONENTS.find((c) => c.id === id))
        .filter((c): c is CatalogComponent => Boolean(c)),
    [recents],
  );

  const applyFilter = (components: CatalogComponent[]): CatalogComponent[] =>
    simulatedOnly ? components.filter((c) => c.maturity === "simulated") : components;

  const searching = query.trim().length > 0;

  const renderGrid = (components: CatalogComponent[], compact = false) => (
    <div className={cn(compact ? "space-y-1.5" : "grid grid-cols-2 gap-1.5")}>
      {components.map((component) => (
        <ComponentCard
          key={component.id}
          component={component}
          favorite={favorites.includes(component.id)}
          onToggleFavorite={toggleFavorite}
          compact={compact && !searching}
        />
      ))}
    </div>
  );

  return (
    <aside
      className={cn(
        "flex w-72 shrink-0 flex-col border-r border-border bg-card",
        className,
      )}
      aria-label="Bibliothèque de composants"
    >
      {/* En-tête */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-sm font-semibold">Composants</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Replier le panneau des composants"
          onClick={() => {
            if (onCollapse) onCollapse();
            else setLibraryOpen(false);
          }}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Recherche */}
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="component-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un composant…"
            aria-label="Rechercher un composant"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as LibraryTab)}>
          <TabsList className="h-8 w-full">
            <TabsTrigger value="all" className="text-xs">
              Tous
            </TabsTrigger>
            <TabsTrigger value="favorites" className="text-xs">
              Favoris
            </TabsTrigger>
            <TabsTrigger value="recents" className="text-xs">
              Récents
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Contenu */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {searching ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {searchResults.length} résultat{searchResults.length > 1 ? "s" : ""}
            </p>
            {searchResults.length === 0 ? (
              <EmptyList message="Aucun composant ne correspond à cette recherche." />
            ) : (
              <>
                {renderGrid(applyFilter(visibleSearchResults))}
                {searchTruncated && (
                  <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
                    {SEARCH_RESULTS_LIMIT} premiers résultats affichés — affinez votre
                    recherche pour les réduire.
                  </p>
                )}
              </>
            )}
          </div>
        ) : tab === "favorites" ? (
          <div className="space-y-2">
            {favoriteComponents.length === 0 ? (
              <EmptyList message="Aucun favori pour le moment. Cliquez sur l'étoile d'un composant pour l'épingler." />
            ) : (
              renderGrid(applyFilter(favoriteComponents), true)
            )}
          </div>
        ) : tab === "recents" ? (
          <div className="space-y-2">
            {recentComponents.length === 0 ? (
              <EmptyList message="Aucun composant récent. Ajoutez-en un depuis l'onglet « Tous »." />
            ) : (
              renderGrid(applyFilter(recentComponents), true)
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Accordion
              type="multiple"
              value={openCategories}
              onValueChange={setOpenCategories}
            >
              {categories.map(({ category, components }) => {
                const style = getCategoryStyle(category.id);
                const visible = applyFilter(components);
                return (
                  <AccordionItem key={category.id} value={category.id} className="border-b-0">
                    <AccordionTrigger className="rounded-md py-2 hover:no-underline">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-md",
                            style.icon,
                          )}
                        >
                          <CatalogIcon name={category.icon} className="size-3.5" />
                        </span>
                        <span className="truncate text-xs font-medium">
                          {category.label}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {visible.length}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2">
                      {visible.length === 0 ? (
                        <p className="px-1 text-xs text-muted-foreground">
                          Aucun composant simulé dans cette catégorie.
                        </p>
                      ) : (
                        renderGrid(visible)
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* Composants favoris (raccourci en bas de l'onglet Tous) */}
            {favoriteComponents.length > 0 && (
              <section className="space-y-1.5 border-t border-border pt-3">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  Composants favoris
                </h3>
                {renderGrid(favoriteComponents, true)}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Pied : filtre « simulés uniquement » */}
      <div className="shrink-0 border-t border-border p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={simulatedOnly}
          onClick={() => setSimulatedOnly((v) => !v)}
          className={cn(
            "h-7 w-full justify-start gap-1.5 text-xs",
            simulatedOnly && "bg-accent text-accent-foreground",
          )}
        >
          <Filter className="size-3.5" />
          Simulés uniquement
          <ChevronDown
            className={cn(
              "ml-auto size-3 transition-transform",
              simulatedOnly ? "" : "-rotate-90",
            )}
          />
        </Button>
      </div>
    </aside>
  );
}
