import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const org_id = sp.get("org_id");
  if (!org_id) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  try {
    // Mode 5: Trend (last N days)
    const trend = sp.get("trend");
    if (trend) {
      const days = parseInt(trend, 10) || 30;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("b_daily_health")
        .select("*")
        .eq("org_id", org_id)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ rows: data || [] });
    }

    // Mode 4: Rolling average
    const range = sp.get("range");
    if (range) {
      const days = parseInt(range, 10) || 30;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("b_daily_health")
        .select("score, date")
        .eq("org_id", org_id)
        .gte("date", since.toISOString().slice(0, 10));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const rows = data || [];
      const total = rows.reduce((sum, r) => sum + (r.score || 0), 0);
      const average = rows.length > 0 ? Math.round(total / rows.length) : 0;
      let status: string = "no_data";
      if (rows.length > 0) {
        status = average >= 90 ? "green" : average >= 70 ? "yellow" : "red";
      }
      return NextResponse.json({
        average,
        days_with_data: rows.length,
        total_days: days,
        status,
      });
    }

    // Mode 3: Site detail
    const site_id = sp.get("site_id");
    const date = sp.get("date");
    if (site_id && date) {
      const { data: row, error } = await supabase
        .from("b_daily_health")
        .select("*")
        .eq("site_id", site_id)
        .eq("date", date)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // ── Parallel queries (same pattern as gateway page) ──────────
      const [
        { data: equipmentRows },
        { data: zones },
        { data: devices },
        { data: sensorBindings },
        { data: sensorRequirements },
        { data: spaces },
      ] = await Promise.all([
        supabase
          .from("a_equipments")
          .select("equipment_id, equipment_name, equipment_type_id, equipment_group, status")
          .eq("site_id", site_id)
          .order("equipment_group"),
        supabase
          .from("a_hvac_zones")
          .select("hvac_zone_id, name, equipment_id, thermostat_device_id, control_scope")
          .eq("site_id", site_id),
        supabase
          .from("a_devices")
          .select("device_id, device_name, device_role, ha_device_id, status, equipment_id, space_id")
          .eq("site_id", site_id),
        supabase
          .from("a_sensors")
          .select("sensor_id, equipment_id, requirement_id, entity_id, sensor_type, device_id, label")
          .eq("site_id", site_id),
        supabase
          .from("library_equipment_sensor_requirements")
          .select("requirement_id, equipment_type_id, sensor_role, sensor_type, unit, required, derived, domain, device_class"),
        supabase
          .from("a_spaces")
          .select("space_id, name, space_type, equipment_id")
          .eq("site_id", site_id),
      ]);

      // ── Normalize nullable arrays ────────────────────────────────
      const bindings = sensorBindings || [];
      const reqs = sensorRequirements || [];

      // ── Entity values for all bound sensors ──────────────────────
      const boundEntityIds = bindings.map((s) => s.entity_id).filter(Boolean);
      let entityValueMap: Record<string, { state: string; unit: string; last_seen_at: string | null }> = {};
      if (boundEntityIds.length > 0) {
        const { data: entityValues } = await supabase
          .from("b_entity_sync")
          .select("entity_id, last_state, unit_of_measurement, last_seen_at")
          .in("entity_id", boundEntityIds);
        if (entityValues) {
          for (const ev of entityValues) {
            entityValueMap[ev.entity_id] = {
              state: ev.last_state ?? "",
              unit: ev.unit_of_measurement ?? "",
              last_seen_at: ev.last_seen_at,
            };
          }
        }
      }

      // ── Thermostat states for device status + battery ────────────
      const thermostatDeviceIds = (zones || []).map((z) => z.thermostat_device_id).filter(Boolean);
      let thermostatStates: Record<string, any> = {};
      if (thermostatDeviceIds.length > 0) {
        const { data: states } = await supabase
          .from("b_thermostat_state")
          .select("device_id, entity_id, eagle_eye_directive, current_temperature_f, battery_level, last_synced_at")
          .in("device_id", thermostatDeviceIds);
        if (states) {
          for (const s of states) thermostatStates[s.device_id] = s;
        }
      }

      // ── Build binding lookup: equipment_id:requirement_id → binding
      const bindingMap = new Map<string, (typeof bindings)[0]>();
      for (const b of bindings) {
        if (b.requirement_id) {
          bindingMap.set(`${b.equipment_id}:${b.requirement_id}`, b);
        }
      }

      const now = Date.now();
      const FRESH_MS = 10 * 60 * 1000;
      const WARN_MS = 30 * 60 * 1000;

      // ── Build equipment response ─────────────────────────────────
      const equipment = (equipmentRows || []).map((eq) => {
        const zone = (zones || []).find((z) => z.equipment_id === eq.equipment_id);
        const thermostatDeviceId = zone?.thermostat_device_id;
        const thermostatDevice = thermostatDeviceId
          ? (devices || []).find((d) => d.device_id === thermostatDeviceId)
          : null;
        const tState = thermostatDeviceId ? thermostatStates[thermostatDeviceId] : null;

        // Get sensor requirements for this equipment type
        const eqReqs = reqs.filter(
          (r) => r.equipment_type_id === eq.equipment_type_id
        );

        // Build sensor list from requirements (shows all expected roles)
        const sensorList = eqReqs.map((req) => {
          const binding = bindingMap.get(`${eq.equipment_id}:${req.requirement_id}`);
          const ev = binding?.entity_id ? entityValueMap[binding.entity_id] : null;
          const lastSeen = ev?.last_seen_at || null;
          const ageMs = lastSeen ? now - new Date(lastSeen).getTime() : Infinity;

          let freshness: "fresh" | "warn" | "stale" | "unmapped" | "derived";
          if (req.derived) {
            freshness = "derived";
          } else if (!binding?.entity_id) {
            freshness = "unmapped";
          } else if (ageMs < FRESH_MS) {
            freshness = "fresh";
          } else if (ageMs < WARN_MS) {
            freshness = "warn";
          } else {
            freshness = "stale";
          }

          const value = ev?.state ?? null;
          const unit = ev?.unit ?? req.unit ?? "";

          return {
            role: req.sensor_role,
            entity_id: binding?.entity_id || null,
            value: value != null ? `${value}${unit ? ` ${unit}` : ""}` : null,
            freshness,
            required: req.required ?? false,
            last_seen: lastSeen,
          };
        });

        // Also include any bindings that exist but don't match a requirement
        const reqIds = new Set(eqReqs.map((r) => r.requirement_id));
        const extraBindings = bindings.filter(
          (b) => b.equipment_id === eq.equipment_id && (!b.requirement_id || !reqIds.has(b.requirement_id))
        );
        for (const b of extraBindings) {
          const ev = b.entity_id ? entityValueMap[b.entity_id] : null;
          const lastSeen = ev?.last_seen_at || null;
          const ageMs = lastSeen ? now - new Date(lastSeen).getTime() : Infinity;
          sensorList.push({
            role: b.sensor_type || b.label || "unknown",
            entity_id: b.entity_id,
            value: ev ? `${ev.state}${ev.unit ? ` ${ev.unit}` : ""}` : null,
            freshness: !b.entity_id ? "unmapped" : ageMs < FRESH_MS ? "fresh" : ageMs < WARN_MS ? "warn" : "stale",
            required: false,
            last_seen: lastSeen,
          });
        }

        // Equipment health: based on mapped physical sensors
        const physicalSensors = sensorList.filter((s) => s.freshness !== "derived" && s.freshness !== "unmapped");
        let health: "green" | "yellow" | "red" | "no_data" = "no_data";
        if (physicalSensors.length > 0) {
          const freshCount = physicalSensors.filter((s) => s.freshness === "fresh").length;
          const warnCount = physicalSensors.filter((s) => s.freshness === "warn").length;
          if (freshCount === physicalSensors.length) health = "green";
          else if (freshCount + warnCount === physicalSensors.length) health = "yellow";
          else if (freshCount > 0) health = "yellow";
          else health = "red";
        } else if (tState) {
          health = "green";
        }

        // Device status from thermostat state
        let deviceStatus = "unknown";
        if (tState?.last_synced_at) {
          const syncAge = now - new Date(tState.last_synced_at).getTime();
          deviceStatus = syncAge < WARN_MS ? "online" : "offline";
        }

        return {
          name: eq.equipment_name,
          type: eq.equipment_group,
          status: eq.status,
          zone: zone?.name || null,
          control: zone?.control_scope || null,
          device: thermostatDevice
            ? {
                name: thermostatDevice.device_name,
                status: deviceStatus,
                battery: tState?.battery_level ?? null,
                last_seen: tState?.last_synced_at || null,
              }
            : null,
          sensors: sensorList,
          health,
        };
      });

      // ── Build spaces response ────────────────────────────────────
      const spacesList = (spaces || []).map((sp) => {
        const linkedEquipment = (equipmentRows || []).find((e) => e.equipment_id === sp.equipment_id);
        const zone = sp.equipment_id
          ? (zones || []).find((z) => z.equipment_id === sp.equipment_id)
          : null;
        const thermostatDevice = zone?.thermostat_device_id
          ? (devices || []).find((d) => d.device_id === zone.thermostat_device_id)
          : null;

        const spaceDevices = (devices || [])
          .filter((d) => d.space_id === sp.space_id)
          .map((d) => ({ name: d.device_name, role: d.device_role, status: d.status }));

        const spaceDeviceIdSet = new Set(
          (devices || []).filter((d) => d.space_id === sp.space_id).map((d) => d.device_id)
        );
        const spaceSensors = bindings
          .filter((s) => s.device_id && spaceDeviceIdSet.has(s.device_id))
          .map((s) => {
            const ev = s.entity_id ? entityValueMap[s.entity_id] : null;
            return {
              role: s.sensor_type || s.label || "unknown",
              value: ev?.state ?? null,
            };
          });

        return {
          name: sp.name,
          type: sp.space_type,
          hvac_equipment: linkedEquipment?.equipment_name || null,
          thermostat_name: thermostatDevice?.device_name || null,
          devices: spaceDevices,
          sensors: spaceSensors,
        };
      });

      return NextResponse.json({ row: row || null, equipment, spaces: spacesList });
    }

    // Mode 2: Day detail (all sites for one day)
    if (date) {
      const { data: rows, error } = await supabase
        .from("b_daily_health")
        .select("*")
        .eq("org_id", org_id)
        .eq("date", date);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const siteIds = (rows || []).map((r) => r.site_id).filter(Boolean);
      let sites: { site_id: string; site_name: string }[] = [];
      if (siteIds.length > 0) {
        const { data: siteData } = await supabase
          .from("a_sites")
          .select("site_id, site_name")
          .in("site_id", siteIds);
        sites = siteData || [];
      }

      return NextResponse.json({ rows: rows || [], sites });
    }

    // Mode 1: Monthly
    const month = sp.get("month"); // YYYY-MM
    if (month) {
      const startDate = `${month}-01`;
      // End of month
      const [y, m] = month.split("-").map(Number);
      const endDate = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month
      const { data, error } = await supabase
        .from("b_daily_health")
        .select("*")
        .eq("org_id", org_id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ rows: data || [] });
    }

    return NextResponse.json({ error: "Provide month, date, range, or trend param" }, { status: 400 });
  } catch (err: any) {
    console.error("[api/trust] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
