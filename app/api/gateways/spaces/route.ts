import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — load spaces with sensor assignments + available temp entities
export async function GET(req: NextRequest) {
  const site_id = req.nextUrl.searchParams.get("site_id");
  if (!site_id) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  try {
    const [
      { data: spaces },
      { data: spaceSensors },
      { data: hvacZones },
      { data: equipmentRows },
      { data: entitySync },
    ] = await Promise.all([
      supabase
        .from("a_spaces")
        .select("space_id, name, space_type, equipment_id")
        .eq("site_id", site_id)
        .order("name"),
      supabase
        .from("a_space_sensors")
        .select("id, space_id, sensor_type, entity_id, weight, is_primary")
        .eq("site_id", site_id),
      supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id, name, equipment_id, thermostat_device_id, control_scope, zone_temp_source")
        .eq("site_id", site_id),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, equipment_group")
        .eq("site_id", site_id),
      supabase
        .from("b_entity_sync")
        .select("entity_id, ha_device_name, last_state, unit_of_measurement, last_seen_at, device_class, domain")
        .eq("site_id", site_id)
        .eq("domain", "sensor"),
    ]);

    // Build entity value map
    const entityMap = new Map(
      (entitySync || []).map((e) => [e.entity_id, e])
    );

    // Build sensor assignment lookup: space_id → assignments[]
    const sensorMap = new Map<string, any[]>();
    for (const s of spaceSensors || []) {
      const arr = sensorMap.get(s.space_id) || [];
      const entity = s.entity_id ? entityMap.get(s.entity_id) : null;
      arr.push({
        id: s.id,
        sensor_type: s.sensor_type,
        entity_id: s.entity_id,
        weight: parseFloat(s.weight) || 0,
        is_primary: s.is_primary,
        value: entity?.last_state ?? null,
        unit: entity?.unit_of_measurement ?? null,
        fresh: entity?.last_seen_at
          ? Date.now() - new Date(entity.last_seen_at).getTime() < 10 * 60 * 1000
          : false,
      });
      sensorMap.set(s.space_id, arr);
    }

    // Build equipment name map
    const eqMap = new Map(
      (equipmentRows || []).map((e) => [e.equipment_id, e.equipment_name])
    );

    // Build spaces response
    const spacesResponse = (spaces || []).map((sp) => ({
      space_id: sp.space_id,
      name: sp.name,
      space_type: sp.space_type,
      equipment_id: sp.equipment_id,
      equipment_name: sp.equipment_id ? eqMap.get(sp.equipment_id) || null : null,
      sensors: sensorMap.get(sp.space_id) || [],
    }));

    // Build zones response
    const zonesResponse = (hvacZones || []).map((z) => ({
      hvac_zone_id: z.hvac_zone_id,
      name: z.name,
      equipment_id: z.equipment_id,
      equipment_name: z.equipment_id ? eqMap.get(z.equipment_id) || null : null,
      thermostat_device_id: z.thermostat_device_id,
      control_scope: z.control_scope,
      zone_temp_source: z.zone_temp_source || "thermostat_builtin",
    }));

    // Available entities (not already bound to a space sensor)
    const boundEntityIds = new Set(
      (spaceSensors || []).map((s) => s.entity_id).filter(Boolean)
    );
    const availableTempEntities = (entitySync || [])
      .filter(
        (e) =>
          e.device_class === "temperature" &&
          !boundEntityIds.has(e.entity_id)
      )
      .map((e) => ({
        entity_id: e.entity_id,
        device_name: e.ha_device_name,
        value: e.last_state,
        unit: e.unit_of_measurement,
      }));

    return NextResponse.json({
      spaces: spacesResponse,
      zones: zonesResponse,
      available_temp_entities: availableTempEntities,
    });
  } catch (err: any) {
    console.error("[api/gateways/spaces] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — save space sensor assignments and weights
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { site_id, assignments, zone_id, zone_temp_source } = body;

    if (!site_id) return NextResponse.json({ error: "site_id required" }, { status: 400 });

    // Save zone temp source if provided
    if (zone_id && zone_temp_source) {
      const { error: zoneErr } = await supabase
        .from("a_hvac_zones")
        .update({ zone_temp_source })
        .eq("hvac_zone_id", zone_id);
      if (zoneErr) {
        return NextResponse.json({ error: zoneErr.message }, { status: 500 });
      }
    }

    // Upsert space sensor assignments
    if (assignments && Array.isArray(assignments)) {
      for (const a of assignments) {
        const { space_id, sensor_type, entity_id, weight } = a;

        if (!space_id || !sensor_type) continue;

        if (entity_id) {
          // Upsert: insert or update
          const { data: existing } = await supabase
            .from("a_space_sensors")
            .select("id")
            .eq("space_id", space_id)
            .eq("sensor_type", sensor_type)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("a_space_sensors")
              .update({ entity_id, weight: weight ?? 1.0, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
          } else {
            await supabase
              .from("a_space_sensors")
              .insert({
                space_id,
                site_id,
                sensor_type,
                entity_id,
                weight: weight ?? 1.0,
              });
          }
        } else {
          // Remove assignment if entity_id is null
          await supabase
            .from("a_space_sensors")
            .delete()
            .eq("space_id", space_id)
            .eq("sensor_type", sensor_type);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[api/gateways/spaces] PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
