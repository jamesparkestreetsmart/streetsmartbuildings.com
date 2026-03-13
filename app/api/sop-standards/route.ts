import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/sop-standards?org_id=...
 * Returns all SOP configs visible to the org: org's own + SSB-level defaults.
 */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Fetch org's own configs + SSB-level configs (org_id IS NULL)
  const { data: configs, error } = await supabase
    .from("a_sop_configs")
    .select("*")
    .or(`org_id.eq.${orgId},org_id.is.null`);

  if (error) {
    console.error("[sop-standards] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!configs?.length) {
    return NextResponse.json({ configs: [] });
  }

  // Resolve names for display
  const equipIds = [...new Set(configs.map((c) => c.equipment_id).filter(Boolean))] as string[];
  const spaceIds = [...new Set(configs.map((c) => c.space_id).filter(Boolean))] as string[];
  const siteIds = [...new Set(configs.map((c) => c.site_id).filter(Boolean))] as string[];
  const orgIds = [...new Set(configs.map((c) => c.org_id).filter(Boolean))] as string[];

  const [equipRes, spaceRes, siteRes, orgRes] = await Promise.all([
    equipIds.length
      ? supabase.from("a_equipments").select("equipment_id, equipment_name").in("equipment_id", equipIds)
      : { data: [] },
    spaceIds.length
      ? supabase.from("a_spaces").select("space_id, name").in("space_id", spaceIds)
      : { data: [] },
    siteIds.length
      ? supabase.from("a_sites").select("site_id, site_name").in("site_id", siteIds)
      : { data: [] },
    orgIds.length
      ? supabase.from("a_organizations").select("org_id, org_name").in("org_id", orgIds)
      : { data: [] },
  ]);

  const equipMap = new Map((equipRes.data || []).map((e: any) => [e.equipment_id, e.equipment_name]));
  const spaceMap = new Map((spaceRes.data || []).map((s: any) => [s.space_id, s.name]));
  const siteMap = new Map((siteRes.data || []).map((s: any) => [s.site_id, s.site_name]));
  const orgMap = new Map((orgRes.data || []).map((o: any) => [o.org_id, o.org_name]));

  const enriched = configs.map((c: any) => ({
    ...c,
    org_name: c.org_id ? orgMap.get(c.org_id) || null : null,
    site_name: c.site_id ? siteMap.get(c.site_id) || null : null,
    equipment_name: c.equipment_id ? equipMap.get(c.equipment_id) || null : null,
    space_name: c.space_id ? spaceMap.get(c.space_id) || null : null,
  }));

  return NextResponse.json({ configs: enriched });
}

/**
 * POST /api/sop-standards — Create a new SOP config.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const row = buildRow(body);
  const { data, error } = await supabase
    .from("a_sop_configs")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[sop-standards] POST error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}

/**
 * PATCH /api/sop-standards — Update an existing SOP config.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const row = buildRow(fields);
  const { data, error } = await supabase
    .from("a_sop_configs")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[sop-standards] PATCH error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}

/**
 * DELETE /api/sop-standards?id=...
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase.from("a_sop_configs").delete().eq("id", id);

  if (error) {
    console.error("[sop-standards] DELETE error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

// ── Helpers ──────────────────────────────────────────────────

function buildRow(body: Record<string, unknown>) {
  return {
    target_kind: body.target_kind,
    scope_level: body.scope_level,
    label: body.label,
    metric: body.metric,
    min_value: body.min_value ?? null,
    max_value: body.max_value ?? null,
    unit: body.unit || "F",
    evaluation_window: body.evaluation_window || "all_hours",
    effective_from: body.effective_from || null,
    effective_to: body.effective_to || null,
    notes: body.notes || null,
    org_id: body.org_id || null,
    site_id: body.site_id || null,
    equipment_type: body.equipment_type || null,
    equipment_id: body.equipment_id || null,
    space_type: body.space_type || null,
    space_id: body.space_id || null,
  };
}
