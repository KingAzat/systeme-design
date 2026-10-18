/**
 * SystemLab — formules de files d'attente pour le mode analytique.
 *
 * - `erlangCWaitMs`  : attente moyenne M/M/c (formule d'Erlang C, calcul
 *   stabilisé en espace logarithmique pour de grandes concurrences).
 * - `mgcWaitMs`      : approximation M/G/c — correction de variabilité
 *   (Ca² + Cs²)/2 appliquée à Erlang C (approximation usuelle de capacity
 *   planning, cf. Factory Physics). Repli Kingman si ρ ≥ 1 (estimation
 *   minorante, signalée « approx. »).
 * - `kingmanWaitMs`  : G/G/c réduisant à la formule de Kingman pour c = 1.
 *
 * Notations : λ = taux d'arrivée (req/s), E[S] = temps de service moyen (ms),
 * c = nombre de serveurs, a = λ·E[S]/1000 erlangs offerts, ρ = a/c.
 */

export interface WaitEstimate {
  waitMs: number;
  /** true si la file est instable (ρ ≥ 1) : valeur approchée minorante. */
  approximate: boolean;
  /** Charge offerte par serveur (ρ). */
  rho: number;
}

/** Probabilité d'attente (Erlang C) puis attente moyenne M/M/c. null si instable. */
export function erlangCWaitMs(lambdaPerSec: number, serviceMs: number, servers: number): number | null {
  const c = Math.max(1, Math.floor(servers));
  const a = (lambdaPerSec * serviceMs) / 1000;
  if (a <= 0) return 0;
  if (a >= c) return null; // ρ ≥ 1 : file instable, pas de régime permanent

  // l[k] = ln(a^k / k!) — récurrence additive stable
  const l = new Array<number>(c + 1);
  l[0] = 0;
  let maxL = 0;
  for (let k = 1; k <= c; k++) {
    l[k] = l[k - 1] + Math.log(a / k);
    if (l[k] > maxL) maxL = l[k];
  }
  // Normalisation par e^maxL pour éviter les débordements
  let sum = 0;
  for (let k = 0; k < c; k++) sum += Math.exp(l[k] - maxL);
  const lastTerm = Math.exp(l[c] - maxL) / (1 - a / c);
  const pWait = lastTerm / (sum + lastTerm);
  // Wq = P_attente × E[S] / (c − a)
  return (pWait * serviceMs) / (c - a);
}

/**
 * Kingman / G/G/c : Wq ≈ (ρ/(1−ρ)) × ((Ca²+Cs²)/2) × E[S]/c.
 * Pour c = 1 on retrouve exactement la formule de Kingman.
 */
export function kingmanWaitMs(
  lambdaPerSec: number,
  serviceMs: number,
  servers: number,
  ca2 = 1,
  cs2 = 0,
): number {
  const c = Math.max(1, Math.floor(servers));
  const a = (lambdaPerSec * serviceMs) / 1000;
  const rho = a / c;
  if (rho <= 0) return 0;
  const rhoCap = Math.min(rho, 0.98); // plafond : file saturée → minorant
  return ((rhoCap / (1 - rhoCap)) * ((ca2 + cs2) / 2) * serviceMs) / c;
}

/** Attente approchée M/G/c : Erlang C corrigé de la variabilité, Kingman en repli. */
export function mgcWaitMs(
  lambdaPerSec: number,
  serviceMs: number,
  servers: number,
  ca2 = 1,
  cs2 = 0,
): WaitEstimate {
  const c = Math.max(1, Math.floor(servers));
  const a = (lambdaPerSec * serviceMs) / 1000;
  const rho = a / c;
  if (rho < 1) {
    const base = erlangCWaitMs(lambdaPerSec, serviceMs, c);
    if (base !== null && Number.isFinite(base)) {
      return { waitMs: (base * (ca2 + cs2)) / 2, approximate: false, rho };
    }
  }
  return { waitMs: kingmanWaitMs(lambdaPerSec, serviceMs, c, ca2, cs2), approximate: true, rho };
}
