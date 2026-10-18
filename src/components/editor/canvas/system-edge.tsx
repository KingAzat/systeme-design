"use client";

/**
 * SystemLab — Connexion custom (bezier) : trait slate-400 (2 px), flèche
 * markerEnd, sélection → trait primaire animé (flux) + badge protocole
 * via EdgeLabelRenderer.
 */
import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { Protocol } from "@/types";
import type { SystemEdgeType } from "./types";

const PROTOCOL_LABELS: Record<Protocol, string> = {
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

function SystemEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  markerEnd,
  data,
}: EdgeProps<SystemEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });
  const protocol = data?.edge.protocol;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "var(--primary)" : "#94a3b8",
          strokeWidth: 2,
          ...(selected
            ? {
                strokeDasharray: "6 8",
                animation: "systemlab-dash 0.9s linear infinite",
              }
            : {}),
        }}
      />
      {selected && protocol && (
        <EdgeLabelRenderer>
          <span
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="pointer-events-none absolute rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
          >
            {PROTOCOL_LABELS[protocol]}
            {data?.edge.networkLatencyMs > 0 ? ` · ${data.edge.networkLatencyMs} ms` : ""}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const SystemEdge = memo(SystemEdgeInner);
