"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  Gauge,
  Lightbulb,
  Play,
  Radar,
  Rocket,
  RotateCcw,
  Search,
  SearchX,
  Target,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

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
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { LevelBadge } from "@/components/learn/level-badge";
import {
  markLearned,
  unmarkLearned,
  useLearnedCourses,
} from "@/components/learn/learned-courses";
import {
  computeXp,
  getXpLevel,
  resetQuizAnswers,
  saveQuizAnswer,
  useAllQuizAnswers,
  useQuizAnswers,
} from "@/components/learn/quiz-progress";
import { useAppStore, getTemplateById } from "@/stores/app-store";
import { formatCost, formatMs, formatPercent, formatRps } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COURSES, COURSE_MAP, getCoursesByLevel } from "@/data/courses";
import type {
  Course,
  CourseExercise,
  CourseLevel,
  QuizQuestion as QuizQuestionType,
} from "@/types";

/**
 * SystemLab — Vue apprentissage.
 * Liste des 23 cours groupés par niveau : carte XP/niveau, recherche,
 * filtre « masquer les terminés ». Vue détail : sections rédigées,
 * concepts, boîte « À retenir », quiz persistant corrigé immédiatement,
 * exercice practice, sommaire actif (lg+), barre de progression de lecture
 * et navigation clavier ← / → entre cours voisins.
 *
 * Le conteneur qui défile est le <main id="app-main"> du shell (pas window).
 */

const LEVELS: {
  level: CourseLevel;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    level: "débutant",
    label: "Débutant",
    description: "Les fondations : client-serveur, HTTP, SQL, cache, observabilité.",
    icon: Rocket,
  },
  {
    level: "intermédiaire",
    label: "Intermédiaire",
    description: "Répartition de charge, asynchrone, files, résilience, recherche.",
    icon: Gauge,
  },
  {
    level: "avancé",
    label: "Avancé",
    description: "Multi-région, cohérence distribuée, pannes en cascade, RAG.",
    icon: Radar,
  },
];

const LEVEL_LABELS: Record<CourseLevel, string> = {
  débutant: "Débutant",
  intermédiaire: "Intermédiaire",
  avancé: "Avancé",
};

/* ------------------------------------------------------------------ */
/* Recherche : normalisation insensible à la casse et aux accents      */
/* ------------------------------------------------------------------ */

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ------------------------------------------------------------------ */
/* Formatage des critères de réussite des exercices                    */
/* ------------------------------------------------------------------ */

const CRITERION_LABELS: Record<CourseExercise["successCriteria"][number]["metric"], string> = {
  p95Ms: "p95",
  errorRate: "taux d'erreur",
  servedRps: "débit servi",
  costPerMonthUsd: "coût",
  cacheHitRate: "hit cache",
};

