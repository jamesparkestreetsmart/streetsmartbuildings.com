import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/sop-standards/dropdowns?org_id=...&site_id=...
 * Returns dropdown options for the SOP Standards add/edit modal.
 */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const siteId = req.nextUrl.searchParams.get("site_id");

  if (!orgId) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  // Fetch all sites for this org
  const { data: sitesRaw } = await supabase
    .from("a_sites")
    .select("site_id, site_name")
    .eq("org_id", orgId)
    .order("site_name");

  const sites = (sitesRaw || []).map((s: any) => ({
    site_id: s.site_id,
    site_name: s.site_name,
  }));

  // Fetch site IDs for equipment/space queries
  const orgSiteIds = sites.map((s: any) => s.site_id);

  // Fetch distinct equipment types (equipment_type_id) across org
  let equipmentTypes: string[] = [];
  let equipment: { equipment_id: string; equipment_name: string; equipment_type_id: string; equipment_group: string }[] = [];

  if (orgSiteIds.length) {
    const { data: eqRaw } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, equipment_type_id, equipment_group, site_id")
      .in("site_id", orgSiteIds)
      .neq("status", "retired")
      .neq("status", "dummy")
      .order("equipment_name");

    const eqs = eqRaw || [];
    equipmentTypes = [...new Set(eqs.map((e: any) => e.equipment_type_id).filter(Boolean))].sort();
    equipment = eqs.map((e: any) => ({
      equipment_id: e.equipment_id,
      equipment_name: e.equipment_name,
      equipment_type_id: e.equipment_type_id || "",
      equipment_group: e.equipment_group || "Uncategorized",
    }));
  }

  // Fetch spaces — filtered by site if provided
  let spaceTypes: string[] = [];
  let spaces: { space_id: string; name: string; space_type: string }[] = [];

  const spaceSiteIds = siteId ? [siteId] : orgSiteIds;
  if (spaceSiteIds.length) {
    const { data: spRaw } = await supabase
      .from("a_spaces")
      .select("space_id, name, space_type, site_id")
      .in("site_id", spaceSiteIds)
      .order("name");

    const sps = spRaw || [];
    spaceTypes = [...new Set(sps.map((s: any) => s.space_type).filter(Boolean))].sort();
    spaces = sps.map((s: any) => ({
      space_id: s.space_id,
      name: s.name || "Unnamed",
      space_type: s.space_type || "Uncategorized",
    }));
  }

  return NextResponse.json({
    sites,
    equipment_types: equipmentTypes,
    equipment,
    space_types: spaceTypes,
    spaces,
  });
}
