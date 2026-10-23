"use client";

import {
  FileJson,
  FolderOpen,
  Info,
  Loader2,
  Monitor,
  Moon,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTheme } from "next-themes";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/stores/app-store";
import { storage } from "@/lib/persistence";
import { cn } from "@/lib/utils";
import { MODE_LABELS } from "@/lib/labels";
import { DEFAULT_SCENARIO } from "@/data/templates";
import type { Architecture, ArchitectureData, SimulationMode } from "@/types";

/**
 * SystemLab — Paramètres.
 * Apparence (next-themes), préférences de simulation (localStorage local et
 * honnête), export/import JSON des architectures, zone sensible et à propos.
 */

const SETTINGS_KEY = "systemlab-settings";

interface SimulationPreferences {
  durationSec: number;
  requestsPerSecond: number;
  seed: number;
  budgetPerMonthUsd: number;
  mode: SimulationMode;
}

const DEFAULT_PREFS: SimulationPreferences = {
  durationSec: DEFAULT_SCENARIO.durationSec,
  requestsPerSecond: DEFAULT_SCENARIO.requestsPerSecond,
  seed: DEFAULT_SCENARIO.seed,
  budgetPerMonthUsd: DEFAULT_SCENARIO.budgetPerMonthUsd,
  mode: DEFAULT_SCENARIO.mode,
};

/* Libellés des modes — source unique @/lib/labels (MODE_LABELS, forme courte). */
const MODE_OPTIONS: { value: SimulationMode; label: string; hint: string }[] = [
  { value: "quick", label: MODE_LABELS.quick, hint: "Vérification ponctuelle" },
  { value: "load", label: MODE_LABELS.load, hint: "Débit nominal soutenu" },
  { value: "stress", label: MODE_LABELS.stress, hint: "Recherche des limites" },
  { value: "endurance", label: MODE_LABELS.endurance, hint: "Stabilité dans la durée" },
  { value: "failure", label: MODE_LABELS.failure, hint: "Défaillance injectée" },
];

const THEME_OPTIONS = [
  { value: "light", label: "Clair", description: "Surfaces claires, accents indigo", icon: Sun },
  { value: "dark", label: "Sombre", description: "Fond sombre, indigo éclairci", icon: Moon },
  { value: "system", label: "Système", description: "Suit les préférences du système", icon: Monitor },
] as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "erreur inconnue";
}

/** Valide une architecture issue d'un import avant de la créer. */
function isValidArchitecture(value: unknown): value is ArchitectureData {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Architecture>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    Array.isArray(candidate.zones) &&
    typeof candidate.scenario === "object" &&
    candidate.scenario !== null
  );
}

