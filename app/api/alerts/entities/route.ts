import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getCallerUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id || null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const level = req.nextUrl.searchParams.get("level") || "sites";
  const siteId = req.nextUrl.searchParams.get("site_id");
  const equipmentId = req.nextUrl.searchParams.get("equipment_id");
  const equipmentGroup = req.nextUrl.searchParams.get("equipment_group");

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  // ─── Level: browse (Site → Equipment → Alert Definitions) ─────────────
  if (level === "browse") {
    const userId = await getCallerUserId();

    // Get all sites
    const { data: sites } = await supabase
      .from("a_sites")
      .select("site_id, site_name")
      .eq("org_id", orgId)
      .order("site_name");

    // Get all equipment with their groups and type IDs
    const { data: allEquipment } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, equipment_group, equipment_type_id, site_id")
      .eq("org_id", orgId)
      .order("equipment_name");

    // Build equipment_type_id → display name mapping via library_equipment_types
    const typeIds = [...new Set(
      (allEquipment || []).map((eq: any) => eq.equipment_type_id).filter(Boolean)
    )];
    let typeNameMap: Record<string, string> = {};
    if (typeIds.length > 0) {
      const { data: libTypes } = await supabase
        .from("library_equipment_types")
        .select("equipment_type_id, name")
        .in("equipment_type_id", typeIds);
      for (const lt of libTypes || []) {
        typeNameMap[lt.equipment_type_id] = lt.name;
      }
    }

    // Get all enabled definitions
    const { data: definitions } = await supabase
      .from("b_alert_definitions")
      .select("*")
      .eq("org_id", orgId)
      .eq("enabled", true);

    // Get user subscriptions if authenticated
    let userSubs: Record<string, any> = {};
    if (userId && definitions?.length) {
      const defIds = definitions.map((d: any) => d.id);
      const { data: subs } = await supabase
        .from("b_alert_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .in("alert_def_id", defIds);
      for (const sub of subs || []) {
        userSubs[sub.alert_def_id] = sub;
      }
    }

    // Build hierarchy: site → equipment → matching definitions
    const browse = (sites || []).map((site: any) => {
      const siteEquipment = (allEquipment || []).filter((eq: any) => eq.site_id === site.site_id);

      const equipmentWithDefs = siteEquipment.map((eq: any) => {
        // Resolve this equipment's display type name via library
        const resolvedTypeName = eq.equipment_type_id
          ? typeNameMap[eq.equipment_type_id] || null
          : null;

        // Find definitions matching this equipment's type/group
        const matchingDefs = (definitions || []).filter((def: any) => {
          // Check if definition targets this equipment type
          if (def.entity_type === "sensor" && def.equipment_type) {
            // Match against resolved library name, equipment_group, or equipment_type_id
            const matches =
              def.equipment_type === resolvedTypeName ||
              def.equipment_type === eq.equipment_group ||
              def.equipment_type === eq.equipment_type_id;
            if (!matches) return false;
          } else if (def.entity_type === "sensor" && def.entity_id) {
            // Specific sensor — we'd need to check if it belongs to this equipment
            // Skip for now — these show up as org-level
            return false;
          } else if (def.entity_type === "derived" || def.entity_type === "anomaly") {
            // Zone-based — match by site scope
          }

          // Check scope filtering
          if (def.scope_mode === "include" && def.scope_ids?.length) {
            if (def.scope_level === "site" && !def.scope_ids.includes(site.site_id)) return false;
            if (def.scope_level === "equipment" && !def.scope_ids.includes(eq.equipment_id)) return false;
          } else if (def.scope_mode === "exclude" && def.scope_ids?.length) {
            if (def.scope_level === "site" && def.scope_ids.includes(site.site_id)) return false;
            if (def.scope_level === "equipment" && def.scope_ids.includes(eq.equipment_id)) return false;
          }

          return true;
        }).map((def: any) => ({
          id: def.id,
          name: def.name,
          severity: def.severity,
          entity_type: def.entity_type,
          condition_type: def.condition_type,
          threshold_value: def.threshold_value,
          equipment_type: def.equipment_type,
          sensor_role: def.sensor_role,
          resolved_dead_time_minutes: def.resolved_dead_time_minutes ?? 0,
          subscription: userSubs[def.id] || null,
        }));

        return {
          equipment_id: eq.equipment_id,
          equipment_name: eq.equipment_name,
          equipment_group: eq.equipment_group,
          definitions: matchingDefs,
        };
      }).filter((eq: any) => eq.definitions.length > 0);

      return {
        site_id: site.site_id,
        site_name: site.site_name,
        equipment: equipmentWithDefs,
      };
    }).filter((site: any) => site.equipment.length > 0);

    return NextResponse.json({ browse });
  }

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

    const { data: equipmentList, error: eqError } = await eqQuery;
    console.log("[ENTITIES] equipment_group query:", { equipmentGroup, orgId, siteId, count: equipmentList?.length, error: eqError?.message });
    const eqIds = (equipmentList || []).map((e: any) => e.equipment_id);
    const totalEquipment = eqIds.length;

    if (eqIds.length === 0) return NextResponse.json({ sensors: [] });

    // Get all sensors across all equipment of this type
    const { data: sensors, error: sError } = await supabase
      .from("a_sensors")
      .select("sensor_type, label")
      .in("equipment_id", eqIds);
    console.log("[ENTITIES] sensors query:", { eqIds: eqIds.slice(0, 5), totalSensors: sensors?.length, error: sError?.message, sampleTypes: (sensors || []).slice(0, 5).map((s: any) => s.sensor_type) });

    // Count how many equipment have each sensor_type
    const sensorTypeCounts: Record<string, { count: number; label: string }> = {};
    for (const s of sensors || []) {
      const st = s.sensor_type;
      if (!st) continue;
      if (!sensorTypeCounts[st]) {
        // Extract sensor role from label format "Equipment Name — Sensor Role"
        let displayLabel = st;
        if (s.label && s.label.includes(" — ")) {
          displayLabel = s.label.split(" — ").pop() || st;
        } else if (s.label) {
          displayLabel = s.label;
        }
        sensorTypeCounts[st] = { count: 0, label: displayLabel };
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

    // Return all sensor types found (at least 1 occurrence)
    const threshold = 1;
    console.log("[ENTITIES] sensorTypeCounts:", JSON.stringify(sensorTypeCounts), "threshold:", threshold, "totalEquipment:", totalEquipment);
    const commonSensors = Object.entries(sensorTypeCounts)
      .filter(([, data]) => data.count >= threshold)
      .map(([sensorType, data]) => ({
        sensor_type: sensorType,
        label: data.label,
        unit: unitMap[sensorType] || null,
        entity_count: data.count,
        total_equipment: totalEquipment,
      }));
    console.log("[ENTITIES] returning commonSensors:", commonSensors.length, commonSensors.map((s: any) => s.sensor_type));

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
