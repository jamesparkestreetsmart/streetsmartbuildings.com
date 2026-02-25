// lib/zone-setpoint-logger.ts
// Logs a snapshot of each managed zone's setpoint state to b_zone_setpoint_log.
// Called by the thermostat-enforce cron after each push cycle.

import { SupabaseClient } from "@supabase/supabase-js";
import { resolveZoneSetpointsSync, ResolvedSetpoints } from "@/lib/setpoint-resolver";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function timeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Compute indoor feels-like from temp + humidity (Steadman / Rothfusz) */
export function computeFeelsLike(tempF: number, humidity: number): number {
  if (tempF < 80) {
    // Simple approximation below 80°F
    return Math.round(tempF + (0.33 * (humidity / 100) * 6.105) - 4.0);
  }
  if (humidity < 40) return Math.round(tempF);
  // Rothfusz regression heat index
  const hi =
    -42.379 +
    2.04901523 * tempF +
    10.14333127 * humidity -
    0.22475541 * tempF * humidity -
    0.00683783 * tempF * tempF -
    0.05481717 * humidity * humidity +
    0.00122874 * tempF * tempF * humidity +
    0.00085282 * tempF * humidity * humidity -
    0.00000199 * tempF * tempF * humidity * humidity;
  return Math.round(hi);
}

// ─── Phase Resolver ───────────────────────────────────────────────────────────

interface PhaseInfo {
  phase: "occupied" | "unoccupied";
  openMins: number | null;
  closeMins: number | null;
  currentMins: number;
}

async function resolvePhase(
  supabase: SupabaseClient,
  siteId: string,
  tz: string
): Promise<PhaseInfo> {
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

  return {
    phase: isOccupied ? "occupied" : "unoccupied",
    openMins,
    closeMins,
    currentMins,
  };
}

// ─── Sensor Reading ───────────────────────────────────────────────────────────

export interface ZoneSensorReading {
  zone_temp_f: number | null;
  zone_humidity: number | null;
  feels_like_temp_f: number | null;
  source: "space_sensors" | "thermostat" | null;
}

/**
 * Computes a weighted space-level average for a given sensor type.
 * Returns null if no sensors have valid readings.
 */
function computeSpaceAvg(
  spaceName: string,
  sensors: { entity_id: string; weight: number }[],
  entityMap: Map<string, { last_state: string | null; last_seen_at: string | null }>
): number | null {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const sensor of sensors) {
    if (!sensor.entity_id) continue;
    const entity = entityMap.get(sensor.entity_id);
    if (!entity?.last_state) continue;
    const val = parseFloat(entity.last_state);
    if (isNaN(val)) continue;
    const w = parseFloat(String(sensor.weight)) || 1.0;
    weightedSum += val * w;
    totalWeight += w;
    console.log("[zone-setpoint-logger] space:", spaceName, "entity:", sensor.entity_id,
      "entity_sync_value:", entity.last_state, "last_seen_at:", entity.last_seen_at,
      "weight:", w);
  }
  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null;
}

