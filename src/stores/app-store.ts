"use client";

/**
 * SystemLab — Store applicatif (navigation SPA + listes partagées).
 * L'état du canvas vit dans editor-store ; l'état de simulation dans
 * simulation-store. Ce store gère la vue active et les passerelles inter-vues.
 */
import { create } from "zustand";
import type {
  AppView,
  ArchitectureData,
  ArchitectureSummary,
  SimulationResult,
  SimulationSummary,
} from "@/types";
import { storage } from "@/lib/persistence";
import { TEMPLATES } from "@/data/templates";

/** Commande à consommer par l'éditeur au montage/à l'activation. */
export type EditorCommand =
  | { kind: "new" }
  | { kind: "load-template"; templateId: string; exerciseHint?: string }
  | { kind: "open-architecture"; architectureId: string };

interface AppState {
  activeView: AppView;
  viewHistory: AppView[];
  /** Résultat affiché dans la vue résultats. */
  currentResult: SimulationResult | null;
  /** Résultats archivés pour la comparaison A/B. */
  compareA: SimulationResult | null;
  compareB: SimulationResult | null;
  /** Cours ouvert dans la vue apprentissage. */
  activeCourseSlug: string | null;
  /** Commande en attente pour l'éditeur. */
  editorCommand: EditorCommand | null;

  architectures: ArchitectureSummary[];
  architecturesLoading: boolean;
  simulations: SimulationSummary[];
  simulationsLoading: boolean;

  setView: (view: AppView) => void;
  goBack: () => void;
  openEditorWithCommand: (command: EditorCommand) => void;
  /** Consommé par l'éditeur après prise en compte (évite les rechargements). */
  clearEditorCommand: () => void;
  openTemplate: (templateId: string, exerciseHint?: string) => void;
  openArchitecture: (architectureId: string) => void;
  newArchitecture: () => void;
  openResult: (result: SimulationResult) => void;
  openCompare: (a: SimulationResult, b: SimulationResult) => void;
  openCourse: (slug: string | null) => void;

  refreshArchitectures: () => Promise<void>;
  refreshSimulations: () => Promise<void>;
  createArchitecture: (data: ArchitectureData) => Promise<ArchitectureSummary>;
  deleteArchitecture: (id: string) => Promise<void>;
  duplicateArchitecture: (id: string) => Promise<void>;
  deleteSimulation: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeView: "landing",
  viewHistory: [],
  currentResult: null,
  compareA: null,
  compareB: null,
  activeCourseSlug: null,
  editorCommand: null,

  architectures: [],
  architecturesLoading: false,
  simulations: [],
  simulationsLoading: false,

  setView: (view) => {
    const { activeView } = get();
    set((s) => ({
      activeView: view,
      viewHistory: activeView === view ? s.viewHistory : [...s.viewHistory.slice(-9), activeView],
    }));
  },

  goBack: () => {
    const history = get().viewHistory;
    const previous = history[history.length - 1];
    if (previous) {
      set({ activeView: previous, viewHistory: history.slice(0, -1) });
    }
  },

  openEditorWithCommand: (command) => {
    set({ editorCommand: command });
    get().setView("editor");
  },

  clearEditorCommand: () => set({ editorCommand: null }),

  openTemplate: (templateId, exerciseHint) => {
    get().openEditorWithCommand({ kind: "load-template", templateId, exerciseHint });
  },

  openArchitecture: (architectureId) => {
    get().openEditorWithCommand({ kind: "open-architecture", architectureId });
  },

  newArchitecture: () => {
    get().openEditorWithCommand({ kind: "new" });
  },

  openResult: (result) => {
    set({ currentResult: result });
    get().setView("results");
  },

  openCompare: (a, b) => {
    set({ compareA: a, compareB: b });
    get().setView("compare");
  },

  openCourse: (slug) => {
    set({ activeCourseSlug: slug });
    if (!slug) get().setView("learn");
  },

  refreshArchitectures: async () => {
    set({ architecturesLoading: true });
    try {
      const items = await storage.architectures.list();
      set({ architectures: items });
    } finally {
      set({ architecturesLoading: false });
    }
  },

  refreshSimulations: async () => {
    set({ simulationsLoading: true });
    try {
      const items = await storage.simulations.list(undefined, 100);
      set({ simulations: items });
    } finally {
      set({ simulationsLoading: false });
    }
  },

  createArchitecture: async (data) => {
    const created = await storage.architectures.create(data);
    await get().refreshArchitectures();
    return {
      id: created.id,
      name: created.name,
      description: created.description,
      nodeCount: created.nodes.length,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  },

  deleteArchitecture: async (id) => {
    await storage.architectures.remove(id);
    await get().refreshArchitectures();
    await get().refreshSimulations();
  },

  duplicateArchitecture: async (id) => {
    await storage.architectures.duplicate(id);
    await get().refreshArchitectures();
  },

  deleteSimulation: async (id) => {
    await storage.simulations.remove(id);
    await get().refreshSimulations();
  },
}));

/** Nom lisible d'une vue (barre d'application / fil d'ariane). */
export const VIEW_LABELS: Record<AppView, string> = {
  landing: "Accueil",
  dashboard: "Tableau de bord",
  editor: "Éditeur",
  results: "Résultats",
  compare: "Comparaison",
  templates: "Modèles",
  learn: "Apprentissage",
  history: "Historique",
  settings: "Paramètres",
};

/** Recherche un modèle par identifiant (utilisé par plusieurs vues). */
export function getTemplateById(id: string) {
  return TEMPLATES.find((t) => t.id === id);
}
