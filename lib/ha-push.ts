// lib/ha-push.ts
// Core library for pushing thermostat setpoints to Home Assistant via REST API

import { SupabaseClient } from "@supabase/supabase-js";
import { resolveZoneSetpointsSync } from "@/lib/setpoint-resolver";
import { siteLocalDate } from "@/lib/utils/site-date";
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

// Zone types that support thermostat push control
const PUSHABLE_ZONE_TYPES = ["customer", "employee"];

// ─── ha_device_id normalizer ─────────────────────────────────────────────────
import { normalizeHaDeviceId } from "@/lib/thermostat/normalize-device-id";

// ─── HA API helpers ───────────────────────────────────────────────────────────

export async function haFetch(
  url: string,
  token: string,
  options: RequestInit = {},
  timeoutMs = 8000
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
  supabase: SupabaseClient,
  desired?: DesiredState
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

    // Post-push verification: compare actual HA state against desired
    if (desired) {
      const modeMatch = state.state === desired.hvac_mode;
      const heatMatch = desired.hvac_mode === "heat"
        ? attrs.temperature === desired.heat_setpoint_f
        : attrs.target_temp_low === desired.heat_setpoint_f;
      const coolMatch = desired.hvac_mode === "cool"
        ? attrs.temperature === desired.cool_setpoint_f
        : attrs.target_temp_high === desired.cool_setpoint_f;
      const verified = modeMatch && heatMatch && coolMatch;

      console.log(
        `[ha-push] Post-push verification ${entityId}: `
        + `${verified ? "CONFIRMED" : "MISMATCH"} — `
        + `mode=${state.state}(want ${desired.hvac_mode}), `
        + `heat=${attrs.target_temp_low ?? attrs.temperature}(want ${desired.heat_setpoint_f}), `
        + `cool=${attrs.target_temp_high ?? attrs.temperature}(want ${desired.cool_setpoint_f})`
      );

      if (!verified) {
        try {
          await supabase.from("b_records_log").insert({
            site_id: siteId,
            event_type: "thermostat_push_unverified",
            message: `Post-push state mismatch for ${entityId}: HA reports mode=${state.state} but desired=${desired.hvac_mode}`,
            source: "ha_push",
            created_by: "system",
            metadata: {
              entity_id: entityId,
              desired_mode: desired.hvac_mode,
              actual_mode: state.state,
              desired_heat: desired.heat_setpoint_f,
              actual_heat: attrs.target_temp_low ?? attrs.temperature,
              desired_cool: desired.cool_setpoint_f,
              actual_cool: attrs.target_temp_high,
              verified,
            },
          });
        } catch (logErr) {
          console.error("[ha-push] Failed to log post-push mismatch:", logErr);
        }
      }
    }
  } catch (err) {
    console.error(`[ha-push] Read-back error for ${entityId}:`, err);
  }
}

// ─── Public functions ─────────────────────────────────────────────────────────

/**
 * Check if Home Assistant is reachable and the token is valid.
 * Returns structured result with failure reason for diagnostics.
 */
export async function checkHAConnection(
  haUrl: string,
  haToken: string,
  timeoutMs = 12000
): Promise<{ connected: boolean; failureReason?: string }> {
  try {
    const res = await haFetch(`${haUrl}/api/`, haToken, { method: "GET" }, timeoutMs);
    if (res.status === 200) {
      return { connected: true };
    }
    if (res.status === 401) {
      console.error("[ha-push] HA auth failed — token invalid or expired");
      return { connected: false, failureReason: "auth_failed" };
    }
    if (res.status === 502 || res.status === 503) {
      console.error(`[ha-push] HA gateway/availability error: HTTP ${res.status}`);
      return { connected: false, failureReason: `http_${res.status}` };
    }
    if (res.status === 404) {
      console.error("[ha-push] HA API path not found — ha_url may be wrong or HA version changed");
      return { connected: false, failureReason: "entity_not_found" };
    }
    console.error(`[ha-push] HA connection check returned HTTP ${res.status}`);
    return { connected: false, failureReason: `http_${res.status}` };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.error(`[ha-push] HA connection check timed out after ${timeoutMs / 1000}s`);
      return { connected: false, failureReason: "timeout" };
    }
    console.error("[ha-push] HA connection check failed:", err?.message);
    return { connected: false, failureReason: "network_error" };
  }
}

/**
 * Check HA connection with one retry. Uses shorter timeout on first attempt.
 * Total worst case: 6s + 2s delay + 8s = 16s (fits within 20s per-site budget).
 */
