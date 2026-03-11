import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// The 13 canonical profile settings fields
const PROFILE_FIELDS = [
  "occupied_heat_f", "occupied_cool_f", "occupied_fan_mode", "occupied_hvac_mode",
  "unoccupied_heat_f", "unoccupied_cool_f", "unoccupied_fan_mode", "unoccupied_hvac_mode",
  "guardrail_min_f", "guardrail_max_f",
  "manager_offset_up_f", "manager_offset_down_f", "manager_override_reset_minutes",
] as const;

// Same 13 fields used to sync zone columns (matches global-push pattern)
const ZONE_SYNC_FIELDS = PROFILE_FIELDS;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { org_id, zone_ids } = body;

    if (!org_id || !Array.isArray(zone_ids) || zone_ids.length === 0) {
      return NextResponse.json(
        { error: "org_id and zone_ids[] are required" },
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
      .in("zone_id", zone_ids);

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No matching snapshot items for selected zones" },
        { status: 400 }
      );
    }

    // 3. Verify which zones still exist in the org
    const { data: liveZones } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, site_id, thermostat_device_id")
      .in("hvac_zone_id", items.map((i: any) => i.zone_id));

    const liveZoneMap = new Map((liveZones || []).map((z: any) => [z.hvac_zone_id, z]));

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

      // 4a. Create a new profile from frozen settings — one per zone (profile isolation)
      const profilePayload: any = {
        org_id,
        name: `${snapshot.name} — ${item.zone_name} (Restored ${today})`,
        scope: "site",
      };

      for (const field of PROFILE_FIELDS) {
        profilePayload[field] = item[field] ?? null;
      }

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

      profilesCreated++;

      // 4b. Re-assign zone to new profile + sync 13 settings columns (global-push pattern)
      const zoneUpdate: any = { profile_id: newProfile.profile_id };
      for (const field of ZONE_SYNC_FIELDS) {
        zoneUpdate[field] = item[field] ?? null;
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

      // 4c. Write directive to b_thermostat_state (same as global-push)
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
    await supabase.from("b_records_log").insert({
      org_id,
      event_type: "thermostat_snapshot_restore",
      event_date: today,
      message: `Restored snapshot "${snapshot.name}" to ${pushed} zones — ${profilesCreated} profiles created`,
      source: "thermostat_snapshots",
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
