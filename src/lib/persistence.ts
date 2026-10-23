/**
 * SystemLab — Couche de persistance (façade côté client).
 *
 * Interface volontairement indépendante de l'UI : le stockage local peut être
 * remplacé par une API distante + authentification sans toucher aux composants.
 * L'implémentation actuelle repose sur les routes /api/* (Prisma + SQLite).
 */
import type {
  Architecture,
  ArchitectureData,
  ArchitectureSummary,
  SimulationResult,
  SimulationSummary,
} from "@/types";

export interface ArchitectureStore {
  list(): Promise<ArchitectureSummary[]>;
  get(id: string): Promise<Architecture | null>;
  create(data: ArchitectureData): Promise<Architecture>;
  update(id: string, patch: { name?: string; description?: string | null; data?: ArchitectureData }): Promise<Architecture>;
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<Architecture>;
}

export interface SimulationStore {
  list(architectureId?: string, limit?: number): Promise<SimulationSummary[]>;
  get(id: string): Promise<SimulationResult | null>;
  create(input: {
    architectureId: string;
    label?: string;
    engineVersion: string;
    mode: SimulationResult["mode"];
    seed: number;
    scenario: SimulationResult["scenario"];
    result: SimulationResult;
  }): Promise<{ id: string }>;
  remove(id: string): Promise<void>;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    // Timeout par défaut (10 s) : une requête pendante ne bloque jamais
    // indéfiniment l'UI — l'appelant voit remonter une erreur exploitable.
    // Un AbortSignal explicite fourni par l'appelant a la priorité.
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof body.error === "string" ? body.error : `Erreur ${res.status} — ${res.statusText}`;
    throw new Error(message);
  }
  return body as T;
}

/* ------------------------------------------------------------------ */
/* Implémentation API (Prisma)                                         */
/* ------------------------------------------------------------------ */

export const apiArchitectureStore: ArchitectureStore = {
  async list() {
    const r = await jsonFetch<{ items: ArchitectureSummary[] }>("/api/architectures");
    return r.items;
  },
  async get(id) {
    try {
      const r = await jsonFetch<{ item: Architecture }>(`/api/architectures/${id}`);
      return r.item;
    } catch {
      return null;
    }
  },
  async create(data) {
    const r = await jsonFetch<{ item: Architecture }>("/api/architectures", {
      method: "POST",
      body: JSON.stringify({ name: data.name, description: data.description, data }),
    });
    return { ...r.item, ...data };
  },
  async update(id, patch) {
    await jsonFetch(`/api/architectures/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    const full = await this.get(id);
    if (!full) throw new Error("Architecture introuvable après mise à jour");
    return full;
  },
  async remove(id) {
    await jsonFetch(`/api/architectures/${id}`, { method: "DELETE" });
  },
  async duplicate(id) {
    const r = await jsonFetch<{ item: Architecture }>(`/api/architectures/${id}/duplicate`, {
      method: "POST",
    });
    const full = await this.get(r.item.id);
    if (!full) throw new Error("Duplication échouée");
    return full;
  },
};

export const apiSimulationStore: SimulationStore = {
  async list(architectureId, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (architectureId) params.set("architectureId", architectureId);
    const r = await jsonFetch<{ items: SimulationSummary[] }>(`/api/simulations?${params}`);
    return r.items;
  },
  async get(id) {
    try {
      const r = await jsonFetch<{ item: SimulationResult }>(`/api/simulations/${id}`);
      return r.item;
    } catch {
      return null;
    }
  },
  async create(input) {
    const r = await jsonFetch<{ item: { id: string } }>("/api/simulations", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return r.item;
  },
  async remove(id) {
    await jsonFetch(`/api/simulations/${id}`, { method: "DELETE" });
  },
};

/** Export par défaut (point d'échange unique pour une future migration). */
export const storage = {
  architectures: apiArchitectureStore,
  simulations: apiSimulationStore,
};
