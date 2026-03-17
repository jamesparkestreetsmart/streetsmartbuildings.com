import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/sop-standards/dropdowns?org_id=...&site_id=...&equipment_type_id=...
 * Returns dropdown options for the SOP Standards add/edit modal.
 */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const siteId = req.nextUrl.searchParams.get("site_id");
  const equipTypeFilter = req.nextUrl.searchParams.get("equipment_type_id");
  const scope = req.nextUrl.searchParams.get("scope"); // "ssb" for platform-wide

  if (!orgId && scope !== "ssb") {
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

  const orgSiteIds = sites.map((s: any) => s.site_id);
  const siteNameMap = new Map(sites.map((s: any) => [s.site_id, s.site_name]));

  // Fetch equipment with site names for display labels
  let equipmentTypes: string[] = [];
  let equipment: { equipment_id: string; equipment_name: string; equipment_type_id: string; equipment_group: string; site_name: string; display_label: string }[] = [];

  if (orgSiteIds.length) {
    let eqQuery = supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, equipment_type_id, equipment_group, site_id")
      .in("site_id", orgSiteIds)
      .neq("status", "retired")
      .neq("status", "dummy")
      .order("equipment_name");

    // Filter by equipment_type_id if provided
    if (equipTypeFilter) {
      eqQuery = eqQuery.eq("equipment_type_id", equipTypeFilter);
    }

    const { data: eqRaw } = await eqQuery;
    const eqs = eqRaw || [];
    equipmentTypes = [...new Set(eqs.map((e: any) => e.equipment_type_id).filter(Boolean))].sort();
    equipment = eqs.map((e: any) => {
      const siteName = siteNameMap.get(e.site_id) || "";
      return {
        equipment_id: e.equipment_id,
        equipment_name: e.equipment_name,
        equipment_type_id: e.equipment_type_id || "",
        equipment_group: e.equipment_group || "Uncategorized",
        site_name: siteName,
        display_label: siteName ? `${e.equipment_name} — ${siteName}` : e.equipment_name,
      };
    });

    // If we filtered by type, still return all equipment types for the dropdown
    if (equipTypeFilter) {
      const { data: allEqTypes } = await supabase
        .from("a_equipments")
        .select("equipment_type_id")
        .in("site_id", orgSiteIds)
        .neq("status", "retired")
        .neq("status", "dummy")
        .not("equipment_type_id", "is", null);
      equipmentTypes = [...new Set((allEqTypes || []).map((e: any) => e.equipment_type_id))].sort();
    }
  }

  // For SSB scope: populate equipment types from library instead of a_equipments
  let equipmentTypeOptions: { value: string; label: string }[] = [];
  if (scope === "ssb") {
    const { data: libTypes } = await supabase
      .from("library_equipment_sop_metrics")
      .select("equipment_type_id")
      .eq("enabled", true);

    const uniqueTypeIds = [...new Set((libTypes || []).map((r: any) => r.equipment_type_id))];

    if (uniqueTypeIds.length) {
      const { data: typeNames } = await supabase
        .from("library_equipment_types")
        .select("equipment_type_id, name")
        .in("equipment_type_id", uniqueTypeIds)
        .order("name");

      equipmentTypeOptions = (typeNames || []).map((t: any) => ({
        value: t.equipment_type_id,
        label: t.name || t.equipment_type_id,
      }));
    }
  } else {
    equipmentTypeOptions = equipmentTypes.map((t) => ({ value: t, label: t }));
  }

  // Fetch space types from library (not from instances)
  const { data: librarySpaceTypes } = await supabase
    .from("library_space_types")
    .select("space_type, description")
    .order("space_type");

  const spaceTypes = (librarySpaceTypes || []).map((st: any) => ({
    value: st.space_type,
    label: st.description || st.space_type,
  }));

  // Fetch spaces — filtered by site if provided
  let spaces: { space_id: string; name: string; space_type: string }[] = [];
  const spaceSiteIds = siteId ? [siteId] : orgSiteIds;
  if (spaceSiteIds.length) {
    const { data: spRaw } = await supabase
      .from("a_spaces")
      .select("space_id, name, space_type, site_id")
      .in("site_id", spaceSiteIds)
      .order("name");

    spaces = (spRaw || []).map((s: any) => ({
      space_id: s.space_id,
      name: s.name || "Unnamed",
      space_type: s.space_type || "Uncategorized",
    }));
  }

  // Fetch HVAC zone types for the zone type scope
  let hvacZoneTypes: string[] = [];
  const zoneSiteIds = siteId ? [siteId] : orgSiteIds;
  if (zoneSiteIds.length) {
    const { data: zoneRaw } = await supabase
      .from("a_hvac_zones")
      .select("zone_type")
      .in("site_id", zoneSiteIds)
      .not("zone_type", "is", null);

    hvacZoneTypes = [...new Set((zoneRaw || []).map((z: any) => z.zone_type))].sort();
  }

  return NextResponse.json({
    sites,
    equipment_types: equipmentTypes,
    equipment_type_options: equipmentTypeOptions,
    equipment,
    space_types: spaceTypes,
    spaces,
    hvac_zone_types: hvacZoneTypes,
  });
}
