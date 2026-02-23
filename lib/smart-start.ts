/**
 * Smart Start calculation engine.
 * Determines optimal HVAC pre-conditioning lead time based on:
 * - Indoor/outdoor temperature delta
 * - Historical ramp rate (from temp history)
 * - Humidity adjustment
 * - Per-zone configurable settings
 * - Full calculation transparency for Logic Map display
 */

import { getAvgRampRate } from "./temp-trend";
import { getLatestWeather } from "./weather";

// ─── Types ─────────────────────────────────────────────────────────────

export interface SmartStartCalc {
  // Inputs
  indoor_temp: number;
  outdoor_temp: number | null;
  indoor_humidity: number | null;
  feels_like_indoor: number | null;
  occupied_heat_setpoint: number;
  occupied_cool_setpoint: number;

  // Targets
  target_temp: number; // setpoint + buffer
  target_mode: "heat" | "cool";
  delta_needed: number; // degrees to change

  // Rate
  avg_ramp_rate: number | null; // °F/min from history
  current_trend: number | null; // °F/min right now
  rate_used: number; // the rate we're using for calc
  rate_source: "historical" | "current" | "default";

  // Humidity adjustment
  humidity_feels_offset: number; // how many °F humidity adds/removes
  humidity_time_adjustment: number; // minutes added/removed

  // Occupancy
  zone_occupancy_status: string | null;
  zone_no_motion_minutes: number | null;
  occupancy_override: boolean;

  // Result
  base_lead_minutes: number;
  adjusted_lead_minutes: number;
  final_offset_minutes: number;
  start_time_minutes: number; // minutes from midnight
  confidence: "low" | "medium" | "high";
}

// ─── Per-zone settings (from a_hvac_zones columns) ─────────────────────

export interface SmartStartSettings {
  buffer_degrees: number; // default 1
  humidity_multiplier: number; // default 1.0
  min_lead_minutes: number; // default 10
  max_lead_minutes: number; // default 90
  rate_override: number | null; // null = auto
}

const DEFAULT_SETTINGS: SmartStartSettings = {
  buffer_degrees: 1,
  humidity_multiplier: 1.0,
  min_lead_minutes: 10,
  max_lead_minutes: 90,
  rate_override: null,
};

// Default ramp rates when no history available
const DEFAULT_HEAT_RATE = 0.15; // °F/min — conservative
const DEFAULT_COOL_RATE = 0.1; // °F/min — cooling is slower

// ─── Load per-zone settings ────────────────────────────────────────────

async function loadZoneSettings(
  supabase: any,
  zoneId: string | null
): Promise<SmartStartSettings> {
  if (!zoneId) return DEFAULT_SETTINGS;

  const { data } = await supabase
    .from("a_hvac_zones")
    .select(
      "smart_start_buffer_degrees, smart_start_humidity_multiplier, " +
        "smart_start_min_lead_minutes, smart_start_max_lead_minutes, " +
        "smart_start_rate_override"
    )
    .eq("hvac_zone_id", zoneId)
    .single();

  if (!data) return DEFAULT_SETTINGS;

  return {
    buffer_degrees: data.smart_start_buffer_degrees ?? DEFAULT_SETTINGS.buffer_degrees,
    humidity_multiplier: data.smart_start_humidity_multiplier ?? DEFAULT_SETTINGS.humidity_multiplier,
    min_lead_minutes: data.smart_start_min_lead_minutes ?? DEFAULT_SETTINGS.min_lead_minutes,
    max_lead_minutes: data.smart_start_max_lead_minutes ?? DEFAULT_SETTINGS.max_lead_minutes,
    rate_override: data.smart_start_rate_override ?? null,
  };
}

// ─── Main calculation ──────────────────────────────────────────────────

