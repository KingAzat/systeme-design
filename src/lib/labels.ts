/**
 * SystemLab — libellés partagés (source unique).
 *
 * Les enums techniques (@/types) utilisent des identifiants anglais ; chaque
 * vue les affichait avec ses propres traductions (« Test rapide » ici,
 * « Rapide » là, « Événementiel » vs « Événementielle » ailleurs…). Ce module
 * centralise UN libellé par valeur — les vues importent au lieu de redéfinir.
 *
 * Conventions :
 * - *_LABELS      : forme courte (badges, résumés compacts)
 * - *_LONG_LABELS : forme développée (formulaires, listes déroulantes)
 * - *_PHRASES     : forme basse casse à insérer dans une phrase
 * - *_OPTIONS     : listes prêtes pour les composants Select shadcn/ui
 */
import type { Protocol, SimulationMaturity, SimulationMode } from "@/types";

/* ============================================================
 * Modes de scénario (ScenarioConfig.mode)
 * ============================================================ */

/** Libellés courts des modes de scénario (badges, résumés). */
export const MODE_LABELS: Record<SimulationMode, string> = {
  quick: "Rapide",
  load: "Charge",
  stress: "Stress",
  endurance: "Endurance",
  failure: "Panne",
};

/** Libellés longs des modes de scénario (formulaire de simulation). */
export const MODE_LONG_LABELS: Record<SimulationMode, string> = {
  quick: "Test rapide",
  load: "Test de charge",
  stress: "Test de stress",
  endurance: "Test d'endurance",
  failure: "Test de panne",
};

/** Options prêtes pour un Select de mode (libellés longs). */
export const MODE_OPTIONS: { value: SimulationMode; label: string }[] = (
  Object.keys(MODE_LONG_LABELS) as SimulationMode[]
).map((value) => ({ value, label: MODE_LONG_LABELS[value] }));

/** Libellé d'un mode de scénario (forme courte, repli sur la valeur brute). */
export function modeLabel(mode: SimulationMode): string {
  return MODE_LABELS[mode] ?? mode;
}

/* ============================================================
 * Mode d'exécution du moteur (SimulationResult.mode / Summary.mode)
 * ============================================================ */

/** Le moteur produit soit une estimation, soit une simulation échantillonnée. */
export type ResultMode = "analytical" | "event-sampled";

/** Libellés courts du mode d'exécution (badges de tableau/historique). */
export const RESULT_MODE_LABELS: Record<ResultMode, string> = {
  analytical: "Analytique",
  "event-sampled": "Événementielle",
};

/** Libellés longs du mode d'exécution (en-tête de résultats). */
export const RESULT_MODE_LONG_LABELS: Record<ResultMode, string> = {
  analytical: "Estimation analytique",
  "event-sampled": "Simulation événementielle",
};

/** Formes basses casse à insérer dans une phrase (« mode analytique… »). */
export const RESULT_MODE_PHRASES: Record<ResultMode, string> = {
  analytical: "analytique",
  "event-sampled": "événementielle échantillonnée",
};

/* ============================================================
 * Protocoles de connexion (ArchEdge.protocol)
 * ============================================================ */

/** Libellés des protocoles (badge d'arête + sélecteur du panneau connexion). */
export const PROTOCOL_LABELS: Record<Protocol, string> = {
  http: "HTTP",
  https: "HTTPS",
  tcp: "TCP",
  grpc: "gRPC",
  websocket: "WebSocket",
  amqp: "AMQP",
  kafka: "Kafka",
  redis: "Redis",
  sql: "SQL",
};

/** Options prêtes pour un Select de protocole. */
export const PROTOCOL_OPTIONS: { value: Protocol; label: string }[] = (
  Object.keys(PROTOCOL_LABELS) as Protocol[]
).map((value) => ({ value, label: PROTOCOL_LABELS[value] }));

/* ============================================================
 * Maturité de simulation des composants (CatalogComponent.maturity)
 * ============================================================ */

/** Libellés de maturité (badges « Simulé / Partiel / Visuel »). */
export const MATURITY_LABELS: Record<SimulationMaturity, string> = {
  simulated: "Simulé",
  partial: "Partiel",
  visual: "Visuel",
};
