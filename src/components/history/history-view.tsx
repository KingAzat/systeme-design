"use client";

/**
 * SystemLab — vue Historique : simulations archivées (filtrage par
 * architecture, sélection A/B pour comparaison, suppression confirmée,
 * pagination client-side 20/page).
 */
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Eye,
  GitCompare,
  History as HistoryIcon,
  Inbox,
  Loader2,
  RefreshCw,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { SimulationSummary } from "@/types";
import { useAppStore } from "@/stores/app-store";
import { storage } from "@/lib/persistence";
import { RESULT_MODE_LABELS, type ResultMode } from "@/lib/labels";
import { ERROR_RATE_WARN, P95_WARN_MS } from "@/lib/thresholds";
import { EmptyState } from "@/components/shared/empty-state";
import {
  formatCost,
  formatDateTime,
  formatMs,
  formatPercent,
  formatRps,
  timeAgo,
} from "@/lib/format";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function ModeBadge({ mode }: { mode: ResultMode }) {
  if (mode === "analytical") {
    return (
      <Badge variant="outline" className="border-info/40 bg-info/10 font-normal text-info">
        {RESULT_MODE_LABELS.analytical}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary/30 bg-primary/10 font-normal text-primary">
      {RESULT_MODE_LABELS["event-sampled"]}
    </Badge>
  );
}

export function HistoryView() {
  const simulations = useAppStore((s) => s.simulations);
  const simulationsLoading = useAppStore((s) => s.simulationsLoading);
  const simulationsError = useAppStore((s) => s.simulationsError);
  const refreshSimulations = useAppStore((s) => s.refreshSimulations);
  const architectures = useAppStore((s) => s.architectures);
  const architecturesLoading = useAppStore((s) => s.architecturesLoading);
  const refreshArchitectures = useAppStore((s) => s.refreshArchitectures);
  const deleteSimulation = useAppStore((s) => s.deleteSimulation);
  const openResult = useAppStore((s) => s.openResult);
  const openCompare = useAppStore((s) => s.openCompare);
  const setView = useAppStore((s) => s.setView);

  const [filterArchId, setFilterArchId] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SimulationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Garde !loading (lecture fraîche via getState) : évite de relancer un
  // chargement déjà en cours — le shell précharge au montage.
  useEffect(() => {
    const s = useAppStore.getState();
    if (s.simulations.length === 0 && !s.simulationsLoading) {
      void s.refreshSimulations();
    }
  }, [simulations.length, refreshSimulations]);

  useEffect(() => {
    const s = useAppStore.getState();
    if (s.architectures.length === 0 && !s.architecturesLoading) {
      void s.refreshArchitectures();
    }
  }, [architectures.length, refreshArchitectures]);

  const sorted = useMemo(
    () =>
      [...simulations].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [simulations],
  );

  const filtered = useMemo(
    () =>
      filterArchId === "all"
        ? sorted
        : sorted.filter((sim) => sim.architectureId === filterArchId),
    [sorted, filterArchId],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [filterArchId]);

  const toggleSelect = (id: string, on: boolean) => {
    setSelectedIds((prev) => {
      if (on) {
        if (prev.includes(id) || prev.length >= 2) return prev;
        return [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  };

  const openSimulation = async (id: string) => {
    setViewingId(id);
    try {
      const full = await storage.simulations.get(id);
      if (full) {
        openResult(full);
      } else {
        toast.error("Simulation introuvable", {
          description: "Elle a peut-être été supprimée — actualisez l'historique.",
        });
      }
    } catch (error) {
      toast.error("Chargement impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setViewingId(null);
    }
  };

  const compareSelected = async () => {
    if (selectedIds.length !== 2 || comparing) return;
    setComparing(true);
    try {
      const [a, b] = await Promise.all(
        selectedIds.map((id) => storage.simulations.get(id)),
      );
      if (!a || !b) {
        toast.error("Simulation introuvable", {
          description: "L'une des simulations sélectionnées n'a pas pu être chargée.",
        });
        return;
      }
      openCompare(a, b);
    } catch (error) {
      toast.error("Comparaison impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setComparing(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteSimulation(pendingDelete.id);
      setSelectedIds((prev) => prev.filter((id) => id !== pendingDelete.id));
      toast.success("Simulation supprimée", {
        description: `${pendingDelete.architectureName} · seed ${pendingDelete.seed}`,
      });
    } catch (error) {
      toast.error("Suppression impossible", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const isEmpty = !simulationsLoading && filtered.length === 0 && !simulationsError;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto w-full max-w-[1400px] p-6 pb-24">
        {/* ---------- En-tête ---------- */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <HistoryIcon className="size-6 text-primary" />
              Historique des simulations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Toutes les simulations archivées — cliquez sur « Voir » pour rouvrir les résultats,
              cochez deux lignes pour les comparer.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="h-8 px-3 text-xs">
              {filtered.length} simulation{filtered.length > 1 ? "s" : ""}
            </Badge>
            <Select value={filterArchId} onValueChange={setFilterArchId}>
              <SelectTrigger size="sm" className="w-full sm:w-[240px]">
                <SelectValue placeholder="Toutes les architectures" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les architectures</SelectItem>
                {architectures.map((arch) => (
                  <SelectItem key={arch.id} value={arch.id}>
                    {arch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshSimulations()}
              disabled={simulationsLoading}
            >
              <RefreshCw className={simulationsLoading ? "size-4 animate-spin" : "size-4"} />
              Actualiser
            </Button>
          </div>
        </header>

        {/* ---------- Contenu ---------- */}
        {simulationsError ? (
          <div className="mt-8">
            <Alert variant="destructive" role="alert">
              <CloudOff aria-hidden />
              <AlertTitle>Serveur local injoignable</AlertTitle>
              <AlertDescription>
                L&apos;historique n&apos;a pas pu être chargé — vos simulations archivées ne
                sont pas perdues. Réessayez plus tard.
              </AlertDescription>
            </Alert>
          </div>
        ) : simulationsLoading && simulations.length === 0 ? (
          <div className="mt-8 space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={Inbox}
            className="mt-16"
            title={
              filterArchId === "all"
                ? "Aucune simulation archivée"
                : "Aucune simulation pour cette architecture"
            }
            description={
              filterArchId === "all"
                ? "Lancez votre première simulation depuis l'éditeur — elle sera archivée ici automatiquement."
                : "Changez de filtre ou lancez une nouvelle simulation pour cette architecture."
            }
            action={
              <Button onClick={() => setView("editor")}>
                <Rocket className="size-4" />
                Ouvrir l&apos;éditeur
              </Button>
            }
          />
        ) : (
          <>
            <div className="mt-8 max-h-[70vh] overflow-x-auto overflow-y-auto rounded-xl border">
              <Table className="min-w-[900px]">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10" />
                    <TableHead>Date</TableHead>
                    <TableHead>Architecture</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right">Seed</TableHead>
                    <TableHead className="text-right">Débit traité</TableHead>
                    <TableHead className="text-right">p95</TableHead>
                    <TableHead className="text-right">Erreurs</TableHead>
                    <TableHead className="text-right">Disponibilité</TableHead>
                    <TableHead className="text-right">Coût</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((sim) => {
                    const isSelected = selectedIds.includes(sim.id);
                    const selectionLocked = selectedIds.length >= 2 && !isSelected;
                    return (
                      <TableRow
                        key={sim.id}
                        className={cn(isSelected && "bg-accent/50")}
                      >
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Checkbox
                                  aria-label={`Sélectionner la simulation ${sim.id} pour comparaison`}
                                  checked={isSelected}
                                  disabled={selectionLocked}
                                  onCheckedChange={(checked) =>
                                    toggleSelect(sim.id, checked === true)
                                  }
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {selectionLocked
                                ? "Sélection limitée à deux simulations"
                                : "Sélectionner pour comparer (2 max)"}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dashed border-muted-foreground/40 tabular-nums">
                                {formatDateTime(sim.createdAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{timeAgo(sim.createdAt)}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={sim.architectureName}>
                              {sim.architectureName}
                            </p>
                            {sim.label ? (
                              <p className="truncate text-xs text-muted-foreground" title={sim.label}>
                                {sim.label}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ModeBadge mode={sim.mode} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {sim.seed}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatRps(sim.overall.servedRps)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            sim.overall.p95Ms > P95_WARN_MS
                              ? "font-medium text-amber-700 dark:text-amber-400"
                              : "",
                          )}
                        >
                          {formatMs(sim.overall.p95Ms)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            sim.overall.errorRate > ERROR_RATE_WARN
                              ? "font-medium text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatPercent(sim.overall.errorRate)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            sim.overall.availability >= 0.999 ? "text-success" : "",
                          )}
                        >
                          {formatPercent(sim.overall.availability)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCost(sim.overall.costPerMonthUsd)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void openSimulation(sim.id)}
                              disabled={viewingId !== null}
                            >
                              {viewingId === sim.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Eye className="size-4" />
                              )}
                              Voir
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Supprimer la simulation"
                                  className="px-2 text-muted-foreground hover:text-destructive"
                                  onClick={() => setPendingDelete(sim)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Supprimer</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {pageCount > 1 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Page {safePage + 1} sur {pageCount} · {filtered.length} simulations
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                  >
                    <ChevronLeft className="size-4" />
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Suivant
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* ---------- Barre flottante de comparaison ---------- */}
        {selectedIds.length > 0 ? (
          <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
            <Card className="gap-0 py-0 shadow-lg">
              <CardContent className="flex items-center gap-3 px-4 py-3">
                <GitCompare className="size-4 text-primary" />
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {selectedIds.length}/2 simulation{selectedIds.length > 1 ? "s" : ""} sélectionnée
                  {selectedIds.length > 1 ? "s" : ""}
                </span>
                <Button
                  size="sm"
                  onClick={() => void compareSelected()}
                  disabled={selectedIds.length !== 2 || comparing}
                >
                  {comparing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <GitCompare className="size-4" />
                  )}
                  Comparer la sélection
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Effacer la sélection"
                  className="px-2"
                  onClick={() => setSelectedIds([])}
                >
                  <X className="size-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* ---------- Confirmation de suppression ---------- */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette simulation ?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete
                  ? `${pendingDelete.architectureName} · seed ${pendingDelete.seed} · ${formatDateTime(pendingDelete.createdAt)} — cette action est définitive.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(event) => {
                  event.preventDefault();
                  void confirmDelete();
                }}
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
