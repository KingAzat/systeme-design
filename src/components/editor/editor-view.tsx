"use client";

/**
 * SystemLab — Vue Éditeur (racine, composant sans props).
 *
 * Assemblage : barre d'outils / bibliothèque (gauche) / canvas (centre) /
 * configuration (droite) / barre de simulation (bas).
 *
 * Consommation des commandes au montage et au retour sur la vue
 * (appStore.editorCommand) : "new", "load-template", "open-architecture".
 * L'état du document vit dans editor-store (Zustand hors composant) : il
 * survit au démontage par le shell quand la vue bascule vers les résultats.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { analyzeGraph, type GraphAnalysis } from "@/engine";
import { storage } from "@/lib/persistence";
import { TEMPLATES } from "@/data/templates";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArchitectureCanvas } from "./canvas/architecture-canvas";
import { ComponentLibrary } from "./panels/component-library";
import { ConfigPanel } from "./panels/config-panel";
import { SimulationBar } from "./panels/simulation-bar";
import { EditorToolbar } from "./toolbar/editor-toolbar";

/** Point de rupture desktop (< 1024 px → panneaux en Sheet). */
const DESKTOP_QUERY = "(min-width: 1024px)";

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(DESKTOP_QUERY);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

export function EditorView() {
  const isDesktop = useIsDesktop();
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);

  const command = useAppStore((s) => s.editorCommand);
  const clearEditorCommand = useAppStore((s) => s.clearEditorCommand);

  const libraryOpen = useEditorStore((s) => s.libraryOpen);
  const configOpen = useEditorStore((s) => s.configOpen);

  /* -------- commandes (montage + retour sur la vue) -------- */

  useEffect(() => {
    const cmd = command;
    if (!cmd) return;
    if (cmd.kind === "new") {
      useEditorStore.getState().reset();
    } else if (cmd.kind === "load-template") {
      const template = TEMPLATES.find((t) => t.id === cmd.templateId);
      if (template) {
        useEditorStore.getState().loadTemplate(template.data, cmd.exerciseHint ?? null);
        toast.success(`Modèle « ${template.name} » chargé dans l'éditeur`);
      } else {
        toast.error("Modèle introuvable.");
      }
    } else if (cmd.kind === "open-architecture") {
      const architectureId = cmd.architectureId;
      void (async () => {
        const arch = await storage.architectures.get(architectureId);
        if (arch) {
          useEditorStore.getState().loadArchitecture(arch);
          toast.success(`Architecture « ${arch.name} » ouverte`);
        } else {
          toast.error("Impossible de charger cette architecture.");
        }
      })();
    }
    clearEditorCommand();
  }, [command, clearEditorCommand]);

  /* -------- validité du graphe (analyzeGraph, debounce 400 ms) -------- */

  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const [analysis, setAnalysis] = useState<GraphAnalysis>(() =>
    analyzeGraph(useEditorStore.getState().toArchitectureData()),
  );
  const graphKey = useMemo(() => JSON.stringify([nodes, edges]), [nodes, edges]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnalysis(analyzeGraph(useEditorStore.getState().toArchitectureData()));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [graphKey]);

  /* -------- responsive : repli par défaut de la barre de simulation -------- */

  useEffect(() => {
    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      useEditorStore.getState().setSimulationBarOpen(false);
    }
  }, []);

  /* -------- bascule des panneaux (desktop) / Sheet (mobile) -------- */

  const toggleLibrary = () => {
    if (isDesktop) useEditorStore.getState().toggleLibrary();
    else setMobileLibraryOpen(true);
  };
  const toggleConfig = () => {
    if (isDesktop) useEditorStore.getState().toggleConfig();
    else setMobileConfigOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ReactFlowProvider>
        <EditorToolbar
          analysis={analysis}
          onToggleLibrary={toggleLibrary}
          onToggleConfig={toggleConfig}
        />

        <div className="flex min-h-0 flex-1">
          {isDesktop && (
            <div className={cn("h-full", libraryOpen ? "flex" : "hidden")}>
              <ComponentLibrary />
            </div>
          )}

          <ArchitectureCanvas />

          {isDesktop && (
            <div className={cn("h-full", configOpen ? "flex" : "hidden")}>
              <ConfigPanel />
            </div>
          )}
        </div>

        <SimulationBar className="shrink-0" />

        {/* Mobile (< 1024 px) : bibliothèque et configuration en Sheet latéral */}
        {!isDesktop && (
          <>
            <Sheet open={mobileLibraryOpen} onOpenChange={setMobileLibraryOpen}>
              <SheetContent
                side="left"
                className="w-80 gap-0 border-r p-0 sm:max-w-[320px] [&>button]:hidden"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Composants</SheetTitle>
                  <SheetDescription>
                    Bibliothèque de composants de l&apos;architecture
                  </SheetDescription>
                </SheetHeader>
                <ComponentLibrary
                  className="h-full"
                  onCollapse={() => setMobileLibraryOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <Sheet open={mobileConfigOpen} onOpenChange={setMobileConfigOpen}>
              <SheetContent
                side="right"
                className="w-80 gap-0 border-l p-0 sm:max-w-[320px] [&>button]:hidden"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Configuration</SheetTitle>
                  <SheetDescription>
                    Panneau de configuration de l&apos;élément sélectionné
                  </SheetDescription>
                </SheetHeader>
                <ConfigPanel
                  className="h-full"
                  onCloseExtra={() => setMobileConfigOpen(false)}
                />
              </SheetContent>
            </Sheet>
          </>
        )}
      </ReactFlowProvider>
    </div>
  );
}
