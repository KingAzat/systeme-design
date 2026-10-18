"use client";

/**
 * SystemLab — ligne de métrique comparative (A vs B + delta orienté).
 * Le ton du delta dépend du sens de la métrique : « better » = la version B
 * progresse sur cet axe, « worse » = elle régresse.
 */
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DeltaTone = "better" | "worse" | "neutral";

const TONE_TEXT: Record<DeltaTone, string> = {
  better: "text-success",
  worse: "text-destructive",
  neutral: "text-muted-foreground",
};

const TONE_ICON: Record<DeltaTone, typeof TrendingUp> = {
  better: TrendingUp,
  worse: TrendingDown,
  neutral: Minus,
};

export interface MetricRowProps {
  label: string;
  valueA: string;
  valueB: string;
  delta: string;
  /** Variation relative optionnelle, ex. « −34 % ». */
  relative?: string;
  tone: DeltaTone;
}

export function MetricRow({ label, valueA, valueB, delta, relative, tone }: MetricRowProps) {
  const ToneIcon = TONE_ICON[tone];
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{valueA}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{valueB}</TableCell>
      <TableCell className="text-right">
        <span className={cn("inline-flex items-center justify-end gap-1.5 tabular-nums", TONE_TEXT[tone])}>
          <ToneIcon className="size-3.5" />
          {delta}
          {relative ? (
            <span className="text-xs text-muted-foreground">({relative})</span>
          ) : null}
        </span>
      </TableCell>
    </TableRow>
  );
}