export async function calculateSmartStart(
  supabase: any,
  siteId: string,
  deviceId: string,
  zoneId: string | null,
  storeOpenMinutes: number, // minutes from midnight
  occupiedHeat: number,
  occupiedCool: number
): Promise<SmartStartCalc> {
  // Load per-zone settings
  const settings = await loadZoneSettings(supabase, zoneId);

  // ─── Gather inputs ─────────────────────────────────────────────

  // Current thermostat state
  const { data: state } = await supabase
    .from("b_thermostat_state")
    .select(
      "current_temperature_f, current_humidity, outdoor_temp_f, " +
        "feels_like_indoor_f, temp_trend_5min, " +
        "zone_occupancy_status, zone_no_motion_minutes"
    )
    .eq("site_id", siteId)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .single();

  const indoorTemp = state?.current_temperature_f || 65;
  const humidity = state?.current_humidity || null;
  const outdoorTemp = state?.outdoor_temp_f || null;
  const feelsLike = state?.feels_like_indoor_f || null;
  const currentTrend = state?.temp_trend_5min || null;
  const occupancyStatus = state?.zone_occupancy_status || null;
  const noMotionMin = state?.zone_no_motion_minutes || null;

  // ─── Determine heat vs cool ────────────────────────────────────

  const midpoint = (occupiedHeat + occupiedCool) / 2;
  const targetMode = indoorTemp < midpoint ? "heat" : "cool";

  const targetTemp =
    targetMode === "heat"
      ? occupiedHeat + settings.buffer_degrees // heat to setpoint + buffer
      : occupiedCool - settings.buffer_degrees; // cool to setpoint - buffer

  const deltaDeg = Math.abs(targetTemp - indoorTemp);

  // ─── Get ramp rate ─────────────────────────────────────────────

  let rateUsed: number;
  let rateSource: "historical" | "current" | "default";
  let historicalRate: number | null = null;

  if (settings.rate_override) {
    rateUsed = settings.rate_override;
    rateSource = "historical"; // treat override as "known"
  } else {
    historicalRate = await getAvgRampRate(supabase, deviceId, targetMode === "heat" ? "heating" : "cooling");

    if (historicalRate && historicalRate > 0.01) {
      rateUsed = historicalRate;
      rateSource = "historical";
    } else if (currentTrend && Math.abs(currentTrend) > 0.01) {
      rateUsed = Math.abs(currentTrend);
      rateSource = "current";
    } else {
      rateUsed = targetMode === "heat" ? DEFAULT_HEAT_RATE : DEFAULT_COOL_RATE;
      rateSource = "default";
    }
  }

  // ─── Outdoor temp adjustment (for default rates only) ──────────
  // Colder outside = faster heat loss = need more lead time
  if (
    rateSource === "default" &&
    outdoorTemp !== null &&
    targetMode === "heat"
  ) {
    const outdoorDelta = 65 - outdoorTemp; // degrees below "mild" baseline
    if (outdoorDelta > 40) {
      rateUsed *= 0.6;
    } else if (outdoorDelta > 20) {
      rateUsed *= 0.8;
    }
  }

  // ─── Base lead time ────────────────────────────────────────────

  const baseLeadMin = deltaDeg / rateUsed;

  // ─── Humidity adjustment ───────────────────────────────────────
  // High humidity makes heating less effective (moisture absorbs energy)
  // Low humidity makes cooling less effective (no evaporative help)

  let humidityFeelsOffset = 0;
  let humidityTimeAdj = 0;

  if (humidity !== null) {
    if (targetMode === "heat" && humidity > 55) {
      // High humidity during heating: takes longer
      humidityFeelsOffset = Math.round((humidity - 55) * 0.1);
      humidityTimeAdj = Math.round(((humidity - 55) / 10) * 5);
    } else if (targetMode === "cool" && humidity > 60) {
      // High humidity during cooling: feels warmer, takes longer
      humidityFeelsOffset = Math.round((humidity - 60) * 0.15);
      humidityTimeAdj = Math.round(((humidity - 60) / 10) * 5);
    } else if (targetMode === "heat" && humidity < 30) {
      // Low humidity during heating: dry air heats faster
      humidityTimeAdj = -Math.round(((30 - humidity) / 10) * 3);
    }
  }

  // Apply humidity multiplier from settings
  humidityTimeAdj = Math.round(humidityTimeAdj * settings.humidity_multiplier);

  // ─── Occupancy check ───────────────────────────────────────────
  // If someone is already in the building early, trigger immediately
  const occupancyOverride =
    occupancyStatus === "occupied" &&
    noMotionMin !== null &&
    noMotionMin < 10;

  // ─── Final calculation ─────────────────────────────────────────

  const adjustedLead = baseLeadMin + humidityTimeAdj;
  const finalOffset = Math.max(
    settings.min_lead_minutes,
    Math.min(settings.max_lead_minutes, Math.round(adjustedLead))
  );
  const startTime = storeOpenMinutes - finalOffset;

  // Confidence level
  let confidence: "low" | "medium" | "high" = "low";
  if (
    rateSource === "historical" &&
    humidity !== null &&
    outdoorTemp !== null
  ) {
    confidence = "high";
  } else if (rateSource !== "default" || humidity !== null) {
    confidence = "medium";
  }

  return {
    indoor_temp: indoorTemp,
    outdoor_temp: outdoorTemp,
    indoor_humidity: humidity,
    feels_like_indoor: feelsLike,
    occupied_heat_setpoint: occupiedHeat,
    occupied_cool_setpoint: occupiedCool,
    target_temp: targetTemp,
    target_mode: targetMode,
    delta_needed: Math.round(deltaDeg * 10) / 10,
    avg_ramp_rate: historicalRate,
    current_trend: currentTrend,
    rate_used: Math.round(rateUsed * 1000) / 1000,
    rate_source: rateSource,
    humidity_feels_offset: humidityFeelsOffset,
    humidity_time_adjustment: humidityTimeAdj,
    zone_occupancy_status: occupancyStatus,
    zone_no_motion_minutes: noMotionMin,
    occupancy_override: occupancyOverride,
    base_lead_minutes: Math.round(baseLeadMin),
    adjusted_lead_minutes: Math.round(adjustedLead),
    final_offset_minutes: finalOffset,
    start_time_minutes: startTime,
    confidence,
  };
}

