import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logZoneSetpointSnapshot } from "@/lib/zone-setpoint-logger";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SITE_ID = "aebd4fdf-2f60-4e6d-b08e-46ebc199555e";

export async function GET() {
  const startMs = Date.now();
  try {
    await logZoneSetpointSnapshot(supabase, SITE_ID);
    return NextResponse.json({
      ok: true,
      site_id: SITE_ID,
      duration_ms: Date.now() - startMs,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      site_id: SITE_ID,
      error: err.message,
      stack: err.stack,
      duration_ms: Date.now() - startMs,
    }, { status: 500 });
  }
}
