// app/api/ha/entity-sync/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body?.site_id) {
    return NextResponse.json(
      { ok: false, error: "Missing site_id" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "HA entity sync endpoint received request",
    site_id: body.site_id,
  });
}
