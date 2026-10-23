import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSimulationSchema } from "@/lib/validation";
import type { SimulationSummary, ScenarioConfig } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/simulations?architectureId=&limit=&offset= — historique résumé.
 * `overall` est lu depuis les colonnes dénormalisées (pas de parse du JSON `result`). */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const architectureId = url.searchParams.get("architectureId");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(100, Math.max(1, Number(limitParam) || 50));
    const offsetParam = Number(url.searchParams.get("offset") ?? NaN);
    const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 0;
    // `result` (JSON volumineux) volontairement absent du select : le résumé est dénormalisé.
    // `scenario` reste stocké en JSON et n'est renvoyé que par la route de détail.
    const rows = await db.simulationRecord.findMany({
      where: architectureId ? { architectureId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        label: true,
        architectureId: true,
        mode: true,
        seed: true,
        createdAt: true,
        servedRps: true,
        p95Ms: true,
        errorRate: true,
        availability: true,
        costPerMonthUsd: true,
        architecture: { select: { name: true } },
      },
    });
    const items: SimulationSummary[] = rows.map((r) => ({
      id: r.id,
      architectureId: r.architectureId,
      architectureName: r.architecture.name,
      label: r.label ?? undefined,
      mode: r.mode as SimulationSummary["mode"],
      seed: r.seed,
      createdAt: r.createdAt.toISOString(),
      overall: {
        servedRps: r.servedRps,
        p95Ms: r.p95Ms,
        errorRate: r.errorRate,
        availability: r.availability,
        costPerMonthUsd: r.costPerMonthUsd,
      },
    }));
    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/simulations", e);
    return NextResponse.json({ error: "Erreur de lecture de l'historique" }, { status: 500 });
  }
}

/** POST /api/simulations — archive un résultat de simulation. */
export async function POST(req: NextRequest) {
  try {
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > 3_000_000) {
      return NextResponse.json({ error: "Corps de requête trop volumineux" }, { status: 413 });
    }
    const body = await req.json();
    const parsed = createSimulationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { architectureId, label, engineVersion, mode, seed, scenario, result } = parsed.data;
    const arch = await db.architecture.findUnique({
      where: { id: architectureId },
      select: { id: true },
    });
    if (!arch) {
      return NextResponse.json(
        { error: "Architecture introuvable : sauvegardez l'architecture avant d'archiver la simulation" },
        { status: 404 },
      );
    }
    // Le résumé `overall` est dénormalisé en colonnes (validé structurellement par Zod).
    const { servedRps, p95Ms, errorRate, availability, costPerMonthUsd } = result.overall;
    const created = await db.simulationRecord.create({
      data: {
        architectureId,
        label: label ?? null,
        engineVersion,
        mode,
        seed,
        scenario: JSON.stringify(scenario satisfies ScenarioConfig),
        result: JSON.stringify(result),
        servedRps,
        p95Ms,
        errorRate,
        availability,
        costPerMonthUsd,
      },
    });
    return NextResponse.json(
      { item: { id: created.id, createdAt: created.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/simulations", e);
    return NextResponse.json({ error: "Erreur d'archivage de la simulation" }, { status: 500 });
  }
}
