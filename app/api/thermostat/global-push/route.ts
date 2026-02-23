// app/api/thermostat/global-push/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getCallerEmail(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.email || "system";
  } catch { return "system"; }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { profile_id, org_id } = body;

    if (!profile_id || !org_id) {
      return NextResponse.json(
        { error: "profile_id and org_id required" },
        { status: 400 }
      );
    }

    // 1. Fetch the profile
    const { data: profile, error: profileErr } = await supabase
      .from("b_thermostat_profiles")
      .select("*")
      .eq("profile_id", profile_id)
      .single();

    if (profileErr || !profile) {
      console.error("[global-push] Profile fetch error:", profileErr);
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // 2. Find all zones linked to this profile
    // Try with is_override filter first, fall back without it
    let zones: any[] | null = null;
    const { data: zonesData, error: zonesErr } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, site_id, thermostat_device_id")
      .eq("profile_id", profile_id)
      .eq("is_override", false);

    if (zonesErr) {
      console.error("[global-push] Zones query with is_override failed:", zonesErr.message);
      // Fallback: just filter by profile_id
      const { data: fallbackZones, error: fallbackErr } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id, name, site_id, thermostat_device_id")
        .eq("profile_id", profile_id);

      if (fallbackErr) {
        console.error("[global-push] Zones fallback also failed:", fallbackErr.message);
        return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
      }
      zones = fallbackZones;
    } else {
      zones = zonesData;
    }

    if (!zones || zones.length === 0) {
      return NextResponse.json({
        zones_updated: 0,
        sites_affected: 0,
        directives_generated: 0,
      });
    }

    let directivesGenerated = 0;
    const siteSet = new Set<string>();

    for (const zone of zones) {
      siteSet.add(zone.site_id);

      // Update zone's setpoint columns to match profile (all fields)
      const { error: updateErr } = await supabase
        .from("a_hvac_zones")
        .update({
          occupied_heat_f: profile.occupied_heat_f,
          occupied_cool_f: profile.occupied_cool_f,
          unoccupied_heat_f: profile.unoccupied_heat_f,
          unoccupied_cool_f: profile.unoccupied_cool_f,
          occupied_fan_mode: profile.occupied_fan_mode,
          occupied_hvac_mode: profile.occupied_hvac_mode,
          unoccupied_fan_mode: profile.unoccupied_fan_mode,
          unoccupied_hvac_mode: profile.unoccupied_hvac_mode,
          guardrail_min_f: profile.guardrail_min_f,
          guardrail_max_f: profile.guardrail_max_f,
          manager_offset_up_f: profile.manager_offset_up_f,
          manager_offset_down_f: profile.manager_offset_down_f,
          manager_override_reset_minutes: profile.manager_override_reset_minutes,
        })
        .eq("hvac_zone_id", zone.hvac_zone_id);

      if (updateErr) {
        console.error("[global-push] Zone update error for", zone.hvac_zone_id, ":", updateErr.message);
        // Continue with other zones
      }

      // Find thermostat device to get ha_device_id
      if (zone.thermostat_device_id) {
        const { data: device } = await supabase
          .from("a_devices")
          .select("ha_device_id")
          .eq("device_id", zone.thermostat_device_id)
          .single();

        if (device?.ha_device_id) {
          const directiveText = `Profile updated: ${profile.name}`;

          // Write directive to b_thermostat_state
          await supabase
            .from("b_thermostat_state")
            .update({
              eagle_eye_directive: directiveText,
              directive_generated_at: new Date().toISOString(),
            })
            .eq("ha_device_id", device.ha_device_id)
            .eq("site_id", zone.site_id);

          directivesGenerated++;
        }
      }
    }

    // Log the global push
    try {
      await supabase.from("b_records_log").insert({
        org_id,
        site_id: null,
        event_type: "global_push",
        event_date: new Date().toISOString().split("T")[0],
        message: `Global push: profile "${profile.name}" applied to ${zones.length} zones across ${siteSet.size} sites`,
        source: "global_push",
        created_by: callerEmail,
      });
    } catch (logErr) {
      console.error("[global-push] POST log error:", logErr);
    }

    return NextResponse.json({
      zones_updated: zones.length,
      sites_affected: siteSet.size,
      directives_generated: directivesGenerated,
    });
  } catch (err: any) {
    console.error("[global-push] POST uncaught:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
