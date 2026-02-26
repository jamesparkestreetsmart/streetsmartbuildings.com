import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const level = req.nextUrl.searchParams.get("level") || "sites";
  const siteId = req.nextUrl.searchParams.get("site_id");
  const equipmentId = req.nextUrl.searchParams.get("equipment_id");
  const equipmentGroup = req.nextUrl.searchParams.get("equipment_group");

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // ─── Level: sites ───────────────────────────────────────────────────────
  if (level === "sites") {
    const { data: sites } = await supabase
      .from("a_sites")
      .select("site_id, site_name")
      .eq("org_id", orgId)
      .order("site_name");

    return NextResponse.json({
      sites: (sites || []).map((s: any) => ({ site_id: s.site_id, name: s.site_name })),
    });
  }

  // ─── Level: equipment ───────────────────────────────────────────────────
  if (level === "equipment") {
    let query = supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, equipment_group, site_id")
      .eq("org_id", orgId)
      .order("equipment_group")
      .order("equipment_name");

    if (siteId) {
      query = query.eq("site_id", siteId);
    }

    const { data: equipment } = await query;
    if (!equipment?.length) return NextResponse.json({ equipment_types: [] });

    // Get site names for display
    const siteIds = [...new Set(equipment.map((e: any) => e.site_id).filter(Boolean))];
    const { data: sites } = await supabase
      .from("a_sites")
      .select("site_id, site_name")
      .in("site_id", siteIds);

    const siteNameMap: Record<string, string> = {};
    for (const s of sites || []) siteNameMap[s.site_id] = s.site_name;

    // Group by equipment_group
    const grouped: Record<string, { label: string; equipment: any[] }> = {};
    for (const eq of equipment) {
      const group = eq.equipment_group || "Other";
      if (!grouped[group]) grouped[group] = { label: group, equipment: [] };
      grouped[group].equipment.push({
        id: eq.equipment_id,
        name: eq.equipment_name,
        site_id: eq.site_id,
        site_name: siteNameMap[eq.site_id] || "",
      });
    }

    const equipmentTypes = Object.entries(grouped).map(([type, data]) => ({
      type,
      label: data.label,
      count: data.equipment.length,
      equipment: data.equipment,
    }));

    return NextResponse.json({ equipment_types: equipmentTypes });
  }

  // ─── Level: sensors (for specific equipment) ───────────────────────────
  if (level === "sensors" && equipmentId) {
    const { data: sensors } = await supabase
      .from("a_sensors")
      .select("entity_id, label, sensor_type")
      .eq("equipment_id", equipmentId);

    // Get units from b_entity_sync
    const entityIds = (sensors || []).map((s: any) => s.entity_id).filter(Boolean);
    let units: Record<string, string> = {};
    if (entityIds.length > 0) {
      const { data: entities } = await supabase
        .from("b_entity_sync")
        .select("entity_id, unit_of_measurement")
        .in("entity_id", entityIds);
      for (const e of entities || []) {
        if (e.unit_of_measurement) units[e.entity_id] = e.unit_of_measurement;
      }
    }

    return NextResponse.json({
      sensors: (sensors || []).map((s: any) => ({
        entity_id: s.entity_id,
        label: s.label || s.entity_id,
        sensor_type: s.sensor_type,
        unit: units[s.entity_id] || null,
      })),
    });
  }

  // ─── Level: sensors (for equipment group/type — common sensors) ────────
  if (level === "sensors" && equipmentGroup) {
    // Find all equipment of this type
    let eqQuery = supabase
      .from("a_equipments")
      .select("equipment_id")
      .eq("org_id", orgId)
      .eq("equipment_group", equipmentGroup);

    if (siteId) eqQuery = eqQuery.eq("site_id", siteId);

    const { data: equipmentList } = await eqQuery;
    const eqIds = (equipmentList || []).map((e: any) => e.equipment_id);
    const totalEquipment = eqIds.length;

    if (eqIds.length === 0) return NextResponse.json({ sensors: [] });

    // Get all sensors across all equipment of this type
    const { data: sensors } = await supabase
      .from("a_sensors")
      .select("sensor_type, label")
      .in("equipment_id", eqIds);

    // Count how many equipment have each sensor_type
    const sensorTypeCounts: Record<string, { count: number; label: string }> = {};
    for (const s of sensors || []) {
      const st = s.sensor_type;
      if (!st) continue;
      if (!sensorTypeCounts[st]) {
        sensorTypeCounts[st] = { count: 0, label: s.label || st };
      }
      sensorTypeCounts[st].count++;
    }

    // Get units from a representative sensor
    const sensorTypes = Object.keys(sensorTypeCounts);
    let unitMap: Record<string, string> = {};
    if (sensorTypes.length > 0 && eqIds.length > 0) {
      const { data: repSensors } = await supabase
        .from("a_sensors")
        .select("sensor_type, entity_id")
        .eq("equipment_id", eqIds[0])
        .in("sensor_type", sensorTypes);

      const repEntityIds = (repSensors || []).map((s: any) => s.entity_id).filter(Boolean);
      if (repEntityIds.length > 0) {
        const { data: entities } = await supabase
          .from("b_entity_sync")
          .select("entity_id, unit_of_measurement")
          .in("entity_id", repEntityIds);

        const entityUnitMap: Record<string, string> = {};
        for (const e of entities || []) {
          if (e.unit_of_measurement) entityUnitMap[e.entity_id] = e.unit_of_measurement;
        }
        for (const s of repSensors || []) {
          if (s.entity_id && entityUnitMap[s.entity_id]) {
            unitMap[s.sensor_type] = entityUnitMap[s.entity_id];
          }
        }
      }
    }

    // Return common sensors (present on at least half the equipment)
    const commonSensors = Object.entries(sensorTypeCounts)
      .filter(([, data]) => data.count >= Math.ceil(totalEquipment * 0.3))
      .map(([sensorType, data]) => ({
        sensor_type: sensorType,
        label: data.label,
        unit: unitMap[sensorType] || null,
        entity_count: data.count,
        total_equipment: totalEquipment,
      }));

    return NextResponse.json({ sensors: commonSensors });
  }

  // ─── Default: return derived + anomalies ────────────────────────────────
  return NextResponse.json({
    derived: getDerivedMetrics(),
    anomalies: getAnomalyTypes(),
  });
}

function getDerivedMetrics() {
  return [
    { key: "cycle_count_1h", label: "Compressor Cycles (1hr)", unit: "cycles" },
    { key: "delta_t_f", label: "Supply-Zone Delta T", unit: "°F" },
    { key: "efficiency_ratio", label: "Efficiency Ratio", unit: "°F/kWh" },
    { key: "power_kw", label: "Power Draw", unit: "kW" },
    { key: "current_a", label: "Current Draw", unit: "A" },
    { key: "energy_kwh", label: "Energy", unit: "kWh" },
  ];
}

function getAnomalyTypes() {
  return [
    { key: "coil_freeze", label: "Coil Freeze", description: "Supply air dangerously cold" },
    { key: "short_cycling", label: "Short Cycling", description: "Excessive compressor cycling" },
    { key: "long_cycle", label: "Long Cycle", description: "Compressor running abnormally long" },
    { key: "filter_restriction", label: "Filter Restriction", description: "Restricted airflow" },
    { key: "refrigerant_low", label: "Low Refrigerant", description: "Insufficient cooling" },
    { key: "idle_heat_gain", label: "Idle Heat Gain", description: "Unexpected temperature rise" },
    { key: "delayed_temp_response", label: "Delayed Response", description: "Slow temperature change" },
  ];
}
