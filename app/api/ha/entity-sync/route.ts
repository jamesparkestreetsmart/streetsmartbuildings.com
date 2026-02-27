// app/api/ha/entity-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateRealtime } from "@/lib/alert-evaluator";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

type IncomingEntity = {
  entity_id: string;
  friendly_name?: string | null;
  domain: string;
  device_class?: string | null;
  unit_of_measurement?: string | null;
  area_id?: string | null;
  state?: string | number | null;
  last_state?: string | null;
  last_updated?: string | null;
  last_seen_at?: string | null;

  ha_device_id?: string | null;
  device_name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  sw_version?: string | null;
  hw_version?: string | null;
};

type LibrarySensor = {
  entity_suffix: string;
  sensor_type: string;
  name: string;
};

// ─── Orphan Entity Resolution ─────────────────────────────────────────────────

async function resolveOrphanEntities(
  siteId: string,
  orphanEntities: IncomingEntity[]
): Promise<Map<string, { ha_device_id: string; device_name: string }>> {
  const result = new Map<string, { ha_device_id: string; device_name: string }>();

  if (orphanEntities.length === 0) return result;

  const { data: siteDevices } = await supabase
    .from("a_devices")
    .select("device_id, device_name, library_device_id, protocol")
    .eq("site_id", siteId)
    .not("library_device_id", "is", null);

  if (!siteDevices || siteDevices.length === 0) return result;

  const libraryIds = [...new Set(siteDevices.map((d) => d.library_device_id).filter(Boolean))];

  const { data: libraryDevices } = await supabase
    .from("library_devices")
    .select("library_device_id, default_sensors, template_name")
    .in("library_device_id", libraryIds);

  if (!libraryDevices || libraryDevices.length === 0) return result;

  const libraryMap = new Map<string, LibrarySensor[]>();
  for (const ld of libraryDevices) {
    const sensors: LibrarySensor[] =
      typeof ld.default_sensors === "string"
        ? JSON.parse(ld.default_sensors)
        : ld.default_sensors ?? [];
    libraryMap.set(ld.library_device_id, sensors);
  }

  for (const device of siteDevices) {
    if (!device.library_device_id) continue;
    const sensors = libraryMap.get(device.library_device_id);
    if (!sensors || sensors.length === 0) continue;

    const syntheticId = `device_${device.device_id}`;
    const deviceName = device.device_name || "Unknown Device";
    const suffixes = sensors.map((s) => s.entity_suffix.toLowerCase());

    const matched = orphanEntities.filter((e) => {
      const slug = e.entity_id.split(".")[1]?.toLowerCase() || "";
      return suffixes.some((suffix) => slug.endsWith(suffix));
    });

    if (matched.length >= 2) {
      for (const entity of matched) {
        result.set(entity.entity_id, {
          ha_device_id: syntheticId,
          device_name: deviceName,
        });
      }
    }
  }

  return result;
}

// ─── Site Identity Resolution ─────────────────────────────────────────────────

