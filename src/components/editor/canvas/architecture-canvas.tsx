"use client";

/**
 * SystemLab — Canvas React Flow (mode contrôlé).
 *
 * Conversion ArchNode/ArchEdge (store) ↔ nœuds/edges React Flow au rendu
 * (useMemo) : l'état du document reste dans le store Zustand, il survit au
 * démontage de la vue par le shell. Le viewport est réinitialisé via
 * fitView() quand `docEpoch` change (chargement/reset) ou au remontage.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node as RFNode,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Boxes, GraduationCap, LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useLibraryStore } from "@/stores/library-store";
import { useSimulationStore } from "@/stores/simulation-store";
import { getComponentById } from "@/data/catalog/registry";
import {
  ADD_COMPONENT_CENTER_EVENT,
  COMPONENT_DND_TYPE,
  NODE_CARD_HEIGHT,
  NODE_CARD_WIDTH,
  ZONE_DEFAULT_HEIGHT,
  ZONE_DEFAULT_WIDTH,
} from "../constants";
import { SystemEdge } from "./system-edge";
import { SystemNode } from "./system-node";
import { ZoneNode } from "./zone-node";
import { nodeStatusFromMetrics, type AppEdge, type AppNode, type NodeStatus } from "./types";

const nodeTypes: NodeTypes = { system: SystemNode, zone: ZoneNode };
const edgeTypes: EdgeTypes = { system: SystemEdge };

const ZONE_COLORS = ["indigo", "cyan", "emerald", "amber", "violet", "rose"] as const;

function minimapNodeColor(node: RFNode): string {
  if (node.type === "zone") return "#e2e8f0";
  const status = (node.data as { status?: NodeStatus }).status;
  if (status === "critical") return "var(--destructive)";
  if (status === "saturated") return "var(--warning)";
  if (status === "healthy") return "var(--success)";
  return "var(--primary)";
}

export function ArchitectureCanvas() {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Anti-spam des toasts de connexion invalide (une fois par tentative). */
  const lastInvalidToast = useRef<{ reason: string; at: number }>({ reason: "", at: 0 });

  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const zones = useEditorStore((s) => s.zones);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const selectedEdgeId = useEditorStore((s) => s.selectedEdgeId);
  const docEpoch = useEditorStore((s) => s.docEpoch);
  const exerciseHint = useEditorStore((s) => s.exerciseHint);
  const setExerciseHint = useEditorStore((s) => s.setExerciseHint);

  const simResult = useSimulationStore((s) => s.result);

  /* ---------------- conversion store → React Flow ---------------- */

  const statusMap = useMemo(() => {
    const map = new Map<string, NodeStatus>();
    if (!simResult) return map;
    for (const metrics of simResult.nodes) {
      map.set(
        metrics.nodeId,
        nodeStatusFromMetrics(metrics.utilization, metrics.errorRate),
      );
    }
    return map;
  }, [simResult]);

  const rfNodes = useMemo<AppNode[]>(() => {
    const zoneNodes: AppNode[] = zones.map((zone) => ({
      id: zone.id,
      type: "zone",
      position: zone.position,
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: { zone },
      style: { width: zone.size.width, height: zone.size.height },
    }));
    const systemNodes: AppNode[] = nodes.map((node) => ({
      id: node.id,
      type: "system",
      position: node.position,
      selected: selectedNodeIds.includes(node.id),
      data: {
        archNode: node,
        component: getComponentById(node.componentId),
        status: statusMap.get(node.id),
      },
    }));
    // Les zones en tête : rendues derrière les nœuds système.
    return [...zoneNodes, ...systemNodes];
  }, [zones, nodes, selectedNodeIds, statusMap]);

  const rfEdges = useMemo<AppEdge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "system",
        selected: selectedEdgeId === edge.id,
        data: { edge },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "#94a3b8",
        },
      })),
    [edges, selectedEdgeId],
  );

  /* ---------------- viewport : fitView au chargement / remontage ---------------- */

  useEffect(() => {
    if (useEditorStore.getState().nodes.length === 0) return;
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.15, duration: 400 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [docEpoch, fitView]);

  /* ---------------- interactions ---------------- */

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Les changements de sélection passent par onSelectionChange (source de
    // vérité unique) ; les positions sont appliquées en continu via moveNode
    // (sans poussée d'historique — gérée au début du drag).
    const store = useEditorStore.getState();
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        store.moveNode(change.id, change.position);
      }
    }
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: selected, edges: selectedEdges }: OnSelectionChangeParams) => {
      useEditorStore
        .getState()
        .setSelection(
          selected.filter((n) => n.type === "system").map((n) => n.id),
          selectedEdges.map((e) => e.id),
        );
    },
    [],
  );

  const onNodeDragStart = useCallback(() => {
    useEditorStore.getState().beginHistorySnapshot();
  }, []);

  const onNodeDragStop = useCallback(
    (_event: unknown, node: AppNode) => {
      const store = useEditorStore.getState();
      // La position finale a déjà été appliquée en continu ; on borne la session.
      if (node.type === "system") store.moveNode(node.id, node.position);
      store.endDrag();
    },
    [],
  );

  const onNodeDoubleClick = useCallback((_event: unknown, node: AppNode) => {
    if (node.type !== "system") return;
    const store = useEditorStore.getState();
    store.selectNode(node.id);
    store.setConfigTab("configuration");
  }, []);

  const onEdgeClick = useCallback((_event: unknown, edge: Edge) => {
    useEditorStore.getState().selectEdge(edge.id);
  }, []);

  const onPaneClick = useCallback(() => {
    useEditorStore.getState().clearSelection();
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    const result = useEditorStore
      .getState()
      .addEdge(connection.source, connection.target);
    if (!result.ok) {
      toast.error(result.reason ?? "Connexion non autorisée.");
    }
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection | Edge): boolean => {
      const validation = useEditorStore
        .getState()
        .checkConnection(connection.source, connection.target);
      if (!validation.valid) {
        const now = Date.now();
        const reason = validation.reason ?? "Connexion non autorisée.";
        if (
          lastInvalidToast.current.reason !== reason ||
          now - lastInvalidToast.current.at > 1500
        ) {
          lastInvalidToast.current = { reason, at: now };
          toast.error(reason);
        }
        return false;
      }
      return true;
    },
    [],
  );

  /* ---------------- drag & drop depuis la bibliothèque ---------------- */

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const componentId = event.dataTransfer.getData(COMPONENT_DND_TYPE);
      if (!componentId) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const node = useEditorStore.getState().addNode(componentId, position);
      if (node) useLibraryStore.getState().addRecent(componentId);
    },
    [screenToFlowPosition],
  );

  /* ---------------- ajout au centre (double-clic bibliothèque) ---------------- */

  useEffect(() => {
    const handler = (event: Event) => {
      const componentId = (event as CustomEvent<string>).detail;
      if (!componentId || !wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      const node = useEditorStore.getState().addNode(componentId, {
        x: center.x - NODE_CARD_WIDTH / 2,
        y: center.y - NODE_CARD_HEIGHT / 2,
      });
      if (node) useLibraryStore.getState().addRecent(componentId);
    };
    window.addEventListener(ADD_COMPONENT_CENTER_EVENT, handler);
    return () => window.removeEventListener(ADD_COMPONENT_CENTER_EVENT, handler);
  }, [screenToFlowPosition]);

  /* ---------------- ajout de zone au centre ---------------- */

  const handleAddZone = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    const store = useEditorStore.getState();
    const color = ZONE_COLORS[store.zones.length % ZONE_COLORS.length];
    store.addZone(
      "Nouvelle zone",
      color,
      {
        x: Math.round(center.x - ZONE_DEFAULT_WIDTH / 2),
        y: Math.round(center.y - ZONE_DEFAULT_HEIGHT / 2),
      },
      { width: ZONE_DEFAULT_WIDTH, height: ZONE_DEFAULT_HEIGHT },
    );
  }, [screenToFlowPosition]);

  /* ---------------- raccourcis clavier globaux ---------------- */

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const store = useEditorStore.getState();

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        store.deleteSelection();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        store.redo();
      } else if (key === "d") {
        event.preventDefault();
        store.duplicateSelection();
      } else if (key === "c") {
        store.copySelection();
      } else if (key === "v") {
        store.paste();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const isEmpty = nodes.length === 0;

  return (
    <div ref={wrapperRef} className="relative h-full min-w-0 flex-1">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onSelectionChange={onSelectionChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: "var(--primary)", strokeWidth: 2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <MiniMap
          pannable
          zoomable
          position="bottom-left"
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={2}
          className="hidden sm:block"
        />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>

      {/* Barre d'outils du canvas : ajout de zone */}
      <div className="absolute top-2 left-2 z-20">
        <button
          type="button"
          onClick={handleAddZone}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ajouter une zone de regroupement"
          title="Ajouter une zone de regroupement"
        >
          <LayoutGrid className="size-3.5" />
          <span className="hidden sm:inline">Ajouter une zone</span>
        </button>
      </div>

      {/* Bandeau pédagogique (objectif d'exercice) */}
      {exerciseHint && (
        <div className="absolute top-2 right-2 left-2 z-20 mx-auto flex w-fit max-w-lg items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-800 shadow-sm backdrop-blur-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <GraduationCap className="mt-0.5 size-4 shrink-0" />
          <p className="leading-relaxed">{exerciseHint}</p>
          <button
            type="button"
            onClick={() => setExerciseHint(null)}
            aria-label="Masquer l'objectif de l'exercice"
            className="shrink-0 cursor-pointer rounded-sm p-0.5 transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* État vide : accueil */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/80 p-6 text-center shadow-sm backdrop-blur-sm">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Boxes className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                Glissez un composant ou ouvrez un modèle
              </p>
              <p className="text-xs text-muted-foreground">
                Faites glisser un composant depuis la bibliothèque à gauche,
                reliez les poignées pour construire votre architecture.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => useAppStore.getState().setView("templates")}
                className="cursor-pointer rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Modèles
              </button>
              <button
                type="button"
                onClick={() => useAppStore.getState().openTemplate("api-scalable")}
                className={cn(
                  "cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                Nouvelle du modèle API scalable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
