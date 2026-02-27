"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogRow {
  id: string;
  hvac_zone_id: string;
  recorded_at: string;
  phase: string | null;
  profile_heat_f: number | null;
  profile_cool_f: number | null;
  feels_like_adj: number | null;
  smart_start_adj: number | null;
  occupancy_adj: number | null;
  manager_adj: number | null;
  active_heat_f: number | null;
  active_cool_f: number | null;
  zone_temp_f: number | null;
  zone_humidity: number | null;
  feels_like_temp_f: number | null;
  occupied_sensor_count: number | null;
  fan_mode: string | null;
  hvac_action: string | null;
  supply_temp_f: number | null;
  return_temp_f: number | null;
  delta_t: number | null;
  power_kw: number | null;
  comp_on: boolean | null;
  adjustment_factors: any[] | null;
  // Power Meter
  apparent_power_kva: number | null;
  compressor_current_a: number | null;
  energy_kwh: number | null;
  energy_delta_kwh: number | null;
  line_voltage_v: number | null;
  power_factor: number | null;
  reactive_power_kvar: number | null;
  frequency_hz: number | null;
  running_state: boolean | null;
  // Anomaly Detection
  coil_freeze: boolean | null;
  delayed_temp_response: boolean | null;
  efficiency_ratio: number | null;
  filter_restriction: boolean | null;
  idle_heat_gain: boolean | null;
  long_cycle: boolean | null;
  outdoor_air_temp_f: number | null;
  refrigerant_low: boolean | null;
  short_cycling: boolean | null;
  line_current_a: number | null;
  cycle_count_1h: number | null;
  continuous_run_min: number | null;
  anomaly_flags: string[] | null;
  anomaly_count: number | null;
  // Equipment Sensors
  cabinet_door_open: boolean | null;
  filter_pressure_pa: number | null;
  water_leak: boolean | null;
  condenser_coil_in_f: number | null;
  condenser_coil_out_f: number | null;
  evaporator_coil_in_f: number | null;
  evaporator_coil_out_f: number | null;
}

interface ZoneInfo {
  hvac_zone_id: string;
  name: string;
  zone_type: string | null;
  equipment_id: string | null;
  smart_start_enabled: boolean;
  manager_override_reset_minutes: number | null;
  manager_override_active: boolean;
  manager_override_remaining_min: number | null;
}

interface SpaceInfo {
  space_id: string;
  name: string;
  space_type: string;
}

interface SpaceGroup {
  space: SpaceInfo;
  zone: ZoneInfo;
  tempSource: string;
  logRows: LogRow[];
}

