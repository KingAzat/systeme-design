"use client";

/**
 * SystemLab — Shell applicatif.
 * Header global (logo, navigation SPA, thème, profil) + bascule des vues
 * selon useAppStore().activeView. L'éditeur occupe toute la hauteur
 * (sans scroll) ; les autres vues défilent dans un conteneur.
 */
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ChevronLeft,
  FlaskConical,
  GraduationCap,
  History,
  LayoutGrid,
  Monitor,
  Moon,
  MousePointerClick,
  Settings,
  Sun,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, VIEW_LABELS } from "@/stores/app-store";
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
import { LandingView } from "@/components/landing/landing-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { EditorView } from "@/components/editor/editor-view";
import { ResultsView } from "@/components/results/results-view";
import { CompareView } from "@/components/compare/compare-view";
import { TemplatesView } from "@/components/templates/templates-view";
import { LearnView } from "@/components/learn/learn-view";
import { HistoryView } from "@/components/history/history-view";
import { SettingsView } from "@/components/settings/settings-view";

const NAV_ITEMS: { view: AppView; label: string; icon: typeof LayoutGrid }[] = [
  { view: "dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { view: "editor", label: "Éditeur", icon: MousePointerClick },
  { view: "templates", label: "Modèles", icon: LayoutGrid },
  { view: "learn", label: "Apprentissage", icon: GraduationCap },
  { view: "history", label: "Historique", icon: History },
];

const ICONS: Record<AppView, typeof LayoutGrid> = {
  landing: FlaskConical,
  dashboard: LayoutGrid,
  editor: MousePointerClick,
  results: ChevronLeft,
  compare: History,
  templates: LayoutGrid,
  learn: GraduationCap,
  history: History,
  settings: Settings,
};

function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-8 w-8"
    >
      {theme === "system" ? (
        <Monitor className="h-4 w-4" />
      ) : isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
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
          <span className="text-sm font-semibold tracking-tight">SystemLab</span>
        </button>

        {canGoBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Retour"
            onClick={goBack}
          >
            <Undo2 className="h-4 w-4 rotate-0" />
          </Button>
        )}

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
          <span>{VIEW_LABELS[activeView]}</span>
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
                <LayoutGrid className="h-4 w-4" /> Tableau de bord
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
