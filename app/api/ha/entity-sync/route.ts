// app/api/ha/entity-sync/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: true,
    message: "HA entity sync endpoint is alive",
  });
}
