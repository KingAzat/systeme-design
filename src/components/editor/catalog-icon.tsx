"use client";

/**
 * SystemLab — Icône de catalogue (résolution via le registre partagé).
 *
 * `getIcon` renvoie une référence STABLE issue de LUCIDE_ICONS : aucun
 * composant n'est recréé au rendu. La règle react-hooks/static-components
 * ne peut pas le savoir (heuristique sur les assignations de rendu) et est
 * donc désactivée pour l'ensemble de ce petit module de rendu d'icônes.
 */
/* eslint-disable react-hooks/static-components -- registre stable, voir explication ci-dessus */
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function CatalogIcon({
  name,
  className,
}: {
  name?: string;
  className?: string;
}) {
  const Icon = getIcon(name);
  return <Icon className={cn(className)} />;
}
