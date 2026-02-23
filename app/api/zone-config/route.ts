import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

// GET — full zone config with nested spaces, sensors, thermostat data, computed temps
export async function GET(req: NextRequest) {
  const site_id = req.nextUrl.searchParams.get("site_id");
  if (!site_id) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  try {
    // Spaces: try with zone_weight, fall back without it
    let spaces: any[] | null = null;
    const { data: spacesFullData, error: spacesFullErr } = await supabase
      .from("a_spaces")
      .select("space_id, name, space_type, equipment_id, zone_weight")
      .eq("site_id", site_id)
      .order("name");

    if (spacesFullErr) {
      console.warn("[zone-config] zone_weight column may not exist, falling back:", spacesFullErr.message);
      const { data: spacesBasicData } = await supabase
        .from("a_spaces")
        .select("space_id, name, space_type, equipment_id")
        .eq("site_id", site_id)
        .order("name");
      spaces = (spacesBasicData || []).map((s: any) => ({ ...s, zone_weight: null }));
    } else {
      spaces = spacesFullData;
    }

    // Zones: try with zone_temp_source, fall back without it
    let zones: any[] | null = null;
    const ZONE_COLS_FULL = "hvac_zone_id, name, equipment_id, thermostat_device_id, control_scope, zone_temp_source, profile_id, site_id, org_id";
    const ZONE_COLS_BASIC = "hvac_zone_id, name, equipment_id, thermostat_device_id, control_scope, profile_id, site_id, org_id";

    const { data: zonesFullData, error: zonesFullErr } = await supabase
      .from("a_hvac_zones")
      .select(ZONE_COLS_FULL)
      .eq("site_id", site_id)
      .order("name");

    if (zonesFullErr) {
      console.warn("[zone-config] zone_temp_source column may not exist, falling back:", zonesFullErr.message);
      const { data: zonesBasicData } = await supabase
        .from("a_hvac_zones")
        .select(ZONE_COLS_BASIC)
        .eq("site_id", site_id)
        .order("name");
      zones = zonesBasicData;
    } else {
      zones = zonesFullData;
    }

    const [
      { data: spaceSensors },
      { data: equipmentRows },
      { data: entitySync },
      { data: thermostatStates },
      { data: deviceRows },
      { data: profiles },
    ] = await Promise.all([
      supabase
        .from("a_space_sensors")
        .select("id, space_id, sensor_type, entity_id, weight, is_primary")
        .eq("site_id", site_id),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, equipment_group")
        .eq("site_id", site_id),
      supabase
        .from("b_entity_sync")
        .select("entity_id, ha_device_id, ha_device_name, last_state, unit_of_measurement, last_seen_at, device_class, domain")
        .eq("site_id", site_id)
        .or("domain.eq.sensor,domain.eq.binary_sensor"),
      supabase
        .from("b_thermostat_state")
        .select("ha_device_id, friendly_name, current_temperature_f, current_humidity, last_synced_at")
        .eq("site_id", site_id),
      supabase
        .from("a_devices")
        .select("device_id, ha_device_id, equipment_id")
        .eq("site_id", site_id),
      supabase
        .from("b_thermostat_profiles")
        .select("profile_id, name"),
    ]);

    console.log("[zone-config] spaces:", (spaces || []).length, "zones:", (zones || []).length,
      "spaces with equipment_id:", (spaces || []).filter((s: any) => s.equipment_id).length,
      "zone equipment_ids:", (zones || []).map((z: any) => z.equipment_id).filter(Boolean));

    // Lookup maps
    const eqMap = new Map(
      (equipmentRows || []).map((e: any) => [e.equipment_id, e.equipment_name])
    );
    const entityMap = new Map(
      (entitySync || []).map((e: any) => [e.entity_id, e])
    );
    const profileMap = new Map(
      (profiles || []).map((p: any) => [p.profile_id, p.name])
    );
    // device_id → ha_device_id
    const deviceHaMap = new Map(
      (deviceRows || []).map((d: any) => [d.device_id, d.ha_device_id])
    );
    // ha_device_id → thermostat state
    const thermostatMap = new Map(
      (thermostatStates || []).map((t: any) => [t.ha_device_id, t])
    );

    // sensor assignments: space_id → sensor[]
    const sensorsBySpace = new Map<string, any[]>();
    for (const s of spaceSensors || []) {
      const arr = sensorsBySpace.get(s.space_id) || [];
      const entity = s.entity_id ? entityMap.get(s.entity_id) : null;
      const lastSeen = entity?.last_seen_at ? new Date(entity.last_seen_at).getTime() : 0;
      const fresh = lastSeen > 0 && Date.now() - lastSeen < 10 * 60 * 1000;
      arr.push({
        id: s.id,
        sensor_type: s.sensor_type,
        entity_id: s.entity_id,
        weight: parseFloat(s.weight) || 0,
        is_primary: s.is_primary,
        value: entity?.last_state ?? null,
        unit: entity?.unit_of_measurement ?? null,
        last_seen_at: entity?.last_seen_at ?? null,
        device_name: entity?.ha_device_name ?? null,
        fresh,
      });
      sensorsBySpace.set(s.space_id, arr);
    }

    // spaces by equipment_id
    const spacesByEquipment = new Map<string, any[]>();
    const unassignedSpaces: any[] = [];
    for (const sp of spaces || []) {
      if (sp.equipment_id) {
        const arr = spacesByEquipment.get(sp.equipment_id) || [];
        arr.push(sp);
        spacesByEquipment.set(sp.equipment_id, arr);
      } else {
        unassignedSpaces.push({
          space_id: sp.space_id,
          name: sp.name,
          space_type: sp.space_type,
        });
      }
    }

    // Compute weighted temp for a space
    function computeSpaceTemp(sensors: any[]): number | null {
      const tempSensors = sensors.filter(
        (s: any) => s.sensor_type === "temperature" && s.value != null && !isNaN(parseFloat(s.value))
      );
      if (tempSensors.length === 0) return null;
      const totalWeight = tempSensors.reduce((sum: number, s: any) => sum + (s.weight || 0), 0);
      if (totalWeight === 0) {
        // Simple average if no weights
        return parseFloat(
          (tempSensors.reduce((sum: number, s: any) => sum + parseFloat(s.value), 0) / tempSensors.length).toFixed(1)
        );
      }
      return parseFloat(
        (tempSensors.reduce((sum: number, s: any) => sum + parseFloat(s.value) * (s.weight / totalWeight), 0)).toFixed(1)
      );
    }

    // Build zone response
    const zonesResponse = (zones || []).map((zone: any) => {
      // Thermostat resolution: zone.thermostat_device_id → a_devices.device_id → ha_device_id → thermostat_state
      let thermostat: any = null;
      if (zone.thermostat_device_id) {
        const haDeviceId = deviceHaMap.get(zone.thermostat_device_id);
        if (haDeviceId) {
          const tState = thermostatMap.get(haDeviceId);
          if (tState) {
            thermostat = {
              name: tState.friendly_name,
              temp_f: tState.current_temperature_f,
              humidity: tState.current_humidity,
              last_synced: tState.last_synced_at,
            };
          }
        }
      }

      // Build spaces for this zone
      const zoneSpaces = (spacesByEquipment.get(zone.equipment_id) || []).map((sp: any) => {
        const sensors = sensorsBySpace.get(sp.space_id) || [];
        const computedTemp = computeSpaceTemp(sensors);
        const hasTempSensors = sensors.some((s: any) => s.sensor_type === "temperature");
        return {
          space_id: sp.space_id,
          name: sp.name,
          space_type: sp.space_type,
          zone_weight: sp.zone_weight != null ? parseFloat(sp.zone_weight) : null,
          sensors,
          computed_temp: computedTemp,
          temp_source: hasTempSensors ? "sensors" : (thermostat ? "thermostat_fallback" : "none"),
        };
      });

      // Compute zone temp (weighted avg of space temps)
      let computedZoneTemp: number | null = null;
      const spacesWithTemp = zoneSpaces.filter((s: any) => s.computed_temp != null || (thermostat && s.temp_source === "thermostat_fallback"));
      if (spacesWithTemp.length > 0) {
        const hasWeights = spacesWithTemp.some((s: any) => s.zone_weight != null && s.zone_weight > 0);
        if (hasWeights) {
          const totalW = spacesWithTemp.reduce((sum: number, s: any) => sum + (s.zone_weight || 0), 0);
          if (totalW > 0) {
            computedZoneTemp = parseFloat(
              spacesWithTemp.reduce((sum: number, s: any) => {
                const temp = s.computed_temp ?? thermostat?.temp_f ?? 0;
                return sum + temp * ((s.zone_weight || 0) / totalW);
              }, 0).toFixed(1)
            );
          }
        } else {
          // Simple average
          const temps = spacesWithTemp.map((s: any) => s.computed_temp ?? thermostat?.temp_f).filter(Boolean);
          if (temps.length > 0) {
            computedZoneTemp = parseFloat(
              (temps.reduce((a: number, b: number) => a + b, 0) / temps.length).toFixed(1)
            );
          }
        }
      }

      return {
        hvac_zone_id: zone.hvac_zone_id,
        name: zone.name,
        equipment_id: zone.equipment_id,
        equipment_name: zone.equipment_id ? eqMap.get(zone.equipment_id) || null : null,
        control_scope: zone.control_scope,
        zone_temp_source: zone.zone_temp_source || "thermostat_builtin",
        profile_name: zone.profile_id ? profileMap.get(zone.profile_id) || null : null,
        thermostat,
        spaces: zoneSpaces,
        computed_zone_temp: computedZoneTemp,
      };
    });

    // Available entities grouped by device_class
    const boundEntityIds = new Set(
      (spaceSensors || []).map((s: any) => s.entity_id).filter(Boolean)
    );
    const temperatureEntities = (entitySync || [])
      .filter((e: any) => e.device_class === "temperature")
      .map((e: any) => ({
        entity_id: e.entity_id,
        device_name: e.ha_device_name,
        value: e.last_state,
        unit: e.unit_of_measurement,
        bound: boundEntityIds.has(e.entity_id),
      }));
    const humidityEntities = (entitySync || [])
      .filter((e: any) => e.device_class === "humidity")
      .map((e: any) => ({
        entity_id: e.entity_id,
        device_name: e.ha_device_name,
        value: e.last_state,
        unit: e.unit_of_measurement,
        bound: boundEntityIds.has(e.entity_id),
      }));
    const occupancyEntities = (entitySync || [])
      .filter((e: any) => e.device_class === "occupancy" || e.device_class === "motion")
      .map((e: any) => ({
        entity_id: e.entity_id,
        device_name: e.ha_device_name,
        value: e.last_state,
        unit: e.unit_of_measurement,
        bound: boundEntityIds.has(e.entity_id),
      }));

    return NextResponse.json({
      zones: zonesResponse,
      unassigned_spaces: unassignedSpaces,
      available_entities: {
        temperature: temperatureEntities,
        humidity: humidityEntities,
        occupancy: occupancyEntities,
      },
      _debug: {
        space_count: (spaces || []).length,
        spaces_with_equipment: (spaces || []).filter((s: any) => s.equipment_id).map((s: any) => ({
          space_id: s.space_id,
          name: s.name,
          equipment_id: s.equipment_id,
        })),
        zone_equipment_ids: (zones || []).map((z: any) => ({
          zone: z.name,
          equipment_id: z.equipment_id,
        })),
        spacesByEquipment_keys: Array.from(spacesByEquipment.keys()),
      },
    });
  } catch (err: any) {
    console.error("[zone-config] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — save zone config (sensor assignments, weights)
export async function PATCH(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { site_id, hvac_zone_id, spaces: spaceEdits } = body;

    if (!site_id || !hvac_zone_id || !Array.isArray(spaceEdits)) {
      return NextResponse.json({ error: "site_id, hvac_zone_id, and spaces[] required" }, { status: 400 });
    }

    // Validate weights
    for (const sp of spaceEdits) {
      const tempSensors = (sp.sensors || []).filter((s: any) => s.sensor_type === "temperature");
      if (tempSensors.length > 0) {
        const weightSum = tempSensors.reduce((sum: number, s: any) => sum + (s.weight || 0), 0);
        if (Math.abs(weightSum - 1.0) > 0.01) {
          return NextResponse.json(
            { error: `Sensor weights for space ${sp.space_id} sum to ${weightSum.toFixed(2)}, must equal 1.0` },
            { status: 400 }
          );
        }
      }
    }

    // Validate zone weights
    const zoneWeights = spaceEdits.filter((sp: any) => sp.zone_weight != null);
    if (zoneWeights.length > 0) {
      const zoneWeightSum = zoneWeights.reduce((sum: number, sp: any) => sum + (sp.zone_weight || 0), 0);
      if (Math.abs(zoneWeightSum - 1.0) > 0.01) {
        return NextResponse.json(
          { error: `Zone weights sum to ${zoneWeightSum.toFixed(2)}, must equal 1.0` },
          { status: 400 }
        );
      }
    }

    // Process each space
    for (const sp of spaceEdits) {
      // Update zone_weight on a_spaces
      if (sp.zone_weight !== undefined) {
        await supabase
          .from("a_spaces")
          .update({ zone_weight: sp.zone_weight })
          .eq("space_id", sp.space_id);
      }

      // Process sensors
      for (const sensor of sp.sensors || []) {
        if (sensor.id && !sensor.entity_id) {
          // DELETE: has id but null entity_id
          await supabase
            .from("a_space_sensors")
            .delete()
            .eq("id", sensor.id);
        } else if (sensor.id && sensor.entity_id) {
          // UPDATE: has id and entity_id
          await supabase
            .from("a_space_sensors")
            .update({
              entity_id: sensor.entity_id,
              sensor_type: sensor.sensor_type,
              weight: sensor.weight ?? 1.0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sensor.id);
        } else if (!sensor.id && sensor.entity_id) {
          // INSERT: no id, has entity_id
          await supabase
            .from("a_space_sensors")
            .insert({
              space_id: sp.space_id,
              site_id,
              sensor_type: sensor.sensor_type,
              entity_id: sensor.entity_id,
              weight: sensor.weight ?? 1.0,
            });
        }
      }
    }

    // Audit log
    try {
      const { data: siteInfo } = await supabase
        .from("a_sites")
        .select("timezone, org_id")
        .eq("site_id", site_id)
        .single();
      const localDate = new Date().toLocaleDateString("en-CA", {
        timeZone: siteInfo?.timezone || "America/Chicago",
      });

      const { data: zoneInfo } = await supabase
        .from("a_hvac_zones")
        .select("name, equipment_id")
        .eq("hvac_zone_id", hvac_zone_id)
        .single();

      await supabase.from("b_records_log").insert({
        site_id,
        org_id: siteInfo?.org_id || null,
        equipment_id: zoneInfo?.equipment_id || null,
        event_type: "zone_config_updated",
        event_date: localDate,
        message: `${zoneInfo?.name || hvac_zone_id}: sensor config updated (${spaceEdits.length} spaces)`,
        source: "zone_config",
        created_by: callerEmail,
      });
    } catch (logErr) {
      console.error("[zone-config] PATCH log error:", logErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[zone-config] PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
