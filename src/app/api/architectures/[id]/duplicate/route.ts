import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/architectures/:id/duplicate — duplique une architecture. */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const source = await db.architecture.findUnique({ where: { id } });
    if (!source) {
      return NextResponse.json({ error: "Architecture introuvable" }, { status: 404 });
    }
    const name = `${source.name} (copie)`.slice(0, 120);
    const created = await db.architecture.create({
      data: {
        name,
        description: source.description,
        data: source.data,
      },
    });
    return NextResponse.json(
      {
        item: {
          id: created.id,
          name: created.name,
          description: created.description ?? undefined,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/architectures/:id/duplicate", e);
    return NextResponse.json({ error: "Erreur de duplication" }, { status: 500 });
  }
}
