import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/sop-assignments?org_id=...
 * Returns SSB-owned assignments + org-owned assignments,
 * each joined with their template data and resolved entity names.
 */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  // Fetch SSB + org assignments with template join
  const { data: rows, error } = await supabase
    .from("a_sop_assignments")
    .select(`
      *,
      a_sop_templates (
        id, target_kind, label, metric, unit,
        min_value, max_value, evaluation_window, notes
      )
    `)
    .or(`org_id.eq.${orgId},owner_kind.eq.ssb`);

  if (error) {
    console.error("[sop-assignments] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ assignments: [] });
  }

  // Resolve entity names
  const equipIds = [...new Set(rows.map((r) => r.equipment_id).filter(Boolean))] as string[];
  const spaceIds = [...new Set(rows.map((r) => r.space_id).filter(Boolean))] as string[];
  const siteIds = [...new Set(rows.map((r) => r.site_id).filter(Boolean))] as string[];
  const orgIds = [...new Set(rows.map((r) => r.org_id).filter(Boolean))] as string[];

  const [equipRes, spaceRes, siteRes, orgRes] = await Promise.all([
    equipIds.length
      ? supabase.from("a_equipments").select("equipment_id, equipment_name, equipment_group").in("equipment_id", equipIds)
      : { data: [] },
    spaceIds.length
      ? supabase.from("a_spaces").select("space_id, name, space_type").in("space_id", spaceIds)
      : { data: [] },
    siteIds.length
      ? supabase.from("a_sites").select("site_id, site_name").in("site_id", siteIds)
      : { data: [] },
    orgIds.length
      ? supabase.from("a_organizations").select("org_id, org_name").in("org_id", orgIds)
      : { data: [] },
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const equipMap = new Map((equipRes.data || []).map((e: any) => [e.equipment_id, e]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spaceMap = new Map((spaceRes.data || []).map((s: any) => [s.space_id, s]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const siteMap = new Map((siteRes.data || []).map((s: any) => [s.site_id, s.site_name]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgMap = new Map((orgRes.data || []).map((o: any) => [o.org_id, o.org_name]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = rows.map((r: any) => {
    const t = r.a_sop_templates;
    const eq = r.equipment_id ? equipMap.get(r.equipment_id) : null;
    const sp = r.space_id ? spaceMap.get(r.space_id) : null;
    return {
      // Assignment fields
      id: r.id,
      template_id: r.template_id,
      owner_kind: r.owner_kind,
      org_id: r.org_id,
      scope_level: r.scope_level,
      site_id: r.site_id,
      equipment_type_id: r.equipment_type_id,
      equipment_id: r.equipment_id,
      space_type: r.space_type,
      space_id: r.space_id,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      retired_at: r.retired_at,
      created_at: r.created_at,
      // Template fields (flattened)
      target_kind: t?.target_kind,
      label: t?.label,
      metric: t?.metric,
      unit: t?.unit,
      min_value: t?.min_value != null ? Number(t.min_value) : null,
      max_value: t?.max_value != null ? Number(t.max_value) : null,
      evaluation_window: t?.evaluation_window,
      notes: t?.notes,
      // Resolved names
      org_name: r.org_id ? orgMap.get(r.org_id) || null : null,
      site_name: r.site_id ? siteMap.get(r.site_id) || null : null,
      equipment_name: eq?.equipment_name || null,
      equipment_group: eq?.equipment_group || null,
      space_name: sp?.name || null,
    };
  });

  return NextResponse.json({ assignments: enriched });
}

/**
 * POST /api/sop-assignments — Create assignment.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const row = {
    template_id: body.template_id,
    owner_kind: body.owner_kind || "org",
    org_id: body.org_id || null,
    scope_level: body.scope_level,
    site_id: body.site_id || null,
    equipment_type_id: body.equipment_type_id || null,
    equipment_id: body.equipment_id || null,
    space_type: body.space_type || null,
    space_id: body.space_id || null,
    effective_from: body.effective_from || null,
    effective_to: body.effective_to || null,
    created_by: body.created_by || null,
  };

  const { data, error } = await supabase
    .from("a_sop_assignments")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[sop-assignments] POST error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignment: data });
}

/**
 * PATCH /api/sop-assignments — Update assignment.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const key of [
    "scope_level", "org_id", "site_id", "equipment_type_id", "equipment_id",
    "space_type", "space_id", "effective_from", "effective_to", "retired_at",
  ]) {
    if (fields[key] !== undefined) updates[key] = fields[key];
  }

  const { data, error } = await supabase
    .from("a_sop_assignments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[sop-assignments] PATCH error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignment: data });
}

/**
 * DELETE /api/sop-assignments?id=...
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Check for compliance rows referencing this assignment
  const { count } = await supabase
    .from("b_sop_compliance_log")
    .select("id", { count: "exact", head: true })
    .eq("sop_assignment_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: "Cannot delete assignment with compliance history. Use Retire instead." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("a_sop_assignments").delete().eq("id", id);

  if (error) {
    console.error("[sop-assignments] DELETE error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
