// app/api/thermostat/zone-setpoints/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveZoneSetpointsSync } from "@/lib/setpoint-resolver";

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

// Full columns including new profile/setpoint fields
const ZONE_COLS_FULL =
  "hvac_zone_id, name, zone_type, control_scope, equipment_id, thermostat_device_id, site_id, org_id, profile_id, is_override, occupied_heat_f, occupied_cool_f, unoccupied_heat_f, unoccupied_cool_f, occupied_fan_mode, occupied_hvac_mode, unoccupied_fan_mode, unoccupied_hvac_mode, guardrail_min_f, guardrail_max_f, manager_offset_up_f, manager_offset_down_f, manager_override_reset_minutes, fan_mode, hvac_mode";

// Fallback if new columns don't exist yet
const ZONE_COLS_BASIC =
  "hvac_zone_id, name, zone_type, control_scope, equipment_id, thermostat_device_id, site_id, org_id";

export async function GET(req: NextRequest) {
  try {
    const siteId = req.nextUrl.searchParams.get("site_id");
    if (!siteId) {
      return NextResponse.json({ error: "site_id required" }, { status: 400 });
    }

    // Try with full columns first, fall back to basic
    let zones: any[] | null = null;
    const { data: fullData, error: fullErr } = await supabase
      .from("a_hvac_zones")
      .select(ZONE_COLS_FULL)
      .eq("site_id", siteId)
      .order("name");

    if (fullErr) {
      console.error("[zone-setpoints] Full column query failed, trying basic:", fullErr.message);
      const { data: basicData, error: basicErr } = await supabase
        .from("a_hvac_zones")
        .select(ZONE_COLS_BASIC)
        .eq("site_id", siteId)
        .order("name");

      if (basicErr) {
        console.error("[zone-setpoints] Basic query also failed:", basicErr.message);
        return NextResponse.json({ error: basicErr.message }, { status: 500 });
      }
      zones = basicData;
    } else {
      zones = fullData;
    }

    if (!zones || zones.length === 0) {
      return NextResponse.json([]);
    }

    // Batch-fetch all referenced profiles
    const profileIds = [
      ...new Set(
        zones.filter((z: any) => z.profile_id).map((z: any) => z.profile_id)
      ),
    ];

    const profileMap = new Map<string, any>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("b_thermostat_profiles")
        .select("*")
        .in("profile_id", profileIds);

      for (const p of profiles || []) {
        profileMap.set(p.profile_id, p);
      }
    }

    // Resolve setpoints for each zone
    const result = zones.map((zone: any) => {
      const profile = zone.profile_id
        ? profileMap.get(zone.profile_id)
        : undefined;
      const resolved = resolveZoneSetpointsSync(zone, profile);

      return {
        ...zone,
        resolved_setpoints: resolved,
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[zone-setpoints] GET uncaught:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { hvac_zone_id, ...fields } = body;

    if (!hvac_zone_id) {
      return NextResponse.json(
        { error: "hvac_zone_id required" },
        { status: 400 }
      );
    }

    // Determine update mode
    const update: Record<string, any> = {};

    // Fields that trigger is_override = true (actual setpoint values)
    const SETPOINT_VALUE_FIELDS = [
      "occupied_heat_f", "occupied_cool_f", "unoccupied_heat_f", "unoccupied_cool_f",
      "guardrail_min_f", "guardrail_max_f",
      "manager_offset_up_f", "manager_offset_down_f", "manager_override_reset_minutes",
    ];

    // Fields that can be updated without triggering override (mode/fan changes)
    const MODE_ONLY_FIELDS = [
      "occupied_fan_mode", "occupied_hvac_mode", "unoccupied_fan_mode", "unoccupied_hvac_mode",
      "fan_mode", "hvac_mode",
    ];

    const ALL_SETTABLE_FIELDS = [...SETPOINT_VALUE_FIELDS, ...MODE_ONLY_FIELDS];

    if ("profile_id" in fields && !fields.is_override) {
      // Switching to a profile — clear override
      update.profile_id = fields.profile_id;
      update.is_override = false;
    } else if (ALL_SETTABLE_FIELDS.some((f) => f in fields)) {
      // Copy all provided fields to update
      for (const f of ALL_SETTABLE_FIELDS) {
        if (fields[f] !== undefined) update[f] = fields[f];
      }
      // Only set is_override = true if actual setpoint VALUES are changing
      // Mode/fan-only changes don't trigger override (allows migrations)
      const hasSetpointValueChange = SETPOINT_VALUE_FIELDS.some((f) => f in fields);
      if (hasSetpointValueChange) {
        update.is_override = true;
      }
    } else if (fields.is_override === false && "profile_id" in fields) {
      // Re-link to profile, clear override
      update.profile_id = fields.profile_id;
      update.is_override = false;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("a_hvac_zones")
      .update(update)
      .eq("hvac_zone_id", hvac_zone_id)
      .select("*, site_id, org_id, equipment_id, name")
      .single();

    if (error) {
      console.error("[zone-setpoints] PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the zone change
    try {
      // Look up site timezone so event_date uses local date, not UTC
      const { data: siteInfo } = await supabase
        .from("a_sites")
        .select("timezone")
        .eq("site_id", data.site_id)
        .single();
      const localDate = new Date().toLocaleDateString("en-CA", {
        timeZone: siteInfo?.timezone || "America/Chicago",
      });

      let eventType: string;
      let message: string;

      if (update.profile_id && !update.is_override) {
        // Profile assignment
        const { data: prof } = await supabase
          .from("b_thermostat_profiles")
          .select("name")
          .eq("profile_id", update.profile_id)
          .single();
        eventType = "zone_profile_changed";
        message = `${data.name}: assigned profile "${prof?.name || update.profile_id}"`;
      } else if (update.is_override) {
        // Manual override
        eventType = "zone_override";
        const parts: string[] = [];
        if (update.occupied_heat_f !== undefined) parts.push(`heat: ${update.occupied_heat_f}°F`);
        if (update.occupied_cool_f !== undefined) parts.push(`cool: ${update.occupied_cool_f}°F`);
        if (update.occupied_hvac_mode !== undefined) parts.push(`mode: ${update.occupied_hvac_mode}`);
        if (update.occupied_fan_mode !== undefined) parts.push(`fan: ${update.occupied_fan_mode}`);
        message = `${data.name}: manual override${parts.length > 0 ? `, ${parts.join(", ")}` : ""}`;
      } else {
        eventType = "zone_updated";
        message = `${data.name}: zone settings updated`;
      }

      await supabase.from("b_records_log").insert({
        site_id: data.site_id,
        org_id: data.org_id || null,
        equipment_id: data.equipment_id || null,
        event_type: eventType,
        event_date: localDate,
        message,
        source: "zone_setpoints",
        created_by: callerEmail,
      });
    } catch (logErr) {
      console.error("[zone-setpoints] PATCH log error:", logErr);
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[zone-setpoints] PATCH uncaught:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