/** Charge et assainit les préférences depuis localStorage. */
function loadPreferences(): SimulationPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFS;
    const o = parsed as Record<string, unknown>;
    const num = (v: unknown, fallback: number): number =>
      typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const mode =
      typeof o.mode === "string" && MODE_OPTIONS.some((m) => m.value === o.mode)
        ? (o.mode as SimulationMode)
        : DEFAULT_PREFS.mode;
    return {
      durationSec: num(o.durationSec, DEFAULT_PREFS.durationSec),
      requestsPerSecond: num(o.requestsPerSecond, DEFAULT_PREFS.requestsPerSecond),
      seed: num(o.seed, DEFAULT_PREFS.seed),
      budgetPerMonthUsd: num(o.budgetPerMonthUsd, DEFAULT_PREFS.budgetPerMonthUsd),
      mode,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function parseNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* ------------------------------------------------------------------ */

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [prefs, setPrefs] = useState<SimulationPreferences>(DEFAULT_PREFS);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const architectures = useAppStore((s) => s.architectures);
  const simulations = useAppStore((s) => s.simulations);
  const refreshArchitectures = useAppStore((s) => s.refreshArchitectures);
  const refreshSimulations = useAppStore((s) => s.refreshSimulations);
  const deleteArchitecture = useAppStore((s) => s.deleteArchitecture);

  useEffect(() => {
    setMounted(true);
    setPrefs(loadPreferences());
  }, []);

  function updatePref<K extends keyof SimulationPreferences>(
    key: K,
    value: SimulationPreferences[K],
  ) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // localStorage indisponible : préférences de session uniquement.
    }
  }

  /* -------- Export / import -------- */

  async function handleExport() {
    setExporting(true);
    try {
      const summaries = useAppStore.getState().architectures;
      const full = await Promise.all(summaries.map((a) => storage.architectures.get(a.id)));
      const items = full.filter((a): a is Architecture => a !== null);
      if (items.length === 0) {
        toast.info("Aucune architecture complète à exporter.");
        return;
      }
      const payload = {
        app: "systemlab",
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        architectures: items,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "systemlab-export.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success(`${items.length} architecture(s) exportée(s).`);
    } catch (err) {
      toast.error(`Export impossible : ${errorMessage(err)}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const list: unknown = Array.isArray(parsed)
        ? parsed
        : (parsed as { architectures?: unknown }).architectures;
      if (!Array.isArray(list)) {
        throw new Error("format de fichier inattendu (tableau « architectures » attendu)");
      }
      let count = 0;
      // Créations en parallèle (allSettled) : un échec partiel n'annule pas
      // l'import des autres architectures.
      const valid = list.filter(isValidArchitecture);
      const settled = await Promise.allSettled(
        valid.map((item) =>
          storage.architectures.create({
            name: item.name,
            description: item.description ?? undefined,
            nodes: item.nodes,
            edges: item.edges,
            zones: item.zones,
            scenario: item.scenario,
          }),
        ),
      );
      count = settled.filter((r) => r.status === "fulfilled").length;
      const failures = settled.length - count;
      await refreshArchitectures();
      await refreshSimulations();
      if (count > 0) {
        toast.success(`${count} architecture(s) importée(s).`);
      } else {
        toast.info("Aucune architecture valide dans ce fichier.");
      }
      if (failures > 0) {
        toast.warning(`${failures} architecture(s) en échec à l'import.`, {
          description: "Vérifiez le format du fichier et réessayez pour les entrées concernées.",
        });
      }
    } catch (err) {
      toast.error(`Import impossible : ${errorMessage(err)}`);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  /* -------- Suppression totale -------- */

  async function handleDeleteAll() {
    setDeleting(true);
    try {
      const ids = useAppStore.getState().architectures.map((a) => a.id);
      for (const id of ids) {
        await deleteArchitecture(id);
      }
      toast.success(`${ids.length} architecture(s) supprimée(s).`);
      setConfirmFinal(false);
    } catch (err) {
      toast.error(`Échec de la suppression : ${errorMessage(err)}`);
    } finally {
      setDeleting(false);
    }
  }

  /* -------- Rendu -------- */

  return (
    <div className="mx-auto w-full max-w-[900px] p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Apparence, préférences de simulation et gestion de vos données.
      </p>

      <div className="mt-6 space-y-6">
        {/* Apparence */}
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Apparence</CardTitle>
            <CardDescription>
              Le choix est mémorisé par votre navigateur (next-themes).
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => {
                const active = mounted && theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-4 text-center transition-colors hover:bg-accent/50",
                      active && "border-primary ring-2 ring-primary/20",
                    )}
                  >
                    <Icon
                      className={cn("size-5", active ? "text-primary" : "text-muted-foreground")}
                    />
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Préférences de simulation */}
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">
              Préférences (enregistrées localement)
            </CardTitle>
            <CardDescription>
              Utilisées lors de la création d&apos;un nouveau document. Elles restent
              dans ce navigateur — aucun envoi serveur.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pref-duration">Durée par défaut (s)</Label>
                <Input
                  id="pref-duration"
                  type="number"
                  min={10}
                  max={600}
                  step={10}
                  value={prefs.durationSec}
                  onChange={(e) =>
                    updatePref("durationSec", parseNumber(e.target.value, prefs.durationSec))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pref-rps">Requêtes/s cibles</Label>
                <Input
                  id="pref-rps"
                  type="number"
                  min={1}
                  step={50}
                  value={prefs.requestsPerSecond}
                  onChange={(e) =>
                    updatePref(
                      "requestsPerSecond",
                      parseNumber(e.target.value, prefs.requestsPerSecond),
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pref-seed">Seed</Label>
                <Input
                  id="pref-seed"
                  type="number"
                  min={0}
                  step={1}
                  value={prefs.seed}
                  onChange={(e) =>
                    updatePref("seed", parseNumber(e.target.value, prefs.seed))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Mêmes paramètres + même seed ⇒ résultats reproductibles.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pref-budget">Budget ($/mois)</Label>
                <Input
                  id="pref-budget"
                  type="number"
                  min={0}
                  step={100}
                  value={prefs.budgetPerMonthUsd}
                  onChange={(e) =>
                    updatePref(
                      "budgetPerMonthUsd",
                      parseNumber(e.target.value, prefs.budgetPerMonthUsd),
                    )
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Mode par défaut</Label>
                <Select
                  value={prefs.mode}
                  onValueChange={(value) => updatePref("mode", value as SimulationMode)}
                >
                  <SelectTrigger className="w-full sm:max-w-72">
                    <SelectValue placeholder="Choisir un mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="font-medium">{option.label}</span>
                        <span className="ml-2 text-muted-foreground">{option.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Données */}
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Données</CardTitle>
            <CardDescription>
              Exportez ou importez vos architectures au format JSON.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            <p className="text-sm tabular-nums text-muted-foreground">
              {architectures.length} architecture{architectures.length > 1 ? "s" : ""} ·{" "}
              {simulations.length} simulation{simulations.length > 1 ? "s" : ""} archivée
              {simulations.length > 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => void handleExport()}
                disabled={exporting || architectures.length === 0}
              >
                {exporting ? <Loader2 className="animate-spin" /> : <FileJson />}
                Exporter mes architectures
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? <Loader2 className="animate-spin" /> : <FolderOpen />}
                Importer
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void handleImportFile(e)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Zone sensible */}
        <Card className="gap-4 border-destructive/40 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base text-destructive">Zone sensible</CardTitle>
            <CardDescription>
              Actions irréversibles sur les données de ce navigateur.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={architectures.length === 0}
              onClick={() => setConfirmDeleteAll(true)}
            >
              <TriangleAlert />
              Supprimer toutes les architectures
            </Button>
          </CardContent>
        </Card>

        {/* À propos */}
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">À propos</CardTitle>
            <CardDescription>
              Un simulateur pédagogique — honnête sur ses limites.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">SystemLab</p>
                <p className="text-muted-foreground">
                  Laboratoire interactif de System Design
                </p>
              </div>
              <Badge variant="outline">version 1.0.0</Badge>
            </div>
            <div>
              <p className="font-medium">Stack technique</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                Next.js 16 · React 19 · React Flow (@xyflow/react) · Recharts ·
                Prisma (SQLite) · Zustand · Tailwind CSS
              </p>
            </div>
            <div>
              <p className="font-medium">Limites connues du simulateur</p>
              <ul className="mt-1.5 space-y-1">
                {[
                  "Architectures limitées à 60 nœuds.",
                  "Durée de simulation plafonnée à 600 s.",
                  "Échantillonnage au-delà de 100 000 requêtes simulées.",
                  "Les composants « visuels » ne sont pas simulés (décoratifs).",
                ].map((limit) => (
                  <li
                    key={limit}
                    className="flex gap-2.5 leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-[9px] size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span>{limit}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Le moteur vise l&apos;ordre de grandeur pédagogique plutôt que la
                précision absolue.
              </p>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="size-4 shrink-0" />
              <Button
                variant="link"
                className="h-auto p-0 text-sm text-primary"
                onClick={() =>
                  toast.info("Les hypothèses s'affichent avec chaque résultat de simulation.")
                }
              >
                Voir les hypothèses du moteur
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation 1/2 — intention */}
      <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer toutes les architectures&nbsp;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {architectures.length} architecture{architectures.length > 1 ? "s" : ""} et{" "}
              leurs simulations archivées seront concernées. Une confirmation
              supplémentaire vous sera demandée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => setConfirmFinal(true)}
            >
              Continuer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation 2/2 — définitive */}
      <AlertDialog open={confirmFinal} onOpenChange={setConfirmFinal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmation finale</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer définitivement{" "}
              {architectures.length} architecture{architectures.length > 1 ? "s" : ""}&nbsp;?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault(); // laisse le dialogue ouvert pendant l'opération
                void handleDeleteAll();
              }}
            >
              {deleting && <Loader2 className="animate-spin" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
