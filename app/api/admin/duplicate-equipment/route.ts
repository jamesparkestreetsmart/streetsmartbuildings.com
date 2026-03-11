import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET  — Diagnose duplicate equipment
 *   ?org_id=...                → org-wide duplicate scan
 *   ?org_id=...&name=...       → search for specific equipment name
 *   ?equipment_id=...          → show all FK references for one equipment
 *
 * POST — Fix a duplicate by remapping references and retiring it
 *   { canonical_id, duplicate_id }
 */

// Tables that may reference equipment_id
const FK_TABLES = [
  { table: "a_equipment_served_spaces", col: "equipment_id" },
  { table: "a_devices", col: "equipment_id" },
  { table: "a_sensors", col: "equipment_id" },
  { table: "a_hvac_zones", col: "equipment_id" },
  { table: "a_spaces", col: "equipment_id" },
  { table: "b_compressor_cycles", col: "equipment_id" },
  { table: "b_anomaly_events", col: "equipment_id" },
  { table: "b_alert_overrides", col: "equipment_id" },
  { table: "b_alert_instances", col: "equipment_id" },
  { table: "b_zone_setpoint_log", col: "equipment_id" },
  { table: "b_records_log", col: "equipment_id" },
];

export async function GET(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get("org_id");
    const name = req.nextUrl.searchParams.get("name");
    const equipmentId = req.nextUrl.searchParams.get("equipment_id");

    // ── Single equipment FK reference check ──
    if (equipmentId) {
      const refs: Record<string, number> = {};
      for (const { table, col } of FK_TABLES) {
        const { count, error } = await supabase
          .from(table)
          .select(col, { count: "exact", head: true })
          .eq(col, equipmentId);
        refs[table] = error ? -1 : (count ?? 0);
      }
      return NextResponse.json({ equipment_id: equipmentId, references: refs });
    }

    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    const auth = await requireAdminRole(orgId);
    if (auth instanceof NextResponse) return auth;

    // ── Search for specific name across all sites ──
    if (name) {
      const { data, error } = await supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, site_id, equipment_group, equipment_type_id, status, created_at, updated_at, retired_at")
        .eq("org_id", orgId)
        .ilike("equipment_name", `%${name}%`)
        .order("site_id")
        .order("created_at");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ matches: data });
    }

    // ── Org-wide duplicate scan: active equipment with same name at same site ──
    const { data: allEquip, error } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, site_id, equipment_group, status, created_at, retired_at")
      .eq("org_id", orgId)
      .is("retired_at", null)
      .order("site_id")
      .order("equipment_name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by (site_id, lower(name)) and find duplicates
    const groups: Record<string, typeof allEquip> = {};
    for (const eq of allEquip || []) {
      const key = `${eq.site_id}::${eq.equipment_name.toLowerCase()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(eq);
    }

    const duplicates = Object.entries(groups)
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({ key, count: items.length, items }));

    return NextResponse.json({
      total_active_equipment: (allEquip || []).length,
      duplicate_groups: duplicates.length,
      duplicates,
    });
  } catch (err: any) {
    console.error("[duplicate-equipment] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal error", stack: err.stack }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
  const { canonical_id, duplicate_id } = await req.json();

  if (!canonical_id || !duplicate_id) {
    return NextResponse.json({ error: "canonical_id and duplicate_id required" }, { status: 400 });
  }

  // Look up both records
  const { data: canonical } = await supabase
    .from("a_equipments")
    .select("equipment_id, equipment_name, site_id, org_id, status")
    .eq("equipment_id", canonical_id)
    .single();

  const { data: duplicate } = await supabase
    .from("a_equipments")
    .select("equipment_id, equipment_name, site_id, org_id, status")
    .eq("equipment_id", duplicate_id)
    .single();

  if (!canonical || !duplicate) {
    return NextResponse.json({ error: "One or both equipment IDs not found" }, { status: 404 });
  }

  if (canonical.org_id !== duplicate.org_id) {
    return NextResponse.json({ error: "Equipment belong to different orgs" }, { status: 400 });
  }

  const auth = await requireAdminRole(canonical.org_id);
  if (auth instanceof NextResponse) return auth;

  // Step 1: Count references on the duplicate
  const refsBefore: Record<string, number> = {};
  for (const { table, col } of FK_TABLES) {
    try {
      const { count } = await supabase
        .from(table)
        .select(col, { count: "exact", head: true })
        .eq(col, duplicate_id);
      refsBefore[table] = count ?? 0;
    } catch {
      refsBefore[table] = -1;
    }
  }

  // Step 2: Remap all references from duplicate → canonical
  const remapped: Record<string, { before: number; after: number }> = {};

  for (const { table, col } of FK_TABLES) {
    if (refsBefore[table] <= 0) continue;

    const { error: updateErr } = await supabase
      .from(table)
      .update({ [col]: canonical_id })
      .eq(col, duplicate_id);

    if (updateErr) {
      console.error(`[duplicate-equipment] Failed to remap ${table}:`, updateErr.message);
      remapped[table] = { before: refsBefore[table], after: -1 };
      continue;
    }

    // Verify
    const { count: afterCount } = await supabase
      .from(table)
      .select(col, { count: "exact", head: true })
      .eq(col, duplicate_id);

    remapped[table] = { before: refsBefore[table], after: afterCount ?? 0 };
  }

  // Step 3: Soft-retire the duplicate
  const { error: retireErr } = await supabase
    .from("a_equipments")
    .update({ retired_at: new Date().toISOString(), status: "retired" })
    .eq("equipment_id", duplicate_id);

  // Step 4: Activity log
  await supabase.from("b_records_log").insert({
    org_id: canonical.org_id,
    site_id: canonical.site_id,
    equipment_id: canonical_id,
    event_type: "duplicate_equipment_merged",
    message: `Merged duplicate "${duplicate.equipment_name}" (${duplicate_id}) into canonical (${canonical_id})`,
    created_by: auth.email,
    details: { canonical_id, duplicate_id, remapped },
  });

  return NextResponse.json({
    success: !retireErr,
    canonical: canonical_id,
    duplicate: duplicate_id,
    retired: !retireErr,
    retire_error: retireErr?.message || null,
    remapped,
  });
  } catch (err: any) {
    console.error("[duplicate-equipment] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal error", stack: err.stack }, { status: 500 });
  }
}
