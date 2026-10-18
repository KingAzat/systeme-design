"use client";

/**
 * SystemLab — Store de l'éditeur (document d'architecture + undo/redo).
 *
 * Le document vit ici en dehors des composants : le shell démonte/remonte les
 * vues, l'état de l'éditeur survit donc aux allers-retours résultats ↔ éditeur.
 *
 * Undo/redo : piles `past`/`future` de snapshots sérialisés (JSON) du document
 * {name, description, nodes, edges, zones, scenario}, capacité 50.
 * - Chaque action mutante pousse un snapshot AVANT modification.
 * - Exceptions « continues » (moveNode pendant un drag, updateNodeConfig,
 *   setScenario, updateEdge, updateZone, renameNode) : un mécanisme de
 *   coalescence (tag + fenêtre temporelle) évite d'inonder l'historique —
 *   un seul snapshot est poussé au début d'une rafale de modifications,
 *   comme beginHistorySnapshot() le fait pour le drag.
 * - moveNode ne pousse jamais : le canvas appelle beginHistorySnapshot() au
 *   onNodeDragStart et endDrag() au onNodeDragStop.
 */
import { create } from "zustand";
import type {
  ArchEdge,
  ArchNode,
  ArchZone,
  Architecture,
  ArchitectureData,
  Protocol,
  ScenarioConfig,
  ZoneColor,
} from "@/types";
import { shortId } from "@/lib/format";
import {
  getComponentById,
  getDefaultConfig,
  validateConnection,
  type ConnectionValidation,
} from "@/data/catalog/registry";
import { DEFAULT_SCENARIO } from "@/data/templates";

/* ------------------------------------------------------------------ */
/* Types publics                                                       */
/* ------------------------------------------------------------------ */

/** Onglet actif du panneau de configuration (nœud sélectionné). */
export type EditorConfigTab = "configuration" | "performance" | "learning";

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

/** Snapshot sérialisé du document (base de l'historique). */
interface DocSnapshot {
  name: string;
  description: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  zones: ArchZone[];
  scenario: ScenarioConfig;
}

interface AddNodeOptions {
  /** Sélectionne le nœud créé et ouvre le panneau de configuration. */
  select?: boolean;
}

export interface EditorState {
  /* --- document --- */
  name: string;
  description: string;
  /** null = document non sauvegardé (jamais persisté côté serveur). */
  architectureId: string | null;
  nodes: ArchNode[];
  edges: ArchEdge[];
  zones: ArchZone[];
  scenario: ScenarioConfig;
  dirty: boolean;
  savedAt: string | null;