export async function checkHAConnectionWithRetry(
  haUrl: string,
  haToken: string,
  retries = 1,
  retryDelayMs = 2000
): Promise<{ connected: boolean; failureReason?: string }> {
  // First attempt: 6s timeout (fast check)
  let lastResult = await checkHAConnection(haUrl, haToken, 6000);
  if (lastResult.connected) return lastResult;

  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[ha-push] Retrying HA connection check (attempt ${attempt + 1})...`);
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    // Retry with longer timeout: 8s
    lastResult = await checkHAConnection(haUrl, haToken, 8000);
    if (lastResult.connected) return lastResult;
  }
  return lastResult;
}

const CONSECUTIVE_FAILURE_THRESHOLD = 3;

async function checkAndAlertConsecutiveFailures(
  supabase: SupabaseClient,
  siteId: string,
  orgId: string,
  failureReason: string
): Promise<void> {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { count } = await supabase
      .from("b_records_log")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("event_type", "thermostat_push_failed")
      .gte("created_at", twoHoursAgo);

    if ((count ?? 0) >= CONSECUTIVE_FAILURE_THRESHOLD) {
      // Check if we already fired an alert recently (don't spam)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentAlerts } = await supabase
        .from("b_records_log")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId)
        .eq("event_type", "ha_connectivity_alert")
        .gte("created_at", oneHourAgo);

      if ((recentAlerts ?? 0) === 0) {
        await supabase.from("b_records_log").insert({
          site_id: siteId,
          org_id: orgId,
          event_type: "ha_connectivity_alert",
          message: `HA unreachable for ${count} consecutive attempts. `
            + `Last failure reason: ${failureReason}. `
            + `Thermostat enforcement is not functioning.`,
          source: "ha_push",
          created_by: "system",
          metadata: {
            failure_count: count,
            failure_reason: failureReason,
            threshold: CONSECUTIVE_FAILURE_THRESHOLD,
          },
        });
        console.error(
          `[ha-push] ALERT: Site ${siteId} has ${count} consecutive HA failures — ha_connectivity_alert logged`
        );
      }
    }
  } catch (err: any) {
    console.error("[ha-push] Consecutive failure check error:", err?.message);
  }
}

const HA_FAILURE_MESSAGES: Record<string, string> = {
  timeout:          "HA push failed: connection timed out (tunnel may be slow)",
  auth_failed:      "HA push failed: authentication rejected — token may be invalid or expired",
  network_error:    "HA push failed: network error — DNS or routing failure",
  http_502:         "HA push failed: bad gateway (502) — tunnel or proxy issue",
  http_503:         "HA push failed: HA unavailable (503) — instance may be restarting",
  webhook_rejected: "HA push failed: webhook rejected — check webhook URL and HA config",
  entity_not_found: "HA push failed: climate entity not found — device mapping may be stale",
};

/**
 * Push desired thermostat state to HA, respecting guardrails and skip-if-already-at-target logic.
 */
export async function pushThermostatState(
  config: HAConfig,
  desired: DesiredState,
  current: CurrentState,
  guardrails: Guardrails,
  context?: { zone_id?: string; zone_name?: string },
  options?: { pushTimeoutMs?: number; modeChangeDelayMs?: number }
): Promise<PushResult> {
  const pushTimeoutMs = options?.pushTimeoutMs ?? 8000;
  const modeChangeDelayMs = options?.modeChangeDelayMs ?? 1500;
  const actions: string[] = [];
  const previous_state: Partial<CurrentState> = { ...current };
  let effectiveDesired = { ...desired };
  let guardrail_triggered = false;
  const ctxTag = context?.zone_name ? `[${context.zone_name}/${context.zone_id}]` : `[${desired.entity_id}]`;

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
        },
        pushTimeoutMs
      );
      let resBody: string | null = null;
      try { resBody = await res.text(); } catch { /* ignore */ }
      if (!res.ok) {
        console.error(`[ha-push] ${ctxTag} set_hvac_mode HTTP ${res.status}: ${resBody?.substring(0, 200)}`);
        actions.push(`set_hvac_mode:${effectiveDesired.hvac_mode}:FAILED`);
      } else {
        actions.push(`set_hvac_mode:${effectiveDesired.hvac_mode}`);
        console.log(`[ha-push] ${ctxTag} set_hvac_mode → ${effectiveDesired.hvac_mode} (${res.status})`);
      }
    } catch (err) {
      console.error(`[ha-push] ${ctxTag} set_hvac_mode exception:`, err);
      actions.push(`set_hvac_mode:${effectiveDesired.hvac_mode}:FAILED`);
    }

    // Wait for Z-Wave thermostat to process mode change
    await new Promise((resolve) => setTimeout(resolve, modeChangeDelayMs));
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
        { method: "POST", body: JSON.stringify(tempBody) },
        pushTimeoutMs
      );
      let resBody: string | null = null;
      try { resBody = await res.text(); } catch { /* ignore */ }
      if (!res.ok) {
        console.error(`[ha-push] ${ctxTag} set_temperature HTTP ${res.status}: ${resBody?.substring(0, 200)}`);
        actions.push(`${tempLabel}:FAILED`);
      } else {
        actions.push(tempLabel);
        console.log(`[ha-push] ${ctxTag} ${tempLabel} (${res.status})`);
      }
    }
  } catch (err) {
    console.error(`[ha-push] ${ctxTag} set_temperature exception:`, err);
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
        },
        pushTimeoutMs
      );
      let fanResBody: string | null = null;
      try { fanResBody = await res.text(); } catch { /* ignore */ }
      if (!res.ok) {
        console.error(`[ha-push] ${ctxTag} set_fan_mode HTTP ${res.status}: ${fanResBody?.substring(0, 200)}`);
        actions.push(`set_fan_mode:${effectiveDesired.fan_mode}:FAILED`);
      } else {
        actions.push(`set_fan_mode:${effectiveDesired.fan_mode}`);
        console.log(`[ha-push] ${ctxTag} set_fan_mode → ${effectiveDesired.fan_mode} (${res.status})`);
      }
    } catch (err) {
      console.error(`[ha-push] ${ctxTag} set_fan_mode exception:`, err);
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
  triggeredBy?: string,
  filterZoneId?: string
): Promise<PushResults> {
  const haUrl = haConfig?.haUrl || process.env.HA_URL;
  const haToken = haConfig?.haToken || process.env.HA_LONG_LIVED_TOKEN;

  if (!haUrl || !haToken) {
    console.log("[ha-push] HA push skipped — connection not configured");
    return { results: [], ha_connected: false, trigger };
  }

  const isCron = trigger === "cron_enforce";
  const startMs = Date.now();

  // Test connection — cron path uses single attempt with 5s timeout to save time
  const connResult = isCron
    ? await checkHAConnection(haUrl, haToken, 5000)
    : await checkHAConnectionWithRetry(haUrl, haToken);
  console.log(`[ha-push] HA connection check: connected=${connResult.connected}, trigger=${trigger}, elapsed=${Date.now() - startMs}ms`);
  if (!connResult.connected) {
    const failureReason = connResult.failureReason || "unknown";
    console.error(`[ha-push] HA unreachable: ${failureReason}`);
    // Log failed push with specific reason
    try {
      const { data: siteInfo } = await supabase
        .from("a_sites")
        .select("org_id, timezone")
        .eq("site_id", siteId)
        .single();
      const localDate = new Date().toLocaleDateString("en-CA", {
        timeZone: siteInfo?.timezone || "America/Chicago",
      });
      const logMessage = HA_FAILURE_MESSAGES[failureReason]
        ?? `HA push failed: ${failureReason} (trigger: ${trigger})`;
      await supabase.from("b_records_log").insert({
        site_id: siteId,
        org_id: siteInfo?.org_id || null,
        event_type: "thermostat_push_failed",
        event_date: localDate,
        message: `${logMessage} (trigger: ${trigger})`,
        source: "ha_push",
        created_by: triggeredBy || "system",
        metadata: { failure_reason: failureReason },
      });
      // Check for consecutive failures and alert
      await checkAndAlertConsecutiveFailures(
        supabase, siteId, siteInfo?.org_id || "", failureReason
      );
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
  const _tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const currentMins =
    Number(_tzParts.find(p => p.type === "hour")?.value ?? "0") * 60 +
    Number(_tzParts.find(p => p.type === "minute")?.value ?? "0");

  const targetDate = siteLocalDate(new Date(), tz);

  let openTime: string | null = null;
  let closeTime: string | null = null;
  let isClosed = false;
  let hoursSource = "none";

  // Step 1: Try b_store_hours_manifests for today (pre-computed, includes exceptions)
  const { data: manifest } = await supabase
    .from("b_store_hours_manifests")
    .select("open_time, close_time, is_closed")
    .eq("site_id", siteId)
    .eq("manifest_date", targetDate)
    .maybeSingle();

  if (manifest) {
    openTime = manifest.open_time || null;
    closeTime = manifest.close_time || null;
    isClosed = manifest.is_closed || false;
    hoursSource = "manifest_today";
  }

  // Step 2: If no manifest for today, try same weekday last week
  if (!manifest) {
    const [y, m, d] = targetDate.split("-").map(Number);
    const lastWeek = new Date(y, m - 1, d);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekDate = lastWeek.toISOString().slice(0, 10);

    const { data: lastWeekManifest } = await supabase
      .from("b_store_hours_manifests")
      .select("open_time, close_time, is_closed")
      .eq("site_id", siteId)
      .eq("manifest_date", lastWeekDate)
      .maybeSingle();

    if (lastWeekManifest) {
      openTime = lastWeekManifest.open_time || null;
      closeTime = lastWeekManifest.close_time || null;
      isClosed = lastWeekManifest.is_closed || false;
      hoursSource = "manifest_last_week";

      try {
        await supabase.from("b_records_log").insert({
          site_id: siteId,
          org_id: site?.org_id || null,
          event_type: "manifest_fallback",
          event_date: targetDate,
          message: `No manifest for ${targetDate}, used same weekday last week (${lastWeekDate})`,
          source: "ha_push",
          created_by: triggeredBy || "system",
        });
      } catch { /* best-effort logging */ }
    }
  }

  // Step 3: If still no hours, fall back to raw b_store_hours
  if (hoursSource === "none") {
    const [y, m, d] = targetDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dayOfWeek = DAY_NAMES[dt.getDay()];

    const { data: baseHours } = await supabase
      .from("b_store_hours")
      .select("open_time, close_time, is_closed")
      .eq("site_id", siteId)
      .eq("day_of_week", dayOfWeek)
      .single();

    if (baseHours) {
      openTime = baseHours.open_time || null;
      closeTime = baseHours.close_time || null;
      isClosed = baseHours.is_closed || false;
      hoursSource = "b_store_hours";
    }

    try {
      await supabase.from("b_records_log").insert({
        site_id: siteId,
        org_id: site?.org_id || null,
        event_type: "manifest_fallback",
        event_date: targetDate,
        message: `No manifest for ${targetDate} or last week, fell back to ${baseHours ? "b_store_hours" : "no hours found"}`,
        source: "ha_push",
        created_by: triggeredBy || "system",
      });
    } catch { /* best-effort logging */ }
  }

  // Log which source resolved (deduplicated via metadata comparison)
  try {
    const manifestMeta = { hours_source: hoursSource, open_time: openTime, close_time: closeTime, is_closed: isClosed };

    const { data: lastManifest } = await supabase
      .from("b_records_log")
      .select("metadata")
      .eq("site_id", siteId)
      .eq("event_type", "manifest_found")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastMeta = lastManifest?.metadata;
    const manifestChanged = !lastMeta
      || lastMeta.hours_source !== manifestMeta.hours_source
      || lastMeta.open_time !== manifestMeta.open_time
      || lastMeta.close_time !== manifestMeta.close_time
      || lastMeta.is_closed !== manifestMeta.is_closed;

    if (manifestChanged) {
      await supabase.from("b_records_log").insert({
        site_id: siteId,
        org_id: site?.org_id || null,
        event_type: "manifest_found",
        event_date: targetDate,
        message: `Hours source: ${hoursSource} (open: ${openTime}, close: ${closeTime}, closed: ${isClosed})`,
        source: "ha_push",
        created_by: triggeredBy || "system",
        metadata: manifestMeta,
      });
    }
  } catch { /* best-effort logging */ }

  const openMins = timeToMinutes(openTime);
  const closeMins = timeToMinutes(closeTime);
  const isOccupied =
    !isClosed &&
    openMins !== null &&
    closeMins !== null &&
    currentMins >= openMins &&
    currentMins < closeMins;

  const phase = isOccupied ? "occupied" : "unoccupied";
  console.log(`[ha-push] Site ${siteId}: phase=${phase}, currentMins=${currentMins}, openMins=${openMins}, closeMins=${closeMins}, isClosed=${isClosed}, source=${hoursSource}, elapsed=${Date.now() - startMs}ms`);

  // Log occupancy state changes (deduplicated via metadata, cross-midnight safe)
  try {
    const { data: lastOccLog } = await supabase
      .from("b_records_log")
      .select("metadata")
      .eq("site_id", siteId)
      .eq("event_type", "occupancy_change")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastPhase = lastOccLog?.metadata?.phase || null;

    if (lastPhase !== phase) {
      await supabase.from("b_records_log").insert({
        site_id: siteId,
        org_id: site?.org_id || null,
        event_type: "occupancy_change",
        event_date: targetDate,
        message: `${lastPhase || "unknown"} → ${phase} (open: ${openTime}, close: ${closeTime}, source: ${hoursSource})`,
        source: "ha_push",
        created_by: triggeredBy || "system",
        metadata: { phase, previous_phase: lastPhase || "unknown", open_time: openTime, close_time: closeTime, hours_source: hoursSource },
      });
    }
  } catch { /* best-effort logging */ }

  // Fetch smart start offsets for today
  const today = siteLocalDate(new Date(), tz);
  const { data: ssLogs } = await supabase
    .from("b_smart_start_log")
    .select("device_id, offset_used_minutes")
    .eq("site_id", siteId)
    .eq("date", today);

  const ssByDevice: Record<string, number> = {};
  for (const ss of ssLogs || []) {
    if (ss.device_id && ss.offset_used_minutes > 0) {
      ssByDevice[ss.device_id] = ss.offset_used_minutes;
    }
  }

  // Load managed HVAC zones for this site (only managed zones get setpoint pushes)
  const { data: zones } = await supabase
    .from("a_hvac_zones")
    .select(
      "hvac_zone_id, name, zone_type, equipment_id, thermostat_device_id, profile_id, occupied_heat_f, occupied_cool_f, unoccupied_heat_f, unoccupied_cool_f, occupied_fan_mode, occupied_hvac_mode, unoccupied_fan_mode, unoccupied_hvac_mode, guardrail_min_f, guardrail_max_f, manager_offset_up_f, manager_offset_down_f, manager_override_reset_minutes, fan_mode, hvac_mode"
    )
    .eq("site_id", siteId)
    .eq("control_scope", "managed");

  if (!zones || zones.length === 0) {
    console.log("[ha-push] No HVAC zones found for site");
    return { results: [], ha_connected: true, trigger };
  }

  // If filtering to a single zone, narrow down the list
  if (filterZoneId) {
    const filtered = zones.filter((z: any) => z.hvac_zone_id === filterZoneId);
    if (filtered.length === 0) {
      console.log(`[ha-push] Zone ${filterZoneId} not found or not managed`);
      return { results: [], ha_connected: true, trigger };
    }
    zones.length = 0;
    zones.push(...filtered);
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

    // Skip zone types that don't support thermostat push
    if (zone.zone_type && !PUSHABLE_ZONE_TYPES.includes(zone.zone_type)) {
      console.log(`[ha-push] Skipping zone "${zone.name}" (${zone.hvac_zone_id}): zone_type "${zone.zone_type}" not pushable`);
      results.push({
        zone_name: zone.name,
        hvac_zone_id: zone.hvac_zone_id,
        entity_id: "",
        pushed: false,
        reason: `Zone type "${zone.zone_type}" not pushable`,
        actions: [],
      });
      continue;
    }

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

    // Look up climate entity dynamically (normalize ha_device_id for consistent matching)
    let climateEntityId: string | null = null;
    if (device.ha_device_id) {
      const normalizedId = normalizeHaDeviceId(device.ha_device_id);
      const { data: entityRow } = await supabase
        .from("b_entity_sync")
        .select("entity_id")
        .eq("ha_device_id", normalizedId || device.ha_device_id)
        .eq("site_id", siteId)
        .ilike("entity_id", "climate.%")
        .limit(1)
        .maybeSingle();
      climateEntityId = entityRow?.entity_id || null;
      // Fallback: try raw (dashless) format if normalized didn't match
      if (!climateEntityId && normalizedId !== device.ha_device_id) {
        const { data: entityRow2 } = await supabase
          .from("b_entity_sync")
          .select("entity_id")
          .eq("ha_device_id", device.ha_device_id)
          .eq("site_id", siteId)
          .ilike("entity_id", "climate.%")
          .limit(1)
          .maybeSingle();
        climateEntityId = entityRow2?.entity_id || null;
      }
    }

    if (!climateEntityId) {
      console.error(
        `[ha-push] No climate entity found for device: `
        + `${device.device_name} (ha_device_id: ${device.ha_device_id}). `
        + `Zone "${zone.name}" will not be controlled until this is resolved.`
      );

      // Log to b_records_log with 1-hour dedup to avoid 288 events/day
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: recentMissing } = await supabase
          .from("b_records_log")
          .select("id", { count: "exact", head: true })
          .eq("site_id", siteId)
          .eq("event_type", "thermostat_entity_missing")
          .eq("device_id", zone.thermostat_device_id)
          .gte("created_at", oneHourAgo);

        if (!recentMissing || recentMissing === 0) {
          const { data: candidateEntities } = await supabase
            .from("b_entity_sync")
            .select("entity_id, ha_device_id")
            .eq("site_id", siteId)
            .ilike("entity_id", "climate.%");

          await supabase.from("b_records_log").insert({
            site_id: siteId,
            org_id: site?.org_id || null,
            equipment_id: zone.equipment_id || null,
            device_id: zone.thermostat_device_id,
            event_type: "thermostat_entity_missing",
            event_date: targetDate,
            message: `Zone "${zone.name}": no climate entity found for `
              + `device "${device.device_name}" `
              + `(ha_device_id: ${device.ha_device_id}). `
              + `Thermostat enforcement is not functioning for this zone.`,
            source: "ha_push",
            created_by: triggeredBy || "system",
            metadata: {
              zone_name: zone.name,
              hvac_zone_id: zone.hvac_zone_id,
              device_name: device.device_name,
              ha_device_id: device.ha_device_id,
              candidate_entities: (candidateEntities || []).map((e: any) => ({
                entity_id: e.entity_id,
                ha_device_id: e.ha_device_id,
              })),
              trigger,
            },
          });

          // Check for consecutive misses → alert
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { count: missCount } = await supabase
            .from("b_records_log")
            .select("id", { count: "exact", head: true })
            .eq("site_id", siteId)
            .eq("event_type", "thermostat_entity_missing")
            .eq("device_id", zone.thermostat_device_id)
            .gte("created_at", twoHoursAgo);

          if ((missCount ?? 0) >= 3) {
            const { count: recentAlerts } = await supabase
              .from("b_records_log")
              .select("id", { count: "exact", head: true })
              .eq("site_id", siteId)
              .eq("event_type", "thermostat_entity_alert")
              .eq("device_id", zone.thermostat_device_id)
              .gte("created_at", oneHourAgo);

            if ((recentAlerts ?? 0) === 0) {
              await supabase.from("b_records_log").insert({
                site_id: siteId,
                org_id: site?.org_id || null,
                device_id: zone.thermostat_device_id,
                event_type: "thermostat_entity_alert",
                message: `Zone "${zone.name}": climate entity missing for ${missCount}+ consecutive checks. `
                  + `ha_device_id "${device.ha_device_id}" has no match in b_entity_sync. `
                  + `Thermostat enforcement is blocked.`,
                source: "ha_push",
                created_by: "system",
                metadata: {
                  failure_count: missCount,
                  ha_device_id: device.ha_device_id,
                  device_name: device.device_name,
                },
              });
              console.error(
                `[ha-push] ALERT: Zone "${zone.name}" has ${missCount} consecutive entity_missing — thermostat_entity_alert logged`
              );
            }
          }
        }
      } catch (logErr) {
        console.error("[ha-push] Failed to log thermostat_entity_missing:", logErr);
      }

      results.push({
        zone_name: zone.name || "",
        hvac_zone_id: zone.hvac_zone_id,
        entity_id: "",
        pushed: false,
        reason: "No climate entity found — ha_device_id mismatch",
        actions: [],
      });
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
      // Try with the device's ha_device_id (may have dashes)
      const { data: s2 } = await supabase
        .from("b_thermostat_state")
        .select("*")
        .eq("site_id", siteId)
        .eq("ha_device_id", device.ha_device_id)
        .maybeSingle();
      if (s2) {
        thermoState = s2;
      } else if (device.ha_device_id.includes("-")) {
        // Fallback: try without dashes (HA addon may store raw hex)
        const rawId = device.ha_device_id.replace(/-/g, "");
        const { data: s3 } = await supabase
          .from("b_thermostat_state")
          .select("*")
          .eq("site_id", siteId)
          .eq("ha_device_id", rawId)
          .maybeSingle();
        thermoState = s3;
      }
    }

    // ── Manager Override: Check before computing/pushing ──
    // Cap override to 30 minutes during unoccupied hours
    const baseOverrideMinutes = resolved.manager_override_reset_minutes ?? 120;
    const overrideResetMinutes = isOccupied ? baseOverrideMinutes : Math.min(15, baseOverrideMinutes);
    const isOverrideActive = thermoState?.manager_override_active === true;

    if (isOverrideActive) {
      const startedAt = thermoState?.manager_override_started_at
        ? new Date(thermoState.manager_override_started_at).getTime() : 0;
      const elapsedMin = startedAt ? (Date.now() - startedAt) / 60000 : Infinity;
      const remaining = Math.max(0, Math.round(overrideResetMinutes - elapsedMin));

      if (overrideResetMinutes > 0 && elapsedMin >= overrideResetMinutes) {
        // Override expired — clear it and push profile setpoint
        console.log(`[ha-push] Zone "${zone.name}": Manager override expired (${Math.round(elapsedMin)}min elapsed) — resetting to profile`);
        await supabase
          .from("b_thermostat_state")
          .update({
            manager_override_active: false,
            manager_override_heat_f: null,
            manager_override_cool_f: null,
            manager_override_started_at: null,
            manager_override_remaining_min: 0,
          })
          .eq("entity_id", climateEntityId)
          .eq("site_id", siteId);
        // Continue to push the profile setpoint
      } else {
        // Override still active — skip push, recalculate directive
        console.log(`[ha-push] Zone "${zone.name}": Skipping push — manager override active (${remaining}m remaining)`);
        const activeOverrideHeat = thermoState?.manager_override_heat_f;
        const activeOverrideCool = thermoState?.manager_override_cool_f;
        const overrideZoneTemp = thermoState?.current_temperature_f;
        const overrideMode = thermoState?.hvac_mode || "heat_cool";
        let holdDirective: string | null = null;
        if (overrideZoneTemp != null && activeOverrideHeat != null) {
          if (overrideMode === "heat" || overrideMode === "heat_cool") {
            if (overrideZoneTemp >= activeOverrideHeat + 1) {
              holdDirective = `Idle — zone ${overrideZoneTemp}°F above setpoint ${activeOverrideHeat}°F (${phase}, manager override, ${remaining}m left)`;
            } else if (overrideZoneTemp <= activeOverrideHeat - 1) {
              holdDirective = `Heating to ${activeOverrideHeat}°F — zone at ${overrideZoneTemp}°F (${phase}, manager override, ${remaining}m left)`;
            }
          }
          if (overrideMode === "cool" || overrideMode === "heat_cool") {
            if (activeOverrideCool != null && overrideZoneTemp <= activeOverrideCool - 1) {
              holdDirective = `Idle — zone ${overrideZoneTemp}°F below setpoint ${activeOverrideCool}°F (${phase}, manager override, ${remaining}m left)`;
            } else if (activeOverrideCool != null && overrideZoneTemp >= activeOverrideCool + 1) {
              holdDirective = `Cooling to ${activeOverrideCool}°F — zone at ${overrideZoneTemp}°F (${phase}, manager override, ${remaining}m left)`;
            }
          }
        }
        if (!holdDirective) {
          holdDirective = `Manager override active: ${activeOverrideHeat ?? "?"}°–${activeOverrideCool ?? "?"}°F (${phase}, ${remaining}m left)`;
        }

        await supabase
          .from("b_thermostat_state")
          .update({
            manager_override_remaining_min: remaining,
            eagle_eye_directive: holdDirective,
            directive_generated_at: new Date().toISOString(),
          })
          .eq("entity_id", climateEntityId)
          .eq("site_id", siteId);

        results.push({
          zone_name: zone.name || "",
          hvac_zone_id: zone.hvac_zone_id,
          entity_id: climateEntityId,
          pushed: false,
          reason: `Manager override active (${remaining}m remaining)`,
          actions: [],
        });
        continue;
      }
    } else if (thermoState?.last_pushed_heat_f != null) {
      // Check for NEW manager override: compare HA actual vs what we last pushed (heat AND cool)
      const haActualHeat = thermoState.target_temp_low_f ?? thermoState.current_setpoint_f;
      const lastPushedHeat = thermoState.last_pushed_heat_f;
      const haActualCool = thermoState.target_temp_high_f ?? null;
      const lastPushedCool = thermoState.last_pushed_cool_f ?? null;

      const heatDrift = haActualHeat != null ? Math.abs(haActualHeat - lastPushedHeat) : 0;
      const coolDrift = (haActualCool != null && lastPushedCool != null) ? Math.abs(haActualCool - lastPushedCool) : 0;

      if (heatDrift >= 1.0 || coolDrift >= 1.0) {
        // Manager changed the thermostat at the wall (heat and/or cool side)
        const managerAdj = haActualHeat != null ? Math.round((haActualHeat - lastPushedHeat) * 10) / 10 : 0;
        // During occupied hours, use profile guardrails. During unoccupied, allow ±15°F.
        const maxRaise = isOccupied ? (resolved.manager_offset_up_f ?? 4) : 15;
        const maxLower = isOccupied ? (resolved.manager_offset_down_f ?? 4) : 15;

        const coolAdj = (haActualCool != null && lastPushedCool != null) ? Math.round((haActualCool - lastPushedCool) * 10) / 10 : 0;
        console.log(`[ha-push] Zone "${zone.name}": Manager override detected! HA heat=${haActualHeat}°F vs pushed=${lastPushedHeat}°F (adj=${managerAdj > 0 ? "+" : ""}${managerAdj}°F), cool=${haActualCool}°F vs pushed=${lastPushedCool}°F (adj=${coolAdj > 0 ? "+" : ""}${coolAdj}°F), guardrails: +${maxRaise}/-${maxLower})`);

        // ── Guardrail enforcement ──
        let finalHeat = haActualHeat;
        let finalCool = haActualCool;
        let bounced = false;

        if (managerAdj > maxRaise) {
          finalHeat = lastPushedHeat + maxRaise;
          bounced = true;
          console.log(`[ha-push] Zone "${zone.name}": Override +${managerAdj}°F exceeds max +${maxRaise}°F — bouncing to ${finalHeat}°F`);
        } else if (managerAdj < -maxLower) {
          finalHeat = lastPushedHeat - maxLower;
          bounced = true;
          console.log(`[ha-push] Zone "${zone.name}": Override ${managerAdj}°F exceeds max -${maxLower}°F — bouncing to ${finalHeat}°F`);
        }

        // Also check cool side
        if (finalCool != null && lastPushedCool != null) {
          const coolSideAdj = finalCool - lastPushedCool;
          if (coolSideAdj > maxRaise) {
            finalCool = lastPushedCool + maxRaise;
            bounced = true;
          } else if (coolSideAdj < -maxLower) {
            finalCool = lastPushedCool - maxLower;
            bounced = true;
          }
        }

        // ── Hard guardrail clamp ──
        const hardMin = resolved.guardrail_min_f;
        const hardMax = resolved.guardrail_max_f;
        const preclampHeat = finalHeat;
        const preclampCool = finalCool;
        finalHeat = Math.min(Math.max(finalHeat, hardMin), hardMax);
        if (finalCool != null) {
          finalCool = Math.min(Math.max(finalCool, hardMin), hardMax);
        }
        if (finalHeat !== preclampHeat || (finalCool != null && finalCool !== preclampCool)) {
          bounced = true;
          console.log(`[ha-push] Zone "${zone.name}": Guardrail clamp heat ${preclampHeat}→${finalHeat}, cool ${preclampCool}→${finalCool} (range ${hardMin}–${hardMax}°F)`);
          try {
            await supabase.from("b_records_log").insert({
              site_id: siteId,
              org_id: site?.org_id || null,
              equipment_id: zone.equipment_id || null,
              event_type: "guardrail_clamp",
              event_date: targetDate,
              message: `Manager override clamped: requested ${preclampHeat}°F, clamped to ${finalHeat}°F (guardrail ${hardMin}–${hardMax}°F)`,
              source: "ha_push",
              created_by: "system",
            });
          } catch (clampLogErr) {
            console.error("[ha-push] Guardrail clamp log error:", clampLogErr);
          }
        }

        // Bounce back to HA if guardrails exceeded
        if (bounced) {
          try {
            const hvacMode = thermoState.hvac_mode || "heat_cool";
            const tempBody: Record<string, any> = { entity_id: climateEntityId };
            if (hvacMode === "heat_cool" && finalCool != null) {
              tempBody.target_temp_low = finalHeat;
              tempBody.target_temp_high = finalCool;
            } else {
              tempBody.temperature = finalHeat;
            }

            await haFetch(
              `${config.haUrl}/api/services/climate/set_temperature`,
              config.haToken,
              { method: "POST", body: JSON.stringify(tempBody) }
            );
            console.log(`[ha-push] Zone "${zone.name}": Bounced override to ${finalHeat}°F`);
          } catch (bounceErr: any) {
            console.error(`[ha-push] Zone "${zone.name}": Bounce-back failed:`, bounceErr.message);
          }

          // Log rejection
          try {
            await supabase.from("b_records_log").insert({
              org_id: site?.org_id || null,
              site_id: siteId,
              equipment_id: zone.equipment_id || null,
              event_type: "manager_override_rejected",
              event_date: targetDate,
              message: `Manager override rejected: ${managerAdj > 0 ? "+" : ""}${managerAdj}°F exceeds max ${managerAdj > 0 ? `+${maxRaise}` : `-${maxLower}`}°F, reset to ${finalHeat}°F (${zone.name})`,
              source: "ha_push",
              metadata: {
                entity_id: climateEntityId,
                zone_name: zone.name,
                requested: haActualHeat,
                clamped: finalHeat,
                manager_adj: managerAdj,
              },
              created_by: triggeredBy || "system",
            });
          } catch (logErr) {
            console.error("[ha-push] Failed to log override rejection:", logErr);
          }
        } else {
          // Log accepted override
          try {
            await supabase.from("b_records_log").insert({
              org_id: site?.org_id || null,
              site_id: siteId,
              equipment_id: zone.equipment_id || null,
              event_type: "manager_override",
              event_date: targetDate,
              message: `Manager override: ${managerAdj > 0 ? "+" : ""}${managerAdj}°F (${zone.name}), expires in ${Math.round(overrideResetMinutes / 60)}hr`,
              source: "ha_push",
              metadata: {
                entity_id: climateEntityId,
                zone_name: zone.name,
                new_heat: finalHeat,
                manager_adj: managerAdj,
                reset_minutes: overrideResetMinutes,
              },
              created_by: triggeredBy || "system",
            });
          } catch (logErr) {
            console.error("[ha-push] Failed to log override acceptance:", logErr);
          }
        }

        // Update b_thermostat_state with override info + recalculated directive
        const overrideUpdate: Record<string, any> = {
          manager_override_active: true,
          manager_override_heat_f: finalHeat,
          manager_override_cool_f: finalCool,
          manager_override_started_at: new Date().toISOString(),
          manager_override_remaining_min: overrideResetMinutes,
          last_pushed_heat_f: finalHeat,
          last_pushed_cool_f: finalCool,
        };
        if (bounced) {
          overrideUpdate.last_pushed_at = new Date().toISOString();
        }

        // Recalculate Eagle Eye directive against new override setpoint
        // Use ±1°F tolerance to prevent rapid switching
        const zoneTemp = thermoState?.current_temperature_f;
        const curMode = thermoState?.hvac_mode || "heat_cool";
        let overrideDirective: string | null = null;
        if (zoneTemp != null) {
          if (curMode === "heat" || curMode === "heat_cool") {
            if (zoneTemp >= finalHeat + 1) {
              overrideDirective = `Idle — zone ${zoneTemp}°F above setpoint ${finalHeat}°F (${phase}, manager override)`;
            } else if (zoneTemp <= finalHeat - 1) {
              overrideDirective = `Heating to ${finalHeat}°F — zone at ${zoneTemp}°F (${phase}, manager override)`;
            }
          }
          if (curMode === "cool" || curMode === "heat_cool") {
            if (haActualCool != null && zoneTemp <= haActualCool - 1) {
              overrideDirective = `Idle — zone ${zoneTemp}°F below setpoint ${haActualCool}°F (${phase}, manager override)`;
            } else if (haActualCool != null && zoneTemp >= haActualCool + 1) {
              overrideDirective = `Cooling to ${haActualCool}°F — zone at ${zoneTemp}°F (${phase}, manager override)`;
            }
          }
        }
        if (!overrideDirective) {
          overrideDirective = `Manager override: ${finalHeat}°–${haActualCool ?? "?"}°F (${phase}, ${overrideResetMinutes}m)`;
        }
        overrideUpdate.eagle_eye_directive = overrideDirective;
        overrideUpdate.directive_generated_at = new Date().toISOString();

        await supabase
          .from("b_thermostat_state")
          .update(overrideUpdate)
          .eq("entity_id", climateEntityId)
          .eq("site_id", siteId);

        // Log resolution chain for manager override
        try {
          await supabase.from("b_records_log").insert({
            org_id: site?.org_id || null,
            site_id: siteId,
            equipment_id: zone.equipment_id || null,
            device_id: zone.thermostat_device_id,
            event_type: "thermostat_push_attempt",
            event_date: targetDate,
            source: "ha_push",
            message: `${zone.name}: Base ${lastPushedHeat}/${lastPushedCool ?? "?"} (${phase}) → Manager override heat ${managerAdj > 0 ? "+" : ""}${managerAdj}, cool ${coolAdj > 0 ? "+" : ""}${coolAdj} → Final ${finalHeat}/${finalCool ?? "?"} → ${bounced ? "bounced" : "accepted"}`,
            metadata: {
              base_heat: lastPushedHeat,
              base_cool: lastPushedCool,
              phase,
              feels_like_adj: 0,
              smart_start_adj: 0,
              occupancy_adj: 0,
              adjusted_heat: haActualHeat,
              adjusted_cool: haActualCool,
              guardrail_clamped: bounced,
              guardrail_min: hardMin,
              guardrail_max: hardMax,
              manager_override: true,
              manager_adj: managerAdj,
              final_heat: finalHeat,
              final_cool: finalCool,
              push_result: bounced ? "bounced" : "accepted",
              entity_id: climateEntityId,
              trigger,
            },
            created_by: triggeredBy || "system",
          });
        } catch (logErr) {
          console.error("[ha-push] Failed to log manager override push_attempt:", logErr);
        }

        results.push({
          zone_name: zone.name || "",
          hvac_zone_id: zone.hvac_zone_id,
          entity_id: climateEntityId,
          pushed: false,
          reason: bounced
            ? `Manager override bounced (${managerAdj > 0 ? "+" : ""}${managerAdj}°F exceeded ±${maxRaise}°F, clamped to ${finalHeat}°F) — holding for ${overrideResetMinutes}m`
            : `Manager override accepted (${managerAdj > 0 ? "+" : ""}${managerAdj}°F) — holding for ${overrideResetMinutes}m`,
          actions: bounced ? [`bounce_back:${finalHeat}`] : [],
        });
        continue;
      }
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

    // Feels Like adjustment — occupied hours only
    let feelsLikeAdj = 0;
    if (isOccupied && flEnabled && sensorReading.zone_temp_f !== null && sensorReading.feels_like_temp_f !== null) {
      const delta = sensorReading.feels_like_temp_f - sensorReading.zone_temp_f;
      feelsLikeAdj = Math.max(-flMaxAdj, Math.min(flMaxAdj, Math.round(delta)));
    }

    // Smart Start adjustment — unchanged (already gates on pre-open window)
    let smartStartAdj = 0;
    const ssOffset = ssByDevice[zone.thermostat_device_id];
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

    // Occupancy adjustment — occupied hours only
    const occupancyReading = await getOccupancyReading(supabase, siteId, zone.equipment_id);
    const occupancyAdj = (isOccupied && occEnabled) ? Math.max(-occMaxAdj, occupancyReading.occupancy_adj) : 0;

    // Total adjustment (feels_like + smart_start + occupancy)
    const totalAdj = feelsLikeAdj + smartStartAdj + occupancyAdj;
    if (!isOccupied) {
      console.log(
        `[ha-push] Zone "${zone.name}": unoccupied phase — feels_like and occupancy adjustments zeroed. Base setpoint: ${profileHeat}/${profileCool}°F`
      );
    }
    console.log(
      `[ha-push] Zone "${zone.name}" adjustments: feels_like=${feelsLikeAdj}, smart_start=${smartStartAdj}, occupancy=${occupancyAdj}, total=${totalAdj}${!isOccupied ? " [unoccupied: adj suppressed]" : ""}`
    );

    // STEP 1 — Base: Select occupied/unoccupied profile setpoints
    const baseHeat = isOccupied ? resolved.occupied_heat_f : resolved.unoccupied_heat_f;
    const baseCool = isOccupied ? resolved.occupied_cool_f : resolved.unoccupied_cool_f;
    const baseMode = isOccupied ? resolved.occupied_hvac_mode : resolved.unoccupied_hvac_mode;
    const baseFan = isOccupied ? resolved.occupied_fan_mode : resolved.unoccupied_fan_mode;

    // STEP 2 — Feels-like + adjustments: Apply to base setpoints
    const adjustedHeat = baseHeat + totalAdj;
    const adjustedCool = baseCool + totalAdj;

    // STEP 3 — Guardrails: Clamp adjusted setpoints to guardrail range
    const gMin = resolved.guardrail_min_f;
    const gMax = resolved.guardrail_max_f;
    const finalHeat = Math.min(Math.max(adjustedHeat, gMin), gMax);
    const finalCool = Math.min(Math.max(adjustedCool, gMin), gMax);
    const guardrailClamped = finalHeat !== adjustedHeat || finalCool !== adjustedCool;

    // Log the full resolution chain
    console.log(
      `[ha-push] Zone "${zone.name}" resolution: Base: ${baseHeat}/${baseCool} (${phase}) → Adj: ${totalAdj >= 0 ? "+" : ""}${totalAdj} → Adjusted: ${adjustedHeat}/${adjustedCool} → Guardrails ${guardrailClamped ? "CLAMPED" : "OK"} (${gMin}–${gMax}) → Final: ${finalHeat}/${finalCool}`
    );

    // Build desired state with fully resolved setpoints
    const desired: DesiredState = {
      entity_id: climateEntityId,
      hvac_mode: baseMode,
      heat_setpoint_f: finalHeat,
      cool_setpoint_f: finalCool,
      fan_mode: baseFan,
    };

    // Map generic mode values to HA-compatible values
    if (desired.hvac_mode === "auto") desired.hvac_mode = "heat_cool";
    // Map generic fan mode values to HA T6 Pro fan modes
    if (desired.fan_mode === "auto") desired.fan_mode = "Auto low";
    if (desired.fan_mode === "on") desired.fan_mode = "Low";
    if (desired.fan_mode === "circulate") desired.fan_mode = "Circulation";

    const guardrails: Guardrails = {
      min_f: gMin,
      max_f: gMax,
    };

    // ── Live HA state read before skip decision ──
    // Enforcement must never trust cached state for correctness.
    // Webhooks can lag, fail, or arrive out of order.
    let liveState: CurrentState | null = null;

    // Change #6: Elapsed-time guard — abort if we've used too much time
    const elapsedBeforeLive = Date.now() - startMs;
    if (isCron && elapsedBeforeLive > 40000) {
      console.warn(`[ha-push] Zone "${zone.name}": elapsed ${elapsedBeforeLive}ms > 40s guard — aborting remaining zones`);
      results.push({
        zone_name: zone.name || "",
        hvac_zone_id: zone.hvac_zone_id,
        entity_id: climateEntityId,
        pushed: false,
        reason: "Elapsed time guard (>40s)",
        actions: [],
      });
      break;
    }

    try {
      const liveRes = await haFetch(
        `${config.haUrl}/api/states/${climateEntityId}`,
        config.haToken,
        { method: "GET" },
        isCron ? 5000 : 8000
      );
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        const attrs = liveData.attributes || {};
        liveState = {
          hvac_mode:            liveData.state,
          current_setpoint_f:   attrs.temperature ?? null,
          target_temp_high_f:   attrs.target_temp_high ?? null,
          target_temp_low_f:    attrs.target_temp_low ?? null,
          fan_mode:             attrs.fan_mode ?? null,
          current_temperature_f: attrs.current_temperature ?? null,
          battery_level:        attrs.battery_level ?? null,
        };
        console.log(
          `[ha-push] Zone "${zone.name}": live HA state — `
          + `mode=${liveState.hvac_mode}, `
          + `temp=${liveState.current_temperature_f}, `
          + `low=${liveState.target_temp_low_f}, `
          + `high=${liveState.target_temp_high_f}`
        );

        // Update b_thermostat_state with live observed fields ONLY
        // (never overwrite push history fields like last_pushed_*)
        await supabase
          .from("b_thermostat_state")
          .update({
            hvac_mode:             liveState.hvac_mode,
            current_temperature_f: liveState.current_temperature_f,
            current_setpoint_f:    liveState.current_setpoint_f,
            target_temp_high_f:    liveState.target_temp_high_f,
            target_temp_low_f:     liveState.target_temp_low_f,
            fan_mode:              liveState.fan_mode,
            last_synced_at:        new Date().toISOString(),
          })
          .eq("entity_id", climateEntityId)
          .eq("site_id", siteId);
      } else {
        console.warn(
          `[ha-push] Zone "${zone.name}": live state fetch returned HTTP ${liveRes.status} — falling back to cache`
        );
      }
    } catch (liveErr: any) {
      console.warn(
        `[ha-push] Zone "${zone.name}": live state fetch failed (${liveErr?.message}) — falling back to cache, elapsed=${Date.now() - startMs}ms`
      );
    }

    const usedLiveState = liveState !== null;
    const current: CurrentState = liveState ?? {
      hvac_mode: thermoState?.hvac_mode || "",
      current_setpoint_f: thermoState?.current_setpoint_f ?? null,
      target_temp_high_f: thermoState?.target_temp_high_f ?? null,
      target_temp_low_f: thermoState?.target_temp_low_f ?? null,
      fan_mode: thermoState?.fan_mode ?? null,
      current_temperature_f: thermoState?.current_temperature_f ?? null,
      battery_level: thermoState?.battery_level ?? null,
    };

    // Mode mismatch always forces push — log for visibility
    if (current.hvac_mode !== desired.hvac_mode) {
      console.log(
        `[ha-push] Mode mismatch: HA=${current.hvac_mode} vs desired=${desired.hvac_mode} — forcing push`
      );
    }

    // Execute the push
    console.log(
      `[ha-push] Zone "${zone.name}" (${climateEntityId}): ${phase} → base=${baseHeat}/${baseCool}, final=${desired.heat_setpoint_f}/${desired.cool_setpoint_f}, mode=${desired.hvac_mode}, fan=${desired.fan_mode} [state_source=${usedLiveState ? "live_ha" : "cache"}]`
    );

    // Change #6: Elapsed-time guard before push
    const elapsedBeforePush = Date.now() - startMs;
    if (isCron && elapsedBeforePush > 40000) {
      console.warn(`[ha-push] Zone "${zone.name}": elapsed ${elapsedBeforePush}ms > 40s guard — aborting remaining zones`);
      results.push({
        zone_name: zone.name || "",
        hvac_zone_id: zone.hvac_zone_id,
        entity_id: climateEntityId,
        pushed: false,
        reason: "Elapsed time guard (>40s)",
        actions: [],
      });
      break;
    }

    const pushResult = await pushThermostatState(
      config, desired, current, guardrails,
      { zone_id: zone.hvac_zone_id, zone_name: zone.name },
      isCron ? { pushTimeoutMs: 5000, modeChangeDelayMs: 800 } : undefined
    );

    // Update b_thermostat_state with directive — always recalculate from current state
    const zoneTemp = thermoState?.current_temperature_f ?? current.current_temperature_f;
    const curAction = thermoState?.hvac_action || null;
    let directiveText: string;
    if (zoneTemp != null) {
      const mode = desired.hvac_mode;
      const heatSp = desired.heat_setpoint_f;
      const coolSp = desired.cool_setpoint_f;
      if (mode === "off") {
        directiveText = `Off (${phase})`;
      } else if (mode === "heat") {
        directiveText = zoneTemp >= heatSp + 1
          ? `Idle — zone ${zoneTemp}°F above setpoint ${heatSp}°F (${phase})`
          : zoneTemp <= heatSp - 1
          ? `Heating to ${heatSp}°F — zone at ${zoneTemp}°F (${phase})`
          : `At setpoint ${heatSp}°F — zone at ${zoneTemp}°F (${phase})`;
      } else if (mode === "cool") {
        directiveText = zoneTemp <= coolSp - 1
          ? `Idle — zone ${zoneTemp}°F below setpoint ${coolSp}°F (${phase})`
          : zoneTemp >= coolSp + 1
          ? `Cooling to ${coolSp}°F — zone at ${zoneTemp}°F (${phase})`
          : `At setpoint ${coolSp}°F — zone at ${zoneTemp}°F (${phase})`;
      } else {
        // heat_cool / auto
        if (zoneTemp <= heatSp - 1) {
          directiveText = `Heating to ${heatSp}°F — zone at ${zoneTemp}°F (${phase})`;
        } else if (zoneTemp >= coolSp + 1) {
          directiveText = `Cooling to ${coolSp}°F — zone at ${zoneTemp}°F (${phase})`;
        } else {
          directiveText = `Idle — zone ${zoneTemp}°F in range ${heatSp}–${coolSp}°F (${phase})`;
        }
      }
      // Append profile info
      directiveText += `, profile: ${resolved.profile_name || resolved.source}`;
    } else {
      directiveText = pushResult.pushed
        ? `Pushed ${desired.hvac_mode} ${desired.heat_setpoint_f}–${desired.cool_setpoint_f}°F (${phase})`
        : "No zone temp available";
    }

    if (climateEntityId) {
      const stateUpdate: Record<string, any> = {
        eagle_eye_directive: directiveText,
        directive_generated_at: new Date().toISOString(),
      };

      // Track desired values so we can detect manager overrides next cycle.
      // Always save both heat AND cool, even when push is skipped ("Already at target"),
      // so that last_pushed_cool_f is never null/? in subsequent logs.
      if (pushResult.pushed) {
        const effective = pushResult.desired_state;
        stateUpdate.last_pushed_heat_f = effective.heat_setpoint_f;
        stateUpdate.last_pushed_cool_f = effective.cool_setpoint_f;
        stateUpdate.last_pushed_at = new Date().toISOString();
      } else {
        // Even when skipped, record what we wanted — these are the enforcement targets
        stateUpdate.last_pushed_heat_f = desired.heat_setpoint_f;
        stateUpdate.last_pushed_cool_f = desired.cool_setpoint_f;
      }

      await supabase
        .from("b_thermostat_state")
        .update(stateUpdate)
        .eq("entity_id", climateEntityId)
        .eq("site_id", siteId);
    }

    // Read back actual state from HA to confirm push took effect
    // Skip on cron path — saves ~11s per zone (1s sleep + 10s fetch)
    if (pushResult.pushed && climateEntityId && !isCron) {
      await readBackThermostatState(config, climateEntityId, siteId, supabase, desired);
    } else if (pushResult.pushed && isCron) {
      console.log(`[ha-push] Zone "${zone.name}": read-back skipped (cron path)`);
    }

    // Log full resolution chain to b_records_log (queryable forever)
    const pushResultLabel = pushResult.pushed
      ? "pushed"
      : pushResult.reason === "Already at target"
      ? "skipped_at_target"
      : "failed";

    try {
      await supabase.from("b_records_log").insert({
        org_id: site?.org_id || null,
        site_id: siteId,
        equipment_id: zone.equipment_id || null,
        device_id: zone.thermostat_device_id,
        event_type: "thermostat_push_attempt",
        event_date: targetDate,
        source: "ha_push",
        message: `${zone.name}: Base ${baseHeat}/${baseCool} (${phase}) → Adj ${totalAdj >= 0 ? "+" : ""}${totalAdj} → Final ${finalHeat}/${finalCool} → ${pushResultLabel}`,
        metadata: {
          base_heat: baseHeat,
          base_cool: baseCool,
          phase,
          feels_like_adj: feelsLikeAdj,
          smart_start_adj: smartStartAdj,
          occupancy_adj: occupancyAdj,
          adjusted_heat: adjustedHeat,
          adjusted_cool: adjustedCool,
          guardrail_clamped: guardrailClamped,
          guardrail_min: gMin,
          guardrail_max: gMax,
          manager_override: false,
          final_heat: finalHeat,
          final_cool: finalCool,
          push_result: pushResultLabel,
          entity_id: climateEntityId,
          profile: resolved.profile_name || resolved.source,
          trigger,
          pre_push_actual: {
            source: usedLiveState ? "live_ha" : "cache",
            hvac_mode: current.hvac_mode,
            heat_f: current.target_temp_low_f ?? current.current_setpoint_f,
            cool_f: current.target_temp_high_f,
          },
          desired: {
            hvac_mode: desired.hvac_mode,
            heat_f: desired.heat_setpoint_f,
            cool_f: desired.cool_setpoint_f,
          },
          mode_mismatch: current.hvac_mode !== desired.hvac_mode,
          push_decision_reason: guardrailClamped ? "guardrail_override"
            : current.hvac_mode !== desired.hvac_mode ? "mode_mismatch"
            : pushResult.pushed ? "setpoint_mismatch"
            : !usedLiveState ? "live_read_failed_cache_used"
            : "already_at_target",
        },
        created_by: triggeredBy || "system",
      });
    } catch (logErr) {
      console.error("[ha-push] Failed to log thermostat_push_attempt:", logErr);
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
        created_by: triggeredBy || "system",
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

  console.log(`[ha-push] Push complete for site ${siteId}: ${results.length} zone(s) processed, elapsed=${Date.now() - startMs}ms`);
  return { results, ha_connected: true, trigger };
}
