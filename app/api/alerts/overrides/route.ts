import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: List overrides for a definition, org, or silenced overrides
export async function GET(req: NextRequest) {
  const alertDefId = req.nextUrl.searchParams.get("alert_def_id");
  const orgId = req.nextUrl.searchParams.get("org_id");
  const silenced = req.nextUrl.searchParams.get("silenced");

  if (!alertDefId && !orgId) {
    return NextResponse.json({ error: "alert_def_id or org_id required" }, { status: 400 });
  }

  // Require admin for override management
  const resolvedOrgId = orgId || (alertDefId ? (await supabase.from("b_alert_definitions").select("org_id").eq("id", alertDefId).single()).data?.org_id : null);
  if (!resolvedOrgId) return NextResponse.json({ error: "Could not determine org" }, { status: 400 });
  const auth = await requireAdminRole(resolvedOrgId);
  if (auth instanceof NextResponse) return auth;

  let query = supabase
    .from("b_alert_overrides")
    .select("*")
    .order("created_at", { ascending: false });

  if (alertDefId) {
    query = query.eq("alert_def_id", alertDefId);
  } else if (orgId) {
    query = query.eq("org_id", orgId);
    if (silenced === "true") {
      query = query.eq("enabled", false);
    }
  }

  const { data: overrides, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join site/equipment names for display
  const siteIds = [...new Set((overrides || []).map((o: any) => o.site_id).filter(Boolean))];
  const equipIds = [...new Set((overrides || []).map((o: any) => o.equipment_id).filter(Boolean))];

  let siteNames: Record<string, string> = {};
  let equipNames: Record<string, string> = {};

  if (siteIds.length > 0) {
    const { data: sites } = await supabase
      .from("a_sites")
      .select("site_id, site_name")
      .in("site_id", siteIds);
    for (const s of sites || []) siteNames[s.site_id] = s.site_name;
  }

  if (equipIds.length > 0) {
    const { data: equips } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name")
      .in("equipment_id", equipIds);
    for (const e of equips || []) equipNames[e.equipment_id] = e.equipment_name;
  }

  const enriched = (overrides || []).map((o: any) => ({
    ...o,
    site_name: o.site_id ? siteNames[o.site_id] || null : null,
    equipment_name: o.equipment_id ? equipNames[o.equipment_id] || null : null,
  }));

  return NextResponse.json({ overrides: enriched });
}

// POST: Create a new override
export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    org_id, alert_def_id, site_id, equipment_id,
    threshold_override, severity_override, cooldown_override,
    sustain_override_min, enabled, silence_reason,
  } = body;

  if (!org_id || !alert_def_id) {
    return NextResponse.json({ error: "org_id and alert_def_id required" }, { status: 400 });
  }

  const auth = await requireAdminRole(org_id);
  if (auth instanceof NextResponse) return auth;

  if (enabled === false && !silence_reason) {
    return NextResponse.json({ error: "silence_reason required when disabling" }, { status: 400 });
  }

  const { data: override, error } = await supabase
    .from("b_alert_overrides")
    .insert({
      org_id,
      alert_def_id,
      site_id: site_id || null,
      equipment_id: equipment_id || null,
      threshold_override: threshold_override ?? null,
      severity_override: severity_override || null,
      cooldown_override: cooldown_override ?? null,
      sustain_override_min: sustain_override_min ?? null,
      enabled: enabled ?? true,
      silence_reason: silence_reason || null,
      created_by: auth.email,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An override already exists for this scope" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ override });
}

// PATCH: Update an override
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { override_id, ...updates } = body;

  if (!override_id) return NextResponse.json({ error: "override_id required" }, { status: 400 });

  // Look up org_id from the override and require admin
  const { data: existing } = await supabase.from("b_alert_overrides").select("org_id").eq("override_id", override_id).single();
  if (!existing) return NextResponse.json({ error: "Override not found" }, { status: 404 });
  const auth = await requireAdminRole(existing.org_id);
  if (auth instanceof NextResponse) return auth;

  if (updates.enabled === false && !updates.silence_reason) {
    return NextResponse.json({ error: "silence_reason required when disabling" }, { status: 400 });
  }

  const allowed = [
    "threshold_override", "severity_override", "cooldown_override",
    "sustain_override_min", "enabled", "silence_reason",
    "site_id", "equipment_id",
  ];
  const filtered: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  const { data: override, error } = await supabase
    .from("b_alert_overrides")
    .update(filtered)
    .eq("override_id", override_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ override });
}

// DELETE: Remove an override
export async function DELETE(req: NextRequest) {
  const overrideId = req.nextUrl.searchParams.get("override_id");
  if (!overrideId) return NextResponse.json({ error: "override_id required" }, { status: 400 });

  // Look up org_id and require admin
  const { data: existing } = await supabase.from("b_alert_overrides").select("org_id").eq("override_id", overrideId).single();
  if (!existing) return NextResponse.json({ error: "Override not found" }, { status: 404 });
  const auth = await requireAdminRole(existing.org_id);
  if (auth instanceof NextResponse) return auth;

  const { error } = await supabase
    .from("b_alert_overrides")
    .delete()
    .eq("override_id", overrideId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
