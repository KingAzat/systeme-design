"use client";

import { useSyncExternalStore } from "react";

import { COURSES } from "@/data/courses";

/**
 * SystemLab — réponses de quiz persistées (clé localStorage "systemlab-quiz").
 *
 * Même mécanique que learned-courses.ts : petit store externe consommé via
 * useSyncExternalStore, synchronisé par événement custom + événement storage.
 * Forme : { [slugDuCours]: { [indexQuestion]: indexChoix } }.
 *
 * Différence volontaire avec learned-courses : l'événement custom NOTIFIE sans
 * invalider le cache (l'écrivain met déjà le cache à jour). Si setItem échoue
 * (quota, navigation privée), la progression de session reste en mémoire —
 * seuls les changements venus d'un autre onglet (storage) invalident.
 *
 * Le snapshot serveur est vide : aucune divergence d'hydratation.
 */

export const QUIZ_KEY = "systemlab-quiz";

/** Réponses persistées : slug du cours → { index question → index choix }. */
export type QuizAnswers = Record<number, number>;
export type AllQuizAnswers = Record<string, QuizAnswers>;

const QUIZ_EVENT = "systemlab-quiz-change";
const SERVER_SNAPSHOT: AllQuizAnswers = {};
const EMPTY_ANSWERS: QuizAnswers = {};

let cached: AllQuizAnswers | null = null;

/**
 * Mémoïsation des snapshots par slug : useSyncExternalStore exige une
 * référence stable tant que les données ne changent pas. On mémorise
 * l'objet réellement référencé par le cache (identité = fraîcheur).
 */
const slugSnapshots = new Map<string, QuizAnswers>();

function isValidIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function readAll(): AllQuizAnswers {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(QUIZ_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const result: AllQuizAnswers = {};
    for (const [slug, answers] of Object.entries(parsed)) {
      if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
        continue;
      }
      const clean: QuizAnswers = {};
      for (const [questionIndex, choice] of Object.entries(answers)) {
        const qi = Number(questionIndex);
        if (Number.isInteger(qi) && qi >= 0 && isValidIndex(choice)) {
          clean[qi] = choice;
        }
      }
      result[slug] = clean;
    }
    return result;
  } catch {
    // JSON corrompu : on repart d'un état vide plutôt que de crasher.
    return {};
  }
}

function getSnapshot(): AllQuizAnswers {
  if (cached === null) cached = readAll();
  return cached;
}

function getSlugSnapshot(slug: string): QuizAnswers {
  const entry = getSnapshot()[slug];
  if (entry === undefined) return EMPTY_ANSWERS;
  if (slugSnapshots.get(slug) !== entry) slugSnapshots.set(slug, entry);
  return entry;
}

function invalidate(): void {
  cached = null;
  slugSnapshots.clear();
}

function subscribe(callback: () => void): () => void {
  // Événement custom (même document) : le cache est déjà à jour, on notifie
  // sans invalider — indispensable quand setItem vient d'échouer.
  window.addEventListener(QUIZ_EVENT, callback);
  // Événement storage (autre onglet) : on relit depuis localStorage.
  const onStorage = (event: StorageEvent) => {
    if (event.key === QUIZ_KEY || event.key === null) {
      invalidate();
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(QUIZ_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

function write(all: AllQuizAnswers): void {
  cached = all;
  try {
    window.localStorage.setItem(QUIZ_KEY, JSON.stringify(all));
  } catch {
    // Quota dépassé ou stockage bloqué : la progression de session vit en
    // mémoire — on n'invalide PAS le cache.
  }
  window.dispatchEvent(new Event(QUIZ_EVENT));
}

/** Réponses d'un cours (lecture ponctuelle, hors React). */
export function getQuizAnswers(slug: string): QuizAnswers {
  return { ...getSnapshot()[slug] };
}

/** Toutes les réponses (lecture ponctuelle, hors React). */
export function getAllQuizAnswers(): AllQuizAnswers {
  return { ...getSnapshot() };
}

/** Hook réactif : réponses persistées d'un cours donné. */
export function useQuizAnswers(slug: string): QuizAnswers {
  return useSyncExternalStore(
    subscribe,
    () => getSlugSnapshot(slug),
    () => EMPTY_ANSWERS,
  );
}

/** Hook réactif : le store complet (tous les cours). */
export function useAllQuizAnswers(): AllQuizAnswers {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT,
  );
}

/** Persiste le choix d'une question d'un cours. */
export function saveQuizAnswer(slug: string, questionIndex: number, choice: number): void {
  if (typeof window === "undefined") return;
  const all: AllQuizAnswers = { ...getSnapshot() };
  const entry: QuizAnswers = { ...all[slug] };
  if (entry[questionIndex] === choice) return;
  entry[questionIndex] = choice;
  all[slug] = entry;
  write(all);
}

/** Oublie toutes les réponses d'un cours (« Recommencer »). */
export function resetQuizAnswers(slug: string): void {
  if (typeof window === "undefined") return;
  const all: AllQuizAnswers = { ...getSnapshot() };
  if (all[slug] === undefined) return;
  delete all[slug];
  slugSnapshots.delete(slug);
  write(all);
}

/* ------------------------------------------------------------------ */
/* XP et niveaux                                                       */
/* ------------------------------------------------------------------ */

export const XP_PER_COURSE = 50;
export const XP_PER_CORRECT_ANSWER = 10;

export interface XpBreakdown {
  xp: number;
  courseXp: number;
  quizXp: number;
}

/**
 * XP locale : 50 par cours terminé + 10 par réponse correcte persistée.
 * Maximum atteignable : 23 cours + 69 questions = 1 840 XP.
 */
export function computeXp(learned: string[], answers: AllQuizAnswers): XpBreakdown {
  const learnedSet = new Set(learned);
  let courseXp = 0;
  let quizXp = 0;
  for (const course of COURSES) {
    if (learnedSet.has(course.slug)) courseXp += XP_PER_COURSE;
    const chosen = answers[course.slug];
    if (chosen === undefined) continue;
    for (const questionIndex of Object.keys(chosen)) {
      const question = course.quiz[Number(questionIndex)];
      if (question !== undefined && question.answer === chosen[Number(questionIndex)]) {
        quizXp += XP_PER_CORRECT_ANSWER;
      }
    }
  }
  return { xp: courseXp + quizXp, courseXp, quizXp };
}

export interface XpLevel {
  threshold: number;
  label: string;
  description: string;
}

/** Paliers de niveau, ordre croissant (XP max possible ≈ 1 840). */
export const XPLEVELS: XpLevel[] = [
  { threshold: 0, label: "Curieux", description: "Découvrir les bases" },
  { threshold: 200, label: "Apprenti architecte", description: "Les fondamentaux en poche" },
  { threshold: 600, label: "Praticien système", description: "Les patterns sans effort" },
  { threshold: 1100, label: "Architecte confirmé", description: "Concevoir sous contrainte" },
  { threshold: 1700, label: "Architecte principal", description: "Maîtrise du laboratoire" },
];

/** Niveau courant pour un total d'XP, plus le palier suivant (null au sommet). */
export function getXpLevel(xp: number): { current: XpLevel; next: XpLevel | null } {
  let index = 0;
  for (let i = 0; i < XPLEVELS.length; i++) {
    if (xp >= XPLEVELS[i].threshold) index = i;
  }
  return {
    current: XPLEVELS[index],
    next: index < XPLEVELS.length - 1 ? XPLEVELS[index + 1] : null,
  };
}
