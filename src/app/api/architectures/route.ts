import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createArchitectureSchema,
  architectureDataSchema,
} from "@/lib/validation";
import type { ArchitectureSummary } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/architectures?take=&skip= — liste résumée des architectures.
 * Par défaut (sans paramètres) : tout renvoyer, comportement inchangé. */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const takeParam = Number(url.searchParams.get("take") ?? NaN);
    const skipParam = Number(url.searchParams.get("skip") ?? NaN);
    const take =
      Number.isFinite(takeParam) && takeParam > 0 ? Math.min(500, Math.floor(takeParam)) : undefined;
    const skip =
      Number.isFinite(skipParam) && skipParam > 0 ? Math.floor(skipParam) : undefined;
    // `data` (JSON volumineux) volontairement absent du select : nodeCount est dénormalisé.
    const rows = await db.architecture.findMany({
      orderBy: { updatedAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        name: true,
        description: true,
        nodeCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const items: ArchitectureSummary[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      nodeCount: r.nodeCount,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/architectures", e);
    return NextResponse.json({ error: "Erreur de lecture des architectures" }, { status: 500 });
  }
}

/** POST /api/architectures — crée une architecture. */
export async function POST(req: NextRequest) {
  try {
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (declaredLength > 3_000_000) {
      return NextResponse.json({ error: "Corps de requête trop volumineux" }, { status: 413 });
    }
    const body = await req.json();
    const parsed = createArchitectureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { name, description, data } = parsed.data;
    // Double validation du graphe interne
    const graph = architectureDataSchema.safeParse(data);
    if (!graph.success) {
      return NextResponse.json(
        { error: "Architecture invalide", details: graph.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const created = await db.architecture.create({
      data: {
        name,
        description: description ?? null,
        data: JSON.stringify(graph.data),
        nodeCount: graph.data.nodes.length,
      },
    });
    return NextResponse.json(
      {
        item: {
          id: created.id,
          name: created.name,
          description: created.description ?? undefined,
          nodeCount: created.nodeCount,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/architectures", e);
    return NextResponse.json({ error: "Erreur de création" }, { status: 500 });
  }
}
