"use client";

/**
 * SystemLab — Shell applicatif.
 * Header global (logo, navigation SPA, thème, profil) + bascule des vues
 * selon useAppStore().activeView. L'éditeur occupe toute la hauteur
 * (sans scroll) ; les autres vues défilent dans un conteneur.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  FlaskConical,
  GitCompare,
  GraduationCap,
  History,
  LayoutDashboard,
  Loader2,
  Menu,
  Monitor,
  Moon,
  MousePointerClick,
  Settings,
  Shapes,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, VIEW_LABELS } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import type { AppView } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LandingView } from "@/components/landing/landing-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { TemplatesView } from "@/components/templates/templates-view";
import { LearnView } from "@/components/learn/learn-view";
import { HistoryView } from "@/components/history/history-view";
import { SettingsView } from "@/components/settings/settings-view";

/*
 * Vues lourdes (React Flow / Recharts) chargées à la demande.
 * La vue initiale est toujours "landing" (état non persisté dans le store),
 * ces chunks ne participent donc ni au rendu serveur ni au bundle initial —
 * la première peinture s’en trouve nettement allégée.
 */
const EditorView = dynamic(
  () => import("@/components/editor/editor-view").then((m) => m.EditorView),
  { ssr: false, loading: () => <ViewLoading label="Chargement de l’éditeur…" /> },
);
const ResultsView = dynamic(
  () => import("@/components/results/results-view").then((m) => m.ResultsView),
  { ssr: false, loading: () => <ViewLoading label="Chargement des résultats…" /> },
);
const CompareView = dynamic(
  () => import("@/components/compare/compare-view").then((m) => m.CompareView),
  { ssr: false, loading: () => <ViewLoading label="Chargement de la comparaison…" /> },
);

