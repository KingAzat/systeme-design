import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { SimulationResult, ScenarioConfig } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/simulations/:id — résultat complet archivé. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const row = await db.simulationRecord.findUnique({
      where: { id },
      include: { architecture: { select: { name: true } } },
    });
    if (!row) {
      return NextResponse.json({ error: "Simulation introuvable" }, { status: 404 });
    }
    let result: SimulationResult;
    let scenario: ScenarioConfig;
    try {
      result = JSON.parse(row.result) as SimulationResult;
      scenario = JSON.parse(row.scenario) as ScenarioConfig;
    } catch {
      return NextResponse.json({ error: "Résultat corrompu" }, { status: 500 });
    }
    // Réaligne les métadonnées avec la ligne SQL (source de vérité)
    const item: SimulationResult = {
      ...result,
      id: row.id,
      architectureId: row.architectureId,
      architectureName: row.architecture.name,
      seed: row.seed,
      mode: row.mode as SimulationResult["mode"],
      engineVersion: row.engineVersion,
      startedAt: row.createdAt.toISOString(),
      scenario,
    };
    return NextResponse.json({ item });
  } catch (e) {
    console.error("GET /api/simulations/:id", e);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }
}

/** DELETE /api/simulations/:id */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.simulationRecord.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Simulation introuvable" }, { status: 404 });
    }
    await db.simulationRecord.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Simulation introuvable" }, { status: 404 });
    }
    console.error("DELETE /api/simulations/:id", e);
    return NextResponse.json({ error: "Erreur de suppression" }, { status: 500 });
  }
}
