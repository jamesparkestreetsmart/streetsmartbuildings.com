import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await context.params;

  try {
    const [
      { data: devices, error: devErr },
      { data: equipments, error: eqErr },
      { data: entities, error: entErr },
      { data: sensors, error: senErr },
      { data: spaces, error: spErr },
    ] = await Promise.all([
      supabase
        .from("a_devices")
        .select("device_id, device_name, device_role, protocol, status, equipment_id, ha_device_id, phase_configuration, space_id")
        .eq("site_id", siteId),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, equipment_type_id, equipment_group, space_id")
        .eq("site_id", siteId),
      supabase
        .from("b_entity_sync")
        .select("entity_id, friendly_name, ha_device_id, domain, device_class, last_state, unit_of_measurement, last_seen_at")
        .eq("site_id", siteId),
      supabase
        .from("a_sensors")
        .select("sensor_id, entity_id, sensor_type, label, library_equipment_sensor_requirements(sensor_role)")
        .eq("site_id", siteId),
      supabase
        .from("a_spaces")
        .select("space_id, name")
        .eq("site_id", siteId),
    ]);

    if (devErr) throw devErr;
    if (eqErr) throw eqErr;
    if (entErr) throw entErr;
    if (senErr) throw senErr;
    if (spErr) throw spErr;

    // Build space lookup map
    const spaceMap = new Map<string, string>();
    for (const sp of spaces || []) {
      spaceMap.set(sp.space_id, sp.name);
    }

    // Build equipment lookup map
    const equipMap = new Map<string, { equipment_name: string; equipment_type_id: string | null; equipment_group: string | null; space_name: string | null }>();
    for (const eq of equipments || []) {
      equipMap.set(eq.equipment_id, {
        equipment_name: eq.equipment_name,
        equipment_type_id: eq.equipment_type_id,
        equipment_group: eq.equipment_group || null,
        space_name: eq.space_id ? spaceMap.get(eq.space_id) || null : null,
      });
    }

    // Build sensor lookup map (entity_id → mapping info)
    const sensorMap = new Map<string, { sensor_type: string | null; sensor_role: string | null }>();
    for (const s of sensors || []) {
      if (!s.entity_id) continue;
      const role =
        (s.library_equipment_sensor_requirements as any)?.sensor_role ||
        s.label ||
        s.sensor_type ||
        null;
      sensorMap.set(s.entity_id, {
        sensor_type: s.sensor_type,
        sensor_role: role,
      });
    }

    // Group entities by ha_device_id
    const entitiesByHaDevice = new Map<string, any[]>();
    for (const ent of entities || []) {
      if (!ent.ha_device_id) continue;
      if (!entitiesByHaDevice.has(ent.ha_device_id)) {
        entitiesByHaDevice.set(ent.ha_device_id, []);
      }
      entitiesByHaDevice.get(ent.ha_device_id)!.push(ent);
    }

    // Assemble device list with nested entities
    const result = (devices || []).map((dev) => {
      const eq = dev.equipment_id ? equipMap.get(dev.equipment_id) : null;
      const devEntities = dev.ha_device_id
        ? entitiesByHaDevice.get(dev.ha_device_id) || []
        : [];

      return {
        device_id: dev.device_id,
        device_name: dev.device_name,
        device_role: dev.device_role,
        protocol: dev.protocol,
        status: dev.status,
        phase_configuration: dev.phase_configuration || null,
        equipment_id: dev.equipment_id,
        equipment_name: eq?.equipment_name || null,
        equipment_type_id: eq?.equipment_type_id || null,
        equipment_group: eq?.equipment_group || null,
        space_id: dev.space_id || null,
        space_name: dev.space_id ? spaceMap.get(dev.space_id) || null : (eq?.space_name || null),
        ha_device_id: dev.ha_device_id,
        entities: devEntities.map((ent: any) => {
          const mapping = sensorMap.get(ent.entity_id);
          return {
            entity_id: ent.entity_id,
            friendly_name: ent.friendly_name,
            domain: ent.domain,
            device_class: ent.device_class,
            last_state: ent.last_state,
            unit_of_measurement: ent.unit_of_measurement,
            last_seen_at: ent.last_seen_at,
            sensor_type: mapping?.sensor_type || null,
            sensor_role: mapping?.sensor_role || null,
          };
        }),
      };
    });

    // Sort: mapped devices first, then unmapped, alphabetical within each group
    result.sort((a, b) => {
      const aMapped = a.equipment_id ? 0 : 1;
      const bMapped = b.equipment_id ? 0 : 1;
      if (aMapped !== bMapped) return aMapped - bMapped;
      return (a.device_name || "").localeCompare(b.device_name || "");
    });

    return NextResponse.json({ devices: result });
  } catch (err: any) {
    console.error("Device list error:", err);
    return NextResponse.json({ error: err.message || "Failed to load" }, { status: 500 });
  }
}
