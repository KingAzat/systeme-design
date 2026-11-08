"use client";

import { useSyncExternalStore } from "react";

/**
 * SystemLab — progression pédagogique locale (clé localStorage "systemlab-learned").
 *
 * Petit store externe consommé via useSyncExternalStore : lisible
 * simultanément par la vue apprentissage et le tableau de bord, synchronisé
 * par événement custom. Sans compte utilisateur — honnêtement locale.
 *
 * Le snapshot serveur est vide : pas de décalage d'hydratation, la progression
 * n'apparaît qu'après le premier rendu client.
 */

export const LEARNED_KEY = "systemlab-learned";

const LEARNED_EVENT = "systemlab-learned-change";
const SERVER_SNAPSHOT: string[] = [];

let cached: string[] | null = null;

function readSlugs(): string[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(LEARNED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function getSnapshot(): string[] {
  if (cached === null) cached = readSlugs();
  return cached;
}

function subscribe(callback: () => void): () => void {
  // Événement custom (même onglet) : le cache vient d'être mis à jour par
  // write() — il ne faut PAS l'invalider, sinon un setItem en échec (quota,
  // navigation privée) relirait un storage inchangé et la coche disparaîtrait
  // immédiatement au lieu de vivre en « progression de session ».
  const onLocalChange = () => callback();
  // storage (AUTRE onglet) : le storage local a réellement changé → invalider.
  const onStorageChange = () => {
    cached = null;
    callback();
  };
  window.addEventListener(LEARNED_EVENT, onLocalChange);
  window.addEventListener("storage", onStorageChange);
  return () => {
    window.removeEventListener(LEARNED_EVENT, onLocalChange);
    window.removeEventListener("storage", onStorageChange);
  };
}

function write(slugs: string[]): void {
  cached = slugs;
  try {
    window.localStorage.setItem(LEARNED_KEY, JSON.stringify(slugs));
  } catch {
    // localStorage indisponible (navigation privée…) : progression de session.
  }
  window.dispatchEvent(new Event(LEARNED_EVENT));
}

/** Slugs actuellement marqués comme terminés (lecture ponctuelle, hors React). */
export function getLearnedSlugs(): string[] {
  return readSlugs();
}

/** Hook réactif : progression locale partagée entre les vues. */
export function useLearnedCourses(): string[] {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT,
  );
}

/** Marque un cours comme terminé. */
export function markLearned(slug: string): void {
  const slugs = readSlugs();
  if (!slugs.includes(slug)) write([...slugs, slug]);
}

/** Retire un cours de la progression. */
export function unmarkLearned(slug: string): void {
  const slugs = readSlugs();
  if (slugs.includes(slug)) write(slugs.filter((s) => s !== slug));
}
