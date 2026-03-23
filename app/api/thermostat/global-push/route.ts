// app/api/thermostat/global-push/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { profile_id, org_id, zone_types } = body;

    if (!profile_id || !org_id) {
      return NextResponse.json(
        { error: "profile_id and org_id required" },
        { status: 400 }
      );
    }

    // Require owner or admin for org-wide push
    const auth = await requireAdminRole(org_id);
    if (auth instanceof NextResponse) return auth;

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

    // 2. Find eligible zones — ORG profiles target all zones in the org,
    //    SITE profiles target zones already linked to the profile
    let zonesQuery = supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, site_id, thermostat_device_id, zone_type");

    if (profile.scope === "ORG" || profile.scope === "org") {
      zonesQuery = zonesQuery.eq("org_id", profile.org_id) as any;
    } else if (profile.site_id) {
      zonesQuery = zonesQuery.eq("site_id", profile.site_id) as any;
    } else {
      zonesQuery = zonesQuery.eq("profile_id", profile_id) as any;
    }

    const { data: zones, error: zonesErr } = await zonesQuery;

    if (zonesErr) {
      console.error("[global-push] Zones query failed:", zonesErr.message);
      return NextResponse.json({ error: zonesErr.message }, { status: 500 });
    }

    if (!zones || zones.length === 0) {
      return NextResponse.json({
        zones_updated: 0,
        sites_affected: 0,
        directives_generated: 0,
      });
    }

    // Filter by zone types if specified
    const filteredZones = Array.isArray(zone_types) && zone_types.length > 0
      ? zones.filter((z: any) => zone_types.includes(z.zone_type))
      : zones;

    if (filteredZones.length === 0) {
      return NextResponse.json({
        zones_updated: 0,
        sites_affected: 0,
        directives_generated: 0,
      });
    }

    // Build zone_type breakdown for response
    const zoneTypeBreakdown: Record<string, number> = {};
    for (const z of filteredZones) {
      const zt = (z as any).zone_type || "unknown";
      zoneTypeBreakdown[zt] = (zoneTypeBreakdown[zt] || 0) + 1;
    }

    let directivesGenerated = 0;
    const siteSet = new Set<string>();

    for (const zone of filteredZones) {
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
        message: `Global push: profile "${profile.name}" applied to ${filteredZones.length} zones across ${siteSet.size} sites`,
        source: "global_push",
        created_by: auth.email,
      });
    } catch (logErr) {
      console.error("[global-push] POST log error:", logErr);
    }

    return NextResponse.json({
      zones_updated: filteredZones.length,
      sites_affected: siteSet.size,
      directives_generated: directivesGenerated,
      zone_type_breakdown: zoneTypeBreakdown,
    });
  } catch (err: any) {
    console.error("[global-push] POST uncaught:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
