/**
 * Barrel du catalogue SystemLab — point d'entrée unique `@/data/catalog`.
 * Ré-exporte le registre complet (composants + catégories + helpers de recherche)
 * ainsi que les définitions de base (catégories, composants cœur, helpers de champs).
 */
export * from "./registry";
export * from "./categories";
export * from "./components-core";
export * from "./field";
