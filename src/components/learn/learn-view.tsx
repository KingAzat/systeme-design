"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  Gauge,
  Play,
  Radar,
  Rocket,
  RotateCcw,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { Progress } from "@/components/ui/progress";
import { LevelBadge } from "@/components/learn/level-badge";
import {
  markLearned,
  unmarkLearned,
  useLearnedCourses,
} from "@/components/learn/learned-courses";
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
 * Liste des 23 cours groupés par niveau avec progression locale, puis vue
 * détail : sections rédigées, concepts, quiz interactif corrigé immédiatement
 * et exercice practice branché sur un modèle d'architecture.
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

function ExerciseCard({ exercise }: { exercise: CourseExercise }) {
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
          <Button onClick={() => openTemplate(exercise.templateId, exercise.title)}>
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
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
            {course.durationMin} min
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
/* Liste des cours                                                     */
/* ------------------------------------------------------------------ */

function CourseList({
  learned,
  onOpenCourse,
}: {
  learned: string[];
  onOpenCourse: (slug: string) => void;
}) {
  const learnedCount = COURSES.filter((c) => learned.includes(c.slug)).length;

  return (
    <div className="mx-auto w-full max-w-[1100px] p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Apprentissage</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {COURSES.length} cours de System Design, avec quiz corrigés et exercices
        pratiques évalués sur des métriques simulées.
      </p>

      <Card className="mt-6 gap-0 py-4">
        <CardContent className="px-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium">Progression locale</p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {learnedCount} / {COURSES.length} cours terminés
            </p>
          </div>
          <Progress
            value={(learnedCount / COURSES.length) * 100}
            className="mt-2.5 h-2"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Enregistrée dans ce navigateur, sans compte utilisateur.
          </p>
        </CardContent>
      </Card>

      {LEVELS.map(({ level, label, description, icon: Icon }) => {
        const courses = getCoursesByLevel(level);
        return (
          <section key={level} className="mt-10">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg border bg-card text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight">Niveau {label}</h2>
              <LevelBadge level={level} />
              <span className="text-sm text-muted-foreground">
                {courses.length} cours — {description}
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
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
      })}
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
  // Remonté via key={course.slug} à chaque changement de cours : le quiz
  // et les réponses se réinitialisent naturellement, sans effet.
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const siblings = getCoursesByLevel(course.level);
  const index = siblings.findIndex((c) => c.slug === course.slug);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index < siblings.length - 1 ? siblings[index + 1] : null;

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === course.quiz.length;
  const score = course.quiz.reduce(
    (acc, q, i) => acc + (answers[i] === q.answer ? 1 : 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-[760px] p-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={onBack}
      >
        <ChevronLeft />
        Apprentissage
      </Button>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
          <section key={i}>
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

      {/* Quiz */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Quiz</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {course.quiz.length} questions — la correction est immédiate.
        </p>
        <div className="mt-4 space-y-4">
          {course.quiz.map((question, qi) => (
            <QuizQuestionCard
              key={`${course.slug}-${qi}`}
              question={question}
              index={qi}
              chosen={answers[qi]}
              onChoose={(choice) => setAnswers((prev) => ({ ...prev, [qi]: choice }))}
            />
          ))}
        </div>
        {allAnswered && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <p className="flex-1 text-sm font-medium tabular-nums">
              Score final : {score} / {course.quiz.length}
            </p>
            <Button variant="outline" size="sm" onClick={() => setAnswers({})}>
              <RotateCcw />
              Recommencer
            </Button>
          </div>
        )}
      </section>

      {/* Exercice practice */}
      {course.exercise && <ExerciseCard exercise={course.exercise} />}

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
        onNavigate={(slug) => openCourse(slug)}
      />
    );
  }

  return <CourseList learned={learned} onOpenCourse={(slug) => openCourse(slug)} />;
}
