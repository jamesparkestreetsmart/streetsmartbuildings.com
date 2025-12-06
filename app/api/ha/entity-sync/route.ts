// app/api/ha/entity-sync/route.ts

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  console.log("✅ HA ENTITY SYNC HIT");
  console.log(JSON.stringify(body, null, 2));

  return NextResponse.json({
    status: "ok",
    received: true,
    entities: body?.entities?.length ?? 0
  });
}
