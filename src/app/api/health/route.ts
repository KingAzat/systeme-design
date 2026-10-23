import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ENGINE_VERSION } from "@/engine";

export const dynamic = "force-dynamic";

/** GET /api/health — vérification réelle (base de données + version moteur). */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error("GET /api/health", e);
    return NextResponse.json(
      { status: "error", service: "systemlab", version: ENGINE_VERSION },
      { status: 503 },
    );
  }
  return NextResponse.json({ status: "ok", service: "systemlab", version: ENGINE_VERSION });
}
