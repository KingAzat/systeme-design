"use client";

import {
  Activity,
  Boxes,
  Clock,
  Copy,
  Eye,
  FolderOpen,
  HeartPulse,
  History,
  Layers,
  Loader2,
  Network,
  Pencil,
  Plus,
  Server,
  Bot,
  Timer,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import { LevelBadge } from "@/components/learn/level-badge";
import { useLearnedCourses } from "@/components/learn/learned-courses";
import { useAppStore } from "@/stores/app-store";
import { storage } from "@/lib/persistence";
import {
  formatMs,
  formatPercent,
  formatRps,
  timeAgo,
} from "@/lib/format";
import { TEMPLATES } from "@/data/templates";
import { COURSES } from "@/data/courses";
import type { ArchitectureSummary } from "@/types";

/**
 * SystemLab — Tableau de bord.
 * Vue d'ensemble : statistiques, démarrage rapide, architectures récentes,
 * dernières simulations et parcours suggéré. Toutes les mutations passent
 * par les actions du store (ou la façade storage pour le renommage).
 */

const MODE_LABELS: Record<string, string> = {
  analytical: "Analytique",
  "event-sampled": "Événementiel",
};

const QUICK_TEMPLATE_ICONS: Record<string, LucideIcon> = {
  "api-simple": Server,
  "three-tier": Layers,
  "api-scalable": Network,
  "rag-ai": Bot,
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "erreur inconnue";
}

/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function DashboardView() {
  const architectures = useAppStore((s) => s.architectures);
  const simulations = useAppStore((s) => s.simulations);
  const newArchitecture = useAppStore((s) => s.newArchitecture);
  const openTemplate = useAppStore((s) => s.openTemplate);
  const openArchitecture = useAppStore((s) => s.openArchitecture);
  const duplicateArchitecture = useAppStore((s) => s.duplicateArchitecture);
  const deleteArchitecture = useAppStore((s) => s.deleteArchitecture);
  const refreshArchitectures = useAppStore((s) => s.refreshArchitectures);
  const openResult = useAppStore((s) => s.openResult);
  const openCourse = useAppStore((s) => s.openCourse);
  const setView = useAppStore((s) => s.setView);

  // Progression locale (localStorage), partagée avec la vue apprentissage.
  const learnedSlugs = useLearnedCourses();
  const [openingSimId, setOpeningSimId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<ArchitectureSummary | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ArchitectureSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Chargement initial : listes vides → refresh auprès de la couche persistence.
  useEffect(() => {
    const s = useAppStore.getState();
    if (s.architectures.length === 0) {
      void s.refreshArchitectures().catch(() =>
        toast.error("Impossible de charger vos architectures."),
      );
    }
    if (s.simulations.length === 0) {
      void s.refreshSimulations().catch(() =>
        toast.error("Impossible de charger vos simulations."),
      );
    }
  }, []);

  const recent = useMemo(() => simulations.slice(0, 10), [simulations]);
  const avgP95 =
    recent.length > 0
      ? recent.reduce((acc, s) => acc + s.overall.p95Ms, 0) / recent.length
      : null;
  const avgAvailability =
    recent.length > 0
      ? recent.reduce((acc, s) => acc + s.overall.availability, 0) / recent.length
      : null;

  const quickTemplates = useMemo(
    () =>
      ["api-simple", "three-tier", "api-scalable", "rag-ai"]
        .map((id) => TEMPLATES.find((t) => t.id === id))
        .filter((t) => t !== undefined),
    [],
  );

  const suggestedCourses = useMemo(() => {
    const remaining = COURSES.filter((c) => !learnedSlugs.includes(c.slug));
    return (remaining.length > 0 ? remaining : COURSES).slice(0, 3);
  }, [learnedSlugs]);

  /* -------- Actions -------- */

  async function handleDuplicate(arch: ArchitectureSummary) {
    setDuplicatingId(arch.id);
    try {
      await duplicateArchitecture(arch.id);
      toast.success(`« ${arch.name} » dupliquée.`);
    } catch (err) {
      toast.error(`Duplication impossible : ${errorMessage(err)}`);
    } finally {
      setDuplicatingId(null);
    }
  }

  function openRename(arch: ArchitectureSummary) {
    setRenameName(arch.name);
    setRenameTarget(arch);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget) return;
    const name = renameName.trim();
    if (name.length === 0) {
      toast.error("Le nom ne peut pas être vide.");
      return;
    }
    setRenaming(true);
    try {
      await storage.architectures.update(renameTarget.id, { name });
      await refreshArchitectures();
      toast.success("Architecture renommée.");
      setRenameTarget(null);
    } catch (err) {
      toast.error(`Renommage impossible : ${errorMessage(err)}`);
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteArchitecture(deleteTarget.id);
      toast.success(`« ${deleteTarget.name} » supprimée.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(`Suppression impossible : ${errorMessage(err)}`);
    } finally {
      setDeleting(false);
    }
  }

  async function handleViewSimulation(id: string) {
    setOpeningSimId(id);
    try {
      const result = await storage.simulations.get(id);
      if (!result) {
        toast.error("Simulation introuvable.");
        return;
      }
      openResult(result);
    } catch {
      toast.error("Impossible de charger la simulation.");
    } finally {
      setOpeningSimId(null);
    }
  }

  /* -------- Rendu -------- */

  return (
    <div className="mx-auto w-full max-w-[1200px] p-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vos architectures, simulations et parcours, en un coup d&apos;œil.
          </p>
        </div>
        <Button onClick={() => newArchitecture()}>
          <Plus />
          Nouvelle architecture
        </Button>
      </div>

      {/* Statistiques */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Boxes} label="Architectures" value={String(architectures.length)} />
        <StatCard icon={Activity} label="Simulations archivées" value={String(simulations.length)} />
        <StatCard
          icon={Timer}
          label="p95 moyen (10 dernières)"
          value={avgP95 === null ? "—" : formatMs(avgP95)}
        />
        <StatCard
          icon={HeartPulse}
          label="Disponibilité moyenne"
          value={avgAvailability === null ? "—" : formatPercent(avgAvailability)}
        />
      </div>

      {/* Démarrage rapide */}
      <Card className="mt-6 gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Démarrage rapide</CardTitle>
          <CardDescription>
            Quatre modèles clés pour explorer le simulateur en moins d&apos;une
            minute.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickTemplates.map((t) => {
              const Icon = QUICK_TEMPLATE_ICONS[t.id] ?? Boxes;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="flex flex-col gap-2.5 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  onClick={() => openTemplate(t.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <LevelBadge level={t.difficulty} />
                  </span>
                  <span className="text-sm font-medium leading-snug">{t.name}</span>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Utiliser
                    <span aria-hidden>→</span>
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Architectures + simulations */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Mes architectures</CardTitle>
            <CardDescription>
              Ouvrir, dupliquer, renommer ou supprimer — {architectures.length}{" "}
              architecture{architectures.length > 1 ? "s" : ""} enregistrée
              {architectures.length > 1 ? "s" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            {architectures.length === 0 ? (
              <div className="py-8 text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Boxes className="size-5" />
                </span>
                <p className="mt-3 text-sm font-medium">Aucune architecture</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Créez-en une ou partez d&apos;un modèle prêt à simuler.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={() => newArchitecture()}>
                    <Plus />
                    Nouvelle architecture
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setView("templates")}>
                    Explorer les modèles
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto pr-1">
                {architectures.map((arch) => (
                  <div
                    key={arch.id}
                    className="flex items-center gap-3 border-b py-2.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{arch.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {arch.nodeCount} composant{arch.nodeCount > 1 ? "s" : ""} ·{" "}
                        {timeAgo(arch.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Ouvrir"
                        onClick={() => openArchitecture(arch.id)}
                      >
                        <FolderOpen />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Dupliquer"
                        disabled={duplicatingId === arch.id}
                        onClick={() => void handleDuplicate(arch)}
                      >
                        {duplicatingId === arch.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Copy />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Renommer"
                        onClick={() => openRename(arch)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Supprimer"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(arch)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Dernières simulations</CardTitle>
            <CardDescription>8 résultats archivés les plus récents.</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setView("history")}>
                <History />
                Tout l&apos;historique
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-5">
            {simulations.length === 0 ? (
              <div className="py-8 text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Activity className="size-5" />
                </span>
                <p className="mt-3 text-sm font-medium">Aucune simulation archivée</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Lancez une simulation depuis l&apos;éditeur : elle apparaîtra ici.
                </p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto pr-1">
                {simulations.slice(0, 8).map((sim) => (
                  <div
                    key={sim.id}
                    className="flex items-center gap-3 border-b py-2.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{sim.architectureName}</p>
                      <p className="text-xs text-muted-foreground">
                        {MODE_LABELS[sim.mode] ?? sim.mode} · {timeAgo(sim.createdAt)}
                      </p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-4 text-sm tabular-nums text-muted-foreground sm:flex">
                      <span className="w-24 text-right">{formatRps(sim.overall.servedRps)}</span>
                      <span className="w-24 text-right">p95 {formatMs(sim.overall.p95Ms)}</span>
                      <span className="w-16 text-right">
                        {formatPercent(sim.overall.errorRate)}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={openingSimId !== null}
                      onClick={() => void handleViewSimulation(sim.id)}
                    >
                      {openingSimId === sim.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Eye />
                      )}
                      Voir
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Parcours suggéré */}
      <Card className="mt-6 gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Parcours suggéré</CardTitle>
          <CardDescription>
            Les prochains cours de votre progression — {COURSES.length} cours au total.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => openCourse(null)}>
              Tout le parcours
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {suggestedCourses.map((course) => (
              <button
                key={course.slug}
                type="button"
                className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                onClick={() => {
                  openCourse(course.slug);
                  setView("learn");
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    {course.durationMin} min
                  </span>
                  <LevelBadge level={course.level} />
                </span>
                <span className="text-sm font-medium leading-snug">{course.title}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de renommage */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renommer l&apos;architecture</DialogTitle>
            <DialogDescription>
              Le nom est utilisé dans vos listes et dans les résultats de simulation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleRename(e)} className="space-y-4">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Nom de l'architecture"
              maxLength={80}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={renaming || renameName.trim().length === 0}>
                {renaming && <Loader2 className="animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation de suppression */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette architecture&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              «&nbsp;{deleteTarget?.name}&nbsp;» et ses simulations archivées seront
              supprimées définitivement. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault(); // garde le dialogue ouvert pendant l'opération
                void handleDelete();
              }}
            >
              {deleting && <Loader2 className="animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
