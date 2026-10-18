import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateArchitectureSchema, architectureDataSchema } from "@/lib/validation";
import type { Architecture } from "@/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/architectures/:id — architecture complète. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const row = await db.architecture.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ error: "Architecture introuvable" }, { status: 404 });
    }
    let data: unknown;
    try {
      data = JSON.parse(row.data);
    } catch {
      return NextResponse.json({ error: "Données d'architecture corrompues" }, { status: 500 });
    }
    const item: Architecture = {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      ...(data as Omit<Architecture, "id" | "name" | "description" | "createdAt" | "updatedAt">),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    return NextResponse.json({ item });
  } catch (e) {
    console.error("GET /api/architectures/:id", e);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }
}

/** PATCH /api/architectures/:id — renomme et/ou remplace le graphe. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateArchitectureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const existing = await db.architecture.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Architecture introuvable" }, { status: 404 });
    }
    const { name, description, data } = parsed.data;
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (data !== undefined) {
      const graph = architectureDataSchema.safeParse(data);
      if (!graph.success) {
        return NextResponse.json(
          { error: "Architecture invalide", details: graph.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      patch.data = JSON.stringify(graph.data);
    }
    const updated = await db.architecture.update({ where: { id }, data: patch });
    return NextResponse.json({
      item: {
        id: updated.id,
        name: updated.name,
        description: updated.description ?? undefined,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("PATCH /api/architectures/:id", e);
    return NextResponse.json({ error: "Erreur de mise à jour" }, { status: 500 });
  }
}

/** DELETE /api/architectures/:id — supprime (cascade simulations). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.architecture.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Architecture introuvable" }, { status: 404 });
    }
    await db.architecture.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/architectures/:id", e);
    return NextResponse.json({ error: "Erreur de suppression" }, { status: 500 });
  }
}