function ViewLoading({ label }: { label: string }) {
  return (
    <div
      className="flex h-full min-h-[40vh] w-full items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/* Une icône DISTINCTE par vue — aucune double attribution. */
const NAV_ITEMS: { view: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { view: "editor", label: "Éditeur", icon: MousePointerClick },
  { view: "templates", label: "Modèles", icon: Shapes },
  { view: "learn", label: "Apprentissage", icon: GraduationCap },
  { view: "history", label: "Historique", icon: History },
];

const ICONS: Record<AppView, typeof LayoutDashboard> = {
  landing: FlaskConical,
  dashboard: LayoutDashboard,
  editor: MousePointerClick,
  results: Activity,
  compare: GitCompare,
  templates: Shapes,
  learn: GraduationCap,
  history: History,
  settings: Settings,
};

/* Souscription no-op : la valeur ne change jamais après l’hydratation. */
const subscribeNoop = () => () => {};

/**
 * Vrai uniquement après l’hydratation cliente (faux pendant le SSR et la
 * première passe d’hydratation). Alternative au pattern mounted+useEffect,
 * conforme à la règle react-hooks/set-state-in-effect.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  /*
   * Garde anti-mismatch d’hydratation : next-themes lit localStorage dès le
   * premier rendu client (thème « dark » ici) alors que le rendu serveur a
   * `resolvedTheme` indéfini — l’aria-label et l’icône différaient donc entre
   * serveur et client. On fige le premier rendu sur l’état serveur (Lune,
   * « thème sombre ») puis on corrige après hydratation.
   */
  const mounted = useHydrated();

  const isDark = mounted && resolvedTheme === "dark";
  const isSystem = mounted && theme === "system";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-8 w-8"
    >
      {isSystem ? (
        <Monitor className="h-4 w-4" />
      ) : isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

/**
 * Menu de navigation mobile (tiroir latéral) : la barre de navigation desktop
 * est masquée sous `md`, ce tiroir garantit que toutes les vues restent
 * accessibles depuis l’en-tête sur petit écran.
 */
function MobileNav({
  activeView,
  onNavigate,
}: {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:hidden"
          aria-label="Ouvrir le menu de navigation"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-sm">Navigation</SheetTitle>
        </SheetHeader>
        <nav aria-label="Navigation mobile" className="flex flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => {
                onNavigate(item.view);
                setOpen(false);
              }}
              aria-current={activeView === item.view ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                activeView === item.view
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function AppShell() {
  const activeView = useAppStore((s) => s.activeView);
  const setView = useAppStore((s) => s.setView);
  const goBack = useAppStore((s) => s.goBack);
  const viewHistory = useAppStore((s) => s.viewHistory);
  const refreshArchitectures = useAppStore((s) => s.refreshArchitectures);
  const refreshSimulations = useAppStore((s) => s.refreshSimulations);

  /* Préchargement des listes partagées (une seule fois par session). */
  useEffect(() => {
    void refreshArchitectures();
    void refreshSimulations();
  }, [refreshArchitectures, refreshSimulations]);

  /*
   * Garde anti-perte navigateur : rechargement / fermeture d'onglet alors
   * qu'un document modifié n'est pas sauvegardé (l'auto-save ne couvre que
   * les documents déjà persistés) → dialogue natif de confirmation.
   */
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (useEditorStore.getState().dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  /*
   * Reset du scroll au changement de vue : le conteneur qui défile est ce
   * <main> (il reste monté entre les vues — seul l'enfant est key={activeView}),
   * sans quoi on arrive au milieu de la page précédente.
   */
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeView]);

  /* Titre de l'onglet dynamique. */
  useEffect(() => {
    const label = VIEW_LABELS[activeView];
    document.title =
      activeView === "landing" ? "SystemLab — Laboratoire de System Design" : `${label} · SystemLab`;
  }, [activeView]);

  const canGoBack = viewHistory.length > 0;
  const ActiveIcon = ICONS[activeView];

  const renderView = () => {
    switch (activeView) {
      case "landing":
        return <LandingView />;
      case "dashboard":
        return <DashboardView />;
      case "editor":
        return <EditorView />;
      case "results":
        return <ResultsView />;
      case "compare":
        return <CompareView />;
      case "templates":
        return <TemplatesView />;
      case "learn":
        return <LearnView />;
      case "history":
        return <HistoryView />;
      case "settings":
        return <SettingsView />;
    }
  };

  const isEditor = activeView === "editor";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* ------- Barre supérieure globale ------- */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3 sm:px-4">
        <button
          type="button"
          onClick={() => setView("landing")}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="SystemLab — retour à l'accueil"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span
            className="text-sm font-semibold tracking-tight"
            /* Attributs injectés par les extensions navigateur (traduction, etc.) avant hydratation. */
            suppressHydrationWarning
          >
            SystemLab
          </span>
        </button>

        {canGoBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Retour à la vue précédente"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Navigation mobile — visible uniquement sous md, où la barre
            desktop est masquée. */}
        <MobileNav activeView={activeView} onNavigate={setView} />

        <nav
          aria-label="Navigation principale"
          className="ml-1 hidden items-center gap-0.5 md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => setView(item.view)}
              aria-current={activeView === item.view ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                activeView === item.view
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="ml-2 hidden items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
          <ActiveIcon className="h-3.5 w-3.5" aria-hidden />
          <span suppressHydrationWarning>{VIEW_LABELS[activeView]}</span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-1 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                aria-label="Menu du profil"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                    JD
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-[13px] font-medium lg:inline">Jean Dupont</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Session locale — Jean Dupont
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setView("settings")}>
                <Settings className="h-4 w-4" /> Paramètres
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("dashboard")}>
                <LayoutDashboard className="h-4 w-4" /> Tableau de bord
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  toast.info(
                    "SystemLab v1.0.0 — moteur de simulation événementielle local, 130 composants, 23 cours.",
                  )
                }
              >
                <FlaskConical className="h-4 w-4" /> À propos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ------- Zone de vue ------- */}
      {isEditor ? (
        <main className="min-h-0 flex-1" aria-label={VIEW_LABELS[activeView]}>
          <div key={activeView} className="h-full animate-in fade-in duration-200">
            {renderView()}
          </div>
        </main>
      ) : (
        <main
          ref={mainRef}
          id="app-main"
          className="min-h-0 flex-1 overflow-y-auto"
          aria-label={VIEW_LABELS[activeView]}
        >
          <div key={activeView} className="flex min-h-full flex-col animate-in fade-in duration-200">
            {renderView()}
          </div>
        </main>
      )}
    </div>
  );
}
