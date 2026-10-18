/**
 * SystemLab — analyse de graphe d'architecture.
 *
 * Fournit `analyzeGraph` : erreurs bloquantes, avertissements de topologie,
 * détection de cycles (DFS), accessibilité depuis les générateurs, nœuds
 * isolés. Utilisé par l'éditeur (validation live) et par runSimulation.
 */
import type { ArchEdge, ArchitectureData, CategoryId, SimRole } from "@/types";
import { getComponentById } from "@/data/catalog/registry";
import { MAX_EDGES_WARN, MAX_NODES } from "./runtime";

export interface GraphIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  nodeId?: string;
}

export interface GraphAnalysis {
  valid: boolean;
  issues: GraphIssue[];
  cycles: string[][];
  isolatedNodeIds: string[];
  hasGenerator: boolean;
  nodeCount: number;
}

/** Métadonnées de nœud vues par le graphe (résolues via le catalogue). */
export interface GraphNodeMeta {
  id: string;
  label: string;
  componentId: string;
  category: CategoryId | null;
  role: SimRole | null;
}

/** Index de graphe réutilisable (moteur + mode analytique). */
export interface GraphIndex {
  nodeIds: string[];
  nodes: Map<string, GraphNodeMeta>;
  out: Map<string, ArchEdge[]>;
  in: Map<string, ArchEdge[]>;
  edges: ArchEdge[];
  droppedEdges: ArchEdge[];
  generators: string[];
}

/** Rôles considérés comme puits de trafic (le flux y aboutit). */
const SINK_ROLES: ReadonlySet<string> = new Set(["database", "storage", "queue", "replica"]);

/** Construit l'index du graphe (nœuds connus + arêtes valides). */
export function buildGraphIndex(arch: ArchitectureData): GraphIndex {
  const nodes = new Map<string, GraphNodeMeta>();
  const nodeIds: string[] = [];
  for (const n of arch.nodes ?? []) {
    const comp = getComponentById(n.componentId);
    nodes.set(n.id, {
      id: n.id,
      label: n.label || comp?.name || n.id,
      componentId: n.componentId,
      category: comp?.category ?? null,
      role: comp?.simRole ?? null,
    });
    nodeIds.push(n.id);
  }
  const out = new Map<string, ArchEdge[]>();
  const inn = new Map<string, ArchEdge[]>();
  for (const id of nodeIds) {
    out.set(id, []);
    inn.set(id, []);
  }
  const edges: ArchEdge[] = [];
  const droppedEdges: ArchEdge[] = [];
  for (const e of arch.edges ?? []) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) {
      droppedEdges.push(e);
      continue;
    }
    edges.push(e);
    out.get(e.source)?.push(e);
    inn.get(e.target)?.push(e);
  }
  const generators = nodeIds.filter((id) => nodes.get(id)?.role === "generator");
  return { nodeIds, nodes, out, in: inn, edges, droppedEdges, generators };
}

/** Détection de cycles par DFS avec coloration (blanc/gris/noir). */
function findCycles(index: GraphIndex): string[][] {
  const color = new Map<string, number>(); // 0 blanc, 1 gris, 2 noir
  for (const id of index.nodeIds) color.set(id, 0);
  const path: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const visit = (id: string): void => {
    color.set(id, 1);
    path.push(id);
    for (const e of index.out.get(id) ?? []) {
      const c = color.get(e.target) ?? 2;
      if (c === 1) {
        // back edge → cycle extrait de la pile
        const start = path.lastIndexOf(e.target);
        if (start >= 0) {
          const cyc = path.slice(start);
          // canonisation : rotation démarrant par le plus petit id
          let minI = 0;
          for (let i = 1; i < cyc.length; i++) if (cyc[i] < cyc[minI]) minI = i;
          const canonical = [...cyc.slice(minI), ...cyc.slice(0, minI)];
          const key = canonical.join(">");
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push(canonical);
          }
        }
      } else if (c === 0) {
        visit(e.target);
      }
    }
    path.pop();
    color.set(id, 2);
  };

  for (const id of index.nodeIds) {
    if ((color.get(id) ?? 0) === 0) visit(id);
    if (cycles.length >= 10) break; // plafond de détection
  }
  return cycles;
}

