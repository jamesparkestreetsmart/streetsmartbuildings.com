import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// The 13 canonical profile settings fields synced to zone columns
const ZONE_SYNC_FIELDS = [
  "occupied_heat_f", "occupied_cool_f", "occupied_fan_mode", "occupied_hvac_mode",
  "unoccupied_heat_f", "unoccupied_cool_f", "unoccupied_fan_mode", "unoccupied_hvac_mode",
  "guardrail_min_f", "guardrail_max_f",
  "manager_offset_up_f", "manager_offset_down_f", "manager_override_reset_minutes",
] as const;

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

    // 1. Fetch the profile
    const { data: profile, error: profErr } = await supabase
      .from("b_thermostat_profiles")
      .select("*")
      .eq("profile_id", id)
      .single();

    if (profErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // 2. Fetch selected zones
    const { data: zones } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, site_id, thermostat_device_id")
      .in("hvac_zone_id", zone_ids);

    if (!zones || zones.length === 0) {
      return NextResponse.json({ error: "No matching zones found" }, { status: 400 });
    }

    let pushed = 0;
    let skipped = 0;
    const errors: string[] = [];
    const siteSet = new Set<string>();

    for (const zone of zones) {
      // 3a. Re-assign zone to this profile + sync settings columns
      const zoneUpdate: any = { profile_id: profile.profile_id };
      for (const field of ZONE_SYNC_FIELDS) {
        zoneUpdate[field] = profile[field] ?? null;
      }

      const { error: updateErr } = await supabase
        .from("a_hvac_zones")
        .update(zoneUpdate)
        .eq("hvac_zone_id", zone.hvac_zone_id);

      if (updateErr) {
        errors.push(`Failed to update zone ${zone.name}: ${updateErr.message}`);
        skipped++;
        continue;
      }

      // 3b. Write directive to b_thermostat_state (global-push pattern)
      if (zone.thermostat_device_id) {
        const { data: device } = await supabase
          .from("a_devices")
          .select("ha_device_id")
          .eq("device_id", zone.thermostat_device_id)
          .single();

        if (device?.ha_device_id) {
          await supabase
            .from("b_thermostat_state")
            .update({
              eagle_eye_directive: `Profile pushed: ${profile.name}`,
              directive_generated_at: new Date().toISOString(),
            })
            .eq("ha_device_id", device.ha_device_id)
            .eq("site_id", zone.site_id);
        }
      }

      siteSet.add(zone.site_id);
      pushed++;
    }

    // 4. Write to b_records_log
    await supabase.from("b_records_log").insert({
      org_id,
      event_type: "thermostat_profile_push",
      event_date: new Date().toISOString().split("T")[0],
      message: `Pushed profile "${profile.name}" to ${pushed} zones across ${siteSet.size} sites`,
      source: "thermostat_profiles",
      created_by: email,
    });

    return NextResponse.json({
      pushed,
      skipped,
      sites_affected: siteSet.size,
      errors,
    });
  } catch (err: any) {
    console.error("[org-profiles/push] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
