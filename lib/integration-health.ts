// lib/integration-health.ts
//
// Detects unavailable HA integrations per site, triggers auto-reload,
// and maintains incident lifecycle in b_integration_health_log.

import { SupabaseClient } from "@supabase/supabase-js";

interface HAConfig {
  haUrl: string | null;
  haToken: string | null;
}

// Maps a_devices.protocol → HA service domain for reload
const PROTOCOL_TO_HA_SERVICE: Record<string, string> = {
  modbus: "modbus",
  "z-wave": "zwave_js",
  zwave: "zwave_js",
  zwave_js: "zwave_js",
  mqtt: "mqtt",
};

// How many consecutive 5-min snapshots must be unavailable before we act
const CONSECUTIVE_UNAVAILABLE_THRESHOLD = 2; // ~10 minutes

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function checkIntegrationHealth(
  supabase: SupabaseClient,
  siteId: string,
  orgId: string,
  haConfig: HAConfig
): Promise<void> {
  // 1. Get all sensors for this site joined to their device protocol info
  //    Entity IDs live in a_sensors, not a_devices.entity_id
  const { data: sensors, error: sensorErr } = await supabase
    .from("a_sensors")
    .select(`
      entity_id,
      sensor_type,
      device_id,
      equipment_id,
      a_devices!inner (
        device_id,
        device_name,
        protocol,
        ha_device_id,
        equipment_id
      )
    `)
    .eq("site_id", siteId)
    .not("entity_id", "is", null)
    .not("a_devices.protocol", "is", null);

  if (sensorErr || !sensors || sensors.length === 0) return;

  // 2. Get current entity states from b_entity_sync
  const entityIds = sensors.map((s) => s.entity_id).filter(Boolean);
  const { data: entityStates, error: syncErr } = await supabase
    .from("b_entity_sync")
    .select("entity_id, last_state, last_updated, ha_device_id")
    .eq("site_id", siteId)
    .in("entity_id", entityIds);

  if (syncErr || !entityStates) return;

  const stateByEntity = new Map(entityStates.map((e) => [e.entity_id, e]));

  // 3. Group by device (protocol + ha_device_id) to detect device-level failures
  type DeviceGroup = {
    protocol: string;
    ha_device_id: string | null;
    device_id: string;
    device_name: string;
    equipment_id: string | null;
    entities: string[];
    unavailableCount: number;
  };

  const groupMap = new Map<string, DeviceGroup>();

  for (const sensor of sensors) {
    const device = (sensor as any).a_devices;
    if (!device?.protocol) continue;

    const key = `${device.protocol}::${device.ha_device_id || device.device_id}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        protocol: device.protocol,
        ha_device_id: device.ha_device_id,
        device_id: device.device_id,
        device_name: device.device_name,
        equipment_id: sensor.equipment_id || device.equipment_id,
        entities: [],
        unavailableCount: 0,
      });
    }
    const group = groupMap.get(key)!;
    group.entities.push(sensor.entity_id);

    const state = stateByEntity.get(sensor.entity_id);
    if (state?.last_state === "unavailable" || state?.last_state === "unknown") {
      group.unavailableCount++;
    }
  }

  // 4. Process each device group
  for (const group of groupMap.values()) {
    const allUnavailable =
      group.entities.length > 0 &&
      group.unavailableCount === group.entities.length;

    const integrationName = `${group.protocol}_${group.device_name
      .toLowerCase()
      .replace(/\s+/g, "_")}`;

    const now = new Date();
    const eventDate = now.toISOString().split("T")[0];
    const eventTime = now.toTimeString().split(" ")[0];

    // Check for existing open incident
    const { data: openIncident } = await supabase
      .from("b_integration_health_log")
      .select("id, detected_at, recovery_attempts, consecutive_nulls")
      .eq("site_id", siteId)
      .eq("integration_name", integrationName)
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (allUnavailable) {
      // ── Integration is DOWN ──────────────────────────────────────────────

      if (!openIncident) {
        // Measure how long it's been unavailable via last_updated staleness
        const oldestUnavailable = group.entities
          .map((eid) => stateByEntity.get(eid))
          .filter((s) => s?.last_state === "unavailable" || s?.last_state === "unknown")
          .map((s) => new Date(s!.last_updated).getTime())
          .sort()[0];

        const minutesUnavailable = oldestUnavailable
          ? (Date.now() - oldestUnavailable) / 60000
          : 0;

        const consecutiveNulls = Math.floor(minutesUnavailable / 5);

        if (consecutiveNulls < CONSECUTIVE_UNAVAILABLE_THRESHOLD) {
          // Not long enough yet — wait for next cron cycle
          continue;
        }

        // Trigger HA reload
        const reloadSuccess = await triggerHAReload(haConfig, group.protocol);

        // Create incident record
        const { data: newIncident } = await supabase
          .from("b_integration_health_log")
          .insert({
            org_id: orgId,
            site_id: siteId,
            equipment_id: group.equipment_id,
            integration_name: integrationName,
            entity_id: group.entities[0],
            consecutive_nulls: consecutiveNulls,
            action_taken: "reload_triggered",
            action_taken_at: now.toISOString(),
            recovery_attempts: 1,
            recovery_successful: reloadSuccess,
          })
          .select("id")
          .single();

        // Audit log
        await supabase.from("b_records_log").insert({
          org_id: orgId,
          site_id: siteId,
          equipment_id: group.equipment_id,
          device_id: group.device_id,
          ha_device_id: group.ha_device_id,
          event_type: "integration_auto_reload",
          message: `Auto-reloaded ${integrationName} after ${consecutiveNulls} consecutive unavailable snapshots. Reload ${reloadSuccess ? "succeeded" : "failed"}.`,
          source: "system_cron",
          created_by: "system",
          event_date: eventDate,
          event_time: eventTime,
          metadata: {
            integration_name: integrationName,
            protocol: group.protocol,
            consecutive_nulls: consecutiveNulls,
            reload_success: reloadSuccess,
            entities: group.entities,
            health_log_id: newIncident?.id ?? null,
          },
        });

        console.log(
          `[integration-health] Site ${siteId}: ${integrationName} unavailable ~${Math.round(minutesUnavailable)}min. Reload ${reloadSuccess ? "OK" : "FAILED"}.`
        );
      } else {
        // ── Existing open incident — increment and retry with backoff ───────

        const attempts = (openIncident.recovery_attempts || 0) + 1;

        await supabase
          .from("b_integration_health_log")
          .update({
            recovery_attempts: attempts,
            action_taken_at: now.toISOString(),
            consecutive_nulls: openIncident.consecutive_nulls + 1,
          })
          .eq("id", openIncident.id);

        // Retry on odd attempts only to avoid hammering HA
        if (attempts % 2 === 1) {
          const reloadSuccess = await triggerHAReload(haConfig, group.protocol);

          await supabase.from("b_records_log").insert({
            org_id: orgId,
            site_id: siteId,
            equipment_id: group.equipment_id,
            device_id: group.device_id,
            ha_device_id: group.ha_device_id,
            event_type: "integration_reload_retry",
            message: `${integrationName} still unavailable. Retry attempt ${attempts}. Reload ${reloadSuccess ? "succeeded" : "failed"}.`,
            source: "system_cron",
            created_by: "system",
            event_date: eventDate,
            event_time: eventTime,
            metadata: {
              integration_name: integrationName,
              protocol: group.protocol,
              attempt_number: attempts,
              reload_success: reloadSuccess,
              health_log_id: openIncident.id,
            },
          });

          console.log(
            `[integration-health] Site ${siteId}: ${integrationName} still down (attempt ${attempts}). Reload ${reloadSuccess ? "OK" : "FAILED"}.`
          );
        }
      }
    } else if (!allUnavailable && openIncident) {
      // ── Integration has RECOVERED ────────────────────────────────────────

      const detectedAt = new Date(openIncident.detected_at).getTime();
      const downtimeMinutes = Math.round((Date.now() - detectedAt) / 60000);

      await supabase
        .from("b_integration_health_log")
        .update({
          resolved_at: now.toISOString(),
          downtime_minutes: downtimeMinutes,
          recovery_successful: true,
        })
        .eq("id", openIncident.id);

      await supabase.from("b_records_log").insert({
        org_id: orgId,
        site_id: siteId,
        equipment_id: group.equipment_id,
        device_id: group.device_id,
        ha_device_id: group.ha_device_id,
        event_type: "integration_recovered",
        message: `${integrationName} recovered after ${downtimeMinutes} minutes of downtime.`,
        source: "system_cron",
        created_by: "system",
        event_date: eventDate,
        event_time: eventTime,
        metadata: {
          integration_name: integrationName,
          downtime_minutes: downtimeMinutes,
          health_log_id: openIncident.id,
        },
      });

      console.log(
        `[integration-health] Site ${siteId}: ${integrationName} recovered after ${downtimeMinutes}min.`
      );
    }
  }
}

// ─── HA Reload Helper ─────────────────────────────────────────────────────────

async function triggerHAReload(
  haConfig: HAConfig,
  protocol: string
): Promise<boolean> {
  if (!haConfig.haUrl || !haConfig.haToken) {
    console.warn("[integration-health] No HA config available for reload.");
    return false;
  }

  const serviceDomain = PROTOCOL_TO_HA_SERVICE[protocol.toLowerCase()];
  if (!serviceDomain) {
    console.warn(
      `[integration-health] No HA service mapped for protocol: ${protocol}`
    );
    return false;
  }

  try {
    const res = await fetch(
      `${haConfig.haUrl}/api/services/${serviceDomain}/reload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${haConfig.haToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    return res.ok;
  } catch (err: any) {
    console.error(`[integration-health] HA reload fetch failed:`, err.message);
    return false;
  }
}