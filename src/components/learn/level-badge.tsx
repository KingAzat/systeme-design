import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CourseLevel } from "@/types";

/**
 * Badge de niveau partagé par les vues apprentissage, modèles et tableau de bord.
 * Les valeurs de CourseLevel et de la difficulté des modèles sont identiques.
 */

export const LEVEL_STYLES: Record<CourseLevel, string> = {
  débutant: "border-success/40 bg-success/5 text-success",
  intermédiaire: "border-warning/40 bg-warning/5 text-warning",
  avancé: "border-destructive/40 bg-destructive/5 text-destructive",
};

export function LevelBadge({
  level,
  className,
}: {
  level: CourseLevel;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(LEVEL_STYLES[level], className)}>
      {level}
    </Badge>
  );
}
