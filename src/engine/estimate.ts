/**
 * SystemLab — estimation analytique rapide (mode « quick »).
 *
 * `estimateArchitecture` propage le débit offert sur le graphe sans simulation
 * événementielle : répartition par poids/branches, hitRatio des caches,
 * acheminement lecture/écriture des serveurs (cache → réplica → base → file,
 * write-around), capacité par rôle (théorique) et attente approchée par
 * Erlang C / Kingman (module queueing).
 *
 * Résultat : un `NodeEstimate` par nœud — débit offert, capacité, taux
 * d'utilisation, contribution locale de latence et avertissements.
 */
import type { ArchitectureData, SimRole } from "@/types";
import { buildGraphIndex } from "./graph";
import { resolveRoleConfig, theoreticalCapacityRps, UNBOUNDED_RPS } from "./runtime";
import { mgcWaitMs } from "./queueing";

export interface NodeEstimate {
  nodeId: string;
  label: string;
  componentId: string;
  /** Capacité théorique nominale (req/s). */
  capacityRps: number;
  /** Débit offert propagé (req/s). */
  offeredRps: number;
  /** ρ = offert / capacité (peut dépasser 1). */
  utilization: number;
  /** Contribution locale de latence (attente + service, ms). */
  estLatencyMs: number;
  warnings: string[];
}

interface Flow {
  read: number;
  write: number;
}

const PASSES = 12; // bornes aussi les cycles : au plus 12 tours de boucle propagés
const ZERO: Flow = { read: 0, write: 0 };

function total(f: Flow): number {
  return f.read + f.write;
}

function fmtRho(rho: number): string {
  return rho.toFixed(2).replace(".", ",");
}

