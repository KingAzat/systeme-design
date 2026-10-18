"use client";

/**
 * SystemLab — Lancement de la simulation depuis l'éditeur.
 * Handler unique partagé par la barre d'outils (« Simuler ») et la barre de
 * simulation basse (« Lancer la simulation ») : construit ArchitectureData,
 * vérifie analyzeGraph (les ERREURS bloquent, WARNING/INFO non) puis délègue
 * au simulation-store.
 */
import { toast } from "sonner";
import { analyzeGraph } from "@/engine";
import { useEditorStore } from "@/stores/editor-store";
import { useSimulationStore } from "@/stores/simulation-store";

export async function launchSimulation(): Promise<void> {
  if (useSimulationStore.getState().status === "running") return;
  const editor = useEditorStore.getState();
  const arch = editor.toArchitectureData();
  const analysis = analyzeGraph(arch);
  const errors = analysis.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    toast.error(`Simulation impossible : ${errors[0].message}`);
    return;
  }
  await useSimulationStore.getState().run(arch, editor.architectureId);
}
