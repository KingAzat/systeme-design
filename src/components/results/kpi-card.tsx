"use client";

/**
 * SystemLab — carte KPI compacte (vues résultats / comparaison).
 * Icône + titre + valeur + sous-texte + accent optionnel (palette SystemLab).
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiAccent = "default" | "success" | "warning" | "destructive" | "info";

const ACCENT_TEXT: Record<KpiAccent, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
};

const ACCENT_ICON: Record<KpiAccent, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accent?: KpiAccent;
  /** Badge optionnel en haut à droite (ex. état du budget). */
  badge?: ReactNode;
  className?: string;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "default",
  badge,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md",
                ACCENT_ICON[accent],
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          {badge}
        </div>
        <p
          className={cn(
            "mt-2.5 text-xl font-semibold tabular-nums tracking-tight",
            ACCENT_TEXT[accent],
          )}
        >
          {value}
        </p>
        {sub ? <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}
