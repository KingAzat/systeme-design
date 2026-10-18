import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSimulationSchema } from "@/lib/validation";
import type { SimulationSummary, SimulationResult, ScenarioConfig } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/simulations?architectureId=&limit= — historique résumé. */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const architectureId = url.searchParams.get("architectureId");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(100, Math.max(1, Number(limitParam) || 50));
    const rows = await db.simulationRecord.findMany({
      where: architectureId ? { architectureId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { architecture: { select: { name: true } } },
    });
    const items: SimulationSummary[] = rows.map((r) => {
      let overall: SimulationSummary["overall"];
      try {
        const result = JSON.parse(r.result) as SimulationResult;
        overall = {
          servedRps: result.overall.servedRps,
          p95Ms: result.overall.p95Ms,
          errorRate: result.overall.errorRate,
          availability: result.overall.availability,
          costPerMonthUsd: result.overall.costPerMonthUsd,
        };
      } catch {
        overall = { servedRps: 0, p95Ms: 0, errorRate: 0, availability: 0, costPerMonthUsd: 0 };
      }
      return {
        id: r.id,
        architectureId: r.architectureId,
        architectureName: r.architecture.name,
        label: r.label ?? undefined,
        mode: r.mode as SimulationSummary["mode"],
        seed: r.seed,
        createdAt: r.createdAt.toISOString(),
        overall,
      };
    });
    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/simulations", e);
    return NextResponse.json({ error: "Erreur de lecture de l'historique" }, { status: 500 });
  }
}

/** POST /api/simulations — archive un résultat de simulation. */
export async function POST(req: NextRequest) {
  try {
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
    const created = await db.simulationRecord.create({
      data: {
        architectureId,
        label: label ?? null,
        engineVersion,
        mode,
        seed,
        scenario: JSON.stringify(scenario satisfies ScenarioConfig),
        result: JSON.stringify(result),
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
