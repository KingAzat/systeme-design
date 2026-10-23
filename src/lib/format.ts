/**
 * SystemLab — Utilitaires de formatage (fr-FR).
 */

const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** 1234 → "1 234" */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return nf0.format(n);
}

/** Débit : req/s avec séparateurs */
export function formatRps(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 10000) return `${nf0.format(Math.round(n))} req/s`;
  if (n >= 100) return `${nf0.format(Math.round(n))} req/s`;
  return `${nf1.format(n)} req/s`;
}

/** Latence : ms adaptative */
export function formatMs(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `${nf1.format(n / 1000)} s`;
  if (n >= 100) return `${nf0.format(n)} ms`;
  if (n >= 10) return `${nf1.format(n)} ms`;
  return `${nf2.format(n)} ms`;
}

/** 0.85 → "85 %" */
export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(ratio * 100)} %`;
}

/** 129.99 → "130 $/mois" */
export function formatCost(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return `${nf0.format(Math.round(n))} $/mois`;
  return `${nf1.format(n)} $/mois`;
}

/** 4.5 → "4,5 Go" */
export function formatSize(n: number, unit = "Go"): string {
  if (!Number.isFinite(n)) return "—";
  return `${nf1.format(n)} ${unit}`;
}

/** 3000000 → "3 M req" */
export function formatRequests(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${nf1.format(n / 1_000_000)} M`;
  if (n >= 1000) return `${nf1.format(n / 1000)} k`;
  return nf0.format(n);
}

/** Timestamp → "il y a 2 min" */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

/** Date + heure locale courte */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Clamp utilitaire */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Génère un identifiant court unique (préfixe + horodatage + aléa cryptographique) */
export function shortId(prefix: string): string {
  const rnd = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}-${Date.now().toString(36)}${rnd}`;
}
