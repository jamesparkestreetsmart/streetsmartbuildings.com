// lib/ha-push.ts
// Core library for pushing thermostat setpoints to Home Assistant via REST API

import { SupabaseClient } from "@supabase/supabase-js";
import { resolveZoneSetpointsSync } from "@/lib/setpoint-resolver";
import { getZoneSensorReading, getOccupancyReading } from "@/lib/zone-setpoint-logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HAConfig {
  haUrl: string;
  haToken: string;
}

export interface DesiredState {
  entity_id: string;
  hvac_mode: string;
  heat_setpoint_f: number;
  cool_setpoint_f: number;
  fan_mode: string;
}

export interface CurrentState {
  hvac_mode: string;
  current_setpoint_f: number | null;
  target_temp_high_f: number | null;
  target_temp_low_f: number | null;
  fan_mode: string | null;
  current_temperature_f: number | null;
  battery_level: number | null;
}

export interface Guardrails {
  min_f: number;
  max_f: number;
}

export interface PushResult {
  pushed: boolean;
  reason: string;
  actions: string[];
  previous_state: Partial<CurrentState>;
  desired_state: Partial<DesiredState>;
  guardrail_triggered?: boolean;
}

export interface ZonePushResult {
  zone_name: string;
  hvac_zone_id: string;
  entity_id: string;
  pushed: boolean;
  reason: string;
  actions: string[];
}

export interface PushResults {
  results: ZonePushResult[];
  ha_connected: boolean;
  trigger: string;
}

// ─── HA API helpers ───────────────────────────────────────────────────────────

