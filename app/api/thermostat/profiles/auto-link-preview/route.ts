import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get("org_id");
    const scope = req.nextUrl.searchParams.get("scope") || "org";
    const siteId = req.nextUrl.searchParams.get("site_id");
    const profileId = req.nextUrl.searchParams.get("profile_id");
    const targetZoneTypesParam = req.nextUrl.searchParams.get("target_zone_types");

    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    const targetZoneTypes = targetZoneTypesParam
      ? targetZoneTypesParam.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    if (targetZoneTypes.length === 0) {
      return NextResponse.json({ would_link: 0, would_skip: 0, zones: [] });
    }

    // Check if profile is global
    let isGlobal = false;
    if (profileId) {
      const { data: profile } = await supabase
        .from("b_thermostat_profiles")
        .select("is_global, scope, site_id")
        .eq("profile_id", profileId)
        .single();
      if (profile) {
        isGlobal = profile.is_global || false;
      }
    }

    // Query candidate zones
    let query = supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, site_id, zone_type, profile_id, a_sites!inner(site_name, org_id)")
      .in("zone_type", targetZoneTypes);

    if (isGlobal) {
      // SSB: all zones
    } else if (scope === "org") {
      query = query.eq("a_sites.org_id", orgId);
    } else if (siteId) {
      query = query.eq("site_id", siteId);
    }

    const { data: zones, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let wouldLink = 0;
    let wouldSkip = 0;
    const zoneList: any[] = [];

    for (const zone of (zones || []) as any[]) {
      const siteMeta = zone.a_sites;
      const entry = {
        zone_id: zone.hvac_zone_id,
        zone_name: zone.name,
        zone_type: zone.zone_type,
        site_name: siteMeta?.site_name || "Unknown",
        has_profile: !!zone.profile_id,
        current_profile_id: zone.profile_id || null,
      };

      if (!zone.profile_id) {
        wouldLink++;
        zoneList.push({ ...entry, action: "link" });
      } else if (zone.profile_id === profileId) {
        // Already assigned to this profile — no change needed
        zoneList.push({ ...entry, action: "already_linked" });
      } else {
        // Has a different profile — never overwrite
        wouldSkip++;
        zoneList.push({ ...entry, action: "skip" });
      }
    }

    return NextResponse.json({ would_link: wouldLink, would_skip: wouldSkip, zones: zoneList });
  } catch (err: any) {
    console.error("[auto-link-preview] error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
