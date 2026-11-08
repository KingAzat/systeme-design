"use client";

/**
 * SystemLab — état vide partagé (vues résultats, historique, comparaison,
 * tableau de bord). Icône + titre + description + action optionnelle, dans un
 * style unique : pastille 64 px sur carte encadrée, texte centré.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Action principale (bouton(s)) affichée sous la description. */
  action?: ReactNode;
  /** Ajustements d'espacement du contexte appelant (ex. « mt-16 py-8 »). */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 text-center",
        className,
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-2xl border bg-card shadow-sm">
        <Icon className="size-8 text-muted-foreground" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
