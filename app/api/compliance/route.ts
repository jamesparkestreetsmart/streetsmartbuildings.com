import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const site_id = sp.get("site_id");
  const range_start = sp.get("range_start"); // YYYY-MM-DD
  const range_end = sp.get("range_end"); // YYYY-MM-DD (exclusive)

  if (!site_id || !range_start || !range_end) {
    return NextResponse.json(
      { error: "site_id, range_start, range_end required" },
      { status: 400 }
    );
  }

  try {
    // Use generous UTC window to capture all US timezone period_starts
    const startUTC = `${range_start}T00:00:00Z`;
    const endUTC = `${range_end}T23:59:59Z`;

    // Fetch compliance log rows with assignment → template details
    const { data: logRows, error: logError } = await supabase
      .from("b_sop_compliance_log")
      .select(
        `id, sop_assignment_id, site_id, equipment_id, space_id,
         period_start, period_end, total_readings, compliant_readings, compliance_pct,
         a_sop_assignments!inner (
           id, org_id, scope_level,
           a_sop_templates (
             label, metric, min_value, max_value,
             evaluation_window, unit, notes
           )
         )`
      )
      .eq("site_id", site_id)
      .gte("period_start", startUTC)
      .lt("period_start", endUTC)
      .order("period_start", { ascending: true });

    if (logError) {
      console.error("[api/compliance] Log query error:", logError.message);
      return NextResponse.json({ error: logError.message }, { status: 500 });
    }

    const rows = logRows || [];

    // Collect equipment and space IDs for name resolution
    const equipIds = [...new Set(rows.map((r) => r.equipment_id).filter(Boolean))] as string[];
    const spaceIds = [...new Set(rows.map((r) => r.space_id).filter(Boolean))] as string[];

    // Parallel lookups
    const [equipResult, spaceResult, siteResult] = await Promise.all([
      equipIds.length > 0
        ? supabase
            .from("a_equipments")
            .select("equipment_id, equipment_name, equipment_group")
            .in("equipment_id", equipIds)
        : { data: [] },
      spaceIds.length > 0
        ? supabase
            .from("a_spaces")
            .select("space_id, name, space_type")
            .in("space_id", spaceIds)
        : { data: [] },
      supabase
        .from("a_sites")
        .select("site_id, site_name, timezone, org_id")
        .eq("site_id", site_id)
        .single(),
    ]);

    const equipMap: Record<string, { name: string; group: string }> = {};
    for (const e of equipResult.data || []) {
      equipMap[e.equipment_id] = {
        name: e.equipment_name,
        group: e.equipment_group || "Uncategorized",
      };
    }

    const spaceMap: Record<string, { name: string; type: string }> = {};
    for (const s of spaceResult.data || []) {
      spaceMap[s.space_id] = {
        name: s.name,
        type: s.space_type || "Uncategorized",
      };
    }

    const site = siteResult.data;
    const siteName = site?.site_name || "";
    const timezone = site?.timezone || "America/Chicago";
    const orgId = site?.org_id || "";

    // Fetch org name
    let orgName = "";
    if (orgId) {
      const { data: org } = await supabase
        .from("a_organizations")
        .select("org_name")
        .eq("org_id", orgId)
        .single();
      orgName = org?.org_name || "";
    }

    // Build normalized response rows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized = rows.map((r: any) => {
      const assignment = r.a_sop_assignments;
      const template = assignment?.a_sop_templates;
      return {
        log_id: r.id,
        sop_assignment_id: r.sop_assignment_id,
        equipment_id: r.equipment_id,
        space_id: r.space_id,
        period_start: r.period_start,
        period_end: r.period_end,
        total_readings: r.total_readings,
        compliant_readings: r.compliant_readings,
        compliance_pct: r.compliance_pct != null ? Number(r.compliance_pct) : null,
        // Template fields
        config_label: template?.label || "",
        metric: template?.metric || "",
        min_value: template?.min_value != null ? Number(template.min_value) : null,
        max_value: template?.max_value != null ? Number(template.max_value) : null,
        evaluation_window: template?.evaluation_window || "all_hours",
        unit: template?.unit || "F",
        notes: template?.notes || null,
        // Assignment fields
        config_org_id: assignment?.org_id || null,
        scope_level: assignment?.scope_level || null,
        // Resolved names
        equipment_name: r.equipment_id ? equipMap[r.equipment_id]?.name || "" : null,
        equipment_group: r.equipment_id ? equipMap[r.equipment_id]?.group || "Uncategorized" : null,
        space_name: r.space_id ? spaceMap[r.space_id]?.name || "" : null,
        space_type: r.space_id ? spaceMap[r.space_id]?.type || "Uncategorized" : null,
      };
    });

    return NextResponse.json({
      rows: normalized,
      site: { site_id, site_name: siteName, timezone, org_id: orgId, org_name: orgName },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/compliance] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
