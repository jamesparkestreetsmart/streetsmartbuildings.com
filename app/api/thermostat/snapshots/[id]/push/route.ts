import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";
import { THERMOSTAT_FUNCTIONAL_FIELDS, snapshotMatchesProfile } from "@/lib/thermostat/profileIdentity";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Use centralized identity fields for zone sync (matches global-push pattern)
const ZONE_SYNC_FIELDS = THERMOSTAT_FUNCTIONAL_FIELDS;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { org_id, zone_ids, zone_id } = body;

    // Support both zone_ids[] (site-wide) and zone_id (single-zone)
    const targetZoneIds: string[] = zone_id
      ? [zone_id]
      : Array.isArray(zone_ids) ? zone_ids : [];

    if (!org_id || targetZoneIds.length === 0) {
      return NextResponse.json(
        { error: "org_id and zone_ids[] or zone_id are required" },
        { status: 400 }
      );
    }

    const auth = await requireAdminRole(org_id);
    if (auth instanceof NextResponse) return auth;
    const { email } = auth;

    // 1. Load snapshot
    const { data: snapshot, error: snapErr } = await supabase
      .from("a_org_thermostat_snapshots")
      .select("*")
      .eq("snapshot_id", id)
      .eq("org_id", org_id)
      .single();

    if (snapErr || !snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    // 2. Load snapshot items for selected zones
    const { data: items } = await supabase
      .from("a_org_thermostat_snapshot_items")
      .select("*")
      .eq("snapshot_id", id)
      .in("zone_id", targetZoneIds);

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No matching snapshot items for selected zones" },
        { status: 400 }
      );
    }

    // 3. Verify which zones still exist in the org + fetch current profile_ids
    const { data: liveZones } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, site_id, thermostat_device_id, profile_id")
      .in("hvac_zone_id", items.map((i: any) => i.zone_id));

    const liveZoneMap = new Map((liveZones || []).map((z: any) => [z.hvac_zone_id, z]));

    // Fetch current profiles for seed+override pattern (Part 3B)
    const currentProfileIds = [...new Set(
      (liveZones || []).filter((z: any) => z.profile_id).map((z: any) => z.profile_id)
    )];
    const currentProfileMap = new Map<string, any>();
    if (currentProfileIds.length > 0) {
      const { data: curProfiles } = await supabase
        .from("b_thermostat_profiles")
        .select("*")
        .in("profile_id", currentProfileIds);
      for (const p of curProfiles || []) {
        currentProfileMap.set(p.profile_id, p);
      }
    }

    const today = new Date().toISOString().split("T")[0];
    let pushed = 0;
    let skipped = 0;
    let profilesCreated = 0;
    const errors: string[] = [];
    const siteSet = new Set<string>();

    // 4. For each snapshot item: create profile, re-assign zone, write directive
    for (const item of items) {
      const liveZone = liveZoneMap.get(item.zone_id);
      if (!liveZone) {
        skipped++;
        continue;
      }

      // 4a. Seed+override: start with current profile values, override with non-null snapshot fields
      const currentProfile = liveZone.profile_id ? currentProfileMap.get(liveZone.profile_id) : null;
      const mergedFields: Record<string, any> = {};
      for (const field of THERMOSTAT_FUNCTIONAL_FIELDS) {
        const snapVal = item[field];
        if (snapVal !== null && snapVal !== undefined) {
          // Snapshot has a value for this field — use it
          mergedFields[field] = snapVal;
        } else if (currentProfile) {
          // Legacy snapshot: field is null — inherit from current profile
          mergedFields[field] = currentProfile[field] ?? null;
        } else {
          mergedFields[field] = null;
        }
      }

      // 4b. Deduplicate: find existing SITE profile with matching settings (partial match)
      const restoredName = `Restored \u2014 ${snapshot.name} \u2014 ${snapshot.snapshot_date}`;

      const { data: existingProfiles } = await supabase
        .from("b_thermostat_profiles")
        .select("*")
        .eq("org_id", org_id)
        .eq("scope", "site")
        .eq("is_system_generated", true);

      let reusedProfile: any = null;
      if (existingProfiles) {
        for (const ep of existingProfiles) {
          if (snapshotMatchesProfile(mergedFields, ep)) { reusedProfile = ep; break; }
        }
      }

      let profileToUse: any;
      if (reusedProfile) {
        // Reuse existing profile, update name
        await supabase
          .from("b_thermostat_profiles")
          .update({ name: restoredName })
          .eq("profile_id", reusedProfile.profile_id);
        profileToUse = { ...reusedProfile, name: restoredName };
      } else {
        // Create new profile with merged fields
        const profilePayload: any = {
          org_id,
          name: restoredName,
          scope: "site",
          site_id: liveZone.site_id || null,
          is_system_generated: true,
          ...mergedFields,
        };

        const { data: newProfile, error: profErr } = await supabase
          .from("b_thermostat_profiles")
          .insert(profilePayload)
          .select()
          .single();

        if (profErr || !newProfile) {
          errors.push(`Failed to create profile for zone ${item.zone_name}: ${profErr?.message}`);
          skipped++;
          continue;
        }
        profileToUse = newProfile;
        profilesCreated++;
      }

      // 4c. Re-assign zone to profile + sync settings columns
      const zoneUpdate: any = { profile_id: profileToUse.profile_id };
      for (const field of ZONE_SYNC_FIELDS) {
        zoneUpdate[field] = mergedFields[field] ?? null;
      }

      const { error: zoneErr } = await supabase
        .from("a_hvac_zones")
        .update(zoneUpdate)
        .eq("hvac_zone_id", item.zone_id);

      if (zoneErr) {
        errors.push(`Failed to update zone ${item.zone_name}: ${zoneErr.message}`);
        skipped++;
        continue;
      }

      // 4d. Write directive to b_thermostat_state (same as global-push)
      if (liveZone.thermostat_device_id) {
        const { data: device } = await supabase
          .from("a_devices")
          .select("ha_device_id")
          .eq("device_id", liveZone.thermostat_device_id)
          .single();

        if (device?.ha_device_id) {
          await supabase
            .from("b_thermostat_state")
            .update({
              eagle_eye_directive: `Snapshot restored: ${snapshot.name}`,
              directive_generated_at: new Date().toISOString(),
            })
            .eq("ha_device_id", device.ha_device_id)
            .eq("site_id", liveZone.site_id);
        }
      }

      siteSet.add(liveZone.site_id);
      pushed++;
    }

    // 5. Write to b_records_log
    const eventType = zone_id ? "zone_snapshot_applied" : "thermostat_snapshot_restore";
    await supabase.from("b_records_log").insert({
      org_id,
      site_id: zone_id && siteSet.size === 1 ? [...siteSet][0] : null,
      event_type: eventType,
      event_date: today,
      message: zone_id
        ? `Applied snapshot "${snapshot.name}" to zone ${items[0]?.zone_name || zone_id}: profile ${pushed > 0 ? "assigned" : "skipped"}`
        : `Restored snapshot "${snapshot.name}" to ${pushed} zones — ${profilesCreated} profiles created`,
      source: "thermostat_profiles",
      metadata: zone_id ? {
        snapshot_id: id,
        snapshot_name: snapshot.name,
        zone_id,
        resulting_profile_id: pushed > 0 ? items[0]?.zone_name : null,
      } : {},
      created_by: email,
    });

    return NextResponse.json({
      pushed,
      skipped,
      profiles_created: profilesCreated,
      sites_affected: siteSet.size,
      errors,
    });
  } catch (err: any) {
    console.error("[snapshots/push] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
