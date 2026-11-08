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
import { useEffect, useState, useSyncExternalStore } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { analyzeGraph, type GraphAnalysis } from "@/engine";
import { storage } from "@/lib/persistence";
import { TEMPLATES } from "@/data/templates";
import type { ArchitectureData } from "@/types";
import { useAppStore, type EditorCommand } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

/** Clé du brouillon local (sessionStorage) — documents jamais sauvegardés. */
const DRAFT_KEY = "systemlab-draft";

/** Garde-fou anti-boucle : la restauration n'a lieu qu'une fois par vie de page. */
let draftRestored = false;

/** Empreinte du dernier brouillon écrit — évite d'écrire un contenu identique en boucle. */
let lastDraftFingerprint: string | null = null;

/** Le repli mobile de la barre de simulation n'est forcé qu'une fois par vie de page. */
let mobileCollapseForced = false;

/**
 * Exécute une commande éditoriale (nouveau document / modèle / architecture).
 * Factorisée : utilisée par le chemin non-dirty (exécution immédiate) et par la
 * confirmation de la garde anti-perte.
 */
let commandSeq = 0;
async function executeCommand(cmd: EditorCommand): Promise<void> {
  if (cmd.kind === "new") {
    useEditorStore.getState().reset();
    return;
  }
  if (cmd.kind === "load-template") {
    const template = TEMPLATES.find((t) => t.id === cmd.templateId);
    if (template) {
      useEditorStore
        .getState()
        .loadTemplate(template.data, cmd.exerciseHint ?? null, cmd.courseSlug);
      toast.success(`Modèle « ${template.name} » chargé dans l'éditeur`);
    } else {
      toast.error("Modèle introuvable.");
    }
    return;
  }
  // open-architecture : chargement asynchrone depuis l'API. Un jeton de
  // séquence neutralise la course « deux ouvertures rapprochées » — si une
  // commande plus récente a été lancée pendant le vol, le résultat tardif
  // est ignoré au lieu d'écraser le document affiché.
  const seq = ++commandSeq;
  let arch: Awaited<ReturnType<typeof storage.architectures.get>> = null;
  try {
    arch = await storage.architectures.get(cmd.architectureId);
  } catch {
    arch = null;
  }
  if (seq !== commandSeq) return;
  if (arch) {
    useEditorStore.getState().loadArchitecture(arch);
    toast.success(`Architecture « ${arch.name} » ouverte`);
  } else {
    toast.error("Impossible de charger cette architecture", {
      description: "Introuvable ou serveur injoignable.",
    });
  }
}

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
  const dirty = useEditorStore((s) => s.dirty);
  const architectureId = useEditorStore((s) => s.architectureId);
  const revision = useEditorStore((s) => s.revision);

  /* -------- commandes (montage + retour sur la vue) -------- */

  // Commande mise en attente derrière la garde anti-perte : confirmée via
  // l'AlertDialog « Modifications non enregistrées » ci-dessous.
  const [pendingCommand, setPendingCommand] = useState<EditorCommand | null>(null);

  // Stash pendant le rendu (pattern React officiel « adjusting state when a
  // prop changes » — https://react.dev/reference/react/useState) : détecter le
  // changement de commande au rendu évite tout setState synchrone dans l'effet
  // (règle react-hooks/set-state-in-effect).
  const [lastSeenCommand, setLastSeenCommand] = useState<EditorCommand | null>(null);
  if (command !== lastSeenCommand) {
    setLastSeenCommand(command);
    if (command !== null && useEditorStore.getState().dirty) {
      setPendingCommand(command);
    }
  }

  useEffect(() => {
    const cmd = command;
    if (!cmd) return;
    // Garde anti-perte : ne JAMAIS écraser silencieusement un document modifié
    // (reset/loadTemplate vident l'historique undo → perte irrécupérable).
    // Une commande stashée (pendingCommand) vit désormais côté confirmation —
    // elle est consommée ici pour ne pas se rejouer au prochain remontage.
    if (pendingCommand !== cmd) {
      void executeCommand(cmd);
    }
    // La commande est consommée immédiatement — exécutée ou en attente de
    // confirmation — pour ne pas re-déclencher cet effet en boucle.
    clearEditorCommand();
  }, [command, pendingCommand, clearEditorCommand]);

  /* -------- brouillon local (document jamais sauvegardé) -------- */

  // Écriture debouncée : le brouillon ne couvre que les documents NON
  // persistés (dirty && architectureId === null) — l'auto-save couvre le reste.
  useEffect(() => {
    if (!dirty || architectureId !== null) return;
    const timer = window.setTimeout(() => {
      if (typeof window === "undefined") return;
      const editor = useEditorStore.getState();
      if (!editor.dirty || editor.architectureId !== null) return;
      const data = editor.toArchitectureData();
      const fingerprint = JSON.stringify({ name: editor.name, data });
      if (fingerprint === lastDraftFingerprint) return; // rien n'a changé
      lastDraftFingerprint = fingerprint;
      try {
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ name: editor.name, data, savedAt: Date.now() }),
        );
      } catch {
        // Quota dépassé / stockage indisponible : le brouillon est best-effort.
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [revision, dirty, architectureId]);

  // Restauration au montage, uniquement si : aucune commande en attente (la
  // commande pilote le document) ET store « vierge ». Test retenu :
  // revision === 0 — toute commande (reset/loadTemplate/loadArchitecture)
  // comme toute mutation incrémente revision ; 0 ⇒ le document n'a jamais été
  // touché depuis la création du store (F5 / premier montage).
  useEffect(() => {
    if (draftRestored) return;
    draftRestored = true;
    if (typeof window === "undefined") return;
    if (useAppStore.getState().editorCommand) return;
    if (useEditorStore.getState().revision !== 0) return;
    let draft: { name?: string; data?: ArchitectureData } | null = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw) as { name?: string; data?: ArchitectureData };
    } catch {
      draft = null;
    }
    if (!draft?.data) return;
    // Garde de forme : un brouillon corrompu (clé tronquée, quota, format
    // périmé) ne doit JAMAIS casser l'éditeur — sans elle, loadTemplate
    // planterait sur deepCloneNodes(undefined) et démonterait l'arbre React.
    const d = draft.data;
    if (
      !Array.isArray(d.nodes) ||
      !Array.isArray(d.edges) ||
      !Array.isArray(d.zones) ||
      typeof d.scenario !== "object" ||
      d.scenario === null
    ) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // purge best-effort
      }
      return;
    }
    // loadTemplate pose architectureId = null et marque dirty — exactement
    // l'état « brouillon non sauvegardé » d'origine.
    useEditorStore.getState().loadTemplate(draft.data, null);
    if (draft.name && draft.name !== draft.data.name) {
      useEditorStore.getState().rename(draft.name);
    }
    sessionStorage.removeItem(DRAFT_KEY);
    // Mémorise l'empreinte pour que l'effet d'écriture ne réécrive pas la clé
    // tout de suite après la restauration (contenu identique → passe).
    lastDraftFingerprint = JSON.stringify({
      name: useEditorStore.getState().name,
      data: useEditorStore.getState().toArchitectureData(),
    });
    toast.info("Brouillon restauré", {
      description:
        "Vos modifications non sauvegardées de la session précédente ont été récupérées.",
    });
  }, []);

  /* -------- validité du graphe (analyzeGraph, debounce 400 ms) -------- */

  const [analysis, setAnalysis] = useState<GraphAnalysis>(() =>
    analyzeGraph(useEditorStore.getState().toArchitectureData()),
  );

  // L'analyse ne dépend que du CONTENU du document : `revision` est
  // incrémenté par toute mutation de contenu (nodes/edges/zones/scenario/
  // name) — jamais par la sélection ni les toggles de panneaux — il remplace
  // donc l'ancien graphKey (JSON.stringify du graphe entier) sans changer le
  // comportement : le debounce 400 ms absorbe les rafales de moveNode pendant
  // un drag, l'analyse relit le graphe à jour via getState().
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnalysis(analyzeGraph(useEditorStore.getState().toArchitectureData()));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [revision]);

  /* -------- responsive : repli par défaut de la barre de simulation -------- */

  // Forcé UNE SEULE fois par vie de la page : la préférence de l'utilisateur
  // (barre ouverte/fermée) survit ensuite aux démontages/remontages de la vue.
  useEffect(() => {
    if (mobileCollapseForced) return;
    mobileCollapseForced = true;
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

      {/* Garde anti-perte : confirmation avant d'écraser un document non
          sauvegardé (nouveau document, modèle, architecture existante). */}
      <AlertDialog
        open={pendingCommand !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCommand(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
            <AlertDialogDescription>
              Le document en cours contient des modifications non sauvegardées.
              Continuer remplacera son contenu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingCommand(null)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const cmd = pendingCommand;
                setPendingCommand(null);
                if (cmd) void executeCommand(cmd);
              }}
            >
              Continuer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
