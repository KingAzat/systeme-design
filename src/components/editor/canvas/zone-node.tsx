"use client";

/**
 * SystemLab — Nœud zone (groupe visuel derrière les composants).
 * Non déplaçable/sélectionnable au sens React Flow ; le label (haut gauche)
 * est cliquable pour sélectionner la zone et l'éditer dans le panneau droit.
 */
import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { ZoneColor } from "@/types";
import type { ZoneNodeType } from "./types";

const ZONE_STYLES: Record<ZoneColor, { box: string; label: string }> = {
  indigo: {
    box: "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/5",
    label: "text-indigo-500 dark:text-indigo-300",
  },
  cyan: {
    box: "border-cyan-300 bg-cyan-50/60 dark:border-cyan-500/40 dark:bg-cyan-500/5",
    label: "text-cyan-600 dark:text-cyan-300",
  },
  emerald: {
    box: "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/5",
    label: "text-emerald-600 dark:text-emerald-300",
  },
  amber: {
    box: "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5",
    label: "text-amber-600 dark:text-amber-300",
  },
  violet: {
    box: "border-violet-300 bg-violet-50/60 dark:border-violet-500/40 dark:bg-violet-500/5",
    label: "text-violet-500 dark:text-violet-300",
  },
  rose: {
    box: "border-rose-300 bg-rose-50/60 dark:border-rose-500/40 dark:bg-rose-500/5",
    label: "text-rose-500 dark:text-rose-300",
  },
};

function ZoneNodeInner({ id, data }: NodeProps<ZoneNodeType>) {
  const zone = data.zone;
  const selectZone = useEditorStore((s) => s.selectZone);
  const selectedZoneId = useEditorStore((s) => s.selectedZoneId);
  const style = ZONE_STYLES[zone.color] ?? ZONE_STYLES.indigo;
  const selected = selectedZoneId === id;

  return (
    <div className="pointer-events-none relative h-full w-full">
      <div
        className={cn(
          "h-full w-full rounded-xl border-2 border-dashed",
          style.box,
          selected && "ring-2 ring-primary/50",
        )}
      >
        <button
          type="button"
          className={cn(
            "pointer-events-auto absolute top-2.5 left-3 cursor-pointer rounded-sm bg-card/60 px-1 py-0.5 text-xs font-medium tracking-wide uppercase backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            style.label,
          )}
          onClick={(event) => {
            event.stopPropagation();
            selectZone(id);
          }}
          aria-label={`Sélectionner la zone « ${zone.label} »`}
        >
          {zone.label}
        </button>
      </div>
    </div>
  );
}

export const ZoneNode = memo(ZoneNodeInner);