export async function getZoneSensorReading(
  supabase: SupabaseClient,
  siteId: string,
  zoneId: string,
  equipmentId: string | null,
  thermostatState: any | null
): Promise<ZoneSensorReading> {
  let zoneTempF: number | null = null;
  let zoneHumidity: number | null = null;
  let source: "space_sensors" | "thermostat" | null = null;

  // STEP A: Get spaces served by this zone's equipment via a_equipment_served_spaces
  if (equipmentId) {
    const { data: servedRows } = await supabase
      .from("a_equipment_served_spaces")
      .select("space_id")
      .eq("equipment_id", equipmentId);

    const spaceIds = (servedRows || []).map((s: any) => s.space_id);
    console.log("[zone-setpoint-logger] zone:", zoneId, "equipment:", equipmentId, "served_spaces:", spaceIds.length);

    if (spaceIds.length > 0) {
      // Get all space sensors (temp + humidity) for these spaces
      const { data: allSensors } = await supabase
        .from("a_space_sensors")
        .select("space_id, entity_id, weight, sensor_type")
        .eq("site_id", siteId)
        .in("sensor_type", ["temperature", "humidity"])
        .in("space_id", spaceIds);

      // Get all entity values in one batch
      const entityIds = (allSensors || []).filter((s: any) => s.entity_id).map((s: any) => s.entity_id);
      const entityMap = new Map<string, { last_state: string | null; last_seen_at: string | null }>();
      if (entityIds.length > 0) {
        const { data: entityValues } = await supabase
          .from("b_entity_sync")
          .select("entity_id, last_state, last_seen_at")
          .eq("site_id", siteId)
          .in("entity_id", entityIds);
        for (const e of entityValues || []) {
          entityMap.set(e.entity_id, { last_state: e.last_state, last_seen_at: e.last_seen_at });
        }
      }

      // Get hvac_zone_weight for each space (default 1.0)
      // Note: hvac_zone_weight column may not exist yet, so default to 1.0
      const { data: spaceWeightRows } = await supabase
        .from("a_spaces")
        .select("space_id, name")
        .in("space_id", spaceIds);
      const spaceWeightMap: Record<string, number> = {};
      const spaceNameMap: Record<string, string> = {};
      for (const sp of spaceWeightRows || []) {
        spaceWeightMap[sp.space_id] = (sp as any).hvac_zone_weight ?? 1.0;
        spaceNameMap[sp.space_id] = sp.name;
      }

      // Group sensors by space_id and type
      const sensorsBySpaceType: Record<string, Record<string, { entity_id: string; weight: number }[]>> = {};
      for (const s of allSensors || []) {
        if (!sensorsBySpaceType[s.space_id]) sensorsBySpaceType[s.space_id] = {};
        if (!sensorsBySpaceType[s.space_id][s.sensor_type]) sensorsBySpaceType[s.space_id][s.sensor_type] = [];
        sensorsBySpaceType[s.space_id][s.sensor_type].push({ entity_id: s.entity_id, weight: s.weight });
      }

      // STEP B: Compute zone averages from space averages
      let tempWeightedSum = 0, tempTotalWeight = 0;
      let humWeightedSum = 0, humTotalWeight = 0;

      for (const spaceId of spaceIds) {
        const zoneWeight = spaceWeightMap[spaceId] ?? 1.0;
        const spaceName = spaceNameMap[spaceId] || spaceId;
        const spaceSensors = sensorsBySpaceType[spaceId] || {};

        // Space avg temperature
        const tempSensors = spaceSensors["temperature"] || [];
        const spaceAvgTemp = computeSpaceAvg(spaceName, tempSensors, entityMap);

        // Space avg humidity
        const humSensors = spaceSensors["humidity"] || [];
        const spaceAvgHum = computeSpaceAvg(spaceName, humSensors, entityMap);

        console.log("[zone-setpoint-logger] space:", spaceName, "temp_sensors:", tempSensors.length, "space_avg_temp:", spaceAvgTemp, "hum_sensors:", humSensors.length, "space_avg_humidity:", spaceAvgHum, "zone_weight:", zoneWeight);

        if (spaceAvgTemp !== null) {
          tempWeightedSum += spaceAvgTemp * zoneWeight;
          tempTotalWeight += zoneWeight;
        }
        if (spaceAvgHum !== null) {
          humWeightedSum += spaceAvgHum * zoneWeight;
          humTotalWeight += zoneWeight;
        }
      }

      if (tempTotalWeight > 0) {
        zoneTempF = Math.round((tempWeightedSum / tempTotalWeight) * 10) / 10;
        source = "space_sensors";
      }
      if (humTotalWeight > 0) {
        zoneHumidity = Math.round((humWeightedSum / humTotalWeight) * 10) / 10;
        if (!source) source = "space_sensors";
      }
    }
  }

  // STEP C: Thermostat fallback
  if (zoneTempF === null && thermostatState?.current_temperature_f != null) {
    zoneTempF = thermostatState.current_temperature_f;
    source = "thermostat";
  }
  if (zoneHumidity === null && thermostatState?.current_humidity != null) {
    zoneHumidity = thermostatState.current_humidity;
    if (source === null) source = "thermostat";
  }

  // STEP D: Compute feels_like_temp_f
  const feelsLike =
    zoneTempF !== null && zoneHumidity !== null ? computeFeelsLike(zoneTempF, zoneHumidity) : null;

  // STEP E: Debug logging
  console.log("[zone-setpoint-logger] zone:", zoneId,
    "zone_temp_f:", zoneTempF,
    "zone_humidity:", zoneHumidity,
    "source:", source,
    "feels_like_temp_f:", feelsLike
  );

  return { zone_temp_f: zoneTempF, zone_humidity: zoneHumidity, feels_like_temp_f: feelsLike, source };
}

