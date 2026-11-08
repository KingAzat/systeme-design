"use client";

/**
 * SystemLab — Store de simulation (contrat consommé par la vue résultats).
 *
 * run(arch, architectureId) :
 *  - status "running", AbortController conservé (abort() disponible) ;
 *  - exécute runSimulation de @/engine avec onProgress + signal ;
 *  - succès : résultat enrichi (id, architectureId ("local" si non sauvegardé),
 *    architectureName si non déjà renseignée), persistance best-effort d'un
 *    SimulationRecord (uniquement si architectureId ≠ null), bascule vers la
 *    vue résultats via appStore.openResult + refreshSimulations, status "done" ;
 *  - AbortError → retour à "idle" sans erreur ;
 *  - autre erreur → status "error" + message.
 */
import { create } from "zustand";
import { toast } from "sonner";
import type { ArchitectureData, SimulationProgress, SimulationResult } from "@/types";
import { runSimulation } from "@/engine";
import { shortId } from "@/lib/format";
import { storage } from "@/lib/persistence";
import { useAppStore } from "@/stores/app-store";

export interface SimulationState {
  status: "idle" | "running" | "done" | "error";
  progress: SimulationProgress | null;
  error: string | null;
  result: SimulationResult | null;
  /** Contrôleur du run courant (interne, non exposé au contrat). */
  controller: AbortController | null;

  run: (
    arch: ArchitectureData,
    architectureId: string | null,
    /** Cours d'origine si la simulation lance un exercice (évaluation des
     *  critères de réussite dans la vue résultats), sinon null/undefined. */
    exerciseSlug?: string | null,
  ) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  status: "idle",
  progress: null,
  error: null,
  result: null,
  controller: null,

  run: async (arch, architectureId, exerciseSlug) => {
    if (get().status === "running") return;
    const controller = new AbortController();
    set({ status: "running", progress: null, error: null, result: null, controller });
    try {
      const result = await runSimulation(arch, {
        onProgress: (p) => {
          // Ignore les progrès d'un run obsolète (abort + relance immédiate).
          if (get().controller === controller) set({ progress: p });
        },
        signal: controller.signal,
      });
      const enriched: SimulationResult = {
        ...result,
        id: result.id || shortId("sim"),
        architectureId: architectureId ?? "local",
        architectureName: result.architectureName || arch.name,
      };
      set({ result: enriched, status: "done", progress: null, controller: null });

      if (architectureId !== null) {
        try {
          await storage.simulations.create({
            architectureId,
            label: arch.name,
            engineVersion: enriched.engineVersion,
            mode: enriched.mode,
            seed: enriched.seed,
            scenario: enriched.scenario,
            result: enriched,
          });
        } catch {
          // Best-effort : la simulation reste utilisable même non archivée.
          toast.error("Résultat non archivé : la persistance est indisponible.");
        }
      }

      useAppStore.getState().openResult(enriched, exerciseSlug ?? null);
      // Best-effort : jamais d'échec non géré pour l'appelant.
      useAppStore.getState().refreshSimulations().catch(() => undefined);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        set({ status: "idle", progress: null, controller: null });
        return;
      }
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        progress: null,
        controller: null,
      });
    }
  },

  abort: () => {
    get().controller?.abort();
  },

  reset: () => {
    get().controller?.abort();
    set({ status: "idle", progress: null, error: null, result: null, controller: null });
  },
}));
