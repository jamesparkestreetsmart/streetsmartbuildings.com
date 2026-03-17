import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/sop-standards/eligible-metrics
 *   ?target_kind=equipment&type_id=refrigerator
 *   ?target_kind=space&space_type=dining
 *   ?target_kind=equipment  (no type_id → all equipment metrics)
 *   ?target_kind=space      (no space_type → all space metrics)
 */
export async function GET(req: NextRequest) {
  const targetKind = req.nextUrl.searchParams.get("target_kind");

  if (!targetKind || !["equipment", "space"].includes(targetKind)) {
    return NextResponse.json({ error: "target_kind required (equipment|space)" }, { status: 400 });
  }

  if (targetKind === "equipment") {
    const typeId = req.nextUrl.searchParams.get("type_id");

    let query = supabase
      .from("library_equipment_sop_metrics")
      .select("sop_metric, display_name, unit")
      .eq("enabled", true)
      .order("display_name");

    if (typeId) {
      query = query.eq("equipment_type_id", typeId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate when no type_id filter (multiple equipment types may share metrics)
    const seen = new Set<string>();
    const metrics = (data || []).filter((m: any) => {
      if (seen.has(m.sop_metric)) return false;
      seen.add(m.sop_metric);
      return true;
    });

    return NextResponse.json({ metrics });
  }

  // Space track
  const spaceType = req.nextUrl.searchParams.get("space_type");

  let query = supabase
    .from("library_space_sop_metrics")
    .select("sop_metric, display_name, unit")
    .eq("enabled", true)
    .order("display_name");

  if (spaceType) {
    query = query.eq("space_type", spaceType);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const metrics = (data || []).filter((m: any) => {
    if (seen.has(m.sop_metric)) return false;
    seen.add(m.sop_metric);
    return true;
  });

  return NextResponse.json({ metrics });
}
