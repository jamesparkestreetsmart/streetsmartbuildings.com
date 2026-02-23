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
}

interface ZoneInfo {
  hvac_zone_id: string;
  name: string;
  equipment_id: string | null;
  smart_start_enabled: boolean;
  manager_override_reset_minutes: number | null;
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
  if (value === null || value === 0) return <span className="text-gray-400">—</span>;
  if (value > 0) return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">+{value}°F</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{value}°F</span>;
}

const COL_COUNT = 22;
const TH = "py-2 px-2 font-semibold whitespace-nowrap text-gray-700 text-xs";
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
      .select("hvac_zone_id, name, equipment_id, thermostat_device_id, manager_override_reset_minutes")
      .eq("site_id", siteId)
      .eq("control_scope", "managed")
      .not("thermostat_device_id", "is", null);

    if (zonesError) {
      console.error("[SpaceHvacTable] Zones query error:", zonesError);
    }

    // Get smart_start_enabled from a_devices (it's per-device, not per-zone)
    const thermoDeviceIds = (zonesData || []).map((z: any) => z.thermostat_device_id).filter(Boolean);
    let ssEnabledByDevice: Record<string, boolean> = {};
    if (thermoDeviceIds.length > 0) {
      const { data: devData } = await supabase
        .from("a_devices")
        .select("device_id, smart_start_enabled")
        .in("device_id", thermoDeviceIds);
      for (const d of devData || []) {
        ssEnabledByDevice[d.device_id] = d.smart_start_enabled || false;
      }
    }

    const zones = (zonesData || []).map((z: any) => ({
      hvac_zone_id: z.hvac_zone_id,
      name: z.name,
      equipment_id: z.equipment_id,
      smart_start_enabled: ssEnabledByDevice[z.thermostat_device_id] || false,
      manager_override_reset_minutes: z.manager_override_reset_minutes,
    })) as ZoneInfo[];
    const zoneMap: Record<string, ZoneInfo> = {};
    for (const z of zones) zoneMap[z.hvac_zone_id] = z;

    // 3. Spaces (linked via equipment_id)
    const { data: spacesData } = await supabase
      .from("a_spaces")
      .select("space_id, name, space_type, equipment_id")
      .eq("site_id", siteId)
      .neq("name", "Unassigned")
      .neq("space_type", "inventory_storage")
      .order("name");

    const spaces = (spacesData || []) as (SpaceInfo & { equipment_id: string | null })[];

    // Build equipment_id → space mapping
    const spaceByEquipment: Record<string, SpaceInfo & { equipment_id: string | null }> = {};
    for (const sp of spaces) {
      if (sp.equipment_id) spaceByEquipment[sp.equipment_id] = sp;
    }

    // Also check a_equipment_served_spaces for additional mappings
    const equipIds = zones.map(z => z.equipment_id).filter(Boolean) as string[];
    let servedData: any[] | null = null;
    if (equipIds.length > 0) {
      const { data } = await supabase
        .from("a_equipment_served_spaces")
        .select("equipment_id, space_id")
        .in("equipment_id", equipIds);
      servedData = data;
    }

    const spaceById: Record<string, SpaceInfo> = {};
    for (const sp of spaces) spaceById[sp.space_id] = sp;

    // 4. Temp source info (from a_space_sensors)
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

    // 5. Build groups: zone → space → log rows
    const result: SpaceGroup[] = [];
    const processedZones = new Set<string>();

    for (const zone of zones) {
      if (processedZones.has(zone.hvac_zone_id)) continue;
      processedZones.add(zone.hvac_zone_id);

      // Find space for this zone
      let space: SpaceInfo | null = null;

      // Direct match via equipment_id on a_spaces
      if (zone.equipment_id && spaceByEquipment[zone.equipment_id]) {
        space = spaceByEquipment[zone.equipment_id];
      }

      // Via served spaces
      if (!space && zone.equipment_id && servedData) {
        const served = servedData.find((s: any) => s.equipment_id === zone.equipment_id);
        if (served && spaceById[served.space_id]) {
          space = spaceById[served.space_id];
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

    // Sort: zones with log data first, then alphabetical
    result.sort((a, b) => {
      const aHas = a.logRows.length > 0 ? 1 : 0;
      const bHas = b.logRows.length > 0 ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      return a.space.name.localeCompare(b.space.name);
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
        <table className="w-full text-sm" style={{ minWidth: 2200 }}>
          <thead>
            <tr className="text-left border-b border-gray-200">
              <th className={TH}>Space</th>
              <th className={TH}>Time</th>
              <th className={TH}>Eagle Eye Directive</th>
              <th className={TH}>Fan</th>
              <th className={TH}>Active Setpoint</th>
              <th className={TH}>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">Feels Like</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs">Feels-like adjustment (-2 to +2)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className={TH}>Zone Temp</th>
              <th className={TH}>Humidity</th>
              <th className={TH}>Feels Like</th>
              <th className={TH}>Source</th>
              <th className={TH}>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">Occ Score</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs">Occupancy adjustment (0 or -1)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className={TH}>Sensors</th>
              <th className={TH}>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">Manager</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs">Manager offset from profile setpoint</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className={TH}>Override</th>
              <th className={TH}>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">SS Score</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs">Smart Start adjustment (+1/-1/0)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className={TH}>SS Enabled</th>
              <th className={TH}>Profile Setpoint</th>
              <th className={TH}>Supply</th>
              <th className={TH}>Return</th>
              <th className={TH}>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">ΔT</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs font-medium">Delta T (Return − Supply)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className={TH}>Power</th>
              <th className={TH}>Comp</th>
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
                        <Link
                          href={`/sites/${siteId}/spaces/${group.space.space_id}`}
                          className="underline font-medium"
                          style={{ color: "#12723A" }}
                        >
                          {group.space.name}
                        </Link>
                        <div className="text-[10px] text-gray-500">{group.space.space_type}</div>
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
                      {/* 1. Space (merged) */}
                      {isFirst && (
                        <td className={`${TD} align-top`} rowSpan={rowCount}>
                          <Link
                            href={`/sites/${siteId}/spaces/${group.space.space_id}`}
                            className="underline font-medium"
                            style={{ color: "#12723A" }}
                          >
                            {group.space.name}
                          </Link>
                          <div className="text-[10px] text-gray-500">{group.space.space_type}</div>
                        </td>
                      )}

                      {/* 2. Time */}
                      <td className={TD}>
                        <span className={`font-mono ${isFirst ? "font-medium text-gray-800" : "text-gray-500"}`}>
                          {formatTime(log.recorded_at)}
                        </span>
                      </td>

                      {/* 3. Eagle Eye Directive (hvac_action) */}
                      <td className={TD}>
                        <ActionBadge action={log.hvac_action} />
                      </td>

                      {/* 4. Fan */}
                      <td className={TD}>
                        <span className="text-gray-600">{friendlyFan(log.fan_mode)}</span>
                      </td>

                      {/* 5. Active Setpoint */}
                      <td className={TD}>
                        {log.active_heat_f != null && log.active_cool_f != null ? (
                          <span className="font-medium text-gray-800">
                            {log.active_heat_f}°–{log.active_cool_f}°F
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* 6. Feels Like Score */}
                      <td className={`${TD} text-center`}>
                        <AdjBadge value={log.feels_like_adj} />
                      </td>

                      {/* 7. Zone Temp */}
                      <td className={TD}>
                        {log.zone_temp_f != null ? (
                          <span className="font-medium" style={{ color: "#12723A" }}>{log.zone_temp_f}°F</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* 8. Humidity */}
                      <td className={TD}>
                        {log.zone_humidity != null ? (
                          <span className="font-medium" style={{ color: "#80B52C" }}>{log.zone_humidity}%</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* 9. Feels Like Temp */}
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

                      {/* 10. Source (same for all rows, shown every row for readability) */}
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

                      {/* 11. Occupancy Score */}
                      <td className={`${TD} text-center`}>
                        <AdjBadge value={log.occupancy_adj} />
                      </td>

                      {/* 12. Occupied Sensor Count */}
                      <td className={`${TD} text-center`}>
                        {log.occupied_sensor_count != null ? (
                          <span className="text-gray-600">{log.occupied_sensor_count}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* 13. Manager Offset */}
                      <td className={`${TD} text-center`}>
                        <ManagerBadge value={log.manager_adj} />
                      </td>

                      {/* 14. Override Time Remaining (from zone config, same all rows) */}
                      {isFirst && (
                        <td className={`${TD} align-top text-center`} rowSpan={rowCount}>
                          {group.zone.manager_override_reset_minutes != null && group.zone.manager_override_reset_minutes > 0 ? (
                            <span className="text-xs text-amber-700">{group.zone.manager_override_reset_minutes} min</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      )}

                      {/* 15. Smart Start Score */}
                      <td className={`${TD} text-center`}>
                        <AdjBadge value={log.smart_start_adj} />
                      </td>

                      {/* 16. Smart Start Enabled (from zone config, same all rows) */}
                      {isFirst && (
                        <td className={`${TD} align-top text-center`} rowSpan={rowCount}>
                          {group.zone.smart_start_enabled ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">yes</span>
                          ) : (
                            <span className="text-xs text-gray-400">no</span>
                          )}
                        </td>
                      )}

                      {/* 17. Profile Setpoint */}
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

                      {/* 18. Supply */}
                      <td className={TD}>
                        {log.supply_temp_f != null ? (
                          <span className="text-gray-600">{log.supply_temp_f}°F</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* 19. Return */}
                      <td className={TD}>
                        {log.return_temp_f != null ? (
                          <span className="text-gray-600">{log.return_temp_f}°F</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* 20. Delta T */}
                      <td className={TD}>
                        {log.delta_t != null ? (
                          <span className={`font-medium ${dtColor}`}>{log.delta_t.toFixed(1)}°F</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* 21. Power */}
                      <td className={TD}>
                        {log.power_kw != null ? (
                          <span className="text-gray-600">{log.power_kw} kW</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* 22. Comp */}
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