export function estimateArchitecture(arch: ArchitectureData): NodeEstimate[] {
  const index = buildGraphIndex(arch);
  const scenario = arch.scenario;
  const rps = Math.max(1, Math.min(200_000, Number(scenario?.requestsPerSecond) || 100));
  const globalReadRatio = Math.min(1, Math.max(0, Number(scenario?.readRatio ?? 0.8)));

  /* --- configurations résolues --- */
  const rcs = new Map<string, ReturnType<typeof resolveRoleConfig>>();
  const roles = new Map<string, SimRole>();
  for (const id of index.nodeIds) {
    const meta = index.nodes.get(id);
    if (!meta || !meta.role) continue;
    const node = (arch.nodes ?? []).find((n) => n.id === id);
    if (!node) continue;
    rcs.set(id, resolveRoleConfig(node));
    roles.set(id, meta.role);
  }

  /* --- capacité de drain des files (workers aval) --- */
  const queueDrain = new Map<string, number>();
  for (const id of index.nodeIds) {
    if (roles.get(id) !== "queue") continue;
    let drain = 0;
    for (const e of index.out.get(id) ?? []) {
      const wrc = rcs.get(e.target);
      if (roles.get(e.target) === "worker" && wrc) {
        drain += theoreticalCapacityRps("worker", wrc, globalReadRatio);
      }
    }
    queueDrain.set(id, drain);
  }

  /* --- générateurs : débit offert initial --- */
  const generators = index.generators.filter((id) => rcs.has(id));
  const totalWeight = generators.reduce((s, id) => s + Math.max(0.001, rcs.get(id)!.weight), 0);
  const initial = new Map<string, Flow>();
  for (const id of generators) {
    const share = rcs.get(id)!.weight / Math.max(0.001, totalWeight);
    initial.set(id, { read: rps * share * globalReadRatio, write: rps * share * (1 - globalReadRatio) });
  }

  /* --- propagation itérative (converge en 1 passe sur un DAG topologique,
   *     quelques passes de plus si l'ordre des nœuds n'est pas topologique) --- */
  let offered = new Map<string, Flow>(generators.map((id) => [id, initial.get(id)!]));
  for (let pass = 0; pass < PASSES; pass++) {
    const next = new Map<string, Flow>();
    for (const id of index.nodeIds) next.set(id, { ...ZERO });
    // semences générateurs
    for (const id of generators) {
      const f = initial.get(id)!;
      const cur = next.get(id)!;
      cur.read += f.read;
      cur.write += f.write;
    }
    // écoulement de chaque nœud (l'ordre du graphe fait converger les DAG)
    for (const id of index.nodeIds) {
      const role = roles.get(id);
      if (!role) continue;
      const flow = next.get(id) ?? { ...ZERO };
      if (total(flow) <= 0) continue;
      const rc = rcs.get(id)!;
      const readShare = total(flow) > 0 ? flow.read / total(flow) : globalReadRatio;
      const add = (targetId: string, amount: Flow): void => {
        const t = next.get(targetId);
        if (!t) return;
        t.read += amount.read;
        t.write += amount.write;
      };
      const outs = (index.out.get(id) ?? []).filter((e) => next.has(e.target));
      const outRole = (targetId: string): SimRole | null => roles.get(targetId) ?? null;

      switch (role) {
        case "generator": {
          // répartition égale entre les sorties
          if (outs.length > 0) {
            const each: Flow = { read: flow.read / outs.length, write: flow.write / outs.length };
            for (const e of outs) add(e.target, each);
          }
          break;
        }
        case "cdn": {
          // les hits (lectures) sont absorbés, le reste va à l'origine
          const misses: Flow = {
            read: flow.read * (1 - rc.cacheHitRatio),
            write: flow.write,
          };
          if (outs.length > 0) for (const e of outs) add(e.target, misses);
          break;
        }
        case "balancer": {
          if (outs.length > 0) {
            const each: Flow = { read: flow.read / outs.length, write: flow.write / outs.length };
            for (const e of outs) add(e.target, each);
          }
          break;
        }
        case "rate-limiter": {
          // limit = capacité permanente ; l'excédent est rejeté
          const allowed = Math.min(total(flow), rc.limit);
          const ratio = total(flow) > 0 ? allowed / total(flow) : 1;
          const passed: Flow = { read: flow.read * ratio, write: flow.write * ratio };
          if (outs.length > 0) for (const e of outs) add(e.target, passed);
          break;
        }
        case "server": {
          // même priorité que le moteur : lectures cache→réplica→base→file,
          // écritures base→file→cache (write-around)
          const caches = outs.filter((e) => outRole(e.target) === "cache");
          const replicas = outs.filter((e) => outRole(e.target) === "replica");
          const databases = outs.filter((e) => outRole(e.target) === "database");
          const queues = outs.filter((e) => outRole(e.target) === "queue");
          let target: string | null = null;
          if (readShare >= 0.5) {
            target =
              caches[0]?.target ?? replicas[0]?.target ?? databases[0]?.target ?? queues[0]?.target ?? null;
          } else {
            target = databases[0]?.target ?? queues[0]?.target ?? caches[0]?.target ?? null;
          }
          if (target) {
            add(target, flow);
          } else if (outs.length > 0) {
            for (const e of outs) add(e.target, flow); // fan-out générique
          }
          break;
        }
        case "cache": {
          // hits absorbés (lectures), misses + écritures vers la base aval
          const misses: Flow = { read: flow.read * (1 - rc.hitRatio), write: flow.write };
          if (outs.length > 0) for (const e of outs) add(e.target, misses);
          break;
        }
        case "queue": {
          const drain = queueDrain.get(id) ?? 0;
          const passed = Math.min(total(flow), drain);
          const ratio = total(flow) > 0 ? passed / total(flow) : 1;
          const workers = outs.filter((e) => outRole(e.target) === "worker");
          if (workers.length > 0) {
            const each: Flow = {
              read: (flow.read * ratio) / workers.length,
              write: (flow.write * ratio) / workers.length,
            };
            for (const e of workers) add(e.target, each);
          }
          break;
        }
        case "worker": {
          // le worker écrit son résultat vers l'aval
          const outFlow: Flow = { read: 0, write: flow.read + flow.write };
          if (outs.length > 0) for (const e of outs) add(e.target, outFlow);
          break;
        }
        default: {
          // proxy, pass-through, circuit-breaker, storage… : puits ou relais
          if (outs.length > 0) for (const e of outs) add(e.target, flow);
          break;
        }
      }
    }
    offered = next;
  }

  /* --- synthèse par nœud --- */
  const out: NodeEstimate[] = [];
  for (const id of index.nodeIds) {
    const meta = index.nodes.get(id);
    const role = roles.get(id);
    if (!meta || !role) continue;
    const rc = rcs.get(id)!;
    const flow = offered.get(id) ?? { ...ZERO };
    const offeredTotal = total(flow);
    const readShare = offeredTotal > 0 ? flow.read / offeredTotal : globalReadRatio;
    const drain = queueDrain.get(id) ?? 0;
    const capacity =
      role === "generator"
        ? rps
        : theoreticalCapacityRps(role, rc, readShare, drain);
    // pour une source, ρ est 1 par construction (offre = capacité) : sans objet
    const utilization =
      role === "generator" ? 0 : capacity > 0 ? offeredTotal / capacity : offeredTotal > 0 ? Infinity : 0;

    /* contribution locale de latence : service + attente (Erlang C/Kingman) */
    let serviceMs: number;
    let servers: number;
    switch (role) {
      case "server":
        serviceMs = rc.avgServiceMs;
        servers = Math.max(1, rc.instances) * Math.max(1, rc.maxConcurrencyPerInstance);
        break;
      case "database": {
        const readMs = rc.avgReadMs * (rc.internalCacheEnabled ? 0.6 : 1);
        serviceMs = readShare * readMs + (1 - readShare) * rc.avgWriteMs;
        servers = Math.max(1, rc.maxConnections);
        break;
      }
      case "replica":
        serviceMs = rc.avgReadMs;
        servers = Math.max(1, rc.instances) * Math.max(1, rc.maxConnections);
        break;
      case "cache":
        serviceMs = rc.avgServiceMs;
        servers = Math.max(1, rc.maxConnections);
        break;
      case "cdn":
        serviceMs = rc.cacheHitRatio * rc.hitLatencyMs + (1 - rc.cacheHitRatio) * rc.latencyMs;
        servers = 0;
        break;
      case "queue": {
        const lag = Math.max(0, offeredTotal - drain);
        serviceMs = (rc.persistMessages ? 2 : 0) + (drain > 0 ? (lag / drain) * 1000 : lag > 0 ? 5000 : 0);
        servers = 0;
        break;
      }
      case "worker":
        serviceMs = rc.avgProcessingMs;
        servers = Math.max(1, rc.instances) * Math.max(1, rc.maxConcurrencyPerInstance);
        break;
      case "balancer":
      case "proxy":
      case "storage":
      case "rate-limiter":
        serviceMs = rc.latencyMs;
        servers = 0;
        break;
      case "pass-through":
      case "circuit-breaker":
        serviceMs = 1;
        servers = 0;
        break;
      default:
        serviceMs = 0;
        servers = 0;
    }
    const lambda = offeredTotal; // débit offert (req/s)
    const wait = servers > 0 ? mgcWaitMs(lambda, serviceMs, servers, 1, 0.25).waitMs : 0;
    const estLatencyMs = serviceMs + wait;

    /* avertissements */
    const warnings: string[] = [];
    if (role !== "generator" && offeredTotal > 0) {
      if (utilization >= 1) {
        warnings.push(`File instable (ρ = ${fmtRho(utilization)}) : la file croît sans limite.`);
      } else if (utilization >= 0.8) {
        warnings.push(`Saturé (ρ = ${fmtRho(utilization)}) : attentes en forte croissance.`);
      }
    }
    if ((role === "cache" && offeredTotal > 0 && rc.hitRatio < 0.5) ||
        (role === "cdn" && offeredTotal > 0 && rc.cacheHitRatio < 0.5)) {
      warnings.push("Taux de hit faible : le cache décharge peu l'origine.");
    }
    if (role === "rate-limiter" && offeredTotal > rc.limit) {
      warnings.push(
        `Rejets attendus : ${Math.round(offeredTotal - rc.limit)} req/s au-dessus de la limite.`,
      );
    }
    if (role === "queue" && drain > 0 && offeredTotal > drain) {
      warnings.push(`Lag : +${Math.round(offeredTotal - drain)} req/s non consommés.`);
    }
    if (role === "queue" && drain <= 0 && offeredTotal > 0) {
      warnings.push("Aucun worker connecté : les messages s'accumulent sans consommateur.");
    }
    if (role === "database" && wait > 1000) {
      warnings.push(`Attente de connexion élevée (~${Math.round(wait)} ms).`);
    }
    if (
      (role === "server" || role === "balancer" || role === "worker" || role === "replica") &&
      rc.instances <= 1 &&
      offeredTotal > 0
    ) {
      warnings.push("Point de défaillance unique (1 instance).");
    }

    out.push({
      nodeId: id,
      label: meta.label,
      componentId: meta.componentId,
      capacityRps: capacity >= UNBOUNDED_RPS ? UNBOUNDED_RPS : Math.round(capacity),
      offeredRps: Math.round(offeredTotal * 10) / 10,
      utilization: Number.isFinite(utilization) ? Math.round(utilization * 1000) / 1000 : 99.999,
      estLatencyMs: Math.round(estLatencyMs * 10) / 10,
      warnings,
    });
  }
  return out;
}