async function resolveSiteIdentity(
  body: any
): Promise<{ site_id: string; org_id: string } | { error: string; status: number }> {
  const { site_slug, site_id, org_id } = body;

  if (site_slug) {
    const { data: site, error } = await supabase
      .from("a_sites")
      .select("site_id, org_id")
      .eq("site_slug", site_slug)
      .single();

    if (error || !site) {
      return { error: `Site not found for slug: ${site_slug}`, status: 404 };
    }

    return { site_id: site.site_id, org_id: site.org_id };
  }

  if (site_id && org_id) {
    return { site_id, org_id };
  }

  return { error: "Missing site_slug (or site_id + org_id)", status: 400 };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const identity = await resolveSiteIdentity(body);
  if ("error" in identity) {
    return NextResponse.json(
      { ok: false, error: identity.error },
      { status: identity.status }
    );
  }

  const { site_id, org_id } = identity;
  const { equipment_id, entities } = body ?? {};

  if (!Array.isArray(entities) || entities.length === 0) {
    return NextResponse.json(
      { ok: false, error: "entities must be a non-empty array" },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const incoming = (entities as IncomingEntity[]).filter((e) => e && e.entity_id && e.domain);

  // Load sensor type mappings — only keep 1:1 matches
  const { data: mappings } = await supabase
    .from("library_sensor_type_mapping")
    .select("sensor_type, ha_device_class")
    .not("ha_device_class", "is", null)
    .neq("ha_device_class", "");

  // Build auto-assign map: only where device_class has exactly one sensor_type
  const dcCounts: Record<string, string[]> = {};
  for (const m of mappings || []) {
    if (!dcCounts[m.ha_device_class]) dcCounts[m.ha_device_class] = [];
    if (!dcCounts[m.ha_device_class].includes(m.sensor_type)) {
      dcCounts[m.ha_device_class].push(m.sensor_type);
    }
  }

  const autoAssignMap: Record<string, string> = {};
  for (const [dc, types] of Object.entries(dcCounts)) {
    if (types.length === 1) {
      autoAssignMap[dc] = types[0];
    }
  }

  // Load existing sensor_type assignments so we don't overwrite manual picks
  const entityIds = incoming.map((e) => e.entity_id);
  const { data: existingEntities } = await supabase
    .from("b_entity_sync")
    .select("entity_id, sensor_type, last_state")
    .eq("site_id", site_id)
    .in("entity_id", entityIds);

  const existingSensorTypes = new Map<string, string | null>();
  const previousStates = new Map<string, string | null>();
  for (const e of existingEntities || []) {
    existingSensorTypes.set(e.entity_id, e.sensor_type);
    previousStates.set(e.entity_id, e.last_state);
  }

  // Resolve orphan entities
  const orphans = incoming.filter((e) => !e.ha_device_id);
  const orphanMap = await resolveOrphanEntities(site_id, orphans);

  // Update a_devices.ha_device_id for matched devices (one-time link)
  if (orphanMap.size > 0) {
    const syntheticIds = new Set<string>();
    orphanMap.forEach((v) => syntheticIds.add(v.ha_device_id));

    for (const syntheticId of syntheticIds) {
      const deviceId = syntheticId.replace("device_", "");
      await supabase
        .from("a_devices")
        .update({ ha_device_id: syntheticId })
        .eq("device_id", deviceId)
        .is("ha_device_id", null);
    }
  }

  // Build rows
  let autoAssigned = 0;
  let preserved = 0;

  const rows = incoming.map((e) => {
    const orphanMatch = orphanMap.get(e.entity_id);

    // sensor_type logic:
    // 1. Preserve existing (manual pick from gateways UI)
    // 2. Auto-assign ONLY if device_class has exactly one sensor_type
    // 3. null — user picks from dropdown on gateways page
    let sensorType: string | null = null;
    const existing = existingSensorTypes.get(e.entity_id);

    if (existing) {
      sensorType = existing;
      preserved++;
    } else if (e.device_class && autoAssignMap[e.device_class]) {
      sensorType = autoAssignMap[e.device_class];
      autoAssigned++;
    }

    return {
      org_id,
      site_id,
      equipment_id: equipment_id || null,
      entity_id: e.entity_id,

      friendly_name: e.friendly_name ?? null,
      domain: e.domain,
      device_class: e.device_class ?? null,
      unit_of_measurement: e.unit_of_measurement ?? null,
      area_id: e.area_id ?? null,

      last_state:
        e.state !== undefined && e.state !== null
          ? String(e.state)
          : e.last_state ?? null,

      last_updated: e.last_updated ?? nowIso,
      last_seen_at: nowIso,

      ha_device_id: e.ha_device_id ?? orphanMatch?.ha_device_id ?? null,
      ha_device_name: e.device_name ?? orphanMatch?.device_name ?? null,

      manufacturer: e.manufacturer ?? null,
      model: e.model ?? null,
      sw_version: e.sw_version ?? null,
      hw_version: e.hw_version ?? null,
      sensor_type: sensorType,
      raw_json: e as any,
    };
  });

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid entities in payload" },
      { status: 400 }
    );
  }

  // ─── State Change Detection ───────────────────────────────────────────────
  // Compare previous state to new state for each entity.
  // Write transition records for entities that actually changed.

  let stateChangesLogged = 0;

  try {
    // Load sensor role mappings for this site's equipment
    // a_sensors maps entity_id → equipment_id + role (label)
    const { data: sensorMappings } = await supabase
      .from("a_sensors")
      .select("entity_id, equipment_id, label, sensor_type")
      .eq("site_id", site_id)
      .in("entity_id", entityIds);

    const sensorRoleMap = new Map<string, { equipment_id: string | null; role: string }>();
    for (const m of sensorMappings || []) {
      if (!m.entity_id) continue;
      // Role extracted from label format: "Equipment Name — role"
      const role = (m.label?.split(" — ")[1] || m.sensor_type || "").toLowerCase();
      sensorRoleMap.set(m.entity_id, {
        equipment_id: m.equipment_id || null,
        role,
      });
    }

    // Also check for climate entities (thermostat state changes)
    const climateEntities = new Set<string>();
    for (const e of incoming) {
      if (e.domain === "climate") climateEntities.add(e.entity_id);
    }

    // Detect transitions
    const stateChangeRows: any[] = [];

    for (const row of rows) {
      const prevState = previousStates.get(row.entity_id);
      const newState = row.last_state;

      // Skip if no previous state (first sync) or state unchanged
      if (prevState === undefined || prevState === null) continue;
      if (prevState === newState) continue;

      // Determine if this entity is tracked (has a sensor role or is a climate entity)
      const mapping = sensorRoleMap.get(row.entity_id);
      const isClimate = climateEntities.has(row.entity_id);

      // Only log transitions for tracked entities
      if (!mapping && !isClimate) continue;

      const role = mapping?.role || (isClimate ? "thermostat_state" : null);
      const eqId = mapping?.equipment_id || null;

      // Derive high-level event from the transition
      let derivedEvent: string | null = null;

      if (role) {
        const prevNum = parseFloat(prevState);
        const newNum = parseFloat(newState as string);

        if (role.includes("compressor") || role.includes("comp")) {
          // Compressor current: crossing threshold = on/off
          const threshold = 0.5; // Will be refined per-zone later
          const wasOn = !isNaN(prevNum) && prevNum > threshold;
          const isOn = !isNaN(newNum) && newNum > threshold;
          if (!wasOn && isOn) derivedEvent = "compressor_on";
          else if (wasOn && !isOn) derivedEvent = "compressor_off";
        } else if (role.includes("power") && !role.includes("factor") && !role.includes("reactive") && !role.includes("apparent")) {
          // Power draw transition
          const wasDrawing = !isNaN(prevNum) && prevNum > 0.05;
          const isDrawing = !isNaN(newNum) && newNum > 0.05;
          if (!wasDrawing && isDrawing) derivedEvent = "power_draw_started";
          else if (wasDrawing && !isDrawing) derivedEvent = "power_draw_stopped";
        } else if (role.includes("cabinet") || role === "cabinet_door_state") {
          const wasOpen = ["on", "open", "true", "1"].includes(prevState.toLowerCase());
          const isOpen = ["on", "open", "true", "1"].includes((newState as string).toLowerCase());
          if (!wasOpen && isOpen) derivedEvent = "cabinet_opened";
          else if (wasOpen && !isOpen) derivedEvent = "cabinet_closed";
        } else if (role.includes("water") && role.includes("leak")) {
          const wasWet = ["on", "wet", "true", "1", "detected"].includes(prevState.toLowerCase());
          const isWet = ["on", "wet", "true", "1", "detected"].includes((newState as string).toLowerCase());
          if (!wasWet && isWet) derivedEvent = "water_leak_detected";
          else if (wasWet && !isWet) derivedEvent = "water_leak_cleared";
        } else if (isClimate || role === "thermostat_state") {
          // HVAC action changes: idle → heating, cooling → idle, etc.
          const newLower = (newState as string).toLowerCase();
          if (newLower === "idle" || newLower === "off") derivedEvent = "hvac_idle";
          else if (newLower === "heating" || newLower === "heat") derivedEvent = "hvac_heating";
          else if (newLower === "cooling" || newLower === "cool") derivedEvent = "hvac_cooling";
          else if (newLower === "fan") derivedEvent = "hvac_fan_only";
          else derivedEvent = `hvac_${newLower}`;
        }
      }

      stateChangeRows.push({
        site_id,
        entity_id: row.entity_id,
        equipment_id: eqId,
        ha_device_id: row.ha_device_id || null,
        previous_state: prevState,
        new_state: newState,
        changed_at: row.last_updated || new Date().toISOString(),
        state_role: role,
        derived_event: derivedEvent,
        metadata: {
          friendly_name: row.friendly_name,
          domain: row.domain,
          unit: row.unit_of_measurement,
        },
      });
    }

    // Batch insert state changes
    if (stateChangeRows.length > 0) {
      const { error: scError } = await supabase
        .from("b_state_change_log")
        .insert(stateChangeRows);

      if (scError) {
        console.error("[entity-sync] State change log error:", scError.message);
        // Don't fail the whole sync — this is supplementary logging
      } else {
        stateChangesLogged = stateChangeRows.length;
        console.log(`[entity-sync] Logged ${stateChangeRows.length} state transitions`);
      }

      // ─── Alert Evaluation (realtime) ──────────────────────────────────────
      // Evaluate each changed entity against alert definitions
      for (const sc of stateChangeRows) {
        try {
          await evaluateRealtime(
            supabase,
            sc.entity_id,
            sc.new_state,
            sc.previous_state,
            org_id,
            site_id
          );
        } catch (alertErr) {
          console.error("[entity-sync] Alert evaluation error:", alertErr);
          // Never let alert evaluation break entity sync
        }
      }
    }
  } catch (stateChangeErr: any) {
    // Non-fatal — log and continue with the main upsert
    console.error("[entity-sync] State change tracking error:", stateChangeErr.message);
  }
  // ─── End State Change Detection ────────────────────────────────────────────

  // ─── Real-time Manager Override Detection (Climate Entities) ─────────────
  // When a climate entity's target_temp_low or target_temp_high changes,
  // check if it's a manager override and apply guardrails.
  let overridesDetected = 0;

  try {
    const climateIncoming = incoming.filter((e) => e.domain === "climate");
    const SRKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (climateIncoming.length > 0 && SRKEY) {
      const svcSupabase = createClient(SUPABASE_URL, SRKEY, {
        auth: { persistSession: false },
      });

      for (const ce of climateIncoming) {
        try {
          // Extract target temps from incoming entity attributes
          const raw = ce as any;
          const incomingHeat: number | null =
            raw.target_temp_low ??
            raw.attributes?.target_temp_low ??
            null;
          const incomingCool: number | null =
            raw.target_temp_high ??
            raw.attributes?.target_temp_high ??
            null;

          // If no target temp data in the payload, skip (cron will catch it)
          if (incomingHeat == null && incomingCool == null) continue;

          // Load b_thermostat_state for this climate entity
          const { data: ts } = await svcSupabase
            .from("b_thermostat_state")
            .select("*")
            .eq("entity_id", ce.entity_id)
            .eq("site_id", site_id)
            .maybeSingle();

          if (!ts) continue;

          // Update b_thermostat_state with incoming target temps
          const tsUpdate: Record<string, any> = {
            last_synced_at: new Date().toISOString(),
          };
          if (incomingHeat != null) tsUpdate.target_temp_low_f = incomingHeat;
          if (incomingCool != null) tsUpdate.target_temp_high_f = incomingCool;
          const rawTemp =
            raw.current_temperature ?? raw.attributes?.current_temperature;
          if (rawTemp != null) tsUpdate.current_temperature_f = rawTemp;

          await svcSupabase
            .from("b_thermostat_state")
            .update(tsUpdate)
            .eq("entity_id", ce.entity_id)
            .eq("site_id", site_id);

          // 30-second cooldown: skip if Eagle Eyes just pushed
          if (ts.last_pushed_at) {
            const elapsed =
              Date.now() - new Date(ts.last_pushed_at).getTime();
            if (elapsed < 30_000) {
              console.log(
                `[entity-sync] Override skip for ${ce.entity_id} — ${Math.round(elapsed / 1000)}s since last push`
              );
              continue;
            }
          }

          // Must have a last_pushed reference to detect override
          if (ts.last_pushed_heat_f == null) continue;

          // Already in override? Skip (ha-push cron manages the timer)
          if (ts.manager_override_active) continue;

          // Compare incoming vs last pushed
          const refHeat = incomingHeat ?? ts.target_temp_low_f;
          if (refHeat == null) continue;

          const delta = Math.abs(refHeat - ts.last_pushed_heat_f);
          if (delta < 1.0) continue; // No significant change

          console.log(
            `[entity-sync] Manager override detected on ${ce.entity_id}: ` +
              `incoming=${refHeat}°F vs pushed=${ts.last_pushed_heat_f}°F (delta=${delta}°F)`
          );

          // ── Load zone + profile for guardrails ──
          const { data: syncRow } = await svcSupabase
            .from("b_entity_sync")
            .select("ha_device_id")
            .eq("entity_id", ce.entity_id)
            .eq("site_id", site_id)
            .maybeSingle();

          if (!syncRow?.ha_device_id) continue;

          const { data: device } = await svcSupabase
            .from("a_devices")
            .select("device_id")
            .eq("ha_device_id", syncRow.ha_device_id)
            .eq("site_id", site_id)
            .maybeSingle();

          if (!device) continue;

          const { data: zone } = await svcSupabase
            .from("a_hvac_zones")
            .select(
              "hvac_zone_id, name, equipment_id, profile_id, manager_offset_up_f, manager_offset_down_f, manager_override_reset_minutes"
            )
            .eq("thermostat_device_id", device.device_id)
            .eq("site_id", site_id)
            .maybeSingle();

          if (!zone) continue;

          // Load profile guardrails if zone has a profile
          let profileGuardrails: {
            manager_offset_up_f?: number | null;
            manager_offset_down_f?: number | null;
            manager_override_reset_minutes?: number | null;
          } = {};
          if (zone.profile_id) {
            const { data: p } = await svcSupabase
              .from("b_thermostat_profiles")
              .select(
                "manager_offset_up_f, manager_offset_down_f, manager_override_reset_minutes"
              )
              .eq("profile_id", zone.profile_id)
              .maybeSingle();
            if (p) profileGuardrails = p;
          }

          const maxRaise =
            zone.manager_offset_up_f ??
            profileGuardrails.manager_offset_up_f ??
            4;
          const maxLower =
            zone.manager_offset_down_f ??
            profileGuardrails.manager_offset_down_f ??
            4;
          const resetMinutes =
            zone.manager_override_reset_minutes ??
            profileGuardrails.manager_override_reset_minutes ??
            120;

          // Expected = last pushed (profile + all adjustments at push time)
          const expected = ts.last_pushed_heat_f;
          const managerAdj =
            Math.round((refHeat - expected) * 10) / 10;

          // Load site info for HA credentials and logging
          const { data: siteInfo } = await svcSupabase
            .from("a_sites")
            .select("ha_url, ha_token, timezone, org_id")
            .eq("site_id", site_id)
            .single();

          const localDate = new Date().toLocaleDateString("en-CA", {
            timeZone: siteInfo?.timezone || "America/Chicago",
          });

          let finalHeat = refHeat;
          let finalCool =
            incomingCool ?? ts.target_temp_high_f ?? null;
          let bounced = false;

          // ── Check guardrails ──
          if (managerAdj > maxRaise) {
            finalHeat = expected + maxRaise;
            bounced = true;
            console.log(
              `[entity-sync] Override exceeds +${maxRaise}°F — bouncing to ${finalHeat}°F`
            );
          } else if (managerAdj < -maxLower) {
            finalHeat = expected - maxLower;
            bounced = true;
            console.log(
              `[entity-sync] Override exceeds -${maxLower}°F — bouncing to ${finalHeat}°F`
            );
          }

          // Also check cool side
          if (
            finalCool != null &&
            ts.last_pushed_cool_f != null
          ) {
            const coolAdj = finalCool - ts.last_pushed_cool_f;
            if (coolAdj > maxRaise) {
              finalCool = ts.last_pushed_cool_f + maxRaise;
              bounced = true;
            } else if (coolAdj < -maxLower) {
              finalCool = ts.last_pushed_cool_f - maxLower;
              bounced = true;
            }
          }

          // ── Bounce back to HA if guardrails exceeded ──
          if (bounced && siteInfo?.ha_url && siteInfo?.ha_token) {
            try {
              const hvacMode = ts.hvac_mode || "heat_cool";
              const tempBody: Record<string, any> = {
                entity_id: ce.entity_id,
              };
              if (hvacMode === "heat_cool" && finalCool != null) {
                tempBody.target_temp_low = finalHeat;
                tempBody.target_temp_high = finalCool;
              } else {
                tempBody.temperature = finalHeat;
              }

              await fetch(
                `${siteInfo.ha_url}/api/services/climate/set_temperature`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${siteInfo.ha_token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(tempBody),
                }
              );
              console.log(
                `[entity-sync] Bounced override on ${ce.entity_id} to ${finalHeat}°F`
              );
            } catch (haErr: any) {
              console.error(
                `[entity-sync] HA bounce-back failed for ${ce.entity_id}:`,
                haErr.message
              );
            }
          }

          // ── Log to b_records_log ──
          try {
            if (bounced) {
              await svcSupabase.from("b_records_log").insert({
                site_id,
                org_id: siteInfo?.org_id || org_id,
                equipment_id: zone.equipment_id || null,
                event_type: "manager_override_rejected",
                event_date: localDate,
                message: `Manager override rejected: ${managerAdj > 0 ? "+" : ""}${managerAdj}°F exceeds max ${managerAdj > 0 ? `+${maxRaise}` : `-${maxLower}`}°F, reset to ${finalHeat}°F (${zone.name})`,
                source: "entity_sync",
                metadata: {
                  entity_id: ce.entity_id,
                  zone_name: zone.name,
                  requested: refHeat,
                  clamped: finalHeat,
                  manager_adj: managerAdj,
                },
                created_by: "eagle_eyes",
              });
            } else {
              await svcSupabase.from("b_records_log").insert({
                site_id,
                org_id: siteInfo?.org_id || org_id,
                equipment_id: zone.equipment_id || null,
                event_type: "manager_override",
                event_date: localDate,
                message: `Manager override: ${managerAdj > 0 ? "+" : ""}${managerAdj}°F (${zone.name}), expires in ${Math.round(resetMinutes / 60)}hr`,
                source: "entity_sync",
                metadata: {
                  entity_id: ce.entity_id,
                  zone_name: zone.name,
                  new_heat: finalHeat,
                  manager_adj: managerAdj,
                  reset_minutes: resetMinutes,
                },
                created_by: "eagle_eyes",
              });
            }
          } catch (logErr: any) {
            console.error(
              `[entity-sync] Override log error:`,
              logErr.message
            );
          }

          // ── Update b_thermostat_state with override info ──
          const overrideUpdate: Record<string, any> = {
            manager_override_active: true,
            manager_override_heat_f: finalHeat,
            manager_override_cool_f: finalCool,
            manager_override_started_at: new Date().toISOString(),
            manager_override_remaining_min: resetMinutes,
            last_pushed_heat_f: finalHeat,
            last_pushed_cool_f: finalCool,
          };
          if (bounced) {
            // Set cooldown so echo from bounce-back push is ignored
            overrideUpdate.last_pushed_at = new Date().toISOString();
          }

          await svcSupabase
            .from("b_thermostat_state")
            .update(overrideUpdate)
            .eq("entity_id", ce.entity_id)
            .eq("site_id", site_id);

          // ── Immediate b_zone_setpoint_log snapshot ──
          try {
            const { data: lastLog } = await svcSupabase
              .from("b_zone_setpoint_log")
              .select("*")
              .eq("hvac_zone_id", zone.hvac_zone_id)
              .order("recorded_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            await svcSupabase.from("b_zone_setpoint_log").insert({
              site_id,
              hvac_zone_id: zone.hvac_zone_id,
              phase: lastLog?.phase || "occupied",
              profile_heat_f: lastLog?.profile_heat_f || null,
              profile_cool_f: lastLog?.profile_cool_f || null,
              feels_like_adj: lastLog?.feels_like_adj || 0,
              smart_start_adj: lastLog?.smart_start_adj || 0,
              occupancy_adj: lastLog?.occupancy_adj || 0,
              manager_adj: managerAdj,
              active_heat_f: finalHeat,
              active_cool_f: finalCool,
              zone_temp_f: lastLog?.zone_temp_f || null,
              zone_humidity: lastLog?.zone_humidity || null,
              feels_like_temp_f: lastLog?.feels_like_temp_f || null,
              occupied_sensor_count:
                lastLog?.occupied_sensor_count || 0,
              fan_mode: ts.fan_mode || null,
              hvac_action: ts.hvac_action || null,
              supply_temp_f: lastLog?.supply_temp_f || null,
              return_temp_f: lastLog?.return_temp_f || null,
              delta_t: lastLog?.delta_t || null,
              power_kw: lastLog?.power_kw || null,
              comp_on: lastLog?.comp_on || null,
              adjustment_factors: [
                ...(lastLog?.adjustment_factors?.filter(
                  (f: any) => f.name !== "manager"
                ) || []),
                {
                  name: "manager",
                  heat_adj: managerAdj,
                  cool_adj: managerAdj,
                  value: managerAdj,
                  reason: bounced
                    ? `Override rejected: ${managerAdj > 0 ? "+" : ""}${managerAdj}°F → clamped to ${managerAdj > 0 ? `+${maxRaise}` : `-${maxLower}`}°F`
                    : `Manager override ${managerAdj > 0 ? "+" : ""}${managerAdj}°F`,
                },
              ],
            });
            console.log(
              `[entity-sync] Wrote immediate setpoint log for zone ${zone.name}`
            );
          } catch (logErr: any) {
            console.error(
              `[entity-sync] Immediate setpoint log error:`,
              logErr.message
            );
          }

          overridesDetected++;
        } catch (ceErr: any) {
          console.error(
            `[entity-sync] Override detection error for ${ce.entity_id}:`,
            ceErr.message
          );
        }
      }
    }
  } catch (overrideErr: any) {
    // Non-fatal — log and continue with the main upsert
    console.error(
      "[entity-sync] Manager override detection error:",
      overrideErr.message
    );
  }
  // ─── End Manager Override Detection ──────────────────────────────────────

  const { error } = await supabase
    .from("b_entity_sync")
    .upsert(rows, {
      onConflict: "site_id,entity_id",
    });

  if (error) {
    console.error("b_entity_sync upsert error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to upsert entities",
        details: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Entities synced successfully",
    count: rows.length,
    orphans_matched: orphanMap.size,
    state_changes_logged: stateChangesLogged,
    overrides_detected: overridesDetected,
    sensor_types: {
      auto_assigned: autoAssigned,
      preserved: preserved,
    },
  });
}