// ─── Occupancy Sensor Reading ─────────────────────────────────────────────────

export interface OccupancyReading {
  occupancy_adj: number;
  occupied_sensor_count: number;
}

export async function getOccupancyReading(
  supabase: SupabaseClient,
  siteId: string,
  equipmentId: string | null
): Promise<OccupancyReading> {
  if (!equipmentId) return { occupancy_adj: 0, occupied_sensor_count: 0 };

  // Spaces linked via a_equipment_served_spaces
  const { data: servedSpaces } = await supabase
    .from("a_equipment_served_spaces")
    .select("space_id")
    .eq("equipment_id", equipmentId);

  const spaceIds = (servedSpaces || []).map((s: any) => s.space_id);
  if (spaceIds.length === 0) return { occupancy_adj: 0, occupied_sensor_count: 0 };

  // Get motion sensors assigned to these spaces
  const { data: motionSensors } = await supabase
    .from("a_space_sensors")
    .select("entity_id")
    .eq("site_id", siteId)
    .eq("sensor_type", "motion")
    .in("space_id", spaceIds);

  if (!motionSensors || motionSensors.length === 0) {
    return { occupancy_adj: 0, occupied_sensor_count: 0 };
  }

  const entityIds = motionSensors.filter((s: any) => s.entity_id).map((s: any) => s.entity_id);
  if (entityIds.length === 0) return { occupancy_adj: 0, occupied_sensor_count: 0 };

  // Get current state of motion sensors
  const { data: entityValues } = await supabase
    .from("b_entity_sync")
    .select("entity_id, last_state")
    .eq("site_id", siteId)
    .in("entity_id", entityIds);

  if (!entityValues || entityValues.length === 0) {
    return { occupancy_adj: 0, occupied_sensor_count: 0 };
  }

  let motionDetectedCount = 0;
  for (const entity of entityValues) {
    const state = entity.last_state?.toLowerCase();
    if (state === "on" || state === "true" || state === "1" || state === "detected") {
      motionDetectedCount++;
    }
  }

  return {
    occupancy_adj: motionDetectedCount === 0 ? -1 : 0,
    occupied_sensor_count: motionDetectedCount,
  };
}

// ─── Equipment Sensors ────────────────────────────────────────────────────────

interface EquipmentSensorReading {
  supply_temp_f: number | null;
  return_temp_f: number | null;
  delta_t: number | null;
  power_kw: number | null;
  comp_on: boolean | null;
}