  /* --- sélection (une seule entité « principale » à la fois) --- */
  /** Multi-sélection canvas (nœuds système uniquement). */
  selectedNodeIds: string[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedZoneId: string | null;

  /* --- presse-papiers --- */
  copiedNodes: ArchNode[];
  copiedEdges: ArchEdge[];

  /* --- historique --- */
  past: DocSnapshot[];
  future: DocSnapshot[];

  /* --- état UI (non persisté) --- */
  libraryOpen: boolean;
  configOpen: boolean;
  configTab: EditorConfigTab;
  simulationBarOpen: boolean;
  /** Bandeau pédagogique (objectif d'exercice) au-dessus du canvas. */
  exerciseHint: string | null;
  /** Incrémenté à chaque chargement/reset → déclenche fitView côté canvas. */
  docEpoch: number;
  /** Incrémenté à chaque mutation → déclenche la sauvegarde automatique. */
  revision: number;

  /* --- actions document --- */
  addNode: (
    componentId: string,
    position: { x: number; y: number },
    options?: AddNodeOptions,
  ) => ArchNode | null;
  updateNodeConfig: (nodeId: string, key: string, value: number | string | boolean) => void;
  resetNodeConfig: (nodeId: string) => void;
  renameNode: (nodeId: string, label: string) => void;
  moveNode: (nodeId: string, position: { x: number; y: number }) => void;
  addEdge: (source: string, target: string) => ActionResult;
  /** Validation pure (sans mutation) pour isValidConnection du canvas. */
  checkConnection: (source: string, target: string) => ConnectionValidation;
  updateEdge: (
    edgeId: string,
    patch: Partial<Pick<ArchEdge, "protocol" | "networkLatencyMs" | "bandwidthMbps" | "label">>,
  ) => void;
  deleteEdge: (edgeId: string) => void;
  addZone: (
    label?: string,
    color?: ZoneColor,
    position?: { x: number; y: number },
    size?: { width: number; height: number },
  ) => ArchZone;
  updateZone: (
    zoneId: string,
    patch: Partial<Pick<ArchZone, "label" | "color">> & {
      position?: { x: number; y: number };
      size?: { width: number; height: number };
    },
  ) => void;
  deleteZone: (zoneId: string) => void;
  rename: (name: string) => void;
  setScenario: (patch: Partial<ScenarioConfig>) => void;
  markSaved: (architectureId?: string) => void;
  loadArchitecture: (arch: Architecture) => void;
  loadTemplate: (data: ArchitectureData, exerciseHint?: string | null) => void;
  reset: () => void;
  toArchitectureData: () => ArchitectureData;

  /* --- sélection --- */
  setSelection: (nodeIds: string[], edgeIds: string[]) => void;
  selectNode: (nodeId: string) => void;
  selectEdge: (edgeId: string) => void;
  selectZone: (zoneId: string) => void;
  clearSelection: () => void;

  /* --- édition --- */
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: () => void;

  /* --- historique --- */
  beginHistorySnapshot: () => void;
  endDrag: () => void;
  undo: () => void;
  redo: () => void;

  /* --- UI --- */
  toggleLibrary: () => void;
  setLibraryOpen: (open: boolean) => void;
  toggleConfig: () => void;
  setConfigOpen: (open: boolean) => void;
  setConfigTab: (tab: EditorConfigTab) => void;
  toggleSimulationBar: () => void;
  setSimulationBarOpen: (open: boolean) => void;
  setExerciseHint: (hint: string | null) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers internes                                                    */
/* ------------------------------------------------------------------ */

const HISTORY_CAPACITY = 50;
const COALESCE_WINDOW_MS = 800;

/** Flag de session de drag (hors état React : pas de re-render attendu). */
let dragActive = false;
/** Dernière poussée d'historique coalescée (tag + horodatage). */
let lastCoalesced: { tag: string; at: number } | null = null;

function snapshotOf(s: EditorState): DocSnapshot {
  // Sérialisation JSON : garantit l'absence de références partagées.
  return JSON.parse(
    JSON.stringify({
      name: s.name,
      description: s.description,
      nodes: s.nodes,
      edges: s.edges,
      zones: s.zones,
      scenario: s.scenario,
    }),
  ) as DocSnapshot;
}

/** Partiel {past, future} à merger dans set() pour pousser l'historique. */
function historyPush(s: EditorState): { past: DocSnapshot[]; future: DocSnapshot[] } {
  return {
    past: [...s.past, snapshotOf(s)].slice(-HISTORY_CAPACITY),
    future: [],
  };
}

/**
 * Coalescence : renvoie true s'il faut pousser un snapshot (début de rafale),
 * false si la modification fait suite à une poussée récente du même tag.
 */
function shouldPushCoalesced(tag: string, windowMs = COALESCE_WINDOW_MS): boolean {
  const now = Date.now();
  if (lastCoalesced && lastCoalesced.tag === tag && now - lastCoalesced.at < windowMs) {
    lastCoalesced.at = now; // prolonge la session d'édition continue
    return false;
  }
  lastCoalesced = { tag, at: now };
  return true;
}

function applySnapshot(snap: DocSnapshot): {
  name: string;
  description: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  zones: ArchZone[];
  scenario: ScenarioConfig;
} {
  return {
    name: snap.name,
    description: snap.description,
    nodes: snap.nodes.map((n) => ({ ...n, config: { ...n.config } })),
    edges: snap.edges.map((e) => ({ ...e })),
    zones: snap.zones.map((z) => ({ ...z })),
    scenario: { ...snap.scenario },
  };
}

function deepCloneNodes(nodes: ArchNode[]): ArchNode[] {
  return nodes.map((n) => ({ ...n, config: { ...n.config }, position: { ...n.position } }));
}

function deepCloneEdges(edges: ArchEdge[]): ArchEdge[] {
  return edges.map((e) => ({ ...e }));
}

function deepCloneZones(zones: ArchZone[]): ArchZone[] {
  return zones.map((z) => ({
    ...z,
    position: { ...z.position },
    size: { ...z.size },
  }));
}

/** Le nœud est-il dans le rectangle de la zone ? */
function pointInZone(
  position: { x: number; y: number },
  zone: ArchZone,
): boolean {
  return (
    position.x >= zone.position.x &&
    position.x <= zone.position.x + zone.size.width &&
    position.y >= zone.position.y &&
    position.y <= zone.position.y + zone.size.height
  );
}

/** Protocole par défaut d'une nouvelle connexion, déduit des rôles simulés. */
function defaultProtocol(source: ArchNode, target: ArchNode): Protocol {
  const roles = [
    getComponentById(source.componentId)?.simRole,
    getComponentById(target.componentId)?.simRole,
  ];
  if (roles.includes("queue")) return "amqp";
  if (roles.includes("cache")) return "redis";
  if (roles.includes("database") || roles.includes("replica")) return "sql";
  if (roles.includes("cdn")) return "https";
  return "http";
}

const EMPTY_SELECTION = {
  selectedNodeIds: [] as string[],
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedZoneId: null,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  name: "Architecture sans titre",
  description: "",
  architectureId: null,
  nodes: [],
  edges: [],
  zones: [],
  scenario: { ...DEFAULT_SCENARIO },
  dirty: false,
  savedAt: null,

  ...EMPTY_SELECTION,

  copiedNodes: [],
  copiedEdges: [],

  past: [],
  future: [],

  libraryOpen: true,
  configOpen: true,
  configTab: "configuration",
  simulationBarOpen: true,
  exerciseHint: null,
  docEpoch: 0,
  revision: 0,

  /* ------------------------- document ------------------------- */

  addNode: (componentId, position, options) => {
    const component = getComponentById(componentId);
    if (!component) return null;
    const s = get();
    const node: ArchNode = {
      id: shortId("n"),
      componentId,
      label: component.name,
      config: getDefaultConfig(componentId),
      position: { x: position.x, y: position.y },
      zoneId: s.zones.find((z) => pointInZone(position, z))?.id,
    };
    set({
      ...historyPush(s),
      nodes: [...s.nodes, node],
      dirty: true,
      revision: s.revision + 1,
      ...(options?.select === false
        ? {}
        : {
            selectedNodeIds: [node.id],
            selectedNodeId: node.id,
            selectedEdgeId: null,
            selectedZoneId: null,
            configOpen: true,
          }),
    });
    return node;
  },

  updateNodeConfig: (nodeId, key, value) => {
    const s = get();
    const push = shouldPushCoalesced(`config:${nodeId}:${key}`) ? historyPush(s) : {};
    set({
      ...push,
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n,
      ),
      dirty: true,
      revision: s.revision + 1,
    });
  },

  resetNodeConfig: (nodeId) => {
    const s = get();
    const node = s.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    set({
      ...historyPush(s),
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, config: getDefaultConfig(n.componentId) } : n,
      ),
      dirty: true,
      revision: s.revision + 1,
    });
  },

  renameNode: (nodeId, label) => {
    const s = get();
    // Aucun trim ici : l'édition inline doit accepter les espaces
    // pendant la saisie ; les appelants triment au commit.
    const next = label.slice(0, 80);
    const node = s.nodes.find((n) => n.id === nodeId);
    if (!node || next === node.label) return;
    const push = shouldPushCoalesced(`rename-node:${nodeId}`) ? historyPush(s) : {};
    set({
      ...push,
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, label: next } : n)),
      dirty: true,
      revision: s.revision + 1,
    });
  },

  moveNode: (nodeId, position) => {
    // Pas de poussée d'historique : voir beginHistorySnapshot/endDrag.
    const s = get();
    set({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
      dirty: true,
      revision: s.revision + 1,
    });
  },

  addEdge: (source, target) => {
    const s = get();
    const sourceNode = s.nodes.find((n) => n.id === source);
    const targetNode = s.nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) {
      return { ok: false, reason: "Composant introuvable." };
    }
    const validation = validateConnection(
      sourceNode.componentId,
      targetNode.componentId,
      source,
      target,
      s.edges,
    );
    if (!validation.valid) {
      return { ok: false, reason: validation.reason };
    }
    const edge: ArchEdge = {
      id: shortId("e"),
      source,
      target,
      protocol: defaultProtocol(sourceNode, targetNode),
      networkLatencyMs: 2,
      bandwidthMbps: 100,
    };
    set({
      ...historyPush(s),
      edges: [...s.edges, edge],
      dirty: true,
      revision: s.revision + 1,
      selectedEdgeId: edge.id,
      selectedNodeIds: [],
      selectedNodeId: null,
      selectedZoneId: null,
    });
    return { ok: true };
  },

  checkConnection: (source, target) => {
    const s = get();
    const sourceNode = s.nodes.find((n) => n.id === source);
    const targetNode = s.nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return { valid: false };
    return validateConnection(
      sourceNode.componentId,
      targetNode.componentId,
      source,
      target,
      s.edges,
    );
  },

  updateEdge: (edgeId, patch) => {
    const s = get();
    const push = shouldPushCoalesced(`edge:${edgeId}`) ? historyPush(s) : {};
    set({
      ...push,
      edges: s.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
      dirty: true,
      revision: s.revision + 1,
    });
  },

  deleteEdge: (edgeId) => {
    const s = get();
    if (!s.edges.some((e) => e.id === edgeId)) return;
    set({
      ...historyPush(s),
      edges: s.edges.filter((e) => e.id !== edgeId),
      dirty: true,
      revision: s.revision + 1,
      ...(s.selectedEdgeId === edgeId ? { selectedEdgeId: null } : {}),
    });
  },

  addZone: (
    label = "Nouvelle zone",
    color = "indigo",
    position = { x: 120, y: 120 },
    size = { width: 460, height: 320 },
  ) => {
    const s = get();
    const zone: ArchZone = { id: shortId("z"), label, color, position, size };
    set({
      ...historyPush(s),
      zones: [...s.zones, zone],
      dirty: true,
      revision: s.revision + 1,
      selectedZoneId: zone.id,
      selectedNodeIds: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      configOpen: true,
    });
    return zone;
  },

  updateZone: (zoneId, patch) => {
    const s = get();
    const push = shouldPushCoalesced(`zone:${zoneId}`) ? historyPush(s) : {};
    set({
      ...push,
      zones: s.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)),
      dirty: true,
      revision: s.revision + 1,
    });
  },

  deleteZone: (zoneId) => {
    const s = get();
    if (!s.zones.some((z) => z.id === zoneId)) return;
    set({
      ...historyPush(s),
      zones: s.zones.filter((z) => z.id !== zoneId),
      nodes: s.nodes.map((n) =>
        n.zoneId === zoneId ? { ...n, zoneId: undefined } : n,
      ),
      dirty: true,
      revision: s.revision + 1,
      ...(s.selectedZoneId === zoneId ? { selectedZoneId: null } : {}),
    });
  },

  rename: (name) => {
    // Aucun trim : les appelants (édition inline) triment au commit.
    const next = name.slice(0, 120);
    const s = get();
    if (!next || next === s.name) return;
    set({
      ...historyPush(s),
      name: next,
      dirty: true,
      revision: s.revision + 1,
    });
  },

  setScenario: (patch) => {
    const s = get();
    const push = shouldPushCoalesced("scenario", 900) ? historyPush(s) : {};
    set({
      ...push,
      scenario: { ...s.scenario, ...patch },
      dirty: true,
      revision: s.revision + 1,
    });
  },

  markSaved: (architectureId) => {
    const s = get();
    set({
      dirty: false,
      savedAt: new Date().toISOString(),
      architectureId: architectureId ?? s.architectureId,
    });
  },

  loadArchitecture: (arch) => {
    lastCoalesced = null;
    dragActive = false;
    set({
      name: arch.name,
      description: arch.description ?? "",
      architectureId: arch.id,
      nodes: deepCloneNodes(arch.nodes),
      edges: deepCloneEdges(arch.edges),
      zones: deepCloneZones(arch.zones),
      scenario: JSON.parse(JSON.stringify(arch.scenario)) as ScenarioConfig,
      dirty: false,
      savedAt: arch.updatedAt,
      ...EMPTY_SELECTION,
      past: [],
      future: [],
      docEpoch: get().docEpoch + 1,
      revision: get().revision + 1,
    });
  },

  loadTemplate: (data, exerciseHint) => {
    lastCoalesced = null;
    dragActive = false;
    set({
      name: data.name,
      description: data.description ?? "",
      architectureId: null,
      nodes: deepCloneNodes(data.nodes),
      edges: deepCloneEdges(data.edges),
      zones: deepCloneZones(data.zones),
      scenario: JSON.parse(JSON.stringify(data.scenario)) as ScenarioConfig,
      dirty: true,
      savedAt: null,
      ...EMPTY_SELECTION,
      past: [],
      future: [],
      exerciseHint: exerciseHint ?? null,
      docEpoch: get().docEpoch + 1,
      revision: get().revision + 1,
    });
  },

  reset: () => {
    lastCoalesced = null;
    dragActive = false;
    set({
      name: "Architecture sans titre",
      description: "",
      architectureId: null,
      nodes: [],
      edges: [],
      zones: [],
      scenario: JSON.parse(JSON.stringify(DEFAULT_SCENARIO)) as ScenarioConfig,
      dirty: false,
      savedAt: null,
      ...EMPTY_SELECTION,
      copiedNodes: [],
      copiedEdges: [],
      past: [],
      future: [],
      exerciseHint: null,
      docEpoch: get().docEpoch + 1,
      revision: get().revision + 1,
    });
  },

  toArchitectureData: () => {
    const s = get();
    return {
      name: s.name,
      description: s.description || undefined,
      nodes: s.nodes,
      edges: s.edges,
      zones: s.zones,
      scenario: s.scenario,
    };
  },

  /* ------------------------- sélection ------------------------- */

  setSelection: (nodeIds, edgeIds) => {
    const s = get();
    const primaryNodeId = nodeIds.length > 0 ? nodeIds[nodeIds.length - 1] : null;
    const primaryEdgeId = edgeIds.length === 1 ? edgeIds[0] : null;
    const hasSelection = nodeIds.length > 0 || primaryEdgeId !== null;
    set({
      selectedNodeIds: nodeIds,
      selectedNodeId: primaryNodeId,
      selectedEdgeId: primaryEdgeId,
      selectedZoneId: hasSelection ? null : s.selectedZoneId,
      configOpen: hasSelection ? true : s.configOpen,
      configTab:
        primaryNodeId !== null && primaryNodeId !== s.selectedNodeId
          ? "configuration"
          : s.configTab,
    });
  },

  selectNode: (nodeId) => {
    set({
      selectedNodeIds: [nodeId],
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      selectedZoneId: null,
      configOpen: true,
    });
  },

  selectEdge: (edgeId) => {
    set({
      selectedNodeIds: [],
      selectedNodeId: null,
      selectedEdgeId: edgeId,
      selectedZoneId: null,
      configOpen: true,
    });
  },

  selectZone: (zoneId) => {
    set({
      selectedNodeIds: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedZoneId: zoneId,
      configOpen: true,
    });
  },

  clearSelection: () => set({ ...EMPTY_SELECTION }),

  /* ------------------------- édition ------------------------- */

  deleteSelection: () => {
    const s = get();
    const removingNodes = s.selectedNodeIds;
    const removingEdge = s.selectedEdgeId;
    const removingZone = s.selectedZoneId;
    if (
      removingNodes.length === 0 &&
      !removingEdge &&
      !removingZone
    ) {
      return;
    }
    let nodes = s.nodes;
    let edges = s.edges;
    let zones = s.zones;
    if (removingNodes.length > 0) {
      const removed = new Set(removingNodes);
      nodes = s.nodes.filter((n) => !removed.has(n.id));
      edges = s.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target));
    } else if (removingEdge) {
      edges = s.edges.filter((e) => e.id !== removingEdge);
    } else if (removingZone) {
      zones = s.zones.filter((z) => z.id !== removingZone);
      nodes = s.nodes.map((n) => (n.zoneId === removingZone ? { ...n, zoneId: undefined } : n));
    }
    // Une panne simulée visant un nœud supprimé est retirée du scénario.
    const failure = s.scenario.failure;
    const scenario =
      failure && removingNodes.includes(failure.nodeId)
        ? { ...s.scenario, failure: null }
        : s.scenario;
    set({
      ...historyPush(s),
      nodes,
      edges,
      zones,
      scenario,
      dirty: true,
      revision: s.revision + 1,
      ...EMPTY_SELECTION,
    });
  },

  duplicateSelection: () => {
    const s = get();
    if (s.selectedNodeIds.length === 0) return;
    const idMap = new Map<string, string>();
    const clones: ArchNode[] = s.nodes
      .filter((n) => s.selectedNodeIds.includes(n.id))
      .map((n) => {
        const id = shortId("n");
        idMap.set(n.id, id);
        return {
          ...n,
          id,
          position: { x: n.position.x + 48, y: n.position.y + 48 },
          config: { ...n.config },
        };
      });
    if (clones.length === 0) return;
    const clonedEdges: ArchEdge[] = s.edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: shortId("e"),
        source: idMap.get(e.source) as string,
        target: idMap.get(e.target) as string,
      }));
    set({
      ...historyPush(s),
      nodes: [...s.nodes, ...clones],
      edges: [...s.edges, ...clonedEdges],
      dirty: true,
      revision: s.revision + 1,
      selectedNodeIds: clones.map((c) => c.id),
      selectedNodeId: clones[clones.length - 1].id,
      selectedEdgeId: null,
      selectedZoneId: null,
    });
  },

  copySelection: () => {
    const s = get();
    if (s.selectedNodeIds.length > 0) {
      const selected = new Set(s.selectedNodeIds);
      set({
        copiedNodes: deepCloneNodes(s.nodes.filter((n) => selected.has(n.id))),
        copiedEdges: deepCloneEdges(
          s.edges.filter((e) => selected.has(e.source) && selected.has(e.target)),
        ),
      });
      return;
    }
    if (s.selectedEdgeId) {
      const edge = s.edges.find((e) => e.id === s.selectedEdgeId);
      if (edge) set({ copiedNodes: [], copiedEdges: [{ ...edge }] });
    }
  },

  paste: () => {
    const s = get();
    if (s.copiedNodes.length === 0 && s.copiedEdges.length === 0) return;
    const idMap = new Map(s.copiedNodes.map((n) => [n.id, shortId("n")]));
    const newNodes: ArchNode[] = s.copiedNodes.map((n) => ({
      ...n,
      id: idMap.get(n.id) as string,
      position: { x: n.position.x + 48, y: n.position.y + 48 },
      config: { ...n.config },
    }));
    const validIds = new Set([...s.nodes.map((n) => n.id), ...newNodes.map((n) => n.id)]);
    const newEdges: ArchEdge[] = s.copiedEdges
      .map((e) => ({
        ...e,
        id: shortId("e"),
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
      }))
      .filter((e) => validIds.has(e.source) && validIds.has(e.target));
    set({
      ...historyPush(s),
      nodes: [...s.nodes, ...newNodes],
      edges: [...s.edges, ...newEdges],
      dirty: true,
      revision: s.revision + 1,
      selectedNodeIds: newNodes.map((n) => n.id),
      selectedNodeId: newNodes.length > 0 ? newNodes[newNodes.length - 1].id : null,
      selectedEdgeId: null,
      selectedZoneId: null,
      configOpen: newNodes.length > 0 ? true : s.configOpen,
    });
  },

  /* ------------------------- historique ------------------------- */

  beginHistorySnapshot: () => {
    if (dragActive) return;
    dragActive = true;
    set((s) => ({ ...historyPush(s) }));
  },

  endDrag: () => {
    dragActive = false;
  },

  undo: () => {
    const s = get();
    if (s.past.length === 0) return;
    const previous = s.past[s.past.length - 1];
    const current = snapshotOf(s);
    dragActive = false;
    lastCoalesced = null;
    set({
      ...applySnapshot(previous),
      past: s.past.slice(0, -1),
      future: [current, ...s.future].slice(0, HISTORY_CAPACITY),
      dirty: true,
      revision: s.revision + 1,
      ...EMPTY_SELECTION,
    });
  },

  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[0];
    const current = snapshotOf(s);
    dragActive = false;
    lastCoalesced = null;
    set({
      ...applySnapshot(next),
      past: [...s.past, current].slice(-HISTORY_CAPACITY),
      future: s.future.slice(1),
      dirty: true,
      revision: s.revision + 1,
      ...EMPTY_SELECTION,
    });
  },

  /* ------------------------- UI ------------------------- */

  toggleLibrary: () => set((s) => ({ libraryOpen: !s.libraryOpen })),
  setLibraryOpen: (open) => set({ libraryOpen: open }),
  toggleConfig: () => set((s) => ({ configOpen: !s.configOpen })),
  setConfigOpen: (open) => set({ configOpen: open }),
  setConfigTab: (tab) => set({ configTab: tab }),
  toggleSimulationBar: () => set((s) => ({ simulationBarOpen: !s.simulationBarOpen })),
  setSimulationBarOpen: (open) => set({ simulationBarOpen: open }),
  setExerciseHint: (hint) => set({ exerciseHint: hint }),
}));