/** Accessibilité (BFS) depuis l'ensemble de départ. */
function reachableFrom(index: GraphIndex, starters: string[]): Set<string> {
  const seen = new Set<string>(starters);
  const queue = [...starters];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    for (const e of index.out.get(cur) ?? []) {
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return seen;
}

export function analyzeGraph(arch: ArchitectureData): GraphAnalysis {
  const issues: GraphIssue[] = [];
  const index = buildGraphIndex(arch);
  const nodeCount = index.nodeIds.length;

  /* --- Erreurs bloquantes --- */
  if (index.generators.length === 0) {
    issues.push({
      severity: "error",
      code: "no-generator",
      message:
        "Aucune source de trafic : ajoutez un Utilisateur ou un Générateur de trafic.",
    });
  }
  for (const n of arch.nodes ?? []) {
    if (!getComponentById(n.componentId)) {
      issues.push({
        severity: "error",
        code: "unknown-component",
        nodeId: n.id,
        message: `Composant inconnu « ${n.componentId} » sur le nœud « ${n.label || n.id} » — il sera ignoré par le moteur.`,
      });
    }
  }
  for (const e of index.droppedEdges) {
    issues.push({
      severity: "error",
      code: "dangling-edge",
      message: `Connexion vers un nœud inexistant (${e.source} → ${e.target}).`,
    });
  }
  if (nodeCount > MAX_NODES) {
    issues.push({
      severity: "error",
      code: "too-many-nodes",
      message: `Architecture trop volumineuse : ${nodeCount} nœuds (le moteur simule au maximum ${MAX_NODES}).`,
    });
  }

  /* --- Cycles --- */
  const cycles = findCycles(index);
  for (const cyc of cycles.slice(0, 5)) {
    const labels = cyc.map((id) => index.nodes.get(id)?.label ?? id).join(" → ");
    issues.push({
      severity: "warning",
      code: "cycle",
      nodeId: cyc[0],
      message: `Un cycle peut provoquer des boucles infinies — le moteur limitera la profondeur : ${labels}.`,
    });
  }

  /* --- Trafic n'aboutissant à aucun puits --- */
  const reach = reachableFrom(index, index.generators);
  const reachHasSink = [...reach].some((id) => {
    const role = index.nodes.get(id)?.role;
    return role !== null && role !== undefined && SINK_ROLES.has(role);
  });
  if (index.generators.length > 0 && !reachHasSink) {
    issues.push({
      severity: "warning",
      code: "no-sink",
      message:
        "Le trafic n'aboutit à aucun puits (base de données, file ou stockage) : les requêtes se terminent en l'air.",
    });
  }

  /* --- Load balancers sans cible aval --- */
  for (const id of index.nodeIds) {
    if (index.nodes.get(id)?.role !== "balancer") continue;
    if ((index.out.get(id) ?? []).length === 0) {
      issues.push({
        severity: "warning",
        code: "lb-no-target",
        nodeId: id,
        message: `Load Balancer « ${index.nodes.get(id)?.label ?? id} » sans cible aval.`,
      });
    }
  }

  /* --- Files sans worker connecté --- */
  for (const id of index.nodeIds) {
    if (index.nodes.get(id)?.role !== "queue") continue;
    const hasWorker = (index.out.get(id) ?? []).some((e) => {
      const r = index.nodes.get(e.target)?.role;
      return r === "worker";
    });
    if (!hasWorker) {
      issues.push({
        severity: "warning",
        code: "queue-no-worker",
        nodeId: id,
        message: `File « ${index.nodes.get(id)?.label ?? id} » sans worker connecté : les messages s'accumulent sans consommateur.`,
      });
    }
  }

  if (index.edges.length > MAX_EDGES_WARN) {
    issues.push({
      severity: "warning",
      code: "too-many-edges",
      message: `Graphe très connecté : ${index.edges.length} connexions (au-delà de ${MAX_EDGES_WARN}, la lecture et la simulation se dégradent).`,
    });
  }

  /* --- Nœuds isolés et inatteignables (hors observabilité, déconnectée par nature) --- */
  const isolatedNodeIds: string[] = [];
  for (const id of index.nodeIds) {
    const isolated =
      (index.out.get(id) ?? []).length === 0 && (index.in.get(id) ?? []).length === 0;
    if (isolated) isolatedNodeIds.push(id);
  }
  for (const id of isolatedNodeIds) {
    const meta = index.nodes.get(id);
    if (meta?.category === "observability") continue;
    issues.push({
      severity: "info",
      code: "isolated",
      nodeId: id,
      message: `Nœud isolé : « ${meta?.label ?? id} » (aucune connexion).`,
    });
  }
  for (const id of index.nodeIds) {
    if (reach.has(id)) continue;
    const meta = index.nodes.get(id);
    if (meta?.category === "observability") continue;
    if (isolatedNodeIds.includes(id)) continue; // déjà signalé comme isolé
    issues.push({
      severity: "info",
      code: "unreachable",
      nodeId: id,
      message: `Nœud inatteignable depuis les sources de trafic : « ${meta?.label ?? id} ».`,
    });
  }

  return {
    valid: !issues.some((i) => i.severity === "error"),
    issues,
    cycles,
    isolatedNodeIds,
    hasGenerator: index.generators.length > 0,
    nodeCount,
  };
}
