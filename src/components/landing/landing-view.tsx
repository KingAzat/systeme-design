"use client";

import {
  ArrowRight,
  FlaskConical,
  Gauge,
  GitCompare,
  GraduationCap,
  Landmark,
  LayoutGrid,
  Lightbulb,
  MousePointerClick,
  Play,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/stores/app-store";
import { COMPONENTS } from "@/data/catalog";
import { COURSES } from "@/data/courses";
import { BIG_TECH_META, TEMPLATES } from "@/data/templates";

/**
 * SystemLab — page d'accueil.
 * Sobre et professionnelle (style Linear/Grafana) : hero avec illustration
 * statique SVG, fonctionnalités chiffrées réelles, parcours en 3 étapes,
 * bande finale et footer sticky. La navigation passe exclusivement par le store.
 */

const FEATURES: { icon: LucideIcon; title: string; lines: [string, string] }[] = [
  {
    icon: MousePointerClick,
    title: "Éditeur visuel",
    lines: [
      `${COMPONENTS.length} composants à glisser, relier et configurer.`,
      "Instances, latence, cache, concurrence : chaque paramètre est réglable.",
    ],
  },
  {
    icon: Gauge,
    title: "Moteur de simulation",
    lines: [
      "Estimation analytique ou simulation événementielle détaillée.",
      "Charge, montées en puissance, pics, pannes et files d'attente modélisés.",
    ],
  },
  {
    icon: Lightbulb,
    title: "Diagnostics intelligents",
    lines: [
      "Goulots d'étranglement identifiés avec preuves chiffrées à l'appui.",
      "Causes, explications pédagogiques et solutions argumentées.",
    ],
  },
  {
    icon: GitCompare,
    title: "Comparaison A/B",
    lines: [
      "Archivez vos simulations et comparez-les côte à côte.",
      "Latence, débit, erreurs, coût : la décision devient factuelle.",
    ],
  },
  {
    icon: LayoutGrid,
    title: `${TEMPLATES.length} modèles prêts`,
    lines: [
      "De l'API minimale au multi-région — plus les géants de la tech.",
      "Explorez, modifiez et simulez sans partir d'une page blanche.",
    ],
  },
  {
    icon: GraduationCap,
    title: "Parcours pédagogique",
    lines: [
      `${COURSES.length} cours, du niveau débutant au niveau avancé.`,
      "Quiz corrigés et exercices évalués sur des métriques simulées.",
    ],
  },
];

const BIG_TECH_COUNT = TEMPLATES.filter((t) => t.id in BIG_TECH_META).length;

const STEPS: { n: string; title: string; text: string }[] = [
  {
    n: "1",
    title: "Construire",
    text: "Glissez les composants sur le canevas, reliez-les et réglez leurs paramètres. Les zones regroupent les responsabilités.",
  },
  {
    n: "2",
    title: "Simuler",
    text: "Définissez le profil de charge — constant, montée, pic, vagues — et injectez des pannes pour éprouver l'architecture.",
  },
  {
    n: "3",
    title: "Diagnostiquer",
    text: "Lisez les métriques (p95, débit servi, taux d'erreur) et les diagnostics, puis itérez jusqu'à l'équilibre coût/latence.",
  },
];

/* ------------------------------------------------------------------ */
/* Illustration statique du hero — mini-architecture dessinée à la main */
/* ------------------------------------------------------------------ */

function HeroDiagram() {
  return (
    <svg
      viewBox="0 0 700 280"
      className="h-auto w-full"
      role="img"
      aria-label="Mini-architecture : utilisateurs, CDN, répartiteur, serveurs API, cache et base de données"
    >
      <defs>
        <marker
          id="hero-arrow"
          viewBox="0 0 10 10"
          refX="8.5"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" className="fill-muted-foreground/70" />
        </marker>
      </defs>

      {/* Zone « Backend » en pointillés discrets */}
      <rect
        x={284}
        y={126}
        width={322}
        height={150}
        rx={10}
        className="fill-primary/5 stroke-primary/25"
        strokeWidth={1}
        strokeDasharray="6 4"
      />
      <text x={294} y={142} fontSize={9.5} fontWeight={500} className="fill-primary/70">
        Backend
      </text>

      {/* Connexions */}
      <line x1={112} y1={58} x2={196} y2={58} strokeWidth={1.5} className="stroke-muted-foreground/70" markerEnd="url(#hero-arrow)" />
      <line x1={286} y1={58} x2={370} y2={58} strokeWidth={1.5} className="stroke-muted-foreground/70" markerEnd="url(#hero-arrow)" />
      {/* Répartiteur → serveurs API (coude orthogonal) */}
      <path
        d="M 426 80 L 426 106 L 360 106 L 360 144"
        fill="none"
        strokeWidth={1.5}
        className="stroke-muted-foreground/70"
        markerEnd="url(#hero-arrow)"
      />
      <line x1={420} y1={172} x2={464} y2={172} strokeWidth={1.5} className="stroke-muted-foreground/70" markerEnd="url(#hero-arrow)" />
      <line x1={530} y1={194} x2={530} y2={210} strokeWidth={1.5} className="stroke-muted-foreground/70" markerEnd="url(#hero-arrow)" />
      <text x={538} y={206} fontSize={8.5} className="fill-muted-foreground">
        miss 25 %
      </text>

      {/* Badges de débit (masquent le début des flèches) */}
      <g>
        <rect x={117} y={50} width={74} height={16} rx={4} className="fill-secondary stroke-border" strokeWidth={1} />
        <text x={154} y={61.5} fontSize={9.5} fontWeight={500} textAnchor="middle" className="fill-secondary-foreground">
          3 500 req/s
        </text>
      </g>
      <g>
        <rect x={296} y={50} width={64} height={16} rx={4} className="fill-secondary stroke-border" strokeWidth={1} />
        <text x={328} y={61.5} fontSize={9.5} fontWeight={500} textAnchor="middle" className="fill-secondary-foreground">
          800 req/s
        </text>
      </g>

      {/* Nœuds */}
      <g>
        <rect x={12} y={36} width={100} height={44} rx={8} strokeWidth={1} className="fill-card stroke-border" />
        <text x={62} y={62} fontSize={11} fontWeight={500} textAnchor="middle" className="fill-foreground">
          Utilisateurs
        </text>
      </g>
      <g>
        <rect x={196} y={36} width={90} height={44} rx={8} strokeWidth={1} className="fill-card stroke-border" />
        <text x={241} y={62} fontSize={11} fontWeight={500} textAnchor="middle" className="fill-foreground">
          CDN
        </text>
      </g>
      <g>
        <rect x={370} y={36} width={112} height={44} rx={8} strokeWidth={1} className="fill-card stroke-border" />
        <text x={426} y={62} fontSize={11} fontWeight={500} textAnchor="middle" className="fill-foreground">
          Load Balancer
        </text>
      </g>
      <g>
        <rect x={300} y={150} width={120} height={56} rx={8} strokeWidth={1} className="fill-card stroke-border" />
        <text x={360} y={172} fontSize={11} fontWeight={500} textAnchor="middle" className="fill-foreground">
          Serveurs API
        </text>
        <text x={360} y={188} fontSize={9} textAnchor="middle" className="fill-muted-foreground">
          3 instances · 45 ms
        </text>
      </g>
      <g>
        <rect x={470} y={150} width={120} height={44} rx={8} strokeWidth={1} className="fill-card stroke-border" />
        <text x={530} y={168} fontSize={11} fontWeight={500} textAnchor="middle" className="fill-foreground">
          Redis
        </text>
        <text x={530} y={183} fontSize={9} textAnchor="middle" className="fill-muted-foreground">
          hit 75 %
        </text>
      </g>
      <g>
        <rect x={470} y={214} width={120} height={44} rx={8} strokeWidth={1} className="fill-card stroke-border" />
        <text x={530} y={240} fontSize={11} fontWeight={500} textAnchor="middle" className="fill-foreground">
          PostgreSQL
        </text>
      </g>

      {/* Goulot d'étranglement */}
      <circle cx={412} cy={156} r={5} className="fill-destructive" />
      <text x={360} y={222} fontSize={9.5} fontWeight={500} textAnchor="middle" className="fill-destructive">
        Goulot — utilisation 82 %
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */

export function LandingView() {
  const newArchitecture = useAppStore((s) => s.newArchitecture);
  const setView = useAppStore((s) => s.setView);

  return (
    /* min-h-full (et non min-h-screen) : le conteneur de scroll du shell a une
       hauteur définie (main flex-1) — le footer colle ainsi exactement au bas
       du viewport quand le contenu est court, sans scroll fantôme de 48px. */
    <div className="flex min-h-full w-full flex-col bg-background">
      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            {/*
             * suppressHydrationWarning : les extensions navigateur (ex. Firefox
             * Translations) injectent des attributs comme data-moz-translations-id
             * sur les éléments textuels avant l’hydratation React. Le texte serveur
             * et client est identique — seule la présence de ces attributs externes
             * diffère, d’où la suppression ciblée du warning sur les zones textuelles.
             */}
            <span
              suppressHydrationWarning
              className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              <FlaskConical className="size-3.5 text-primary" />
              Apprendre le System Design en pratiquant
            </span>
            <h1
              suppressHydrationWarning
              className="text-balance mt-10 text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              Concevez. <span className="text-primary" suppressHydrationWarning>Simulez.</span>{" "}
              Comprenez.
            </h1>
            <p
              suppressHydrationWarning
              className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground"
            >
              Construisez des architectures au drag-and-drop, simulez la charge,
              identifiez les goulots d&apos;étranglement et comparez vos
              solutions — sans provisionner la moindre infrastructure.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => newArchitecture()}>
                <Play />
                Ouvrir l&apos;éditeur
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-foreground/20 hover:border-foreground/35 hover:bg-muted"
                onClick={() => setView("templates")}
              >
                <LayoutGrid />
                Explorer les modèles
              </Button>
            </div>
            <p suppressHydrationWarning className="mt-4 text-xs text-muted-foreground">
              {COMPONENTS.length} composants · {TEMPLATES.length} modèles ·{" "}
              {COURSES.length} cours — tout fonctionne dans votre navigateur.
            </p>
          </div>
          <div className="hidden lg:block">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <HeroDiagram />
            </div>
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section className="border-t">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            Tout ce qu&apos;il faut pour pratiquer
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Un environnement complet, du canevas au diagnostic, pensé pour
            apprendre en expérimentant.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="gap-4 py-5">
                <CardContent className="px-5">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {f.lines[0]}
                    <br />
                    {f.lines[1]}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Architectures des géants de la tech */}
      <section className="border-t bg-card">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
                <Landmark className="size-6 text-primary" aria-hidden />
                Les géants de la tech, en modèles
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {BIG_TECH_COUNT} architectures emblématiques reconstruites avec les
                composants du laboratoire : même structure, mêmes arbitrages, à
                votre échelle. Ouvrez-les, cassez-les, réparez-les.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-foreground/20 hover:border-foreground/35 hover:bg-muted"
              onClick={() => setView("templates")}
            >
              Explorer les modèles
              <ArrowRight />
            </Button>
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.filter((t) => t.id in BIG_TECH_META).map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-3 rounded-lg border bg-background px-4 py-3"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Landmark className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {BIG_TECH_META[t.id].inspiration}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="border-t bg-card">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            Comment ça marche
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <span className="flex size-9 items-center justify-center rounded-full border bg-background font-semibold tabular-nums text-primary">
                  {s.n}
                </span>
                <p className="mt-3 font-medium">{s.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bande finale */}
      <section className="border-t">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 text-center lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            Prêt à comprendre par la pratique&nbsp;?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Chaque concept de System Design devient concret quand vous le
            simulez vous-même. Commencez par un modèle, cassez-le, réparez-le.
          </p>
          <Button size="lg" className="mt-6" onClick={() => newArchitecture()}>
            Commencer maintenant
            <ArrowRight />
          </Button>
        </div>
      </section>

      {/* Footer sticky */}
      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 lg:px-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm font-medium text-foreground">
              SystemLab — Laboratoire interactif de System Design
            </p>
            <nav className="flex items-center gap-4">
              <button
                type="button"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setView("learn")}
              >
                Documentation
              </button>
              <button
                type="button"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setView("templates")}
              >
                Modèles
              </button>
              <button
                type="button"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setView("settings")}
              >
                Paramètres
              </button>
            </nav>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Fait avec Next.js, React Flow et un moteur de simulation
            événementielle.
          </p>
        </div>
      </footer>
    </div>
  );
}
