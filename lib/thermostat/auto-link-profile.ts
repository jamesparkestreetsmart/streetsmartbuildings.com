import { SupabaseClient } from "@supabase/supabase-js";

export interface AutoLinkResult {
  linked: number;
  skipped: number;
  conflicts: ZoneConflict[];
}

export interface ZoneConflict {
  zone_id: string;
  zone_name: string;
  site_name: string;
  existing_profile_name: string;
}

export async function autoLinkProfile(
  supabase: SupabaseClient,
  profileId: string,
  orgId: string,
  scope: string,
  siteId: string | null,
  targetZoneTypes: string[],
  isGlobal: boolean = false
): Promise<AutoLinkResult> {
  if (!targetZoneTypes || targetZoneTypes.length === 0) {
    return { linked: 0, skipped: 0, conflicts: [] };
  }

  // Query candidate zones by scope
  let query = supabase
    .from("a_hvac_zones")
    .select("hvac_zone_id, name, site_id, zone_type, profile_id, a_sites!inner(site_name, org_id)")
    .in("zone_type", targetZoneTypes);

  if (isGlobal) {
    // SSB: all zones across all orgs
  } else if (scope === "org") {
    query = query.eq("a_sites.org_id", orgId);
  } else {
    // site scope
    if (siteId) {
      query = query.eq("site_id", siteId);
    } else {
      return { linked: 0, skipped: 0, conflicts: [] };
    }
  }

  const { data: zones, error } = await query;
  if (error) {
    console.error("[auto-link] query error:", error);
    return { linked: 0, skipped: 0, conflicts: [] };
  }

  if (!zones || zones.length === 0) {
    return { linked: 0, skipped: 0, conflicts: [] };
  }

  // Gather existing profile names for conflict reporting
  const existingProfileIds = [
    ...new Set(zones.filter((z: any) => z.profile_id && z.profile_id !== profileId).map((z: any) => z.profile_id)),
  ];

  let profileNameMap: Record<string, string> = {};
  if (existingProfileIds.length > 0) {
    const { data: existingProfiles } = await supabase
      .from("b_thermostat_profiles")
      .select("profile_id, name")
      .in("profile_id", existingProfileIds);

    if (existingProfiles) {
      for (const p of existingProfiles) {
        profileNameMap[p.profile_id] = p.name;
      }
    }
  }

  let linked = 0;
  let skipped = 0;
  const conflicts: ZoneConflict[] = [];
  const toUpdate: string[] = [];

  for (const zone of zones as any[]) {
    const siteMeta = zone.a_sites;
    const siteName = siteMeta?.site_name || "Unknown";

    if (!zone.profile_id) {
      // No profile assigned → fill empty slot
      toUpdate.push(zone.hvac_zone_id);
      continue;
    }

    if (zone.profile_id === profileId) {
      // Already assigned to this profile → no-op
      continue;
    }

    // Zone has a different profile → never overwrite, regardless of scope
    skipped++;
    conflicts.push({
      zone_id: zone.hvac_zone_id,
      zone_name: zone.name,
      site_name: siteName,
      existing_profile_name: profileNameMap[zone.profile_id] || "Unknown",
    });
  }

  // Batch update zones
  if (toUpdate.length > 0) {
    const { error: updateErr } = await supabase
      .from("a_hvac_zones")
      .update({ profile_id: profileId })
      .in("hvac_zone_id", toUpdate);

    if (updateErr) {
      console.error("[auto-link] update error:", updateErr);
    } else {
      linked = toUpdate.length;
    }
  }

  // Log to b_records_log
  try {
    await supabase.from("b_records_log").insert({
      org_id: orgId,
      site_id: null,
      event_type: "profile_auto_linked",
      event_date: new Date().toISOString().split("T")[0],
      message: `Auto-linked profile to ${linked} zone(s) for types [${targetZoneTypes.join(", ")}]. ${skipped} skipped.`,
      source: "thermostat_profiles",
      created_by: "system",
    });
  } catch (logErr) {
    console.error("[auto-link] log error:", logErr);
  }

  return { linked, skipped, conflicts };
}
