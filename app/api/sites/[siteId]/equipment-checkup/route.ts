import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXCLUDED_GROUPS = ["Space", "HVAC", "Infrastructure", "Plumbing", "Inventory"];

const LOG_TABLE_MAP: Record<string, { table: string; unit: string }> = {
  log_temperatures: { table: "log_temperatures", unit: "°F" },
  log_humidities:   { table: "log_humidities",   unit: "%" },
  log_powers:       { table: "log_powers",        unit: "W" },
  log_energies:     { table: "log_energies",      unit: "kWh" },
  log_currents:     { table: "log_currents",      unit: "A" },
  log_voltages:     { table: "log_voltages",      unit: "V" },
  log_frequencies:  { table: "log_frequencies",   unit: "Hz" },
  log_pressures:    { table: "log_pressures",     unit: "psi" },
  log_flowrates:    { table: "log_flowrates",     unit: "gpm" },
  log_percentages:  { table: "log_percentages",   unit: "%" },
  log_binaries:     { table: "log_binaries",      unit: "" },
  log_states:       { table: "log_states",        unit: "" },
};

const VEL_ACCEL_TYPES = ["log_temperatures", "log_humidities"];

type RangeKey = "latest" | "7d" | "14d" | "30d" | "45d" | "90d";

const RANGE_DAYS: Record<string, number> = {
  "7d": 7, "14d": 14, "30d": 30, "45d": 45, "90d": 90,
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await context.params;
  const mode = (req.nextUrl.searchParams.get("mode") || "latest") as RangeKey;

  try {
    // 1. Fetch equipment for this site, excluding retired + unwanted groups
    const { data: equipmentList, error: equipError } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, equipment_group, equipment_type_id, space_id, status")
      .eq("site_id", siteId)
      .not("equipment_group", "in", `(${EXCLUDED_GROUPS.map((g) => `"${g}"`).join(",")})`)
      .not("status", "eq", "retired")
      .order("equipment_group", { ascending: true })
      .order("equipment_name", { ascending: true });

    if (equipError) throw equipError;
    if (!equipmentList || equipmentList.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    const equipmentIds = equipmentList.map((e) => e.equipment_id);

    // 2. Fetch space names
    const spaceIds = [...new Set(equipmentList.map((e) => e.space_id).filter(Boolean))];
    const { data: spaces } = await supabase
      .from("a_spaces")
      .select("space_id, name")
      .in("space_id", spaceIds);

    const spaceMap: Record<string, string> = {};
    spaces?.forEach((s) => { spaceMap[s.space_id] = s.name; });

    // 3. Fetch sensors for all equipment
    const { data: sensors, error: sensorError } = await supabase
      .from("a_sensors")
      .select(`
        sensor_id,
        equipment_id,
        entity_id,
        sensor_type,
        label,
        library_equipment_sensor_requirements (
          sensor_role,
          unit
        ),
        library_sensor_type_mapping (
          log_table,
          unit
        )
      `)
      .in("equipment_id", equipmentIds);

    if (sensorError) throw sensorError;
    if (!sensors || sensors.length === 0) {
      // Return equipment with no sensor data
      const groups = buildGroups(equipmentList, spaceMap, []);
      return NextResponse.json({ groups, mode });
    }

    // 4. Fetch readings from each relevant log table
    const sensorReadings: Record<string, { value: any; ts: string; unit: string; velocity?: number | null; acceleration?: number | null }[]> = {};

    // Group sensors by log table
    const byLogTable: Record<string, { entity_id: string; sensor_id: string; unit: string }[]> = {};
    for (const sensor of sensors) {
      const logTable = (sensor.library_sensor_type_mapping as any)?.log_table;
      if (!logTable) continue;
      if (!byLogTable[logTable]) byLogTable[logTable] = [];
      const unit =
        (sensor.library_equipment_sensor_requirements as any)?.unit ||
        (sensor.library_sensor_type_mapping as any)?.unit ||
        LOG_TABLE_MAP[logTable]?.unit ||
        "";
      byLogTable[logTable].push({ entity_id: sensor.entity_id, sensor_id: sensor.sensor_id, unit });
    }

    if (mode === "latest") {
      // Fetch latest reading per entity per log table
      for (const [logTable, entries] of Object.entries(byLogTable)) {
        const entityIds = entries.map((e) => e.entity_id);

        const { data: rows } = await supabase
          .from(logTable)
          .select("entity_id, value, ts")
          .in("entity_id", entityIds)
          .eq("site_id", siteId)
          .order("ts", { ascending: false })
          .limit(entityIds.length * 5); // grab a few per entity to compute vel/accel

        if (!rows) continue;

        // Group rows by entity_id
        const byEntity: Record<string, any[]> = {};
        for (const row of rows) {
          if (!byEntity[row.entity_id]) byEntity[row.entity_id] = [];
          byEntity[row.entity_id].push(row);
        }

        for (const entry of entries) {
          const entityRows = byEntity[entry.entity_id] || [];
          if (entityRows.length === 0) continue;

          const latest = entityRows[0];
          let velocity: number | null = null;
          let acceleration: number | null = null;

          if (VEL_ACCEL_TYPES.includes(logTable) && entityRows.length >= 2) {
            const v1 = parseFloat(entityRows[0].value);
            const v2 = parseFloat(entityRows[1].value);
            const t1 = new Date(entityRows[0].ts).getTime();
            const t2 = new Date(entityRows[1].ts).getTime();
            const dtMin = (t1 - t2) / 60000;
            if (dtMin > 0) {
              velocity = parseFloat(((v1 - v2) / dtMin).toFixed(3));

              if (entityRows.length >= 3) {
                const v3 = parseFloat(entityRows[2].value);
                const t3 = new Date(entityRows[2].ts).getTime();
                const dtMin2 = (t2 - t3) / 60000;
                if (dtMin2 > 0) {
                  const vel2 = (v2 - v3) / dtMin2;
                  const avgDt = (dtMin + dtMin2) / 2;
                  acceleration = parseFloat(((velocity - vel2) / avgDt).toFixed(4));
                }
              }
            }
          }

          sensorReadings[entry.sensor_id] = [{
            value: latest.value,
            ts: latest.ts,
            unit: entry.unit,
            velocity,
            acceleration,
          }];
        }
      }
    } else {
      // Time series mode — return 5 evenly spaced buckets over the range
      const days = RANGE_DAYS[mode] || 7;
      const now = Date.now();
      const rangeStart = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
      const bucketMs = (days * 24 * 60 * 60 * 1000) / 5;

      for (const [logTable, entries] of Object.entries(byLogTable)) {
        const entityIds = entries.map((e) => e.entity_id);

        const { data: rows } = await supabase
          .from(logTable)
          .select("entity_id, value, ts")
          .in("entity_id", entityIds)
          .eq("site_id", siteId)
          .gte("ts", rangeStart)
          .order("ts", { ascending: true });

        if (!rows) continue;

        const byEntity: Record<string, any[]> = {};
        for (const row of rows) {
          if (!byEntity[row.entity_id]) byEntity[row.entity_id] = [];
          byEntity[row.entity_id].push(row);
        }

        for (const entry of entries) {
          const entityRows = byEntity[entry.entity_id] || [];
          if (entityRows.length === 0) continue;

          // Build 5 buckets
          const buckets: { value: any; ts: string; unit: string }[] = [];
          for (let i = 0; i < 5; i++) {
            const bucketStart = now - days * 24 * 60 * 60 * 1000 + i * bucketMs;
            const bucketEnd = bucketStart + bucketMs;
            const bucketRows = entityRows.filter((r) => {
              const t = new Date(r.ts).getTime();
              return t >= bucketStart && t < bucketEnd;
            });
            if (bucketRows.length > 0) {
              // Average value in bucket
              const avg =
                bucketRows.reduce((sum, r) => sum + parseFloat(r.value), 0) /
                bucketRows.length;
              buckets.push({
                value: parseFloat(avg.toFixed(2)),
                ts: bucketRows[Math.floor(bucketRows.length / 2)].ts,
                unit: entry.unit,
              });
            }
          }

          sensorReadings[entry.sensor_id] = buckets;
        }
      }
    }

    // 5. Assemble final structure
    const groups = buildGroups(equipmentList, spaceMap, sensors, sensorReadings);
    return NextResponse.json({ groups, mode });
  } catch (err: any) {
    console.error("Equipment checkup error:", err);
    return NextResponse.json({ error: err.message || "Failed to load" }, { status: 500 });
  }
}

function buildGroups(
  equipmentList: any[],
  spaceMap: Record<string, string>,
  sensors: any[],
  sensorReadings: Record<string, any[]> = {}
) {
  // Map sensors by equipment_id
  const sensorsByEquipment: Record<string, any[]> = {};
  for (const sensor of sensors) {
    if (!sensorsByEquipment[sensor.equipment_id]) sensorsByEquipment[sensor.equipment_id] = [];
    sensorsByEquipment[sensor.equipment_id].push(sensor);
  }

  // Group equipment
  const groupMap: Record<string, any[]> = {};
  for (const equip of equipmentList) {
    const group = equip.equipment_group || "Other";
    if (!groupMap[group]) groupMap[group] = [];

    const equipSensors = (sensorsByEquipment[equip.equipment_id] || []).map((s) => ({
      sensor_id: s.sensor_id,
      entity_id: s.entity_id,
      sensor_type: s.sensor_type,
      sensor_role: (s.library_equipment_sensor_requirements as any)?.sensor_role || s.label || s.sensor_type,
      log_table: (s.library_sensor_type_mapping as any)?.log_table || null,
      readings: sensorReadings[s.sensor_id] || [],
    }));

    groupMap[group].push({
      equipment_id: equip.equipment_id,
      equipment_name: equip.equipment_name,
      equipment_type_id: equip.equipment_type_id,
      space_name: spaceMap[equip.space_id] || null,
      status: equip.status,
      sensors: equipSensors,
    });
  }

  return Object.entries(groupMap).map(([group, items]) => ({ group, items }));
}