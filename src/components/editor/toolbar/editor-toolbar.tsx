"use client";

/**
 * SystemLab — Barre d'outils de l'éditeur.
 * Nom éditable, état de sauvegarde, validité (analyzeGraph), undo/redo,
 * zoom/ajuster/réinitialisation de vue, comparaison, lancement de simulation,
 * sauvegarde manuelle + sauvegarde automatique (debounce 2 s) et bascule des
 * panneaux latéraux (desktop) / Sheet (mobile).
 */
import { useEffect, useRef, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import {
  CircleX,
  Crosshair,
  GitCompare,
  Home,
  Info,
  PanelLeft,
  PanelRight,
  Pencil,
  Play,
  Redo2,
  RotateCcw,
  Save,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import type { GraphAnalysis } from "@/engine";
import { storage } from "@/lib/persistence";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { launchSimulation } from "../run-simulation";

export interface EditorToolbarProps {
  analysis: GraphAnalysis | null;
  /** Desktop : replie/déploie le panneau ; mobile : ouvre le Sheet. */
  onToggleLibrary: () => void;
  onToggleConfig: () => void;
}

export function EditorToolbar({ analysis, onToggleLibrary, onToggleConfig }: EditorToolbarProps) {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  const name = useEditorStore((s) => s.name);
  const dirty = useEditorStore((s) => s.dirty);
  const savedAt = useEditorStore((s) => s.savedAt);
  const nodeCount = useEditorStore((s) => s.nodes.length);
  const architectureId = useEditorStore((s) => s.architectureId);
  const revision = useEditorStore((s) => s.revision);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const libraryOpen = useEditorStore((s) => s.libraryOpen);
  const configOpen = useEditorStore((s) => s.configOpen);

  const setView = useAppStore((s) => s.setView);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);

  /* ----------------------- sauvegarde ----------------------- */

  const save = async (silent: boolean): Promise<void> => {
    if (saveInFlight.current) return;
    const editor = useEditorStore.getState();
    const data = editor.toArchitectureData();
    saveInFlight.current = true;
    setSaving(true);
    try {
      if (editor.architectureId) {
        await storage.architectures.update(editor.architectureId, {
          name: data.name,
          description: data.description ?? null,
          data,
        });
        editor.markSaved();
      } else {
        const created = await storage.architectures.create(data);
        editor.markSaved(created.id);
      }
      await useAppStore.getState().refreshArchitectures();
      if (!silent) toast.success("Architecture sauvegardée");
    } catch (error) {
      if (!silent) {
        toast.error(
          error instanceof Error
            ? `Sauvegarde impossible : ${error.message}`
            : "Sauvegarde impossible.",
        );
      }
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  // Sauvegarde automatique : 2 s après la dernière action mutante,
  // uniquement si l'architecture est déjà persistée (architectureId ≠ null).
  useEffect(() => {
    if (!dirty || !architectureId) return;
    const timer = window.setTimeout(() => {
      const editor = useEditorStore.getState();
      if (!editor.dirty || !editor.architectureId) return;
      void save(true);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [revision, dirty, architectureId]);

  /* ----------------------- édition du nom ----------------------- */

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed) useEditorStore.getState().rename(trimmed);
    setEditingName(false);
  };

  /* ----------------------- validité ----------------------- */

  const errorCount = analysis?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warningCount = analysis?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const issueCount = analysis?.issues.length ?? 0;

  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 sm:px-3">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label="Retour au tableau de bord"
        title="Tableau de bord"
        onClick={() => setView("dashboard")}
      >
        <Home className="size-4" />
      </Button>

      <div className="flex min-w-0 items-center gap-1">
        {editingName ? (
          <Input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitName();
              if (event.key === "Escape") setEditingName(false);
            }}
            aria-label="Nom de l'architecture"
            className="h-8 w-40 text-sm font-semibold sm:w-56"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftName(name);
              setEditingName(true);
            }}
            className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Renommer l'architecture"
            title="Renommer l'architecture"
          >
            <span className="truncate">{name}</span>
            <Pencil className="size-3 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Indicateurs d'état */}
      <div className="hidden items-center gap-3 border-l border-border pl-3 text-xs md:flex">
        {dirty ? (
          <span className="flex items-center gap-1.5 font-medium text-warning">
            <span aria-hidden className="size-1.5 rounded-full bg-warning" />
            Modifications non sauvegardées
          </span>
        ) : savedAt ? (
          <span className="flex items-center gap-1.5 text-success">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            Sauvegardé {timeAgo(savedAt)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/50" />
            Jamais sauvegardé
          </span>
        )}
        <span className="text-muted-foreground">
          {nodeCount} composant{nodeCount > 1 ? "s" : ""}
        </span>
      </div>

      {/* Badge de validité */}
      {analysis && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              className={cn(
                "hidden cursor-default sm:inline-flex",
                errorCount > 0
                  ? "border-transparent bg-destructive/10 text-destructive"
                  : warningCount > 0
                    ? "border-transparent bg-warning/10 text-warning"
                    : "border-transparent bg-success/10 text-success",
              )}
            >
              {analysis.valid
                ? issueCount > 0
                  ? `${issueCount} problème${issueCount > 1 ? "s" : ""}`
                  : "Architecture valide"
                : `${issueCount} problème${issueCount > 1 ? "s" : ""}`}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-72">
            <p className="mb-1 font-medium">Analyse du graphe</p>
            {analysis.issues.length === 0 ? (
              <p className="text-xs opacity-90">
                Aucun problème détecté : le graphe est prêt pour la simulation.
              </p>
            ) : (
              <ul className="space-y-1">
                {analysis.issues.slice(0, 10).map((issue) => (
                  <li
                    key={`${issue.code}-${issue.nodeId ?? ""}`}
                    className="flex items-start gap-1.5 text-xs"
                  >
                    {issue.severity === "error" ? (
                      <CircleX className="mt-0.5 size-3 shrink-0 text-destructive" />
                    ) : issue.severity === "warning" ? (
                      <TriangleAlert className="mt-0.5 size-3 shrink-0 text-warning" />
                    ) : (
                      <Info className="mt-0.5 size-3 shrink-0 text-info" />
                    )}
                    {issue.message}
                  </li>
                ))}
                {analysis.issues.length > 10 && (
                  <li className="text-xs opacity-70">
                    + {analysis.issues.length - 10} autre(s)…
                  </li>
                )}
              </ul>
            )}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Actions à droite */}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={
            libraryOpen
              ? "Masquer la bibliothèque de composants"
              : "Afficher la bibliothèque de composants"
          }
          title="Bibliothèque de composants"
          aria-pressed={libraryOpen}
          onClick={onToggleLibrary}
        >
          <PanelLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={
            configOpen
              ? "Masquer le panneau de configuration"
              : "Afficher le panneau de configuration"
          }
          title="Panneau de configuration"
          aria-pressed={configOpen}
          onClick={onToggleConfig}
        >
          <PanelRight className="size-4" />
        </Button>

        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Sauvegarder l'architecture"
          title="Sauvegarder"
          disabled={saving || (!dirty && architectureId !== null)}
          onClick={() => void save(false)}
        >
          <Save className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Annuler la dernière action"
          title="Annuler (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => useEditorStore.getState().undo()}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Rétablir"
          title="Rétablir (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => useEditorStore.getState().redo()}
        >
          <Redo2 className="size-4" />
        </Button>

        <span className="hidden w-12 text-center text-xs text-muted-foreground tabular-nums sm:block">
          {Math.round(zoom * 100)} %
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 sm:inline-flex"
          aria-label="Ajuster la vue à l'écran"
          title="Ajuster à l'écran"
          onClick={() => void rf.fitView({ padding: 0.2, duration: 300 })}
        >
          <Crosshair className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 sm:inline-flex"
          aria-label="Réinitialiser la vue"
          title="Réinitialiser la vue"
          onClick={() => void rf.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 })}
        >
          <RotateCcw className="size-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="hidden h-8 md:inline-flex"
          onClick={() => setView("compare")}
        >
          <GitCompare className="size-3.5" />
          Comparer
        </Button>
        <Button size="sm" className="h-8" onClick={() => void launchSimulation()}>
          <Play className="size-3.5" />
          <span className="hidden sm:inline">Simuler</span>
        </Button>
      </div>
    </div>
  );
}
