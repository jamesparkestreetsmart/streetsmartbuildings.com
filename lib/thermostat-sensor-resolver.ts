// lib/thermostat-sensor-resolver.ts
// Determines what temperature/humidity reading to use for decisions.

import { SupabaseClient } from "@supabase/supabase-js";

export interface SensorReading {
  temperature_f: number | null;
  humidity_pct: number | null;
  source: "space_weighted" | "thermostat_builtin" | "none";
  stale: boolean;
  last_updated: string | null;
}

/**
 * Resolve the best temperature/humidity reading for a zone.
 *
 * Resolution order depends on zone_temp_source:
 * - "space_weighted_avg": use a_space_sensors weighted average, fallback to thermostat
 * - "thermostat_builtin": use thermostat builtin directly
 * - undefined/null: try space sensors first, then thermostat (legacy behavior)
 */
export async function resolveSensorReading(
  supabase: SupabaseClient,
  siteId: string,
  equipmentId: string | null,
  thermostatState: {
    current_temperature_f: number | null;
    current_humidity?: number | null;
    last_synced_at?: string | null;
  } | null,
  zoneConfig?: { zone_temp_source?: string | null }
): Promise<SensorReading> {
  const FRESH_THRESHOLD_MIN = 10;
  const STALE_THRESHOLD_MIN = 30;

  const zoneTempSource = zoneConfig?.zone_temp_source;

  // If explicitly set to thermostat_builtin, skip space sensors
  if (zoneTempSource === "thermostat_builtin") {
    return resolveThermostatBuiltin(thermostatState, FRESH_THRESHOLD_MIN, STALE_THRESHOLD_MIN);
  }

  // Try space sensors (either explicitly requested or as first attempt in auto mode)
  if (equipmentId && zoneTempSource !== "thermostat_builtin") {
    const spaceReading = await resolveSpaceSensors(
      supabase, siteId, equipmentId, FRESH_THRESHOLD_MIN, STALE_THRESHOLD_MIN
    );
    if (spaceReading) return spaceReading;
  }

  // Fall back to thermostat builtin
  return resolveThermostatBuiltin(thermostatState, FRESH_THRESHOLD_MIN, STALE_THRESHOLD_MIN);
}

/**
 * Resolve temperature from a_space_sensors weighted average.
 * Queries spaces linked to the equipment, then their sensor assignments + entity values.
 */
async function resolveSpaceSensors(
  supabase: SupabaseClient,
  siteId: string,
  equipmentId: string,
  freshThresholdMin: number,
  staleThresholdMin: number
): Promise<SensorReading | null> {
  try {
    // Get spaces linked to this equipment
    const { data: spaces } = await supabase
      .from("a_spaces")
      .select("space_id")
      .eq("site_id", siteId)
      .eq("equipment_id", equipmentId);

    if (!spaces || spaces.length === 0) return null;

    const spaceIds = spaces.map((s: any) => s.space_id);

    // Get temperature sensor assignments for these spaces
    const { data: spaceSensors } = await supabase
      .from("a_space_sensors")
      .select("space_id, entity_id, weight")
      .eq("site_id", siteId)
      .eq("sensor_type", "temperature")
      .in("space_id", spaceIds);

    if (!spaceSensors || spaceSensors.length === 0) return null;

    // Filter to sensors with entity assignments
    const assignedSensors = spaceSensors.filter((s: any) => s.entity_id);
    if (assignedSensors.length === 0) return null;

    // Get entity values from b_entity_sync
    const entityIds = assignedSensors.map((s: any) => s.entity_id);
    const { data: entityValues } = await supabase
      .from("b_entity_sync")
      .select("entity_id, last_state, unit_of_measurement, last_seen_at")
      .eq("site_id", siteId)
      .in("entity_id", entityIds);

    if (!entityValues || entityValues.length === 0) return null;

    const entityMap = new Map(
      entityValues.map((e: any) => [e.entity_id, e])
    );

    // Compute weighted average
    let totalWeight = 0;
    let weightedSum = 0;
    let latestSeen: string | null = null;

    for (const sensor of assignedSensors) {
      const entity = entityMap.get(sensor.entity_id);
      if (!entity || !entity.last_state) continue;

      const temp = parseFloat(entity.last_state);
      if (isNaN(temp)) continue;

      const weight = parseFloat(sensor.weight) || 1.0;
      weightedSum += temp * weight;
      totalWeight += weight;

      if (entity.last_seen_at) {
        if (!latestSeen || new Date(entity.last_seen_at) > new Date(latestSeen)) {
          latestSeen = entity.last_seen_at;
        }
      }
    }

    if (totalWeight === 0) return null;

    const avgTemp = weightedSum / totalWeight;

    const isFresh = latestSeen
      ? (Date.now() - new Date(latestSeen).getTime()) / 60000 < freshThresholdMin
      : false;

    const isStale = latestSeen
      ? (Date.now() - new Date(latestSeen).getTime()) / 60000 > staleThresholdMin
      : true;

    if (isStale) return null;

    return {
      temperature_f: Math.round(avgTemp * 10) / 10,
      humidity_pct: null,
      source: "space_weighted",
      stale: !isFresh,
      last_updated: latestSeen,
    };
  } catch (err) {
    console.error("[sensor-resolver] Space sensor query failed:", err);
    return null;
  }
}

/**
 * Resolve temperature from thermostat builtin state.
 */
function resolveThermostatBuiltin(
  thermostatState: {
    current_temperature_f: number | null;
    current_humidity?: number | null;
    last_synced_at?: string | null;
  } | null,
  freshThresholdMin: number,
  staleThresholdMin: number
): SensorReading {
  if (thermostatState && thermostatState.current_temperature_f != null) {
    const lastSynced = thermostatState.last_synced_at;
    const isStale = lastSynced
      ? (Date.now() - new Date(lastSynced).getTime()) / 60000 > staleThresholdMin
      : false;

    const isFresh = lastSynced
      ? (Date.now() - new Date(lastSynced).getTime()) / 60000 < freshThresholdMin
      : true;

    if (!isStale) {
      return {
        temperature_f: thermostatState.current_temperature_f,
        humidity_pct: (thermostatState as any).current_humidity ?? null,
        source: "thermostat_builtin",
        stale: !isFresh,
        last_updated: lastSynced || null,
      };
    }
  }

  // Both stale or unavailable
  return {
    temperature_f: thermostatState?.current_temperature_f ?? null,
    humidity_pct: null,
    source: "none",
    stale: true,
    last_updated: null,
  };
}
