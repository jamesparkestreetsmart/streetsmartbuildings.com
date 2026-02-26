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
  const derivedEvent = url.get("derived_event") || null;
  const limit = Math.min(parseInt(url.get("limit") || "50", 10) || 50, 200);

  try {
    let query = supabase
      .from("b_state_change_log")
      .select(
        "id, entity_id, equipment_id, previous_state, new_state, changed_at, state_role, derived_event, metadata"
      )
      .eq("site_id", siteId)
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (equipmentId) query = query.eq("equipment_id", equipmentId);
    if (derivedEvent) query = query.eq("derived_event", derivedEvent);

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
