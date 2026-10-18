/**
 * SystemLab — injection de pannes.
 *
 * Le facteur de disponibilité d'un nœud au temps t :
 *   - « outage »     : 0 sur [start, start+duration], puis rampe 0→1 sur recoverySec.
 *   - « degradation »: (1−severity) sur la fenêtre, puis rampe vers 1.
 *
 * Effets appliqués par le moteur :
 *   facteur 0            → toute requête entrante échoue immédiatement
 *                          (« Service indisponible (panne) ») ;
 *   0 < facteur < 1      → temps de service × 1/facteur, capacité × facteur ;
 *   availability (nœud)  = 1 − durée d'indisponibilité / durée simulée.
 *
 * Les conséquences (erreurs remontantes, circuit breakers ouverts, bascule
 * des load balancers avec health checks, files qui s'accumulent en amont)
 * sont ÉMERGENTES : elles découlent du modèle, pas d'un script.
 */
import type { FailureScenario } from "@/types";

export class FailureEngine {
  private readonly failures: FailureScenario[];

  constructor(failures: FailureScenario[]) {
    this.failures = (failures ?? []).filter(
      (f) =>
        f !== null &&
        typeof f === "object" &&
        typeof f.nodeId === "string" &&
        Number.isFinite(f.startSec) &&
        Number.isFinite(f.durationSec),
    );
  }

  /** Y a-t-il au moins une panne pour ce nœud ? */
  has(nodeId: string): boolean {
    return this.failures.some((f) => f.nodeId === nodeId);
  }

  /**
   * Facteur de capacité/disponibilité du nœud au temps t (ms simulées).
   * En cas de pannes multiples sur le même nœud, on prend la pire.
   */
  factor(nodeId: string, tMs: number): number {
    let worst = 1;
    for (const f of this.failures) {
      if (f.nodeId !== nodeId) continue;
      const v = this.singleFactor(f, tMs);
      if (v < worst) worst = v;
    }
    return worst;
  }

  private singleFactor(f: FailureScenario, tMs: number): number {
    const t = tMs / 1000;
    const start = Math.max(0, f.startSec);
    const duration = Math.max(0, f.durationSec);
    const end = start + duration;
    const recovery = Math.max(0, f.recoverySec);
    const recovEnd = end + recovery;
    if (t < start || t >= recovEnd) return 1;
    const severity = Math.min(1, Math.max(0, f.severity));
    const floor = f.kind === "outage" ? 0 : 1 - severity;
    if (t < end) return floor;
    if (recovery <= 0) return 1;
    // Récupération progressive : rampe floor → 1
    return floor + (1 - floor) * ((t - end) / recovery);
  }

  /** Durée cumulée d'indisponibilité totale (facteur 0) dans [0, simSec]. */
  outageSec(nodeId: string, simSec: number): number {
    let total = 0;
    for (const f of this.failures) {
      if (f.nodeId !== nodeId || f.kind !== "outage") continue;
      const start = Math.max(0, f.startSec);
      const end = start + Math.max(0, f.durationSec);
      const overlap = Math.min(end, simSec) - Math.min(start, simSec);
      if (overlap > 0) total += overlap;
    }
    return Math.min(total, simSec);
  }

  /** Durée cumulée en mode dégradé (0 < facteur < 1) dans [0, simSec]. */
  degradedSec(nodeId: string, simSec: number): number {
    let total = 0;
    for (const f of this.failures) {
      if (f.nodeId !== nodeId) continue;
      const start = Math.max(0, f.startSec);
      const end = start + Math.max(0, f.durationSec);
      const recovEnd = end + Math.max(0, f.recoverySec);
      // fenêtre de dégradation = [start, end) (sauf outage : 0) ∪ [end, recovEnd) (rampe)
      if (f.kind === "degradation") {
        const w1 = Math.min(end, simSec) - Math.min(start, simSec);
        if (w1 > 0) total += w1;
      }
      const w2 = Math.min(recovEnd, simSec) - Math.min(end, simSec);
      if (w2 > 0) total += w2;
    }
    return Math.min(total, simSec);
  }

  /** Liste des pannes actives (utile pour le diagnostic de scénario). */
  active(): FailureScenario[] {
    return [...this.failures];
  }
}
