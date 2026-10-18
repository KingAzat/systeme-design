import type { CatalogCategory } from "@/types";

/** Catégories du catalogue SystemLab (contrat stable). */
export const CATEGORIES: CatalogCategory[] = [
  { id: "clients", label: "Clients et trafic", icon: "Users" },
  { id: "network", label: "Réseau", icon: "Network" },
  { id: "compute", label: "Compute et applications", icon: "Server" },
  { id: "sql", label: "Bases de données SQL", icon: "Database" },
  { id: "nosql", label: "Bases de données NoSQL", icon: "Braces" },
  { id: "cache", label: "Cache", icon: "Zap" },
  { id: "messaging", label: "Messagerie et événements", icon: "Send" },
  { id: "storage", label: "Stockage", icon: "HardDrive" },
  { id: "search", label: "Recherche et données", icon: "FileSearch" },
  { id: "communication", label: "Communication", icon: "Globe" },
  { id: "security", label: "Identité et sécurité", icon: "Shield" },
  { id: "resilience", label: "Résilience", icon: "HeartPulse" },
  { id: "observability", label: "Observabilité", icon: "Activity" },
  { id: "distributed", label: "Architecture distribuée", icon: "GitMerge" },
  { id: "jobs", label: "Traitements différés", icon: "Clock" },
  { id: "ai", label: "Intelligence artificielle", icon: "Brain" },
  { id: "business", label: "Services métier", icon: "Briefcase" },
  { id: "infrastructure", label: "Infrastructure et cloud", icon: "Cloud" },
];

export const CATEGORY_MAP: Record<string, CatalogCategory> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);
