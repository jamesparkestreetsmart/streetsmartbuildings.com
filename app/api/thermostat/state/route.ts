// app/api/thermostat/state/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveZoneSetpointsSync } from "@/lib/setpoint-resolver";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function timeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // 1. Fetch thermostat state
  const { data: states, error } = await supabase
    .from("b_thermostat_state")
    .select(
      "ha_device_id, hvac_mode, hvac_action, current_temperature_f, current_humidity, current_setpoint_f, target_temp_high_f, target_temp_low_f, fan_mode, fan_action, battery_level, last_synced_at, eagle_eye_directive, directive_generated_at, feels_like_indoor_f, feels_like_outdoor_f, outdoor_temp_f, temp_trend_5min, temp_accel_5min, zone_occupancy_status, zone_last_motion_at"
    )
    .eq("site_id", siteId);

  if (error) {
    console.error("[thermostat/state] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Get all thermostat devices for this site (they have equipment_id directly)
  const { data: thermostatDevices } = await supabase
    .from("a_devices")
    .select("device_id, ha_device_id, device_name, equipment_id")
    .eq("site_id", siteId)
    .eq("device_role", "thermostat");

  // 3. Get zones with full setpoint/profile data
  const { data: hvacZones } = await supabase
    .from("a_hvac_zones")
    .select(
      "hvac_zone_id, name, zone_type, equipment_id, thermostat_device_id, profile_id, is_override, occupied_heat_f, occupied_cool_f, unoccupied_heat_f, unoccupied_cool_f, occupied_fan_mode, occupied_hvac_mode, unoccupied_fan_mode, unoccupied_hvac_mode, guardrail_min_f, guardrail_max_f, manager_offset_up_f, manager_offset_down_f, fan_mode, hvac_mode"
    )
    .eq("site_id", siteId);

  // Build maps for resolving equipment_id
  const haToEquipDirect: Record<string, string> = {};
  const haToEquipViaZone: Record<string, string> = {};
  const haToDeviceName: Record<string, string> = {};
  const haToDeviceId: Record<string, string> = {};

  if (thermostatDevices) {
    for (const dev of thermostatDevices) {
      if (dev.equipment_id) haToEquipDirect[dev.ha_device_id] = dev.equipment_id;
      if (dev.device_name) haToDeviceName[dev.ha_device_id] = dev.device_name;
      haToDeviceId[dev.ha_device_id] = dev.device_id;
    }
    if (hvacZones) {
      const deviceIdToHa: Record<string, string> = {};
      for (const dev of thermostatDevices) {
        deviceIdToHa[dev.device_id] = dev.ha_device_id;
      }
      for (const z of hvacZones) {
        if (!z.thermostat_device_id || !z.equipment_id) continue;
        const haId = deviceIdToHa[z.thermostat_device_id];
        if (haId) haToEquipViaZone[haId] = z.equipment_id;
      }
    }
  }

  // Single-thermostat fallback
  const singleFallbackEquipId =
    (states?.length ?? 0) >= 1 && thermostatDevices && thermostatDevices.length === 1 && thermostatDevices[0].equipment_id
      ? thermostatDevices[0].equipment_id
      : null;
  const singleFallbackDeviceName =
    thermostatDevices && thermostatDevices.length === 1 ? thermostatDevices[0].device_name : null;

  // 4. Determine current phase (occupied/unoccupied) from store hours
  const { data: siteInfo } = await supabase
    .from("a_sites")
    .select("timezone")
    .eq("site_id", siteId)
    .single();

  const tz = siteInfo?.timezone || "America/Chicago";
  const nowInTz = new Date().toLocaleString("en-US", { timeZone: tz });
  const nowDate = new Date(nowInTz);
  const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();

  const targetDate = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [y, m, d] = targetDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dayOfWeek = DAY_NAMES[dt.getDay()];

  const { data: baseHours } = await supabase
    .from("b_store_hours")
    .select("open_time, close_time, is_closed")
    .eq("site_id", siteId)
    .eq("day_of_week", dayOfWeek)
    .single();

  let openTime: string | null = baseHours?.open_time || null;
  let closeTime: string | null = baseHours?.close_time || null;
  let isClosed: boolean = baseHours?.is_closed || false;

  // Check exception events
  const { data: events } = await supabase
    .from("b_store_hours_events")
    .select("event_id, rule_id, event_date")
    .eq("site_id", siteId)
    .eq("event_date", targetDate);

  if (events && events.length > 0) {
    const ruleId = events[0].rule_id;
    const { data: rule } = await supabase
      .from("b_store_hours_exception_rules")
      .select("*")
      .eq("rule_id", ruleId)
      .single();

    if (rule) {
      if (rule.rule_type === "date_range_daily") {
        if (targetDate === rule.effective_from_date) {
          openTime = rule.start_day_open;
          closeTime = rule.start_day_close;
          isClosed = false;
        } else if (targetDate === rule.effective_to_date) {
          openTime = rule.end_day_open;
          closeTime = rule.end_day_close;
          isClosed = false;
        } else {
          openTime = rule.middle_days_open;
          closeTime = rule.middle_days_close;
          isClosed = rule.middle_days_closed || false;
        }
      } else {
        isClosed = rule.is_closed ?? isClosed;
        openTime = rule.is_closed ? null : (rule.open_time ?? openTime);
        closeTime = rule.is_closed ? null : (rule.close_time ?? closeTime);
      }
    }
  }

  const openMins = timeToMinutes(openTime);
  const closeMins = timeToMinutes(closeTime);
  const isOccupied =
    !isClosed &&
    openMins !== null &&
    closeMins !== null &&
    currentMins >= openMins &&
    currentMins < closeMins;

  const currentPhase = isOccupied ? "occupied" : "unoccupied";

  // 5. Batch-fetch profiles for zones
  const profileIds = [
    ...new Set((hvacZones || []).filter((z: any) => z.profile_id).map((z: any) => z.profile_id)),
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

  // Build zone lookup: device_id → resolved setpoints
  const zoneByDeviceId = new Map<string, any>();
  const zoneByEquipmentId = new Map<string, any>();
  for (const z of hvacZones || []) {
    const profile = z.profile_id ? profileMap.get(z.profile_id) : undefined;
    const resolved = resolveZoneSetpointsSync(z, profile);
    const entry = { zone: z, resolved };
    if (z.thermostat_device_id) zoneByDeviceId.set(z.thermostat_device_id, entry);
    if (z.equipment_id) zoneByEquipmentId.set(z.equipment_id, entry);
  }

  // 6. Enrich state rows with equipment_id, thermostat_name, and profile setpoints
  const enriched = (states || []).map((s: any) => {
    const equipmentId =
      haToEquipDirect[s.ha_device_id] ||
      haToEquipViaZone[s.ha_device_id] ||
      singleFallbackEquipId ||
      null;
    const thermostatName =
      haToDeviceName[s.ha_device_id] || singleFallbackDeviceName || null;

    // Fix stale "No zone assigned" when zone IS actually linked
    let directive = s.eagle_eye_directive;
    if (directive === "No zone assigned" && equipmentId) {
      directive = "Zone linked \u2014 awaiting next push";
    }

    // Resolve profile setpoints for this thermostat
    const deviceId = haToDeviceId[s.ha_device_id];
    const zoneEntry =
      (deviceId ? zoneByDeviceId.get(deviceId) : null) ||
      (equipmentId ? zoneByEquipmentId.get(equipmentId) : null);

    let profileSetpoints: any = null;
    if (zoneEntry) {
      const r = zoneEntry.resolved;
      profileSetpoints = {
        occupied_heat_f: r.occupied_heat_f,
        occupied_cool_f: r.occupied_cool_f,
        unoccupied_heat_f: r.unoccupied_heat_f,
        unoccupied_cool_f: r.unoccupied_cool_f,
        occupied_hvac_mode: r.occupied_hvac_mode,
        unoccupied_hvac_mode: r.unoccupied_hvac_mode,
        profile_name: r.profile_name,
        source: r.source,
      };
    }

    return {
      ...s,
      equipment_id: equipmentId,
      thermostat_name: thermostatName,
      eagle_eye_directive: directive,
      current_phase: currentPhase,
      profile_setpoints: profileSetpoints,
    };
  });

  // 7. Fetch equipment sensors via a_sensors (mappings) + b_entity_sync (live values)
  const { data: sensorMappings } = await supabase
    .from("a_sensors")
    .select("entity_id, label, sensor_type, equipment_id")
    .eq("site_id", siteId);

  const mappedEntityIds = (sensorMappings || []).map((m: any) => m.entity_id).filter(Boolean);
  let entityLiveData: any[] = [];
  if (mappedEntityIds.length > 0) {
    const { data } = await supabase
      .from("b_entity_sync")
      .select("entity_id, last_state, unit_of_measurement, last_seen_at")
      .eq("site_id", siteId)
      .in("entity_id", mappedEntityIds);
    entityLiveData = data || [];
  }

  const entityMap: Record<string, any> = {};
  for (const e of entityLiveData) entityMap[e.entity_id] = e;

  const equipmentSensors = (sensorMappings || []).map((m: any) => {
    const role = m.label?.split(" — ")[1] || m.sensor_type || null;
    const live = entityMap[m.entity_id] || {};
    return {
      equipment_id: m.equipment_id,
      entity_id: m.entity_id,
      sensor_role: role,
      device_class: m.sensor_type,
      last_state: live.last_state ?? null,
      unit_of_measurement: live.unit_of_measurement ?? null,
      last_seen_at: live.last_seen_at ?? null,
    };
  });

  return NextResponse.json({
    thermostat_states: enriched,
    equipment_sensors: equipmentSensors,
    current_phase: currentPhase,
  });
}
