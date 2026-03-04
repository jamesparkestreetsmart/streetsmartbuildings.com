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
  const hvacZoneId = url.get("hvac_zone_id") || null;
  const anomalyType = url.get("anomaly_type") || null;
  const activeOnly = url.get("active_only") === "true";
  const limit = Math.min(parseInt(url.get("limit") || "50", 10) || 50, 200);

  try {
    const baseCols =
      "id, anomaly_type, severity, started_at, ended_at, duration_min, peak_value, peak_value_unit, trigger_snapshot, resolution_snapshot, acknowledged_by, acknowledged_at, alert_sent, hvac_zone_id, equipment_id";

    // Try with resolved_reason first, fall back without it
    let cols = `${baseCols}, resolved_reason`;

    let query = supabase
      .from("b_anomaly_events")
      .select(cols)
      .eq("site_id", siteId)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (equipmentId) query = query.eq("equipment_id", equipmentId);
    if (hvacZoneId) query = query.eq("hvac_zone_id", hvacZoneId);
    if (anomalyType) query = query.eq("anomaly_type", anomalyType);
    if (activeOnly) query = query.is("ended_at", null);

    let result = await query;

    // If resolved_reason column doesn't exist, retry without it
    if (result.error && result.error.message?.includes("resolved_reason")) {
      console.warn("[anomaly-events] resolved_reason column not found, retrying without it");
      let fallback = supabase
        .from("b_anomaly_events")
        .select(baseCols)
        .eq("site_id", siteId)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (equipmentId) fallback = fallback.eq("equipment_id", equipmentId);
      if (hvacZoneId) fallback = fallback.eq("hvac_zone_id", hvacZoneId);
      if (anomalyType) fallback = fallback.eq("anomaly_type", anomalyType);
      if (activeOnly) fallback = fallback.is("ended_at", null);

      result = await fallback as typeof result;
    }

    const { data, error } = result;

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
