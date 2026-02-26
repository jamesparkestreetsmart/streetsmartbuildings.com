import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await context.params;
  const url = req.nextUrl.searchParams;

  const equipmentId = url.get("equipment_id") || null;
  const limit = Math.min(parseInt(url.get("limit") || "50", 10) || 50, 200);

  try {
    let query = supabase
      .from("b_compressor_cycles")
      .select(
        "id, hvac_zone_id, equipment_id, started_at, ended_at, duration_min, hvac_mode, stage1_minutes, stage2_minutes, avg_power_kw, peak_power_kw, total_energy_kwh, peak_current_a, start_zone_temp_f, end_zone_temp_f, temp_delta_f, start_supply_temp_f, end_supply_temp_f, start_setpoint_f, efficiency_ratio"
      )
      .eq("site_id", siteId)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (equipmentId) query = query.eq("equipment_id", equipmentId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