interface Props {
  siteId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function friendlyFan(fan: string | null): string {
  if (!fan) return "—";
  switch (fan) {
    case "Auto low": return "Auto";
    case "Low": return "On";
    case "Circulation": return "Circ";
    default: return fan;
  }
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** HVAC action badge */
function ActionBadge({ action }: { action: string | null }) {
  if (!action || action === "idle") {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">idle</span>;
  }
  if (action === "heating") {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">heating</span>;
  }
  if (action === "cooling") {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">cooling</span>;
  }
  return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-600">{action}</span>;
}

/** Adjustment score badge */
function AdjBadge({ value, label }: { value: number | null; label?: string }) {
  if (value === null || value === 0) return <span className="text-gray-400">0</span>;
  if (value > 0) return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">+{value}</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{value}</span>;
}

/** Manager offset badge (°F) */
function ManagerBadge({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-gray-400">0</span>;
  if (value > 0) return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">+{value}°F</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{value}°F</span>;
}

/** Compute remaining override minutes from log history.
 *  logRows are sorted newest-first. Returns 0 if no active override. */
function computeRemainingOverride(logRows: LogRow[], maxMinutes: number | null): number {
  if (!maxMinutes || maxMinutes <= 0) return 0;
  if (!logRows || logRows.length === 0) return 0;
  const latest = logRows[0];
  if (latest.manager_adj === null || latest.manager_adj === 0) return 0;
  // Walk backwards through rows to find when the override started
  let overrideStartedAt = new Date(latest.recorded_at);
  for (let i = 1; i < logRows.length; i++) {
    if (logRows[i].manager_adj === null || logRows[i].manager_adj === 0) {
      overrideStartedAt = new Date(logRows[i - 1].recorded_at);
      break;
    }
    overrideStartedAt = new Date(logRows[i].recorded_at);
  }
  const elapsedMinutes = (Date.now() - overrideStartedAt.getTime()) / (60 * 1000);
  return Math.max(0, Math.round(maxMinutes - elapsedMinutes));
}

const COL_COUNT = 50;
// Header styles — group colors for two-row header
const TH_BASE = "py-1.5 px-2 font-semibold whitespace-nowrap text-xs";
const TH = `${TH_BASE} text-gray-700`; // fallback
// Group header row 1 (spanning labels)
const GH = "py-1 px-2 text-[10px] font-bold uppercase tracking-wider text-center text-white/90";
// Column header row 2 — primary and supporting shades per group
const TH_FIXED   = `${TH_BASE} bg-slate-800 text-white`;
const TH_G1_P    = `${TH_BASE} bg-blue-900 text-white`;
const TH_G1_S    = `${TH_BASE} bg-blue-800 text-blue-100`;
const TH_G2      = `${TH_BASE} bg-emerald-900 text-white`;
const TH_G3_P    = `${TH_BASE} bg-orange-900 text-white`;
const TH_G3_S    = `${TH_BASE} bg-orange-800 text-orange-100`;
const TH_G4_P    = `${TH_BASE} bg-purple-900 text-white`;
const TH_G4_S    = `${TH_BASE} bg-purple-800 text-purple-100`;
const TH_G5_P    = `${TH_BASE} bg-amber-900 text-white`;
const TH_G5_S    = `${TH_BASE} bg-amber-800 text-amber-100`;
const TH_G6_P    = `${TH_BASE} bg-teal-900 text-white`;
const TH_G6_S    = `${TH_BASE} bg-teal-800 text-teal-100`;
const TH_G7      = `${TH_BASE} bg-slate-700 text-white`;
// New groups after Profile
const TH_G8_P    = `${TH_BASE} text-white`; // Power Meter (navy) — uses inline style for bg
const TH_G8_S    = `${TH_BASE} text-white/90`; // Power Meter secondary
const TH_G9_P    = `${TH_BASE} text-white`; // Anomaly Detection (red-700)
const TH_G9_S    = `${TH_BASE} text-white/90`; // Anomaly Detection secondary
const TH_G10_P   = `${TH_BASE} text-white`; // Equipment Sensors (purple-600)
const TH_G10_S   = `${TH_BASE} text-white/90`; // Equipment Sensors secondary
const TD = "py-1.5 px-2 whitespace-nowrap text-xs";

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SpaceHvacTable({ siteId }: Props) {
  const [groups, setGroups] = useState<SpaceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(300);

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    // 1. Time series log rows (last 90 min)
    const cutoff = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const { data: logData, error: logError } = await supabase
      .from("b_zone_setpoint_log")
      .select("*")
      .eq("site_id", siteId)
      .gte("recorded_at", cutoff)
      .order("hvac_zone_id")
      .order("recorded_at", { ascending: false });

    if (logError) {
      console.error("[SpaceHvacTable] Log query error:", logError);
    }

    const logRows = (logData || []) as LogRow[];

    // Group by zone
    const logByZone: Record<string, LogRow[]> = {};
    for (const row of logRows) {
      if (!logByZone[row.hvac_zone_id]) logByZone[row.hvac_zone_id] = [];
      // Cap at 18 rows per zone
      if (logByZone[row.hvac_zone_id].length < 18) {
        logByZone[row.hvac_zone_id].push(row);
      }
    }

    // 2. Zones
    const { data: zonesData, error: zonesError } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, zone_type, equipment_id, thermostat_device_id, manager_override_reset_minutes")
      .eq("site_id", siteId)
      .eq("control_scope", "managed")
      .not("thermostat_device_id", "is", null)
      .not("equipment_id", "is", null);

    if (zonesError) {
      console.error("[SpaceHvacTable] Zones query error:", zonesError);
    }

    // Get smart_start_enabled from a_devices + ha_device_id for thermostat state lookup
    const thermoDeviceIds = (zonesData || []).map((z: any) => z.thermostat_device_id).filter(Boolean);
    let ssEnabledByDevice: Record<string, boolean> = {};
    let haDeviceIdByDevice: Record<string, string> = {};
    if (thermoDeviceIds.length > 0) {
      const { data: devData } = await supabase
        .from("a_devices")
        .select("device_id, smart_start_enabled, ha_device_id")
        .in("device_id", thermoDeviceIds);
      for (const d of devData || []) {
        ssEnabledByDevice[d.device_id] = d.smart_start_enabled || false;
        if (d.ha_device_id) haDeviceIdByDevice[d.device_id] = d.ha_device_id;
      }
    }

    // Fetch override state from b_thermostat_state for all thermostats at this site.
    // Override code updates rows by entity_id (climate entity), so look up the
    // climate entity_id for each ha_device_id via b_entity_sync, then query by entity_id.
    const overrideByHaDevice: Record<string, { active: boolean; remaining: number | null }> = {};
    const haDeviceIds = Object.values(haDeviceIdByDevice).filter(Boolean);
    if (haDeviceIds.length > 0) {
      // Get climate entity IDs for these HA devices
      const { data: climateEntities } = await supabase
        .from("b_entity_sync")
        .select("entity_id, ha_device_id")
        .eq("site_id", siteId)
        .ilike("entity_id", "climate.%")
        .in("ha_device_id", haDeviceIds);

      const climateEntityIds = (climateEntities || []).map((e: any) => e.entity_id).filter(Boolean);
      const entityToHaDevice: Record<string, string> = {};
      for (const e of climateEntities || []) {
        if (e.entity_id && e.ha_device_id) entityToHaDevice[e.entity_id] = e.ha_device_id;
      }

      if (climateEntityIds.length > 0) {
        const { data: tStates } = await supabase
          .from("b_thermostat_state")
          .select("entity_id, manager_override_active, manager_override_remaining_min")
          .eq("site_id", siteId)
          .in("entity_id", climateEntityIds);
        for (const ts of tStates || []) {
          const haDevId = entityToHaDevice[ts.entity_id];
          if (haDevId) {
            overrideByHaDevice[haDevId] = {
              active: ts.manager_override_active || false,
              remaining: ts.manager_override_remaining_min ?? null,
            };
          }
        }
      }
    }

    const zones = (zonesData || []).map((z: any) => {
      const haDevId = haDeviceIdByDevice[z.thermostat_device_id] || "";
      const overrideState = overrideByHaDevice[haDevId];
      return {
        hvac_zone_id: z.hvac_zone_id,
        name: z.name,
        zone_type: z.zone_type || null,
        equipment_id: z.equipment_id,
        smart_start_enabled: ssEnabledByDevice[z.thermostat_device_id] || false,
        manager_override_reset_minutes: z.manager_override_reset_minutes,
        manager_override_active: overrideState?.active || false,
        manager_override_remaining_min: overrideState?.remaining ?? null,
      };
    }) as ZoneInfo[];
    const zoneMap: Record<string, ZoneInfo> = {};
    for (const z of zones) zoneMap[z.hvac_zone_id] = z;

    // 3. Spaces (a_spaces does NOT have equipment_id — mapping goes through a_equipment_served_spaces)
    const { data: spacesData, error: spacesError } = await supabase
      .from("a_spaces")
      .select("space_id, name, space_type")
      .eq("site_id", siteId)
      .order("name");

    if (spacesError) {
      console.error("[SpaceHvacTable] Spaces query error:", spacesError);
    }

    // Filter out utility spaces in JS
    const spaces = ((spacesData || []) as SpaceInfo[])
      .filter(sp => sp.name !== "Unassigned" && sp.space_type !== "inventory_storage");

    const spaceById: Record<string, SpaceInfo> = {};
    for (const sp of spaces) spaceById[sp.space_id] = sp;

    // 4. Map equipment → spaces via a_equipment_served_spaces
    const equipIds = zones.map(z => z.equipment_id).filter(Boolean) as string[];
    const equipToSpaceIds: Record<string, string[]> = {};
    if (equipIds.length > 0) {
      const { data: servedData } = await supabase
        .from("a_equipment_served_spaces")
        .select("equipment_id, space_id")
        .in("equipment_id", equipIds);
      for (const row of servedData || []) {
        if (!equipToSpaceIds[row.equipment_id]) equipToSpaceIds[row.equipment_id] = [];
        equipToSpaceIds[row.equipment_id].push(row.space_id);
      }
    }

    // 5. Temp source info (from a_space_sensors)
    const spaceIds = spaces.map(s => s.space_id);
    let tempSensors: any[] | null = null;
    if (spaceIds.length > 0) {
      const { data } = await supabase
        .from("a_space_sensors")
        .select("space_id, entity_id, sensor_type")
        .eq("site_id", siteId)
        .eq("sensor_type", "temperature")
        .in("space_id", spaceIds);
      tempSensors = data;
    }

    const spacesWithSensors = new Set((tempSensors || []).filter((s: any) => s.entity_id).map((s: any) => s.space_id));

    // 6. Build groups: zone → space → log rows
    const result: SpaceGroup[] = [];
    const processedZones = new Set<string>();

    for (const zone of zones) {
      if (processedZones.has(zone.hvac_zone_id)) continue;
      processedZones.add(zone.hvac_zone_id);

      // Find space for this zone via equipment → served spaces
      let space: SpaceInfo | null = null;

      if (zone.equipment_id && equipToSpaceIds[zone.equipment_id]) {
        const servedSpaceIds = equipToSpaceIds[zone.equipment_id];
        // Use the first served space that exists in our spaces list
        for (const sid of servedSpaceIds) {
          if (spaceById[sid]) {
            space = spaceById[sid];
            break;
          }
        }
      }

      // Fallback: use zone name as space
      if (!space) {
        space = { space_id: zone.hvac_zone_id, name: zone.name, space_type: "zone" };
      }

      const tempSource = spacesWithSensors.has(space.space_id) ? "Zone Avg" : "Thermostat";
      const zoneLogRows = logByZone[zone.hvac_zone_id] || [];

      result.push({ space, zone, tempSource, logRows: zoneLogRows });
    }

    // Sort: zones with log data first, then alphabetical by zone name
    result.sort((a, b) => {
      const aHas = a.logRows.length > 0 ? 1 : 0;
      const bHas = b.logRows.length > 0 ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      return a.zone.name.localeCompare(b.zone.name);
    });

    setGroups(result);
    setLoading(false);
    setLastRefresh(new Date());
    setCountdown(300);
  }, [siteId]);

  // ─── Auto-refresh every 5 min ────────────────────────────────────────────

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── Countdown display ───────────────────────────────────────────────────

  const countdownMins = Math.floor(countdown / 60);
  const countdownSecs = countdown % 60;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">Space & HVAC</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span
                className="inline-block h-2 w-2 rounded-full animate-pulse"
                style={{ backgroundColor: countdown > 30 ? "#22c55e" : "#f59e0b" }}
              />
              <span>
                Refresh in {countdownMins}:{countdownSecs.toString().padStart(2, "0")}
              </span>
              <span className="text-gray-300">|</span>
              <span>Last: {lastRefresh.toLocaleTimeString()}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">Last 90 minutes &bull; Updates every 5 min</p>
        </div>
        <button
          onClick={() => fetchData()}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
        >
          ↻ Refresh Now
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 4800 }}>
          <thead>
            {/* Row 1: Group labels */}
            <tr>
              <th rowSpan={2} className={`${TH_FIXED} rounded-tl-md`}>Zone</th>
              <th rowSpan={2} className={TH_FIXED}>Time</th>
              <th colSpan={7} className={`${GH} bg-blue-900`}>Thermostat Commands</th>
              <th colSpan={1} className={`${GH} bg-emerald-900`}>Active</th>
              <th colSpan={5} className={`${GH} bg-orange-900`}>Feels Like</th>
              <th colSpan={2} className={`${GH} bg-purple-900`}>Occupancy</th>
              <th colSpan={2} className={`${GH} bg-amber-900`}>Manager</th>
              <th colSpan={2} className={`${GH} bg-teal-900`}>Smart Start</th>
              <th colSpan={1} className={`${GH} bg-slate-700`}>Profile</th>
              <th colSpan={8} className={GH} style={{ backgroundColor: "#1e3a5f" }}>Power Meter</th>
              <th colSpan={13} className={GH} style={{ backgroundColor: "#b91c1c" }}>Anomaly Detection</th>
              <th colSpan={7} className={`${GH} rounded-tr-md`} style={{ backgroundColor: "#7c3aed" }}>Equipment Sensors</th>
            </tr>
            {/* Row 2: Individual column names */}
            <tr>
              {/* G1 — Thermostat Commands (blue) */}
              <th className={TH_G1_P}>Eagle Eye Directive</th>
              <th className={TH_G1_P}>Fan</th>
              <th className={TH_G1_S}>Supply</th>
              <th className={TH_G1_S}>Return</th>
              <th className={TH_G1_S}>ΔT</th>
              <th className={TH_G1_S}>Power</th>
              <th className={TH_G1_S}>Comp</th>
              {/* G2 — Active Setpoint (emerald) */}
              <th className={TH_G2}>Active Setpoint</th>
              {/* G3 — Feels Like (orange) */}
              <th className={TH_G3_P}>Feels Like Score</th>
              <th className={TH_G3_S}>Zone Temp</th>
              <th className={TH_G3_S}>Zone Humidity</th>
              <th className={TH_G3_S}>Feels Like Temp</th>
              <th className={TH_G3_S}>Source</th>
              {/* G4 — Occupancy (purple) */}
              <th className={TH_G4_P}>Occ Score</th>
              <th className={TH_G4_S}>Sensors</th>
              {/* G5 — Manager (amber) */}
              <th className={TH_G5_P}>Manager</th>
              <th className={TH_G5_S}>Remaining</th>
              {/* G6 — Smart Start (teal) */}
              <th className={TH_G6_P}>SS Score</th>
              <th className={TH_G6_S}>SS Enabled</th>
              {/* G7 — Profile (slate) */}
              <th className={TH_G7}>Profile Setpoint</th>
              {/* G8 — Power Meter (navy) */}
              <th className={TH_G8_P} style={{ backgroundColor: "#1e3a5f" }}>Apparent</th>
              <th className={TH_G8_P} style={{ backgroundColor: "#1e3a5f" }}>Current</th>
              <th className={TH_G8_S} style={{ backgroundColor: "#264a6f" }}>Energy</th>
              <th className={TH_G8_S} style={{ backgroundColor: "#264a6f" }}>Voltage</th>
              <th className={TH_G8_S} style={{ backgroundColor: "#264a6f" }}>PF</th>
              <th className={TH_G8_S} style={{ backgroundColor: "#264a6f" }}>Reactive</th>
              <th className={TH_G8_S} style={{ backgroundColor: "#264a6f" }}>Freq</th>
              <th className={TH_G8_P} style={{ backgroundColor: "#1e3a5f" }}>Running</th>
              {/* G9 — Anomaly Detection (red) */}
              <th className={TH_G9_P} style={{ backgroundColor: "#b91c1c" }}>{"\u26A0"} Count</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Coil Freeze</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Delayed Resp</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Efficiency</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Filter</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Idle Gain</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Long Cycle</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Outdoor</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Refrig Low</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Short Cycle</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Cycles/hr</th>
              <th className={TH_G9_S} style={{ backgroundColor: "#dc2626" }}>Run Min</th>
              <th className={TH_G9_P} style={{ backgroundColor: "#b91c1c" }}>Flags</th>
              {/* G10 — Equipment Sensors (purple) */}
              <th className={TH_G10_P} style={{ backgroundColor: "#7c3aed" }}>Cabinet</th>
              <th className={TH_G10_S} style={{ backgroundColor: "#8b5cf6" }}>Filter {"\u0394"}P</th>
              <th className={TH_G10_P} style={{ backgroundColor: "#7c3aed" }}>Water Leak</th>
              <th className={TH_G10_S} style={{ backgroundColor: "#8b5cf6" }}>Cond In</th>
              <th className={TH_G10_S} style={{ backgroundColor: "#8b5cf6" }}>Cond Out</th>
              <th className={TH_G10_S} style={{ backgroundColor: "#8b5cf6" }}>Evap In</th>
              <th className={TH_G10_S} style={{ backgroundColor: "#8b5cf6" }}>Evap Out</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COL_COUNT} className="py-8 text-gray-500 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading spaces...
                  </div>
                </td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="py-8 text-gray-500 text-center">
                  No managed zones found
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const rowCount = Math.max(group.logRows.length, 1);
                const hasLogs = group.logRows.length > 0;

                if (!hasLogs) {
                  // Placeholder row when no log data yet
                  return (
                    <tr key={group.zone.hvac_zone_id} className="border-b border-gray-200">
                      <td className={`${TD} align-top`}>
                        <span className="font-medium text-gray-800">{group.zone.name}</span>
                        {group.zone.zone_type && (
                          <div className="text-[10px] text-gray-500 capitalize">{group.zone.zone_type}</div>
                        )}
                      </td>
                      <td colSpan={COL_COUNT - 1} className={`${TD} text-gray-400 italic`}>
                        Awaiting first snapshot...
                      </td>
                    </tr>
                  );
                }

                return group.logRows.map((log, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === group.logRows.length - 1;
                  const borderClass = isLast ? "border-b border-gray-200" : "border-b border-gray-50";

                  // Delta T color
                  let dtColor = "text-gray-600";
                  if (log.delta_t !== null) {
                    dtColor = log.delta_t < 0 ? "text-blue-600" : log.delta_t > 15 ? "text-green-600" : log.delta_t >= 10 ? "text-gray-700" : "text-amber-600";
                  }

                  return (
                    <tr key={log.id} className={`${borderClass} hover:bg-gray-50/50 transition-colors`}>
                      {/* Zone (merged) */}
                      {isFirst && (
                        <td className={`${TD} align-top`} rowSpan={rowCount}>
                          <span className="font-medium text-gray-800">{group.zone.name}</span>
                          {group.zone.zone_type && (
                            <div className="text-[10px] text-gray-500 capitalize">{group.zone.zone_type}</div>
                          )}
                        </td>
                      )}

                      {/* Time */}
                      <td className={TD}>
                        <span className={`font-mono ${isFirst ? "font-medium text-gray-800" : "text-gray-500"}`}>
                          {formatTime(log.recorded_at)}
                        </span>
                      </td>

                      {/* G1: Eagle Eye Directive */}
                      <td className={TD}>
                        <ActionBadge action={log.hvac_action} />
                      </td>

                      {/* G1: Fan */}
                      <td className={TD}>
                        <span className="text-gray-600">{friendlyFan(log.fan_mode)}</span>
                      </td>

                      {/* G1: Supply */}
                      <td className={TD}>
                        {log.supply_temp_f != null ? (
                          <span className="text-gray-600">{log.supply_temp_f}°F</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G1: Return */}
                      <td className={TD}>
                        {log.return_temp_f != null ? (
                          <span className="text-gray-600">{log.return_temp_f}°F</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G1: ΔT */}
                      <td className={TD}>
                        {log.delta_t != null ? (
                          <span className={`font-medium ${dtColor}`}>{log.delta_t.toFixed(1)}°F</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G1: Power */}
                      <td className={TD}>
                        {log.power_kw != null ? (
                          <span className="text-gray-600">{log.power_kw} kW</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G1: Comp */}
                      <td className={TD}>
                        {log.comp_on != null ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            log.comp_on ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
                          }`}>
                            {log.comp_on ? "On" : "Off"}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G2: Active Setpoint */}
                      <td className={TD}>
                        {log.active_heat_f != null && log.active_cool_f != null ? (
                          <span className="font-medium text-gray-800">
                            {log.active_heat_f}°–{log.active_cool_f}°F
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G3: Feels Like Score */}
                      <td className={`${TD} text-center`}>
                        <AdjBadge value={log.feels_like_adj} />
                      </td>

                      {/* G3: Zone Temp */}
                      <td className={TD}>
                        {log.zone_temp_f != null ? (
                          <span className="font-medium" style={{ color: "#12723A" }}>{log.zone_temp_f}°F</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G3: Zone Humidity */}
                      <td className={TD}>
                        {log.zone_humidity != null ? (
                          <span className="font-medium" style={{ color: "#80B52C" }}>{log.zone_humidity}%</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G3: Feels Like Temp */}
                      <td className={TD}>
                        {log.feels_like_temp_f != null ? (
                          <span className={`font-medium ${
                            log.zone_temp_f != null && Math.abs(log.feels_like_temp_f - log.zone_temp_f) >= 2
                              ? "text-red-600" : "text-gray-500"
                          }`}>
                            {log.feels_like_temp_f}°F
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G3: Source (rowSpan) */}
                      {isFirst && (
                        <td className={`${TD} align-top`} rowSpan={rowCount}>
                          <span className={`px-2 py-0.5 rounded font-medium ${
                            group.tempSource === "Zone Avg"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {group.tempSource}
                          </span>
                        </td>
                      )}

                      {/* G4: Occ Score */}
                      <td className={`${TD} text-center`}>
                        <AdjBadge value={log.occupancy_adj} />
                      </td>

                      {/* G4: Sensors */}
                      <td className={`${TD} text-center`}>
                        {log.occupied_sensor_count != null ? (
                          <span className="text-gray-600">{log.occupied_sensor_count}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G5: Manager */}
                      <td className={`${TD} text-center`}>
                        <ManagerBadge value={log.manager_adj} />
                      </td>

                      {/* G5: Remaining override time (rowSpan) */}
                      {isFirst && (
                        <td className={`${TD} align-top text-center`} rowSpan={rowCount}>
                          {group.zone.manager_override_active && (group.zone.manager_override_remaining_min ?? 0) > 0
                            ? (() => {
                                const m = group.zone.manager_override_remaining_min!;
                                const hrs = Math.floor(m / 60);
                                const mins = m % 60;
                                const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                                return <span className="text-xs font-medium text-amber-700">{label}</span>;
                              })()
                            : <span className="text-gray-400">&mdash;</span>
                          }
                        </td>
                      )}

                      {/* G6: SS Score */}
                      <td className={`${TD} text-center`}>
                        <AdjBadge value={log.smart_start_adj} />
                      </td>

                      {/* G6: SS Enabled (rowSpan) */}
                      {isFirst && (
                        <td className={`${TD} align-top text-center`} rowSpan={rowCount}>
                          {group.zone.smart_start_enabled ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">yes</span>
                          ) : (
                            <span className="text-xs text-gray-400">no</span>
                          )}
                        </td>
                      )}

                      {/* G7: Profile Setpoint */}
                      <td className={TD}>
                        {log.profile_heat_f != null && log.profile_cool_f != null ? (
                          <span className="text-gray-600">
                            {log.profile_heat_f}°–{log.profile_cool_f}°F
                            <span className="text-gray-400 ml-1">({log.phase === "occupied" ? "occ" : "unocc"})</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* G8: Power Meter */}
                      <td className={TD}>
                        {log.apparent_power_kva != null ? (
                          <span className="text-gray-600">{log.apparent_power_kva.toFixed(1)} kVA</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.compressor_current_a != null ? (
                          <span className="text-gray-600">{log.compressor_current_a.toFixed(2)} A</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.energy_delta_kwh != null ? (
                          <span className="text-gray-600">{log.energy_delta_kwh.toFixed(2)} kWh</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.line_voltage_v != null ? (
                          <span className="text-gray-600">{log.line_voltage_v.toFixed(1)} V</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.power_factor != null ? (
                          <span className="text-gray-600">{log.power_factor.toFixed(2)}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.reactive_power_kvar != null ? (
                          <span className="text-gray-600">{log.reactive_power_kvar.toFixed(3)} kVAR</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.frequency_hz != null ? (
                          <span className="text-gray-600">{log.frequency_hz.toFixed(2)} Hz</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.running_state != null ? (
                          log.running_state
                            ? <span className="text-green-600">{"\u25CF"}</span>
                            : <span className="text-gray-400">{"\u25CB"}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>

                      {/* G9: Anomaly Detection */}
                      <td className={`${TD} text-center`}>
                        {log.anomaly_count != null ? (
                          log.anomaly_count > 0
                            ? <span className="font-bold text-red-600">{log.anomaly_count}</span>
                            : <span className="text-gray-400">0</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.coil_freeze === true
                          ? <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">YES</span>
                          : log.coil_freeze === false ? null : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.delayed_temp_response === true
                          ? <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">YES</span>
                          : log.delayed_temp_response === false ? null : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.efficiency_ratio != null ? (
                          <span className="text-gray-600">{log.efficiency_ratio.toFixed(1)}%</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.filter_restriction === true
                          ? <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">YES</span>
                          : log.filter_restriction === false ? null : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.idle_heat_gain === true
                          ? <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">YES</span>
                          : log.idle_heat_gain === false ? null : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.long_cycle === true
                          ? <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">YES</span>
                          : log.long_cycle === false ? null : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.outdoor_air_temp_f != null ? (
                          <span className="text-gray-600">{log.outdoor_air_temp_f}{"\u00B0"}F</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.refrigerant_low === true
                          ? <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">YES</span>
                          : log.refrigerant_low === false ? null : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.short_cycling === true
                          ? <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">YES</span>
                          : log.short_cycling === false ? null : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.cycle_count_1h != null ? (
                          <span className="text-gray-600">{log.cycle_count_1h}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.continuous_run_min != null ? (
                          <span className="text-gray-600">{log.continuous_run_min}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.anomaly_flags && log.anomaly_flags.length > 0 ? (
                          <span className="text-red-600 text-[10px]">{log.anomaly_flags.join(", ")}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>

                      {/* G10: Equipment Sensors */}
                      <td className={`${TD} text-center`}>
                        {log.cabinet_door_open === true
                          ? <span className="font-bold text-red-600">OPEN</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.filter_pressure_pa != null ? (
                          <span className="text-gray-600">{log.filter_pressure_pa} Pa</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${TD} text-center`}>
                        {log.water_leak === true
                          ? <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">LEAK</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.condenser_coil_in_f != null ? (
                          <span className="text-gray-600">{log.condenser_coil_in_f}{"\u00B0"}F</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.condenser_coil_out_f != null ? (
                          <span className="text-gray-600">{log.condenser_coil_out_f}{"\u00B0"}F</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.evaporator_coil_in_f != null ? (
                          <span className="text-gray-600">{log.evaporator_coil_in_f}{"\u00B0"}F</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={TD}>
                        {log.evaporator_coil_out_f != null ? (
                          <span className="text-gray-600">{log.evaporator_coil_out_f}{"\u00B0"}F</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                });
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
