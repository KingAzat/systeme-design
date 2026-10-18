import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createArchitectureSchema,
  architectureDataSchema,
} from "@/lib/validation";
import type { ArchitectureSummary } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/architectures — liste résumée des architectures. */
export async function GET() {
  try {
    const rows = await db.architecture.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        data: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const items: ArchitectureSummary[] = rows.map((r) => {
      let nodeCount = 0;
      try {
        const parsed = JSON.parse(r.data) as { nodes?: unknown[] };
        nodeCount = Array.isArray(parsed.nodes) ? parsed.nodes.length : 0;
      } catch {
        nodeCount = 0;
      }
      return {
        id: r.id,
        name: r.name,
        description: r.description ?? undefined,
        nodeCount,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/architectures", e);
    return NextResponse.json({ error: "Erreur de lecture des architectures" }, { status: 500 });
  }
}

/** POST /api/architectures — crée une architecture. */
export async function POST(req: NextRequest) {
  try {
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
      },
    });
    return NextResponse.json(
      {
        item: {
          id: created.id,
          name: created.name,
          description: created.description ?? undefined,
          nodeCount: graph.data.nodes.length,
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