async function haFetch(
  url: string,
  token: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Read-back helper ────────────────────────────────────────────────────────

/**
 * Read actual thermostat state from HA after a push and update b_thermostat_state.
 */
async function readBackThermostatState(
  config: HAConfig,
  entityId: string,
  siteId: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    // Wait a moment for HA to settle after the push
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const res = await haFetch(
      `${config.haUrl}/api/states/${entityId}`,
      config.haToken,
      { method: "GET" },
      10000
    );
    if (!res.ok) {
      console.error(`[ha-push] Read-back failed for ${entityId}: HTTP ${res.status}`);
      return;
    }
    const state = await res.json();
    const attrs = state.attributes || {};

    console.log(
      `[ha-push] Read-back ${entityId}: mode=${state.state}, temp=${attrs.current_temperature}, ` +
      `setpoint=${attrs.temperature}, high=${attrs.target_temp_high}, low=${attrs.target_temp_low}, ` +
      `fan=${attrs.fan_mode}, action=${attrs.hvac_action}`
    );

    await supabase
      .from("b_thermostat_state")
      .update({
        hvac_mode: state.state,
        current_temperature_f: attrs.current_temperature ?? null,
        current_setpoint_f: attrs.temperature ?? null,
        target_temp_high_f: attrs.target_temp_high ?? null,
        target_temp_low_f: attrs.target_temp_low ?? null,
        fan_mode: attrs.fan_mode ?? null,
        current_humidity: attrs.current_humidity ?? null,
        hvac_action: attrs.hvac_action ?? null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("entity_id", entityId)
      .eq("site_id", siteId);
  } catch (err) {
    console.error(`[ha-push] Read-back error for ${entityId}:`, err);
  }
}

// ─── Public functions ─────────────────────────────────────────────────────────

/**
 * Check if Home Assistant is reachable and the token is valid.
 */
export async function checkHAConnection(
  haUrl: string,
  haToken: string
): Promise<boolean> {
  try {
    const res = await haFetch(`${haUrl}/api/`, haToken, { method: "GET" }, 5000);
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Push desired thermostat state to HA, respecting guardrails and skip-if-already-at-target logic.
 */
export async function pushThermostatState(
  config: HAConfig,
  desired: DesiredState,
  current: CurrentState,
  guardrails: Guardrails
): Promise<PushResult> {
  const actions: string[] = [];
  const previous_state: Partial<CurrentState> = { ...current };
  let effectiveDesired = { ...desired };
  let guardrail_triggered = false;

  console.log("[ha-push] Current state:", JSON.stringify(current));
  console.log("[ha-push] Desired state:", JSON.stringify(desired));
  console.log("[ha-push] Mode change needed:", current.hvac_mode, "→", desired.hvac_mode, current.hvac_mode !== desired.hvac_mode ? "(WILL CHANGE)" : "(same)");

  // a. Guardrail check FIRST
  if (
    current.current_temperature_f != null &&
    current.current_temperature_f <= guardrails.min_f
  ) {
    effectiveDesired.hvac_mode = "heat";
    effectiveDesired.heat_setpoint_f = guardrails.min_f + 10;
    guardrail_triggered = true;
    console.log(
      `[ha-push] Guardrail MIN triggered: ${current.current_temperature_f}°F <= ${guardrails.min_f}°F → force heat ${effectiveDesired.heat_setpoint_f}°F`
    );
  } else if (
    current.current_temperature_f != null &&
    current.current_temperature_f >= guardrails.max_f
  ) {
    effectiveDesired.hvac_mode = "cool";
    effectiveDesired.cool_setpoint_f = guardrails.max_f - 10;
    guardrail_triggered = true;
    console.log(
      `[ha-push] Guardrail MAX triggered: ${current.current_temperature_f}°F >= ${guardrails.max_f}°F → force cool ${effectiveDesired.cool_setpoint_f}°F`
    );
  }

  // b. Already at target check
  if (!guardrail_triggered) {
    const modeMatch = current.hvac_mode === effectiveDesired.hvac_mode;
    const fanMatch =
      !effectiveDesired.fan_mode || current.fan_mode === effectiveDesired.fan_mode;

    if (modeMatch && fanMatch) {
      if (
        effectiveDesired.hvac_mode === "heat" &&
        current.current_setpoint_f === effectiveDesired.heat_setpoint_f
      ) {
        return {
          pushed: false,
          reason: "Already at target",
          actions: [],
          previous_state,
          desired_state: effectiveDesired,
        };
      }
      if (
        effectiveDesired.hvac_mode === "cool" &&
        current.current_setpoint_f === effectiveDesired.cool_setpoint_f
      ) {
        return {
          pushed: false,
          reason: "Already at target",
          actions: [],
          previous_state,
          desired_state: effectiveDesired,
        };
      }
      if (
        effectiveDesired.hvac_mode === "heat_cool" &&
        current.target_temp_high_f === effectiveDesired.cool_setpoint_f &&
        current.target_temp_low_f === effectiveDesired.heat_setpoint_f
      ) {
        return {
          pushed: false,
          reason: "Already at target",
          actions: [],
          previous_state,
          desired_state: effectiveDesired,
        };
      }
    }
  }

  // c. Push sequence (order matters)
  const baseUrl = config.haUrl;

  // 1. Set HVAC mode (if different)
  if (current.hvac_mode !== effectiveDesired.hvac_mode) {
    try {
      const modePayload = {
        entity_id: effectiveDesired.entity_id,
        hvac_mode: effectiveDesired.hvac_mode,
      };
      console.log("[ha-push] set_hvac_mode payload:", JSON.stringify(modePayload));
      const res = await haFetch(
        `${baseUrl}/api/services/climate/set_hvac_mode`,
        config.haToken,
        {
          method: "POST",
          body: JSON.stringify(modePayload),
        }
      );
      let resBody: string | null = null;
      try { resBody = await res.text(); } catch { /* ignore */ }
      actions.push(`set_hvac_mode:${effectiveDesired.hvac_mode}`);
      console.log(
        `[ha-push] set_hvac_mode → ${effectiveDesired.hvac_mode} (status: ${res.status}, body: ${resBody?.substring(0, 500)})`
      );
    } catch (err) {
      console.error("[ha-push] set_hvac_mode failed:", err);
      actions.push(`set_hvac_mode:${effectiveDesired.hvac_mode}:FAILED`);
    }

    // 2. Wait 1500ms for Z-Wave thermostat to process mode change
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 3. Set temperature
  try {
    let tempBody: Record<string, any>;
    let tempLabel: string;

    if (effectiveDesired.hvac_mode === "heat") {
      tempBody = {
        entity_id: effectiveDesired.entity_id,
        temperature: effectiveDesired.heat_setpoint_f,
      };
      tempLabel = `set_temperature:${effectiveDesired.heat_setpoint_f}`;
    } else if (effectiveDesired.hvac_mode === "cool") {
      tempBody = {
        entity_id: effectiveDesired.entity_id,
        temperature: effectiveDesired.cool_setpoint_f,
      };
      tempLabel = `set_temperature:${effectiveDesired.cool_setpoint_f}`;
    } else if (effectiveDesired.hvac_mode === "heat_cool") {
      tempBody = {
        entity_id: effectiveDesired.entity_id,
        target_temp_high: effectiveDesired.cool_setpoint_f,
        target_temp_low: effectiveDesired.heat_setpoint_f,
      };
      tempLabel = `set_temperature:${effectiveDesired.heat_setpoint_f}-${effectiveDesired.cool_setpoint_f}`;
    } else {
      // off mode — no temperature to set
      tempBody = {};
      tempLabel = "";
    }

    if (tempLabel) {
      console.log("[ha-push] set_temperature payload:", JSON.stringify(tempBody));
      const res = await haFetch(
        `${baseUrl}/api/services/climate/set_temperature`,
        config.haToken,
        { method: "POST", body: JSON.stringify(tempBody) }
      );
      let resBody: string | null = null;
      try { resBody = await res.text(); } catch { /* ignore */ }
      actions.push(tempLabel);
      console.log(`[ha-push] ${tempLabel} (status: ${res.status}, body: ${resBody?.substring(0, 500)})`);
    }
  } catch (err) {
    console.error("[ha-push] set_temperature failed:", err);
    actions.push("set_temperature:FAILED");
  }

  // 4. Set fan mode (if different)
  if (
    effectiveDesired.fan_mode &&
    current.fan_mode !== effectiveDesired.fan_mode
  ) {
    try {
      const res = await haFetch(
        `${baseUrl}/api/services/climate/set_fan_mode`,
        config.haToken,
        {
          method: "POST",
          body: JSON.stringify({
            entity_id: effectiveDesired.entity_id,
            fan_mode: effectiveDesired.fan_mode,
          }),
        }
      );
      actions.push(`set_fan_mode:${effectiveDesired.fan_mode}`);
      console.log(
        `[ha-push] set_fan_mode → ${effectiveDesired.fan_mode} (status: ${res.status})`
      );
    } catch (err) {
      console.error("[ha-push] set_fan_mode failed:", err);
      actions.push(`set_fan_mode:${effectiveDesired.fan_mode}:FAILED`);
    }
  }

  return {
    pushed: true,
    reason: guardrail_triggered ? "Guardrail override applied" : "Setpoints updated",
    actions,
    previous_state,
    desired_state: effectiveDesired,
    guardrail_triggered,
  };
}

// ─── Shared orchestration function ────────────────────────────────────────────

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

/**
 * Execute the full HA push flow for a site. Used by both the API endpoint
 * and the manifest push route (direct import, no HTTP roundtrip).
 */
export async function executePushForSite(
  supabase: SupabaseClient,
  siteId: string,
  trigger: string,
  haConfig?: HAConfig,
  triggeredBy?: string
): Promise<PushResults> {
  const haUrl = haConfig?.haUrl || process.env.HA_URL;
  const haToken = haConfig?.haToken || process.env.HA_LONG_LIVED_TOKEN;

  if (!haUrl || !haToken) {
    console.log("[ha-push] HA push skipped — connection not configured");
    return { results: [], ha_connected: false, trigger };
  }

  // Test connection
  const connected = await checkHAConnection(haUrl, haToken);
  if (!connected) {
    console.error("[ha-push] HA unreachable");
    // Log failed push
    try {
      const { data: siteInfo } = await supabase
        .from("a_sites")
        .select("org_id, timezone")
        .eq("site_id", siteId)
        .single();
      const localDate = new Date().toLocaleDateString("en-CA", {
        timeZone: siteInfo?.timezone || "America/Chicago",
      });
      await supabase.from("b_records_log").insert({
        site_id: siteId,
        org_id: siteInfo?.org_id || null,
        event_type: "thermostat_push_failed",
        event_date: localDate,
        message: `HA push failed: Home Assistant unreachable (trigger: ${trigger})`,
        source: "ha_push",
        created_by: triggeredBy || "eagle_eyes",
      });
    } catch (logErr) {
      console.error("[ha-push] Failed to log HA unreachable:", logErr);
    }
    return { results: [], ha_connected: false, trigger };
  }

  const config: HAConfig = { haUrl, haToken };

  // Get site info (timezone)
  const { data: site } = await supabase
    .from("a_sites")
    .select("timezone, org_id")
    .eq("site_id", siteId)
    .single();

  const tz = site?.timezone || "America/Chicago";

  // Determine current phase (occupied / unoccupied)
  const nowInTz = new Date().toLocaleString("en-US", { timeZone: tz });
  const nowDate = new Date(nowInTz);
  const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();

  const targetDate = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [y, m, d] = targetDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dayOfWeek = DAY_NAMES[dt.getDay()];

  // Get base store hours
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

  const phase = isOccupied ? "occupied" : "unoccupied";
  console.log(`[ha-push] Phase: ${phase} (time: ${currentMins}min, open: ${openMins}, close: ${closeMins}, closed: ${isClosed})`);

  // Fetch smart start offsets for today
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

  // Load HVAC zones for this site
  const { data: zones } = await supabase
    .from("a_hvac_zones")
    .select(
      "hvac_zone_id, name, zone_type, equipment_id, thermostat_device_id, profile_id, is_override, occupied_heat_f, occupied_cool_f, unoccupied_heat_f, unoccupied_cool_f, occupied_fan_mode, occupied_hvac_mode, unoccupied_fan_mode, unoccupied_hvac_mode, guardrail_min_f, guardrail_max_f, manager_offset_up_f, manager_offset_down_f, manager_override_reset_minutes, fan_mode, hvac_mode"
    )
    .eq("site_id", siteId);

  if (!zones || zones.length === 0) {
    console.log("[ha-push] No HVAC zones found for site");
    return { results: [], ha_connected: true, trigger };
  }

  // Batch-fetch profiles
  const profileIds = [
    ...new Set(zones.filter((z: any) => z.profile_id).map((z: any) => z.profile_id)),
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

  const results: ZonePushResult[] = [];

  for (const zone of zones) {
    if (!zone.thermostat_device_id) continue;

    // Get thermostat device info
    const { data: device } = await supabase
      .from("a_devices")
      .select("device_id, device_name, ha_device_id, equipment_id")
      .eq("device_id", zone.thermostat_device_id)
      .single();

    if (!device) {
      console.log(`[ha-push] No device found for thermostat_device_id: ${zone.thermostat_device_id}`);
      continue;
    }

    // Look up climate entity dynamically
    let climateEntityId: string | null = null;
    if (device.ha_device_id) {
      const { data: entityRow } = await supabase
        .from("b_entity_sync")
        .select("entity_id")
        .eq("ha_device_id", device.ha_device_id)
        .eq("site_id", siteId)
        .ilike("entity_id", "climate.%")
        .limit(1)
        .maybeSingle();
      climateEntityId = entityRow?.entity_id || null;
    }

    if (!climateEntityId) {
      console.log(`[ha-push] No climate entity found for device: ${device.device_name}`);
      continue;
    }

    // Resolve profile setpoints
    const resolved = resolveZoneSetpointsSync(zone, profileMap.get(zone.profile_id));

    // Load current state from b_thermostat_state (needed for adjustments)
    let thermoState: any = null;
    const { data: s1 } = await supabase
      .from("b_thermostat_state")
      .select("*")
      .eq("site_id", siteId)
      .eq("entity_id", climateEntityId)
      .maybeSingle();
    thermoState = s1;

    if (!thermoState && device.ha_device_id) {
      const { data: s2 } = await supabase
        .from("b_thermostat_state")
        .select("*")
        .eq("site_id", siteId)
        .eq("ha_device_id", device.ha_device_id)
        .maybeSingle();
      thermoState = s2;
    }

    // ── Compute active setpoint adjustments ──
    const profile = zone.profile_id ? profileMap.get(zone.profile_id) : undefined;
    const flEnabled = profile?.feels_like_enabled ?? true;
    const flMaxAdj = profile?.feels_like_max_adj_f ?? 2;
    const ssProfileEnabled = profile?.smart_start_enabled ?? true;
    const ssMaxAdj = profile?.smart_start_max_adj_f ?? 1;
    const occEnabled = profile?.occupancy_enabled ?? true;
    const occMaxAdj = profile?.occupancy_max_adj_f ?? 1;

    const sensorReading = await getZoneSensorReading(supabase, siteId, zone.hvac_zone_id, zone.equipment_id, thermoState);

    const profileHeat = isOccupied ? resolved.occupied_heat_f : resolved.unoccupied_heat_f;
    const profileCool = isOccupied ? resolved.occupied_cool_f : resolved.unoccupied_cool_f;

    // Feels Like adjustment
    let feelsLikeAdj = 0;
    if (flEnabled && sensorReading.zone_temp_f !== null && sensorReading.feels_like_temp_f !== null) {
      const delta = sensorReading.feels_like_temp_f - sensorReading.zone_temp_f;
      feelsLikeAdj = Math.max(-flMaxAdj, Math.min(flMaxAdj, Math.round(delta)));
    }

    // Smart Start adjustment
    let smartStartAdj = 0;
    const ssOffset = ssByZone[zone.hvac_zone_id];
    if (ssProfileEnabled && ssOffset && ssOffset > 0 && openMins !== null) {
      const windowStart = openMins - ssOffset;
      const isInSmartStartWindow = currentMins >= windowStart && currentMins < openMins;
      if (isInSmartStartWindow && sensorReading.zone_temp_f !== null) {
        if (sensorReading.zone_temp_f < profileHeat) {
          smartStartAdj = Math.min(ssMaxAdj, 1);
        } else if (sensorReading.zone_temp_f > profileCool) {
          smartStartAdj = Math.max(-ssMaxAdj, -1);
        }
      }
    }

    // Occupancy adjustment
    const occupancyReading = await getOccupancyReading(supabase, siteId, zone.equipment_id);
    const occupancyAdj = occEnabled ? Math.max(-occMaxAdj, occupancyReading.occupancy_adj) : 0;

    // Total adjustment (feels_like + smart_start + occupancy)
    const totalAdj = feelsLikeAdj + smartStartAdj + occupancyAdj;
    console.log(
      `[ha-push] Zone "${zone.name}" adjustments: feels_like=${feelsLikeAdj}, smart_start=${smartStartAdj}, occupancy=${occupancyAdj}, total=${totalAdj}`
    );

    // Build desired state with adjustments applied
    const desired: DesiredState = isOccupied
      ? {
          entity_id: climateEntityId,
          hvac_mode: resolved.occupied_hvac_mode,
          heat_setpoint_f: resolved.occupied_heat_f + totalAdj,
          cool_setpoint_f: resolved.occupied_cool_f + totalAdj,
          fan_mode: resolved.occupied_fan_mode,
        }
      : {
          entity_id: climateEntityId,
          hvac_mode: resolved.unoccupied_hvac_mode,
          heat_setpoint_f: resolved.unoccupied_heat_f + totalAdj,
          cool_setpoint_f: resolved.unoccupied_cool_f + totalAdj,
          fan_mode: resolved.unoccupied_fan_mode,
        };

    // Map generic mode values to HA-compatible values
    if (desired.hvac_mode === "auto") desired.hvac_mode = "heat_cool";
    // Map generic fan mode values to HA T6 Pro fan modes
    if (desired.fan_mode === "auto") desired.fan_mode = "Auto low";
    if (desired.fan_mode === "on") desired.fan_mode = "Low";
    if (desired.fan_mode === "circulate") desired.fan_mode = "Circulation";

    const guardrails: Guardrails = {
      min_f: resolved.guardrail_min_f,
      max_f: resolved.guardrail_max_f,
    };

    const current: CurrentState = {
      hvac_mode: thermoState?.hvac_mode || "",
      current_setpoint_f: thermoState?.current_setpoint_f ?? null,
      target_temp_high_f: thermoState?.target_temp_high_f ?? null,
      target_temp_low_f: thermoState?.target_temp_low_f ?? null,
      fan_mode: thermoState?.fan_mode ?? null,
      current_temperature_f: thermoState?.current_temperature_f ?? null,
      battery_level: thermoState?.battery_level ?? null,
    };

    // Execute the push
    console.log(
      `[ha-push] Zone "${zone.name}" (${climateEntityId}): ${phase} → profile=${profileHeat}/${profileCool}, active=${desired.heat_setpoint_f}/${desired.cool_setpoint_f}, mode=${desired.hvac_mode}, fan=${desired.fan_mode}`
    );

    const pushResult = await pushThermostatState(config, desired, current, guardrails);

    // Update b_thermostat_state with directive info
    const directiveText = pushResult.pushed
      ? `Pushed ${desired.hvac_mode} ${desired.hvac_mode === "heat" ? desired.heat_setpoint_f : desired.hvac_mode === "cool" ? desired.cool_setpoint_f : `${desired.heat_setpoint_f}-${desired.cool_setpoint_f}`}°F (${phase}, profile: ${resolved.profile_name || resolved.source})`
      : thermoState?.eagle_eye_directive || "No push needed";

    if (climateEntityId) {
      await supabase
        .from("b_thermostat_state")
        .update({
          eagle_eye_directive: directiveText,
          directive_generated_at: new Date().toISOString(),
        })
        .eq("entity_id", climateEntityId)
        .eq("site_id", siteId);
    }

    // Read back actual state from HA to confirm push took effect
    if (pushResult.pushed && climateEntityId) {
      await readBackThermostatState(config, climateEntityId, siteId, supabase);
    }

    // Log to b_records_log
    try {
      const hasFailed = pushResult.actions.some((a: string) => a.includes("FAILED"));
      const setpointLabel = desired.hvac_mode === "heat"
        ? `${desired.heat_setpoint_f}°F`
        : desired.hvac_mode === "cool"
        ? `${desired.cool_setpoint_f}°F`
        : desired.hvac_mode === "off"
        ? "off"
        : `${desired.heat_setpoint_f}–${desired.cool_setpoint_f}°F`;

      await supabase.from("b_records_log").insert({
        org_id: site?.org_id || null,
        site_id: siteId,
        equipment_id: zone.equipment_id || null,
        device_id: zone.thermostat_device_id,
        event_type: hasFailed ? "thermostat_push_failed" : "thermostat_push",
        event_date: targetDate,
        source: "ha_push",
        message: pushResult.pushed
          ? `Pushed ${desired.hvac_mode} ${setpointLabel} to ${zone.name || climateEntityId} (${phase}, profile: ${resolved.profile_name || resolved.source}, trigger: ${trigger})`
          : `${zone.name || climateEntityId}: ${pushResult.reason} (${phase}, trigger: ${trigger})`,
        metadata: {
          trigger,
          phase,
          push_result: pushResult,
          entity_id: climateEntityId,
        },
        created_by: triggeredBy || "eagle_eyes",
      });
    } catch (logErr) {
      console.error("[ha-push] Failed to log to b_records_log:", logErr);
    }

    results.push({
      zone_name: zone.name || "",
      hvac_zone_id: zone.hvac_zone_id,
      entity_id: climateEntityId,
      pushed: pushResult.pushed,
      reason: pushResult.reason,
      actions: pushResult.actions,
    });
  }

  console.log(`[ha-push] Push complete for site ${siteId}: ${results.length} zone(s) processed`);
  return { results, ha_connected: true, trigger };
}
