/**
 * SystemLab — seuils d'alerte partagés par toutes les vues.
 *
 * UNIQUE source de vérité des seuils d'affichage (canvas, carte de charge,
 * tableaux de métriques, KPI, historique). Auparavant, chaque vue codait ses
 * propres valeurs (80 %/95 % dans l'éditeur, 60 %/85 % dans les résultats) :
 * un même nœud pouvait apparaître « saturé » sur le canevas mais « OK » dans
 * les résultats. Toutes les vues s'appuient désormais sur ces constantes.
 *
 * Note : le moteur (src/engine/diagnostics.ts) conserve sa propre
 * classification pédagogique (80 %/95 %) pour libeller les diagnostics —
 * hors périmètre de l'UI, ces seuils internes ne sont pas concernés.
 */

/** Utilisation moyenne/max au-delà de laquelle un nœud est « en vigilance ». */
export const UTILIZATION_WARN = 0.6;

/** Utilisation moyenne/max au-delà de laquelle un nœud est « saturé ». */
export const UTILIZATION_CRITICAL = 0.85;

/** Latence p95 de bout en bout au-delà de laquelle le résultat est alertant. */
export const P95_WARN_MS = 800;

/** Taux d'erreur au-delà duquel le résultat est signalé (couleur d'alerte). */
export const ERROR_RATE_WARN = 0.02;

/** Taux d'erreur au-delà duquel un nœud est considéré en panne/défaillant. */
export const ERROR_RATE_CRITICAL = 0.05;