function formatCriterion(criterion: CourseExercise["successCriteria"][number]): string {
  const label = CRITERION_LABELS[criterion.metric];
  const op = criterion.op === "<=" ? "≤" : "≥";
  switch (criterion.metric) {
    case "p95Ms":
      return `${label} ${op} ${formatMs(criterion.value)}`;
    case "errorRate":
      return `${label} ${op} ${formatPercent(criterion.value)}`;
    case "servedRps":
      return `${label} ${op} ${formatRps(criterion.value)}`;
    case "costPerMonthUsd":
      return `${label} ${op} ${formatCost(criterion.value)}`;
    case "cacheHitRate":
      return `${label} ${op} ${formatPercent(criterion.value)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Rendu du contenu des sections (paragraphes, listes « - »)            */
/* ------------------------------------------------------------------ */

function renderBlocks(content: string): ReactNode {
  return content.split(/\n\n+/).map((block, bi) => {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const bullets = lines.filter((line) => line.trim().startsWith("- "));
    if (lines.length > 0 && bullets.length === lines.length) {
      return (
        <ul key={bi} className="space-y-1.5">
          {bullets.map((line, li) => (
            <li key={li} className="flex gap-2.5 text-[15px] leading-7 text-muted-foreground">
              <span className="mt-[13px] size-1 shrink-0 rounded-full bg-primary/60" />
              <span>{line.trim().slice(2)}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={bi} className="text-[15px] leading-7 text-muted-foreground">
        {block}
      </p>
    );
  });
}

/* ------------------------------------------------------------------ */
/* Quiz interactif                                                     */
/* ------------------------------------------------------------------ */

function QuizQuestionCard({
  question,
  index,
  chosen,
  onChoose,
}: {
  question: QuizQuestionType;
  index: number;
  chosen: number | undefined;
  onChoose: (choice: number) => void;
}) {
  const answered = chosen !== undefined;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardDescription className="text-xs font-medium uppercase tracking-wide">
          Question {index + 1}
        </CardDescription>
        <p className="text-sm font-medium leading-relaxed">{question.question}</p>
      </CardHeader>
      <CardContent className="grid gap-2 px-4">
        {question.choices.map((choice, ci) => {
          const isCorrect = ci === question.answer;
          const isChosen = chosen === ci;
          return (
            <Button
              key={ci}
              type="button"
              variant="outline"
              className={cn(
                "h-auto justify-start whitespace-normal py-2.5 text-left font-normal",
                answered && isCorrect && "border-success bg-success/10",
                answered && isChosen && !isCorrect && "border-destructive bg-destructive/10",
                answered && !isCorrect && !isChosen && "opacity-55",
              )}
              disabled={answered}
              onClick={() => onChoose(ci)}
            >
              {answered && isCorrect && <CircleCheck className="size-4 shrink-0 text-success" />}
              {answered && isChosen && !isCorrect && (
                <CircleX className="size-4 shrink-0 text-destructive" />
              )}
              <span>{choice}</span>
            </Button>
          );
        })}
        {answered && (
          <div className="mt-1 flex gap-2.5 rounded-md bg-muted/60 p-3">
            {chosen === question.answer ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {question.explanation}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Carte exercice                                                      */
/* ------------------------------------------------------------------ */

function ExerciseCard({
  exercise,
  courseSlug,
}: {
  exercise: CourseExercise;
  courseSlug: string;
}) {
  const openTemplate = useAppStore((s) => s.openTemplate);
  const template = getTemplateById(exercise.templateId);

  return (
    <Card className="mt-10 border-primary/30">
      <CardHeader className="px-6">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="size-4" />
          </span>
          Exercice : {exercise.title}
        </CardTitle>
        <CardDescription className="pt-1.5 leading-relaxed">{exercise.goal}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-6">
        <div>
          <p className="text-sm font-medium">Contraintes</p>
          <ul className="mt-2 space-y-1.5">
            {exercise.constraints.map((constraint, i) => (
              <li
                key={i}
                className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
              >
                <span className="mt-[9px] size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span>{constraint}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium">Critères de réussite</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {exercise.successCriteria.map((criterion, i) => (
              <Badge
                key={i}
                variant="outline"
                className="gap-1.5 border-success/40 bg-success/5 font-normal text-success"
              >
                <Check className="size-3" />
                {formatCriterion(criterion)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3">
          <p className="min-w-48 flex-1 text-sm leading-relaxed text-muted-foreground">
            Modèle de départ :{" "}
            <span className="font-medium text-foreground">
              {template?.name ?? exercise.templateId}
            </span>
            . La plateforme évaluera vos métriques simulées après exécution.
          </p>
          <Button
            onClick={() =>
              // Le bandeau de l'éditeur affiche l'objectif réel de l'exercice
              // (et non plus son seul titre) pour garder la cible en vue ;
              // le slug du cours permet à la vue résultats d'évaluer les
              // critères de réussite après la simulation.
              openTemplate(
                exercise.templateId,
                `${exercise.title} — ${exercise.goal}`,
                courseSlug,
              )
            }
          >
            <Play />
            Ouvrir l&apos;exercice dans l&apos;éditeur
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Carte de cours (liste)                                              */
/* ------------------------------------------------------------------ */

function CourseCard({
  course,
  learned,
  onOpen,
}: {
  course: Course;
  learned: boolean;
  onOpen: () => void;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-pointer gap-2 py-4 transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:outline-none",
        learned && "border-success/30",
      )}
    >
      <CardHeader className="px-4">
        <CardTitle className="flex items-start justify-between gap-2 text-base leading-snug">
          <span>{course.title}</span>
          {learned && <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1 text-xs">
            <Clock className="size-3.5" />
            {course.durationMin} min · {course.quiz.length} questions
          </span>
          {course.exercise && (
            <Badge variant="outline" className="gap-1 border-primary/30 font-normal text-primary">
              <Target className="size-3" />
              Exercice
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {course.summary}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {course.concepts.slice(0, 3).map((concept) => (
            <Badge key={concept} variant="outline" className="font-normal text-muted-foreground">
              {concept}
            </Badge>
          ))}
          {course.concepts.length > 3 && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              +{course.concepts.length - 3}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Barre de progression de lecture (écoute le scroll de #app-main)     */
/* ------------------------------------------------------------------ */

function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Le conteneur qui défile est le <main id="app-main"> du shell.
    const container = document.getElementById("app-main");
    if (container === null) return;
    const update = () => {
      const scrollable = container.scrollHeight - container.clientHeight;
      const ratio = scrollable > 0 ? container.scrollTop / scrollable : 1;
      setProgress(Math.min(1, Math.max(0, ratio)));
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, []);

  const percent = Math.round(progress * 100);

  return (
    <div
      role="progressbar"
      aria-label="Progression de lecture"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="sticky top-0 z-10 h-1 bg-muted/40"
    >
      <div
        className="h-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sommaire du cours (lg+, section active via IntersectionObserver)    */
/* ------------------------------------------------------------------ */

interface TocItem {
  id: string;
  label: string;
  numeric?: number;
}

function buildTocItems(course: Course): TocItem[] {
  const items: TocItem[] = course.sections.map((section, i) => ({
    id: `course-section-${i}`,
    label: section.title,
    numeric: i + 1,
  }));
  if ((course.keyTakeaways?.length ?? 0) > 0) {
    items.push({ id: "course-takeaways", label: "À retenir" });
  }
  items.push({ id: "course-quiz", label: "Quiz" });
  if (course.exercise !== undefined) {
    items.push({ id: "course-exercise", label: "Exercice" });
  }
  return items;
}

function CourseToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // Bande d'activation entre 30 % et 40 % de la hauteur du viewport :
    // la section courante est celle qui traverse le tiers supérieur.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      {
        root: document.getElementById("app-main"),
        rootMargin: "-30% 0px -60% 0px",
        threshold: 0,
      },
    );
    for (const item of items) {
      const element = document.getElementById(item.id);
      if (element !== null) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <aside
      aria-label="Sommaire du cours"
      className="hidden w-56 shrink-0 self-start lg:sticky lg:top-6 lg:block"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sommaire
      </p>
      <ul className="mt-3 space-y-0.5">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  document
                    .getElementById(item.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn(
                  "flex items-start gap-2 rounded-md px-2 py-1 text-sm leading-snug transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-muted/70 font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item.numeric !== undefined ? (
                  <span
                    className={cn(
                      "tabular-nums",
                      active ? "text-primary" : "text-muted-foreground/60",
                    )}
                  >
                    {String(item.numeric).padStart(2, "0")}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "mt-[7px] size-1.5 shrink-0 rounded-full",
                      active ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  />
                )}
                <span className="line-clamp-2">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Liste des cours                                                     */
/* ------------------------------------------------------------------ */

function CourseList({
  learned,
  onOpenCourse,
}: {
  learned: string[];
  onOpenCourse: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hideLearned, setHideLearned] = useState(false);

  // XP locale : 50 XP par cours terminé + 10 XP par réponse correcte
  // persistée — tout vit dans ce navigateur.
  const allAnswers = useAllQuizAnswers();
  const { xp, quizXp } = computeXp(learned, allAnswers);
  const learnedCount = COURSES.filter((c) => learned.includes(c.slug)).length;
  const { current, next } = getXpLevel(xp);
  const levelProgress = next
    ? Math.min(100, Math.max(0, ((xp - current.threshold) / (next.threshold - current.threshold)) * 100))
    : 100;

  const normalizedQuery = normalizeText(query);
  const visibleCourses = useMemo(
    () =>
      COURSES.filter((course) => {
        if (hideLearned && learned.includes(course.slug)) return false;
        if (normalizedQuery === "") return true;
        const haystack = normalizeText(
          [course.title, course.summary, ...course.concepts].join(" "),
        );
        return haystack.includes(normalizedQuery);
      }),
    [hideLearned, learned, normalizedQuery],
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Apprentissage</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {COURSES.length} cours de System Design — quiz notés, exercices évalués, XP locale.
      </p>

      {/* Carte XP / niveau */}
      <Card className="mt-6 gap-0 py-4">
        <CardContent className="px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <p className="text-sm font-medium">{current.label}</p>
              <p className="text-xs text-muted-foreground">{current.description}</p>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              {next ? `${xp} / ${next.threshold} XP` : `${xp} XP — niveau maximum`}
            </p>
          </div>
          <Progress
            value={levelProgress}
            aria-label="Progression vers le niveau suivant"
            className="mt-2.5 h-2"
          />
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            {xp} XP · {learnedCount}/{COURSES.length} cours · {quizXp} XP de quiz
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enregistré dans ce navigateur, sans compte.
          </p>
        </CardContent>
      </Card>

      {/* Recherche + filtre « masquer les terminés » */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un cours, un concept…"
            aria-label="Rechercher un cours"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2.5">
          <Switch
            id="learn-hide-completed"
            checked={hideLearned}
            onCheckedChange={setHideLearned}
          />
          <label
            htmlFor="learn-hide-completed"
            className="cursor-pointer text-sm text-muted-foreground"
          >
            Masquer les terminés
          </label>
        </div>
      </div>

      {visibleCourses.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 py-8 text-center">
          <SearchX className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {normalizedQuery === ""
              ? "Tous les cours sont terminés — retirez le filtre pour les revoir."
              : `Aucun cours ne correspond à « ${query.trim()} »${
                  hideLearned ? " avec les cours terminés masqués" : ""
                }.`}
          </p>
        </div>
      ) : (
        LEVELS.map(({ level, label, description, icon: Icon }) => {
          const levelCourses = visibleCourses.filter((c) => c.level === level);
          if (levelCourses.length === 0) return null;
          return (
            <section key={level} className="mt-10">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg border bg-card text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">Niveau {label}</h2>
                <LevelBadge level={level} />
                <span className="text-sm text-muted-foreground">
                  {levelCourses.length} cours — {description}
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {levelCourses.map((course) => (
                  <CourseCard
                    key={course.slug}
                    course={course}
                    learned={learned.includes(course.slug)}
                    onOpen={() => onOpenCourse(course.slug)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Détail d'un cours                                                   */
/* ------------------------------------------------------------------ */

function CourseDetail({
  course,
  learned,
  onToggleLearned,
  onBack,
  onNavigate,
}: {
  course: Course;
  learned: boolean;
  onToggleLearned: () => void;
  onBack: () => void;
  onNavigate: (slug: string) => void;
}) {
  // Réponses persistées (localStorage via quiz-progress) : le quiz survit
  // aux rechargements. CourseDetail est remonté via key={course.slug}.
  const answers = useQuizAnswers(course.slug);

  const siblings = getCoursesByLevel(course.level);
  const index = siblings.findIndex((c) => c.slug === course.slug);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index < siblings.length - 1 ? siblings[index + 1] : null;
  const previousSlug = previous?.slug ?? null;
  const nextSlug = next?.slug ?? null;

  const tocItems = useMemo(() => buildTocItems(course), [course]);

  // ← / → : navigation clavier entre cours voisins du même niveau,
  // sauf si un champ de saisie a le focus ou si un dialog est ouvert.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]') !== null) return;
      const targetSlug = event.key === "ArrowLeft" ? previousSlug : nextSlug;
      if (targetSlug === null) return;
      event.preventDefault();
      onNavigate(targetSlug);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previousSlug, nextSlug, onNavigate]);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === course.quiz.length;
  const score = course.quiz.reduce(
    (acc, question, i) => acc + (answers[i] === question.answer ? 1 : 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] p-6">
      <div className="lg:grid lg:grid-cols-[1fr_14rem] lg:gap-10">
        {/* Colonne de contenu — largeur de lecture ~760 px */}
        <div className="min-w-0 max-w-[760px]">
          <ReadingProgressBar />

          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={onBack}
          >
            <ChevronLeft />
            Apprentissage
          </Button>

          <p className="mt-4 text-sm text-muted-foreground">
            Apprentissage · Niveau {LEVEL_LABELS[course.level]}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <LevelBadge level={course.level} />
            <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
              <Clock className="size-3" />
              {course.durationMin} min
            </Badge>
            {course.exercise && (
              <Badge variant="outline" className="gap-1 border-primary/30 font-normal text-primary">
                <Target className="size-3" />
                Exercice pratique
              </Badge>
            )}
            {learned && (
              <Badge variant="outline" className="gap-1 border-success/40 font-normal text-success">
                <CircleCheck className="size-3" />
                Terminé
              </Badge>
            )}
          </div>

          <h1 className="text-balance mt-3 text-3xl font-semibold tracking-tight">
            {course.title}
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground">{course.summary}</p>

          {/* Sections rédigées */}
          <div className="mt-10 space-y-9">
            {course.sections.map((section, i) => (
              <section key={i} id={`course-section-${i}`} className="scroll-mt-3">
                <h2 className="flex items-baseline gap-3 text-lg font-semibold tracking-tight">
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3">{renderBlocks(section.content)}</div>
              </section>
            ))}
          </div>

          {/* Concepts */}
          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">Concepts clés</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {course.concepts.map((concept) => (
                <Badge key={concept} variant="secondary" className="font-normal">
                  {concept}
                </Badge>
              ))}
            </div>
          </section>

          {/* À retenir */}
          {(course.keyTakeaways?.length ?? 0) > 0 && (
            <section id="course-takeaways" className="mt-10 scroll-mt-3">
              <Card className="gap-3 border-success/30 bg-success/[0.03] py-4">
                <CardHeader className="px-5">
                  <CardTitle className="flex items-center gap-2.5 text-base">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                      <Lightbulb className="size-4" />
                    </span>
                    À retenir
                  </CardTitle>
                  <CardDescription>
                    L&apos;essentiel de ce cours, autonome pour une relecture plus tard.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-5">
                  <ul className="space-y-2.5">
                    {course.keyTakeaways?.map((takeaway, i) => (
                      <li
                        key={i}
                        className="flex gap-2.5 text-[15px] leading-7 text-muted-foreground"
                      >
                        <Check className="mt-1.5 size-4 shrink-0 text-success" />
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}

          {/* Quiz (réponses persistées) */}
          <section id="course-quiz" className="mt-10 scroll-mt-3">
            <h2 className="text-lg font-semibold tracking-tight">Quiz</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.quiz.length} questions — la correction est immédiate et vos réponses sont
              conservées dans ce navigateur.
            </p>
            <div className="mt-4 space-y-4">
              {course.quiz.map((question, qi) => (
                <QuizQuestionCard
                  key={`${course.slug}-${qi}`}
                  question={question}
                  index={qi}
                  chosen={answers[qi]}
                  onChoose={(choice) => saveQuizAnswer(course.slug, qi, choice)}
                />
              ))}
            </div>
            {allAnswered && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <p className="flex-1 text-sm font-medium tabular-nums">
                  Score final : {score} / {course.quiz.length}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resetQuizAnswers(course.slug)}
                >
                  <RotateCcw />
                  Recommencer
                </Button>
              </div>
            )}
          </section>

          {/* Exercice practice */}
          {course.exercise && (
            <section id="course-exercise" className="scroll-mt-3">
              <ExerciseCard exercise={course.exercise} courseSlug={course.slug} />
            </section>
          )}

          {/* Actions de fin */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
            <Button
              variant={learned ? "outline" : "default"}
              className={cn(learned && "border-success/40 text-success hover:bg-success/10")}
              onClick={onToggleLearned}
            >
              {learned ? <CircleCheck /> : <Check />}
              {learned ? "Terminé — annuler" : "Marquer comme terminé"}
            </Button>
            <div className="flex flex-wrap gap-2">
              {previous && (
                <Button
                  variant="outline"
                  className="max-w-52"
                  onClick={() => onNavigate(previous.slug)}
                >
                  <ChevronLeft />
                  <span className="truncate">{previous.title}</span>
                </Button>
              )}
              {next && (
                <Button
                  variant="outline"
                  className="max-w-52"
                  onClick={() => onNavigate(next.slug)}
                >
                  <span className="truncate">{next.title}</span>
                  <ChevronRight />
                </Button>
              )}
            </div>
          </div>
        </div>

        <CourseToc items={tocItems} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function LearnView() {
  const activeCourseSlug = useAppStore((s) => s.activeCourseSlug);
  const openCourse = useAppStore((s) => s.openCourse);
  // Progression locale (localStorage) exposée comme store externe réactif :
  // snapshot serveur vide → aucune divergence d'hydratation.
  const learned = useLearnedCourses();

  useEffect(() => {
    // Le conteneur qui défile est le <main id="app-main"> du shell —
    // window ne défile pas, l'ancien window.scrollTo était sans effet.
    document.getElementById("app-main")?.scrollTo({ top: 0 });
  }, [activeCourseSlug]);

  const course = activeCourseSlug !== null ? COURSE_MAP[activeCourseSlug] : undefined;

  // Référence stable : consommée comme dépendance de l'effet « ← / → »
  // de CourseDetail, qui ne doit pas se réabonner à chaque rendu.
  const handleNavigate = useCallback(
    (slug: string) => openCourse(slug),
    [openCourse],
  );

  function toggleLearned(slug: string) {
    if (learned.includes(slug)) {
      unmarkLearned(slug);
    } else {
      markLearned(slug);
      toast.success("Cours marqué comme terminé.");
    }
  }

  if (course) {
    return (
      <CourseDetail
        key={course.slug}
        course={course}
        learned={learned.includes(course.slug)}
        onToggleLearned={() => toggleLearned(course.slug)}
        onBack={() => openCourse(null)}
        onNavigate={handleNavigate}
      />
    );
  }

  return <CourseList learned={learned} onOpenCourse={handleNavigate} />;
}
