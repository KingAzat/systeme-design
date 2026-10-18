/**
 * SystemLab — PRNG déterministe (mulberry32) + gaussienne de Box-Muller.
 *
 * TOUT l'aléa du moteur passe par ce module : aucune autre source de hasard
 * n'est autorisée dans les calculs (ni Math.random, ni Date.now).
 * À seed et ordre de traitement identiques, la trajectoire est reproductible.
 */
export class Rng {
  private state: number;
  /** Second tirage de Box-Muller mis en réserve (paire de gaussiennes). */
  private spare: number | null = null;

  constructor(seed: number) {
    // Mélange léger pour éviter que des graines proches donnent des suites proches.
    let s = seed >>> 0;
    if (s === 0) s = 0x9e3779b9;
    s ^= s >>> 16;
    s = Math.imul(s, 0x85ebca6b);
    s ^= s >>> 13;
    s = Math.imul(s, 0xc2b2ae35);
    this.state = s >>> 0;
  }

  /** Uniforme [0, 1) — mulberry32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniforme [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Vrai avec la probabilité p (p ≤ 0 → jamais, p ≥ 1 → toujours). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * Gaussienne centrée réduite — Box-Muller polaire (rejection sampling).
   * Deux tirages indépendants par paire, le second est conservé en réserve.
   */
  gaussian(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * f;
    return u * f;
  }

  /**
   * Log-normale : médiane `median`, dispersion `sigma` (écart-type du logarithme).
   * Utilisée pour les temps de service (asymétrie réaliste : traitements longs rares).
   */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.gaussian());
  }

  /** Tirage exponentiel de taux `ratePerSec` (processus de Poisson) → délai en ms. */
  expovariateMs(ratePerSec: number): number {
    if (ratePerSec <= 0) return Number.POSITIVE_INFINITY;
    const u = this.next(); // u ∈ [0,1) → 1−u ∈ (0,1] : log défini
    return (-1000 * Math.log(1 - u)) / ratePerSec;
  }
}

/** Hachage stable FNV-1a 32 bits (ip-hash des load balancers). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
