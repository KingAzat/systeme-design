/**
 * SystemLab — modèle de coût mensuel estimé (ordres de grandeur cloud 2025,
 * tarifs « us-east » moyens ; hypothèse documentée : précision ~±30 %).
 *
 *   server (dédié)   : 45 $/instance (≈ 2 vCPU / 4 Go)
 *   serverless       : 0,20 $ / 1 M requêtes (facturation à l'invocation)
 *   database         : 120 $ fixe + 0,10 $/Go de données
 *   replica          : 80 $ par réplica (le coût de réplication est porté
 *                      par les nœuds réplica, pas par le primaire)
 *   cache            : 15 $/Go de mémoire
 *   balancer         : 25 $ fixe + 0,008 $/Go transité
 *   cdn              : 0,01 $/Go servi (requêtes × taille moyenne)
 *   queue            : 2 $/partition + 0,10 $ / 1 M messages
 *   rate-limiter / circuit-breaker / proxy : 10 à 30 $ fixes (service géré)
 *   storage          : 10 $ fixe (ordre de grandeur, sans volumétrie saisie)
 *   generator / composants pédagogiques   : 0 $ (explicite : hors infra réelle)
 */
import type { SimRole } from "@/types";
import type { RoleConfig } from "./runtime";

/** 30,42 jours × 86 400 s — mois « moyen » utilisé pour la projection. */
export const SECONDS_PER_MONTH = 2_628_468;

/** Détection des composants facturés à la requête (FaaS). */
function isServerless(componentId: string): boolean {
  const id = componentId.toLowerCase();
  return id.includes("serverless") || id.includes("lambda") || id.includes("function");
}

export function nodeCostPerMonth(
  role: SimRole,
  rc: RoleConfig,
  componentId: string,
  /** Débit traité observé, remis à l'échelle réelle (req/s). */
  throughputRpsReal: number,
  requestSizeKb: number,
): number {
  const rps = Math.max(0, throughputRpsReal);
  // Ko/s → Go/mois (1 Go = 1024 × 1024 Ko)
  const gbPerMonth = (rps * SECONDS_PER_MONTH * Math.max(0, requestSizeKb)) / (1024 * 1024);
  switch (role) {
    case "server":
      if (isServerless(componentId)) {
        return round2((rps * SECONDS_PER_MONTH * 0.2) / 1_000_000);
      }
      return round2(Math.max(1, rc.instances) * 45);
    case "worker":
      return round2(Math.max(1, rc.instances) * 45);
    case "database":
      return round2(120 + 0.1 * Math.max(0, rc.dataGb));
    case "replica":
      return round2(Math.max(1, rc.instances) * 80);
    case "cache":
      return round2(15 * Math.max(0, rc.memoryGb));
    case "balancer":
      return round2(25 + gbPerMonth * 0.008);
    case "cdn":
      return round2(gbPerMonth * 0.01);
    case "queue":
      return round2(
        Math.max(1, rc.partitions) * 2 + ((rps * SECONDS_PER_MONTH) / 1_000_000) * 0.1,
      );
    case "rate-limiter":
      return 20;
    case "circuit-breaker":
      return 10;
    case "proxy":
      return 30;
    case "storage":
      return 10;
    case "generator":
    case "pass-through":
      return 0;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
