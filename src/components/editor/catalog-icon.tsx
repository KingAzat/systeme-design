"use client";

/**
 * SystemLab — Icône de catalogue (résolution via le registre partagé).
 *
 * `getIcon` renvoie une référence STABLE issue de LUCIDE_ICONS : aucun
 * composant n'est recréé au rendu. La règle react-hooks/static-components
 * ne peut pas le savoir (heuristique sur les assignations de rendu) et est
 * donc désactivée pour l'ensemble de ce petit module de rendu d'icônes.
 *
 * Si le composant possède un logo de marque réel (Redis, Docker, Kafka…,
 * voir src/lib/brand-logos.ts), celui-ci remplace l'icône Lucide : silhouette
 * officielle + couleur de marque, éclaircie en thème sombre si nécessaire.
 */
/* eslint-disable react-hooks/static-components -- registre stable, voir explication ci-dessus */
import { getIcon } from "@/lib/icons";
import { getComponentLogo, getCompanyLogo, type BrandLogo } from "@/lib/brand-logos";
import { cn } from "@/lib/utils";

/** Classe de thème sombre selon la stratégie de la marque : les logos noirs
 *  sont inversés (brightness ne peut pas éclaircir le noir pur), les couleurs
 *  sombres sont éclaircies. */
function brandDarkClass(brand: BrandLogo): string | undefined {
  if (brand.darkMode === "invert") return "dark:invert";
  if (brand.darkMode === "brighten") return "dark:brightness-[1.9]";
  return undefined;
}

export function CatalogIcon({
  name,
  componentId,
  className,
}: {
  name?: string;
  /** Identifiant catalogue : déclenche le logo de marque lorsqu'il existe. */
  componentId?: string;
  className?: string;
}) {
  const brand = getComponentLogo(componentId);
  if (brand) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className={cn(className, brandDarkClass(brand))}
        style={{ fill: brand.color }}
      >
        <path d={brand.path} />
      </svg>
    );
  }
  const Icon = getIcon(name);
  return <Icon className={cn(className)} />;
}

/** Logo d'entreprise de la galerie (« géants de la tech »). Null si inconnu. */
export function CompanyMark({
  logoKey,
  className,
}: {
  logoKey: string | undefined;
  className?: string;
}) {
  const brand = getCompanyLogo(logoKey);
  if (!brand) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={brand.title}
      className={cn(className, brandDarkClass(brand))}
      style={{ fill: brand.color }}
    >
      <path d={brand.path} />
    </svg>
  );
}