async function getEquipmentSensors(
  supabase: SupabaseClient,
  siteId: string,
  equipmentId: string | null
): Promise<EquipmentSensorReading> {
  const result: EquipmentSensorReading = {
    supply_temp_f: null,
    return_temp_f: null,
    delta_t: null,
    power_kw: null,
    comp_on: null,
  };

  if (!equipmentId) return result;

  // Get sensor mappings from a_sensors (equipment_id → entity_id + label/sensor_type)
  const { data: sensorMappings } = await supabase
    .from("a_sensors")
    .select("entity_id, label, sensor_type")
    .eq("equipment_id", equipmentId);

  if (!sensorMappings || sensorMappings.length === 0) return result;

  const entityIds = sensorMappings.filter((m: any) => m.entity_id).map((m: any) => m.entity_id);
  if (entityIds.length === 0) return result;

  // Get live values from b_entity_sync (include ha_device_id for CT invert lookup)
  const { data: entityValues } = await supabase
    .from("b_entity_sync")
    .select("entity_id, last_state, unit_of_measurement, ha_device_id")
    .eq("site_id", siteId)
    .in("entity_id", entityIds);

  if (!entityValues) return result;

  const entityMap = new Map(entityValues.map((e: any) => [e.entity_id, e]));

  // Fetch ct_inverted for devices linked to this equipment
  const haDeviceIds = [...new Set(entityValues.map((e: any) => e.ha_device_id).filter(Boolean))];
  const ctInvertedByHaId = new Map<string, boolean>();
  if (haDeviceIds.length > 0) {
    const { data: devRows } = await supabase
      .from("a_devices")
      .select("ha_device_id, ct_inverted")
      .in("ha_device_id", haDeviceIds);
    for (const d of devRows || []) {
      if (d.ha_device_id) ctInvertedByHaId.set(d.ha_device_id, d.ct_inverted || false);
    }
  }

  for (const mapping of sensorMappings) {
    if (!mapping.entity_id) continue;
    const entity = entityMap.get(mapping.entity_id);
    if (!entity?.last_state) continue;
    let val = parseFloat(entity.last_state);
    if (isNaN(val)) continue;

    // Determine sensor role from label (format: "Equipment Name — role") or sensor_type
    const role = (mapping.label?.split(" — ")[1] || mapping.sensor_type || "").toLowerCase();

    // Apply CT inversion for power/current roles
    const isCTRole = role.includes("power") || role.includes("compressor") || role.includes("current") || role.includes("energy");
    if (isCTRole && entity.ha_device_id && ctInvertedByHaId.get(entity.ha_device_id)) {
      val = val * -1;
    }

    if (role.includes("supply") && role.includes("air") || role === "supply_air_temp" || role === "supply_temp") {
      result.supply_temp_f = val;
    } else if (role.includes("return") && role.includes("air") || role === "return_air_temp" || role === "return_temp") {
      result.return_temp_f = val;
    } else if (role.includes("delta") || role === "delta_t") {
      result.delta_t = val;
    } else if (role.includes("power")) {
      result.power_kw = val;
    } else if (role.includes("compressor")) {
      result.comp_on = val > 0.5;
    }
  }

  // Compute delta_t from supply/return if not directly available
  if (result.delta_t === null && result.supply_temp_f !== null && result.return_temp_f !== null) {
    result.delta_t = Math.round((result.return_temp_f - result.supply_temp_f) * 10) / 10;
  }

  return result;
}

// ─── Main Logger ──────────────────────────────────────────────────────────────