// ─── Persist calculation to b_smart_start_log ──────────────────────────

export async function persistSmartStartCalc(
  supabase: any,
  siteId: string,
  deviceId: string,
  zoneId: string | null,
  scheduledOpenTime: string, // "HH:MM:SS"
  calc: SmartStartCalc
) {
  const today = new Date().toISOString().split("T")[0];

  return supabase.from("b_smart_start_log").upsert(
    {
      device_id: deviceId,
      site_id: siteId,
      zone_id: zoneId,
      date: today,
      scheduled_open_time: scheduledOpenTime,
      hvac_start_time: minutesToTimeStr(calc.start_time_minutes),
      offset_used_minutes: calc.final_offset_minutes,
      target_setpoint_f: calc.target_temp,
      indoor_temp_at_calc: calc.indoor_temp,
      outdoor_temp_at_calc: calc.outdoor_temp,
      indoor_humidity_at_calc: calc.indoor_humidity,
      feels_like_indoor_at_calc: calc.feels_like_indoor,
      temp_trend_at_calc: calc.current_trend,
      heating_rate_avg: calc.avg_ramp_rate,
      humidity_adjustment_minutes: calc.humidity_time_adjustment,
      occupancy_override: calc.occupancy_override,
      next_recommended_offset: calc.final_offset_minutes,
      confidence: calc.confidence,
      algorithm_version: 2,
      calculation_detail: calc,
      hit_guardrail:
        calc.final_offset_minutes === calc.start_time_minutes || // edge case
        calc.final_offset_minutes <= 10 ||
        calc.final_offset_minutes >= 90,
    },
    { onConflict: "device_id,date" }
  );
}

function minutesToTimeStr(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}:00`;
}
