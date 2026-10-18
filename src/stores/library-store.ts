"use client";

/**
 * SystemLab — Store bibliothèque (préférences utilisateur persistées).
 * Favoris et composants récemment utilisés dans le panneau de gauche de l'éditeur.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENTS = 12;

interface LibraryState {
  /** Identifiants de composants favoris (componentId du catalogue). */
  favorites: string[];
  /** Identifiants récemment utilisés (plus récent en tête, max 12). */
  recents: string[];

  toggleFavorite: (componentId: string) => void;
  addRecent: (componentId: string) => void;
  isFavorite: (componentId: string) => boolean;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recents: [],

      toggleFavorite: (componentId) =>
        set((s) => ({
          favorites: s.favorites.includes(componentId)
            ? s.favorites.filter((id) => id !== componentId)
            : [...s.favorites, componentId],
        })),

      addRecent: (componentId) =>
        set((s) => ({
          recents: [componentId, ...s.recents.filter((id) => id !== componentId)].slice(
            0,
            MAX_RECENTS,
          ),
        })),

      isFavorite: (componentId) => get().favorites.includes(componentId),
    }),
    {
      name: "systemlab-library",
    },
  ),
);