export async function logZoneSetpointSnapshot(
  supabase: SupabaseClient,
  siteId: string
): Promise<void> {
  try {
    // 1. Get site timezone
    const { data: siteInfo } = await supabase
      .from("a_sites")
      .select("timezone")
      .eq("site_id", siteId)
      .single();

    const tz = siteInfo?.timezone || "America/Chicago";

    // 2. Resolve phase
    const phaseInfo = await resolvePhase(supabase, siteId, tz);

    // 3. Fetch all managed zones for this site
    const { data: zones } = await supabase
      .from("a_hvac_zones")
      .select(
        "hvac_zone_id, equipment_id, thermostat_device_id, profile_id, is_override, occupied_heat_f, occupied_cool_f, unoccupied_heat_f, unoccupied_cool_f, occupied_fan_mode, occupied_hvac_mode, unoccupied_fan_mode, unoccupied_hvac_mode, guardrail_min_f, guardrail_max_f, manager_offset_up_f, manager_offset_down_f, manager_override_reset_minutes, fan_mode, hvac_mode"
      )
      .eq("site_id", siteId)
      .eq("control_scope", "managed")
      .not("thermostat_device_id", "is", null)
      .not("equipment_id", "is", null);

    if (!zones || zones.length === 0) return;

    // 4. Batch-fetch profiles
    const profileIds = [...new Set(zones.filter((z: any) => z.profile_id).map((z: any) => z.profile_id))];
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

    // 5. Get thermostat device → ha_device_id mapping + smart_start_enabled
    const deviceIds = zones.map((z: any) => z.thermostat_device_id).filter(Boolean);
    const { data: devices } = deviceIds.length > 0
      ? await supabase
          .from("a_devices")
          .select("device_id, ha_device_id, smart_start_enabled")
          .in("device_id", deviceIds)
      : { data: [] as any[] };

    const deviceToHa: Record<string, string> = {};
    const deviceSsEnabled: Record<string, boolean> = {};
    for (const dev of devices || []) {
      deviceToHa[dev.device_id] = dev.ha_device_id;
      deviceSsEnabled[dev.device_id] = dev.smart_start_enabled || false;
    }

    // 6. Fetch all thermostat states for this site (keyed by entity_id OR ha_device_id)
    const { data: tStates } = await supabase
      .from("b_thermostat_state")
      .select(
        "entity_id, ha_device_id, current_temperature_f, current_humidity, current_setpoint_f, target_temp_high_f, target_temp_low_f, fan_mode, hvac_action, last_synced_at"
      )
      .eq("site_id", siteId);

    const stateByHaDevice: Record<string, any> = {};
    const stateByEntityId: Record<string, any> = {};
    for (const ts of tStates || []) {
      if (ts.ha_device_id) stateByHaDevice[ts.ha_device_id] = ts;
      if (ts.entity_id) stateByEntityId[ts.entity_id] = ts;
    }

    // 6b. Fetch climate entities from b_entity_sync to map ha_device_id → entity_id
    const haDeviceIds = Object.values(deviceToHa).filter(Boolean);
    const climateEntityByHaDevice: Record<string, string> = {};
    if (haDeviceIds.length > 0) {
      const { data: climateEntities } = await supabase
        .from("b_entity_sync")
        .select("entity_id, ha_device_id")
        .eq("site_id", siteId)
        .eq("domain", "climate")
        .in("ha_device_id", haDeviceIds);
      for (const ce of climateEntities || []) {
        if (ce.ha_device_id && ce.entity_id) {
          climateEntityByHaDevice[ce.ha_device_id] = ce.entity_id;
        }
      }
    }

    // 7. Check smart start log for today
    const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const { data: ssLogs } = await supabase
      .from("b_smart_start_log")
      .select("zone_id, offset_used_minutes")
      .eq("site_id", siteId)
      .eq("date", today);

    const ssByZone: Record<string, number> = {};
    for (const ss of ssLogs || []) {
      if (ss.zone_id && ss.offset_used_minutes > 0) {
        ssByZone[ss.zone_id] = ss.offset_used_minutes;
      }
    }

    // 8. Process each zone
    const rows: any[] = [];

    for (const zone of zones) {
      const profile = zone.profile_id ? profileMap.get(zone.profile_id) : undefined;
      const resolved: ResolvedSetpoints = resolveZoneSetpointsSync(zone, profile);

      // Get thermostat state — try ha_device_id first, then entity_id via climate entity lookup
      const haDeviceId = zone.thermostat_device_id ? deviceToHa[zone.thermostat_device_id] : null;
      let tState = haDeviceId ? stateByHaDevice[haDeviceId] : null;
      if (!tState && haDeviceId) {
        // Fallback: find climate entity for this ha_device_id, then look up by entity_id
        const climateEntityId = climateEntityByHaDevice[haDeviceId];
        if (climateEntityId) {
          tState = stateByEntityId[climateEntityId];
        }
      }
      console.log("[zone-setpoint-logger] zone:", zone.hvac_zone_id, "thermostat_device_id:", zone.thermostat_device_id, "ha_device_id:", haDeviceId, "tState found:", !!tState, "current_temp:", tState?.current_temperature_f, "current_humidity:", tState?.current_humidity);

      // Profile setpoints for current phase
      const profileHeat = phaseInfo.phase === "occupied" ? resolved.occupied_heat_f : resolved.unoccupied_heat_f;
      const profileCool = phaseInfo.phase === "occupied" ? resolved.occupied_cool_f : resolved.unoccupied_cool_f;

      // ── Sensor readings ──
      const sensorReading = await getZoneSensorReading(supabase, siteId, zone.hvac_zone_id, zone.equipment_id, tState);

      // ── Occupancy ──
      const occupancyReading = await getOccupancyReading(supabase, siteId, zone.equipment_id);

      // ── Profile adjustment settings ──
      const flEnabled = profile?.feels_like_enabled ?? true;
      const flMaxAdj = profile?.feels_like_max_adj_f ?? 2;
      const ssProfileEnabled = profile?.smart_start_enabled ?? true;
      const ssMaxAdj = profile?.smart_start_max_adj_f ?? 1;
      const occEnabled = profile?.occupancy_enabled ?? true;
      const occMaxAdj = profile?.occupancy_max_adj_f ?? 1;

      // ── Feels Like Adjustment ──
      let feelsLikeAdj = 0;
      if (flEnabled && sensorReading.zone_temp_f !== null && sensorReading.feels_like_temp_f !== null) {
        const delta = sensorReading.feels_like_temp_f - sensorReading.zone_temp_f;
        feelsLikeAdj = Math.max(-flMaxAdj, Math.min(flMaxAdj, Math.round(delta)));
      }

      // ── Smart Start Adjustment ──
      // Only active during the pre-open window: [openTime - leadMinutes] to [openTime]
      let smartStartAdj = 0;
      const ssOffset = ssByZone[zone.hvac_zone_id];
      if (ssProfileEnabled && ssOffset && ssOffset > 0 && phaseInfo.openMins !== null) {
        const ssLeadMinutes = ssOffset; // lead time from b_smart_start_log
        const windowStart = phaseInfo.openMins - ssLeadMinutes;
        const isInSmartStartWindow = phaseInfo.currentMins >= windowStart && phaseInfo.currentMins < phaseInfo.openMins;
        if (isInSmartStartWindow && sensorReading.zone_temp_f !== null) {
          if (sensorReading.zone_temp_f < profileHeat) {
            smartStartAdj = Math.min(ssMaxAdj, 1); // heating pre-condition
          } else if (sensorReading.zone_temp_f > profileCool) {
            smartStartAdj = Math.max(-ssMaxAdj, -1); // cooling pre-condition
          }
        }
      }

      // ── Occupancy Adjustment ──
      let occupancyAdj = occEnabled
        ? Math.max(-occMaxAdj, occupancyReading.occupancy_adj)
        : 0;

      // ── Manager Adjustment ──
      // Compare thermostat's actual setpoint against the EXPECTED setpoint
      // (profile + non-manager adjustments). Only non-zero if someone manually
      // changed the thermostat beyond what Eagle Eyes computed and pushed.
      let managerAdj = 0;
      if (phaseInfo.phase === "occupied" && tState) {
        const actualSP = tState.current_setpoint_f ?? tState.target_temp_low_f;
        const expectedSP = profileHeat + feelsLikeAdj + smartStartAdj + occupancyAdj;
        if (actualSP != null) {
          const rawOffset = actualSP - expectedSP;
          // Clamp to ±4
          managerAdj = Math.max(-4, Math.min(4, rawOffset));
          // Zero out if very small (rounding)
          if (Math.abs(managerAdj) < 0.5) managerAdj = 0;
        }
      }

      // ── Compute final active setpoints ──
      const totalAdj = feelsLikeAdj + smartStartAdj + occupancyAdj + managerAdj;
      const activeHeat = profileHeat + totalAdj;
      const activeCool = profileCool + totalAdj;

      // ── Equipment sensors ──
      const equipSensors = await getEquipmentSensors(supabase, siteId, zone.equipment_id);

      // ── Build adjustment_factors JSONB ──
      const adjustmentFactors = [
        {
          name: "feels_like",
          heat_adj: feelsLikeAdj,
          cool_adj: feelsLikeAdj,
          value: sensorReading.feels_like_temp_f !== null && sensorReading.zone_temp_f !== null
            ? sensorReading.feels_like_temp_f - sensorReading.zone_temp_f
            : 0,
          reason: !flEnabled
            ? "Disabled by profile"
            : feelsLikeAdj !== 0
            ? `Feels like ${sensorReading.feels_like_temp_f}°F vs actual ${sensorReading.zone_temp_f}°F`
            : "No adjustment",
        },
        {
          name: "smart_start",
          heat_adj: smartStartAdj,
          cool_adj: smartStartAdj,
          value: ssOffset || 0,
          reason: !ssProfileEnabled
            ? "Disabled by profile"
            : smartStartAdj !== 0
            ? `Smart start active, ${ssOffset}min lead`
            : "Not active",
        },
        {
          name: "occupancy",
          heat_adj: occupancyAdj,
          cool_adj: occupancyAdj,
          value: occupancyReading.occupied_sensor_count,
          reason: !occEnabled
            ? "Disabled by profile"
            : occupancyAdj < 0
            ? "No motion detected"
            : occupancyReading.occupied_sensor_count > 0
            ? `${occupancyReading.occupied_sensor_count} sensor(s) active`
            : "No sensors",
        },
        {
          name: "manager",
          heat_adj: managerAdj,
          cool_adj: managerAdj,
          value: managerAdj,
          reason: managerAdj !== 0
            ? `Manager offset ${managerAdj > 0 ? "+" : ""}${managerAdj}°F`
            : "No override",
        },
      ];

      rows.push({
        site_id: siteId,
        hvac_zone_id: zone.hvac_zone_id,
        phase: phaseInfo.phase,
        profile_heat_f: profileHeat,
        profile_cool_f: profileCool,
        feels_like_adj: feelsLikeAdj,
        smart_start_adj: smartStartAdj,
        occupancy_adj: occupancyAdj,
        manager_adj: managerAdj,
        active_heat_f: activeHeat,
        active_cool_f: activeCool,
        zone_temp_f: sensorReading.zone_temp_f,
        zone_humidity: sensorReading.zone_humidity,
        feels_like_temp_f: sensorReading.feels_like_temp_f,
        occupied_sensor_count: occupancyReading.occupied_sensor_count,
        fan_mode: tState?.fan_mode || null,
        hvac_action: tState?.hvac_action || null,
        supply_temp_f: equipSensors.supply_temp_f,
        return_temp_f: equipSensors.return_temp_f,
        delta_t: equipSensors.delta_t,
        power_kw: equipSensors.power_kw,
        comp_on: equipSensors.comp_on,
        adjustment_factors: adjustmentFactors,
      });
    }

    // 9. Batch insert
    if (rows.length > 0) {
      const { error } = await supabase.from("b_zone_setpoint_log").insert(rows);
      if (error) {
        console.error("[zone-setpoint-logger] Insert error:", error.message);
      }
    }
  } catch (err: any) {
    console.error("[zone-setpoint-logger] Error:", err.message);
  }
}
