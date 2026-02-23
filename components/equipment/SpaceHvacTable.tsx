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

interface Space {
  space_id: string;
  name: string;
  space_type: string;
}

interface HVACEquipment {
  equipment_id: string;
  equipment_name: string;
  equipment_type_id: string | null;
  status: string;
}

interface HVACSensor {
  entity_id: string;
  equipment_id: string | null;
  device_class: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
  sensor_role: string | null;
}

interface HVACSensorData {
  power: HVACSensor | null;
  supply_temp: HVACSensor | null;
  return_temp: HVACSensor | null;
  delta_t: HVACSensor | null;
  fan_status: HVACSensor | null;
  compressor_status: HVACSensor | null;
}

interface ProfileSetpoints {
  occupied_heat_f: number;
  occupied_cool_f: number;
  unoccupied_heat_f: number;
  unoccupied_cool_f: number;
  occupied_hvac_mode: string;
  unoccupied_hvac_mode: string;
  profile_name: string | null;
  source: string;
}

interface ThermostatState {
  ha_device_id: string;
  hvac_mode: string | null;
  hvac_action: string | null;
  current_temperature_f: number | null;
  current_humidity: number | null;
  current_setpoint_f: number | null;
  target_temp_high_f: number | null;
  target_temp_low_f: number | null;
  fan_mode: string | null;
  fan_action: string | null;
  battery_level: number | null;
  last_synced_at: string | null;
  eagle_eye_directive: string | null;
  directive_generated_at: string | null;
  feels_like_indoor_f: number | null;
  feels_like_outdoor_f: number | null;
  outdoor_temp_f: number | null;
  temp_trend_5min: number | null;
  temp_accel_5min: number | null;
  zone_occupancy_status: string | null;
  zone_last_motion_at: string | null;
  equipment_id?: string | null;
  thermostat_name?: string | null;
  current_phase?: string | null;
  profile_setpoints?: ProfileSetpoints | null;
}

interface ThermostatDevice {
  device_id: string;
  device_name: string;
  ha_device_id: string;
  space_id: string | null;
  equipment_id: string | null;
  smart_start_enabled: boolean;
  smart_start_reset_at: string | null;
  label: string | null;
}

interface SpaceDevice {
  device_id: string;
  ha_device_id: string;
  weight: number;
  device_class: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface SpaceRow {
  space: Space;
  hvac_equipments: HVACEquipment[];
  hvac_sensors_by_equipment: Record<string, HVACSensorData>;
  thermostats: (ThermostatDevice & { state: ThermostatState | null })[];
  weighted_temp: number | null;
  weighted_temp_ts: string | null;
  weighted_humidity: number | null;
  weighted_humidity_ts: string | null;
  temp_source: string;
}

interface Props {
  siteId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifySensors(sensors: HVACSensor[]): HVACSensorData {
  const data: HVACSensorData = {
    power: null,
    supply_temp: null,
    return_temp: null,
    delta_t: null,
    fan_status: null,
    compressor_status: null,
  };
  for (const sensor of sensors) {
    if (!sensor.sensor_role) continue;
    switch (sensor.sensor_role) {
      case "power":
      case "power_kw":
        data.power = sensor;
        break;
      case "supply_air":
      case "supply_air_temp":
      case "supply_temp":
        data.supply_temp = sensor;
        break;
      case "return_air":
      case "return_air_temp":
      case "return_temp":
        data.return_temp = sensor;
        break;
      case "delta_t":
        data.delta_t = sensor;
        break;
      case "fan":
      case "fan_status":
        data.fan_status = sensor;
        break;
      case "compressor":
      case "compressor_status":
      case "compressor_state":
      case "compressor_current":
        data.compressor_status = sensor;
        break;
    }
  }
  return data;
}

function calculateWeightedAverage(
  devices: SpaceDevice[],
  deviceClass: string
): { value: number | null; ts: string | null } {
  const readings = devices.filter(
    (d) =>
      d.device_class === deviceClass &&
      d.last_state !== null &&
      !isNaN(parseFloat(d.last_state!))
  );
  if (readings.length === 0) return { value: null, ts: null };

  let totalWeight = 0;
  let weightedSum = 0;
  let latestTs: string | null = null;

  for (const reading of readings) {
    const value = parseFloat(reading.last_state!);
    const weight = reading.weight || 3;
    weightedSum += value * weight;
    totalWeight += weight;
    if (!latestTs || (reading.last_seen_at && reading.last_seen_at > latestTs)) {
      latestTs = reading.last_seen_at;
    }
  }
  return {
    value: totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null,
    ts: latestTs,
  };
}

/** Compute indoor feels-like from temp + humidity (Steadman heat index) */
function computeFeelsLikeIndoor(tempF: number | null, humidity: number | null): number | null {
  if (tempF === null || humidity === null) return null;
  // Below 80°F, humidity has negligible effect on perceived temperature
  if (tempF < 80) return Math.round(tempF);
  // Above 80°F with low humidity (<40%), feels like ≈ actual temp
  if (humidity < 40) return Math.round(tempF);
  // Rothfusz regression heat index (only meaningful at 80°F+ with 40%+ humidity)
  const hi =
    -42.379 +
    2.04901523 * tempF +
    10.14333127 * humidity -
    0.22475541 * tempF * humidity -
    0.00683783 * tempF * tempF -
    0.05481717 * humidity * humidity +
    0.00122874 * tempF * tempF * humidity +
    0.00085282 * tempF * humidity * humidity -
    0.00000199 * tempF * tempF * humidity * humidity;
  return Math.round(hi);
}

/** Friendly HVAC mode label */
function friendlyMode(mode: string | null): string {
  if (!mode) return "—";
  switch (mode) {
    case "heat_cool": return "Auto";
    case "heat": return "Heat";
    case "cool": return "Cool";
    case "off": return "Off";
    default: return mode;
  }
}

/** Friendly fan mode label */
function friendlyFan(fan: string | null): string {
  if (!fan) return "—";
  switch (fan) {
    case "Auto low": return "Auto";
    case "Low": return "On";
    case "Circulation": return "Circ";
    default: return fan;
  }
}

function formatSensorValue(sensor: HVACSensor | null): string {
  if (!sensor || sensor.last_state === null) return "—";
  const value = sensor.last_state;
  const unit = sensor.unit_of_measurement || "";
  return `${value}${unit ? " " + unit : ""}`;
}

function formatTimeAgo(isoStr: string | null): string {
  if (!isoStr) return "No data";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Combined velocity + acceleration trend indicator */
function TrendIndicator({ trend, accel }: { trend: number | null; accel: number | null }) {
  if (trend === null || trend === undefined) return <span className="text-gray-400">—</span>;

  const absTrend = Math.abs(trend);
  const absAccel = Math.abs(accel ?? 0);
  const isAccelerating = accel !== null && absAccel >= 0.2;

  // Stable
  if (absTrend < 0.3) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-0.5 text-emerald-600 cursor-help">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
            <p className="text-xs font-medium">Stable</p>
            <p className="text-xs opacity-75">{trend > 0 ? "+" : ""}{trend.toFixed(1)}°F / 5min</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Rising
  if (trend > 0) {
    const isUrgent = isAccelerating && accel! > 0; // rising + accelerating
    const color = isUrgent ? "text-red-600" : "text-orange-500";
    const label = isUrgent ? "Rising & accelerating" : isAccelerating ? "Rising, decelerating" : "Rising";

    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center gap-0 cursor-help ${color}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2L12 8H2L7 2Z" fill="currentColor" />
              </svg>
              {isUrgent && (
                <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="-ml-1">
                  <path d="M5 2L9 7H1L5 2Z" fill="currentColor" />
                </svg>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
            <p className="text-xs font-medium">{label}</p>
            <p className="text-xs opacity-75">Velocity: +{trend.toFixed(1)}°F / 5min</p>
            {accel !== null && <p className="text-xs opacity-75">Accel: {accel > 0 ? "+" : ""}{accel.toFixed(2)}°F / 5min²</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Falling
  const isFastCool = isAccelerating && accel! < 0; // falling + accelerating downward
  const color = isFastCool ? "text-blue-600" : "text-blue-400";
  const label = isFastCool ? "Falling fast" : isAccelerating ? "Falling, slowing" : "Falling";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-0 cursor-help ${color}`}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 12L2 6H12L7 12Z" fill="currentColor" />
            </svg>
            {isFastCool && (
              <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="-ml-1">
                <path d="M5 12L1 7H9L5 12Z" fill="currentColor" />
              </svg>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
          <p className="text-xs font-medium">{label}</p>
          <p className="text-xs opacity-75">Velocity: {trend.toFixed(1)}°F / 5min</p>
          {accel !== null && <p className="text-xs opacity-75">Accel: {accel > 0 ? "+" : ""}{accel.toFixed(2)}°F / 5min²</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Directive badge with contextual color */
function DirectiveBadge({ directive }: { directive: string | null }) {
  if (!directive || directive === "Awaiting data") {
    return <span className="text-gray-400 text-xs italic">Awaiting data</span>;
  }

  const lower = directive.toLowerCase();

  if (lower === "no zone assigned") {
    return <span className="text-gray-400 text-xs italic">No zone assigned</span>;
  }

  let bgClass = "bg-gray-100 text-gray-600 border-gray-200";

  if (lower.includes("guardrail")) {
    bgClass = "bg-red-50 text-red-700 border-red-200";
  } else if (lower.includes("unreachable") || lower.includes("failed")) {
    bgClass = "bg-orange-50 text-orange-700 border-orange-200";
  } else if (lower.includes("occupied") && !lower.includes("unoccupied")) {
    bgClass = "bg-green-50 text-green-700 border-green-200";
  } else if (lower.includes("unoccupied")) {
    bgClass = "bg-blue-50 text-blue-700 border-blue-200";
  } else if (lower.includes("awaiting next push") || lower.includes("pending push")) {
    bgClass = "bg-amber-50 text-amber-700 border-amber-200";
  } else if (lower.includes("in range") || lower.includes("no action")) {
    bgClass = "bg-gray-50 text-gray-600 border-gray-200";
  }

  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border ${bgClass}`} style={{ maxWidth: 260 }}>
      <span className="truncate">{directive}</span>
    </span>
  );
}

/** Smart Start toggle with reset */
function SmartStartCell({
  enabled,
  deviceId,
  resetAt,
  onToggle,
  onReset,
}: {
  enabled: boolean;
  deviceId: string;
  resetAt: string | null;
  onToggle: (deviceId: string, newValue: boolean) => void;
  onReset: (deviceId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onToggle(deviceId, !enabled)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          enabled ? "bg-emerald-500" : "bg-gray-300"
        }`}
        title={enabled ? "Smart Start enabled" : "Smart Start disabled"}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </button>
      {enabled && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onReset(deviceId)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Reset Smart Start algorithm"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2.5 7a4.5 4.5 0 1 1 1.2 3.1M2.5 11V7h4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl"
            >
              <p className="text-xs font-medium">Reset Smart Start</p>
              <p className="text-xs opacity-75">Restarts learning from 30 min default</p>
              {resetAt && (
                <p className="text-xs opacity-60 mt-1">
                  Last reset: {new Date(resetAt).toLocaleDateString()}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SpaceHvacTable({ siteId }: Props) {
  const [spaceRows, setSpaceRows] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(300); // 5 min in seconds

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    // 1. Spaces
    const { data: spacesData, error: spacesError } = await supabase
      .from("a_spaces")
      .select("space_id, name, space_type")
      .eq("site_id", siteId)
      .neq("name", "Unassigned")
      .neq("space_type", "inventory_storage")
      .order("name");

    if (spacesError) {
      console.error("Error fetching spaces:", spacesError);
      setLoading(false);
      return;
    }

    const spaces = (spacesData || []) as Space[];
    const spaceIds = spaces.map((s) => s.space_id);

    // 2. HVAC equipment
    const { data: hvacData } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, equipment_type_id, status")
      .eq("site_id", siteId)
      .eq("equipment_group", "HVAC");

    const hvacEquipments = (hvacData || []) as HVACEquipment[];
    const hvacIds = hvacEquipments.map((h) => h.equipment_id);

    // 3. Served spaces
    const { data: servedData } = await supabase
      .from("a_equipment_served_spaces")
      .select("equipment_id, space_id")
      .in("equipment_id", hvacIds.length > 0 ? hvacIds : ["__none__"]);

    const equipmentsBySpace: Record<string, string[]> = {};
    if (servedData) {
      for (const row of servedData) {
        if (!equipmentsBySpace[row.space_id]) equipmentsBySpace[row.space_id] = [];
        equipmentsBySpace[row.space_id].push(row.equipment_id);
      }
    }

    // 4. Fetch thermostat state + equipment sensors via API (bypasses RLS)
    let apiThermostatStates: ThermostatState[] = [];
    let apiSensorData: HVACSensor[] = [];
    try {
      const stateRes = await fetch(`/api/thermostat/state?site_id=${siteId}`);
      if (stateRes.ok) {
        const apiData = await stateRes.json();
        apiThermostatStates = apiData.thermostat_states || [];
        apiSensorData = apiData.equipment_sensors || [];
      }
    } catch (err) {
      console.error("[SpaceHvacTable] API fetch error:", err);
    }

    const sensorsByEquipment: Record<string, HVACSensor[]> = {};
    for (const sensor of apiSensorData) {
      const equipId = sensor.equipment_id;
      if (!equipId) continue;
      if (!sensorsByEquipment[equipId]) sensorsByEquipment[equipId] = [];
      sensorsByEquipment[equipId].push(sensor);
    }

    // 5. Space ambient sensors (weighted temp/humidity)
    const { data: spaceDevicesData } = await supabase
      .from("a_devices")
      .select("device_id, ha_device_id, space_id, weight")
      .eq("site_id", siteId)
      .in("space_id", spaceIds.length > 0 ? spaceIds : ["__none__"]);

    const spaceHaDeviceIds = (spaceDevicesData || [])
      .map((d: any) => d.ha_device_id)
      .filter(Boolean);

    const { data: spaceEntitiesData } = await supabase
      .from("b_entity_sync")
      .select("ha_device_id, device_class, last_state, unit_of_measurement, last_seen_at")
      .eq("site_id", siteId)
      .in("ha_device_id", spaceHaDeviceIds.length > 0 ? spaceHaDeviceIds : ["__none__"])
      .in("device_class", ["temperature", "humidity"]);

    const deviceReadingsBySpace: Record<string, SpaceDevice[]> = {};
    if (spaceDevicesData && spaceEntitiesData) {
      for (const device of spaceDevicesData as any[]) {
        const spId = device.space_id;
        if (!spId) continue;
        const entities = (spaceEntitiesData as any[]).filter(
          (e) => e.ha_device_id === device.ha_device_id
        );
        for (const entity of entities) {
          if (!deviceReadingsBySpace[spId]) deviceReadingsBySpace[spId] = [];
          deviceReadingsBySpace[spId].push({
            device_id: device.device_id,
            ha_device_id: device.ha_device_id,
            weight: device.weight || 3,
            device_class: entity.device_class,
            last_state: entity.last_state,
            unit_of_measurement: entity.unit_of_measurement,
            last_seen_at: entity.last_seen_at,
          });
        }
      }
    }

    // 6. Thermostat devices (device_role = 'thermostat')
    const { data: thermostatDevices } = await supabase
      .from("a_devices")
      .select(
        "device_id, device_name, ha_device_id, space_id, equipment_id, smart_start_enabled, smart_start_reset_at, label"
      )
      .eq("site_id", siteId)
      .eq("device_role", "thermostat");

    // 7. Index thermostat state (already fetched from API in step 4)
    const stateByHaDevice: Record<string, ThermostatState> = {};
    const stateByEquipment: Record<string, ThermostatState> = {};
    for (const ts of apiThermostatStates) {
      stateByHaDevice[ts.ha_device_id] = ts;
      if (ts.equipment_id) {
        stateByEquipment[ts.equipment_id] = ts;
      }
    }

    // Map thermostats to spaces (via direct space_id OR via equipment → served spaces)
    const thermostatsBySpace: Record<string, (ThermostatDevice & { state: ThermostatState | null })[]> = {};
    // Build reverse map: equipment_id → [space_ids it serves]
    const spacesByEquipment: Record<string, string[]> = {};
    if (servedData) {
      for (const row of servedData) {
        if (!spacesByEquipment[row.equipment_id]) spacesByEquipment[row.equipment_id] = [];
        spacesByEquipment[row.equipment_id].push(row.space_id);
      }
    }
    if (thermostatDevices) {
      for (const tdev of thermostatDevices as ThermostatDevice[]) {
        // Match state: try ha_device_id first, then equipment_id
        const state = stateByHaDevice[tdev.ha_device_id]
          || (tdev.equipment_id ? stateByEquipment[tdev.equipment_id] : null)
          || null;
        const tstatEntry = { ...tdev, state };
        const targetSpaces = new Set<string>();

        // Direct space assignment
        if (tdev.space_id) targetSpaces.add(tdev.space_id);

        // Via equipment → served spaces
        if (tdev.equipment_id && spacesByEquipment[tdev.equipment_id]) {
          for (const spId of spacesByEquipment[tdev.equipment_id]) {
            targetSpaces.add(spId);
          }
        }

        for (const spId of targetSpaces) {
          if (!thermostatsBySpace[spId]) thermostatsBySpace[spId] = [];
          thermostatsBySpace[spId].push(tstatEntry);
        }
      }
    }

    // Also propagate state to spaces via equipment when no thermostat device is directly mapped
    // (covers cases where a_devices has no thermostat device but b_thermostat_state has data)
    for (const ts of apiThermostatStates) {
      if (!ts.equipment_id) continue;
      const servedSpaces = spacesByEquipment[ts.equipment_id] || [];
      for (const spId of servedSpaces) {
        if (!thermostatsBySpace[spId] || thermostatsBySpace[spId].length === 0) {
          // Create a synthetic thermostat entry for this space
          thermostatsBySpace[spId] = [{
            device_id: ts.ha_device_id,
            device_name: "Thermostat",
            ha_device_id: ts.ha_device_id,
            space_id: spId,
            equipment_id: ts.equipment_id,
            smart_start_enabled: false,
            smart_start_reset_at: null,
            label: null,
            state: ts,
          }];
        }
      }
    }

    // 8. Build rows
    const rows: SpaceRow[] = spaces.map((space) => {
      const equipIds = equipmentsBySpace[space.space_id] || [];
      const hvac_equips = hvacEquipments.filter((h) => equipIds.includes(h.equipment_id));

      const hvac_sensors_by_equipment: Record<string, HVACSensorData> = {};
      for (const equip of hvac_equips) {
        const sensors = sensorsByEquipment[equip.equipment_id] || [];
        hvac_sensors_by_equipment[equip.equipment_id] = classifySensors(sensors);
      }

      const spaceDevices = deviceReadingsBySpace[space.space_id] || [];
      const tempResult = calculateWeightedAverage(spaceDevices, "temperature");
      const humidityResult = calculateWeightedAverage(spaceDevices, "humidity");

      // Fallback: if no space sensors, use thermostat's built-in readings
      const spaceTstats = thermostatsBySpace[space.space_id] || [];
      let finalTemp = tempResult.value;
      let finalTempTs = tempResult.ts;
      let finalHumidity = humidityResult.value;
      let finalHumidityTs = humidityResult.ts;

      if (finalTemp === null && spaceTstats.length > 0) {
        const firstState = spaceTstats.find((t) => t.state?.current_temperature_f != null)?.state;
        if (firstState) {
          finalTemp = Math.round(firstState.current_temperature_f!);
          finalTempTs = firstState.last_synced_at;
        }
      }
      if (finalHumidity === null && spaceTstats.length > 0) {
        const firstState = spaceTstats.find((t) => t.state?.current_humidity != null)?.state;
        if (firstState) {
          finalHumidity = Math.round(firstState.current_humidity!);
          finalHumidityTs = firstState.last_synced_at;
        }
      }

      // Determine temperature source
      let tempSource = "—";
      if (tempResult.value !== null) {
        tempSource = "Zone Avg";
      } else if (finalTemp !== null && spaceTstats.length > 0) {
        const tstatName = spaceTstats[0]?.state?.thermostat_name || spaceTstats[0]?.device_name || "Thermostat";
        tempSource = tstatName;
      }

      return {
        space,
        hvac_equipments: hvac_equips,
        hvac_sensors_by_equipment,
        thermostats: spaceTstats,
        weighted_temp: finalTemp,
        weighted_temp_ts: finalTempTs,
        weighted_humidity: finalHumidity,
        weighted_humidity_ts: finalHumidityTs,
        temp_source: tempSource,
      };
    });

    // Sort: spaces with thermostats or HVAC first, then alphabetical
    rows.sort((a, b) => {
      const aHas = a.hvac_equipments.length > 0 || a.thermostats.length > 0 ? 1 : 0;
      const bHas = b.hvac_equipments.length > 0 || b.thermostats.length > 0 ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      return a.space.name.localeCompare(b.space.name);
    });

    setSpaceRows(rows);
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

  // ─── Smart Start handlers ────────────────────────────────────────────────

  // Helper to log Smart Start actions to the activity log
  const logSmartStartAction = async (deviceId: string, deviceName: string, action: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toISOString().slice(0, 10);
      await fetch("/api/activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          date: today,
          message: action,
          created_by: user?.email || "system",
          event_type: "smart_start",
          source: "space_hvac",
          device_id: deviceId,
        }),
      });
    } catch (err) {
      console.error("[SmartStart] log error:", err);
    }
  };

  const handleSmartStartToggle = async (deviceId: string, newValue: boolean) => {
    const { error } = await supabase
      .from("a_devices")
      .update({ smart_start_enabled: newValue })
      .eq("device_id", deviceId);

    if (error) {
      console.error("Error toggling smart start:", error);
      return;
    }

    // Find device name for the log message
    const tstat = spaceRows.flatMap((r) => r.thermostats).find((t) => t.device_id === deviceId);
    const name = tstat?.device_name || "Thermostat";
    logSmartStartAction(deviceId, name, `Smart Start ${newValue ? "enabled" : "disabled"} on ${name}`);

    // Optimistic update
    setSpaceRows((prev) =>
      prev.map((row) => ({
        ...row,
        thermostats: row.thermostats.map((t) =>
          t.device_id === deviceId ? { ...t, smart_start_enabled: newValue } : t
        ),
      }))
    );
  };

  const handleSmartStartReset = async (deviceId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("a_devices")
      .update({ smart_start_reset_at: now })
      .eq("device_id", deviceId);

    if (error) {
      console.error("Error resetting smart start:", error);
      return;
    }

    const tstat = spaceRows.flatMap((r) => r.thermostats).find((t) => t.device_id === deviceId);
    const name = tstat?.device_name || "Thermostat";
    logSmartStartAction(deviceId, name, `Smart Start algorithm reset on ${name}`);

    setSpaceRows((prev) =>
      prev.map((row) => ({
        ...row,
        thermostats: row.thermostats.map((t) =>
          t.device_id === deviceId ? { ...t, smart_start_reset_at: now } : t
        ),
      }))
    );
  };

  // ─── Flatten for table rendering ─────────────────────────────────────────

  type FlatRow = {
    space: Space;
    hvac: HVACEquipment | null;
    hvac_sensors: HVACSensorData | null;
    thermostat: (ThermostatDevice & { state: ThermostatState | null }) | null;
    weighted_temp: number | null;
    weighted_temp_ts: string | null;
    weighted_humidity: number | null;
    weighted_humidity_ts: string | null;
    feelsLikeIndoor: number | null;
    temp_source: string;
    isFirstForSpace: boolean;
    rowSpan: number;
  };

  const flattenedRows: FlatRow[] = [];

  for (const row of spaceRows) {
    // Determine row items: merge HVAC equipment + thermostats per space
    const items: { hvac: HVACEquipment | null; thermostat: (ThermostatDevice & { state: ThermostatState | null }) | null }[] = [];

    if (row.hvac_equipments.length === 0 && row.thermostats.length === 0) {
      items.push({ hvac: null, thermostat: null });
    } else if (row.thermostats.length > 0) {
      // Primary: one row per thermostat (they're the control point)
      for (const tstat of row.thermostats) {
        const linkedHvac = tstat.equipment_id
          ? row.hvac_equipments.find((h) => h.equipment_id === tstat.equipment_id) || null
          : row.hvac_equipments[0] || null;
        items.push({ hvac: linkedHvac, thermostat: tstat });
      }
      // Any HVAC equipment without a thermostat
      const tstatEquipIds = new Set(row.thermostats.map((t) => t.equipment_id).filter(Boolean));
      for (const hvac of row.hvac_equipments) {
        if (!tstatEquipIds.has(hvac.equipment_id)) {
          items.push({ hvac, thermostat: null });
        }
      }
    } else {
      // HVAC equipment only, no thermostats
      for (const hvac of row.hvac_equipments) {
        items.push({ hvac, thermostat: null });
      }
    }

    const feelsLike = computeFeelsLikeIndoor(row.weighted_temp, row.weighted_humidity);

    items.forEach((item, idx) => {
      flattenedRows.push({
        space: row.space,
        hvac: item.hvac,
        hvac_sensors: item.hvac ? row.hvac_sensors_by_equipment[item.hvac.equipment_id] || null : null,
        thermostat: item.thermostat,
        weighted_temp: row.weighted_temp,
        weighted_temp_ts: row.weighted_temp_ts,
        weighted_humidity: row.weighted_humidity,
        weighted_humidity_ts: row.weighted_humidity_ts,
        feelsLikeIndoor: feelsLike,
        temp_source: row.temp_source,
        isFirstForSpace: idx === 0,
        rowSpan: items.length,
      });
    });
  }

  // ─── Countdown display ───────────────────────────────────────────────────

  const countdownMins = Math.floor(countdown / 60);
  const countdownSecs = countdown % 60;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
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
        <button
          onClick={() => fetchData()}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
        >
          ↻ Refresh Now
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1400px]">
          <thead>
            <tr className="text-left border-b border-gray-200">
              {/* GROUP 1 — MEASUREMENT */}
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Space</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Source</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Temp</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Humidity</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">Feels Like</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs">Indoor feels-like (only differs from temp above 80°F)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Occupancy</th>
              {/* GROUP 2 — DECISION */}
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">Profile Setpoint</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs font-medium">What the profile dictates for current phase</p>
                      <p className="text-xs opacity-75">Based on store hours + assigned profile</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">Active Setpoint</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs font-medium">What the thermostat is actually set to</p>
                      <p className="text-xs opacity-75">Green = matches profile, Amber = differs</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700" style={{ minWidth: "220px" }}>
                <span className="text-amber-700">Eagle Eye Directive</span>
              </th>
              {/* GROUP 3 — EQUIPMENT STATE */}
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">HVAC Equipment</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Mode</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Power</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Supply</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Return</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">ΔT</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs font-medium">Delta T (Return − Supply)</p>
                      <p className="text-xs opacity-75">Heat transfer across the coil</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Fan</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Comp</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dashed border-gray-400">Smart Start</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                      <p className="text-xs font-medium">Predictive pre-conditioning</p>
                      <p className="text-xs opacity-75">Learns optimal start time to hit setpoint at open</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={19} className="py-8 text-gray-500 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading spaces...
                  </div>
                </td>
              </tr>
            ) : flattenedRows.length === 0 ? (
              <tr>
                <td colSpan={19} className="py-8 text-gray-500 text-center">
                  No spaces found
                </td>
              </tr>
            ) : (
              flattenedRows.map((row, idx) => {
                const rowKey = `${row.space.space_id}-${row.hvac?.equipment_id || "nh"}-${row.thermostat?.device_id || "nt"}-${idx}`;
                const tState = row.thermostat?.state;

                // Feels like: always compute client-side (DB value may use stale formula)
                const feelsLike = row.feelsLikeIndoor;

                // Profile setpoint for current phase
                const ps = tState?.profile_setpoints;
                const phase = tState?.current_phase || "unoccupied";
                const profileHeat = phase === "occupied" ? ps?.occupied_heat_f : ps?.unoccupied_heat_f;
                const profileCool = phase === "occupied" ? ps?.occupied_cool_f : ps?.unoccupied_cool_f;
                const profileMode = phase === "occupied" ? ps?.occupied_hvac_mode : ps?.unoccupied_hvac_mode;

                // Active setpoint (what's actually on the thermostat)
                const activeHeat = tState?.target_temp_low_f ?? tState?.current_setpoint_f;
                const activeCool = tState?.target_temp_high_f ?? tState?.current_setpoint_f;
                const activeIsSingle = tState?.current_setpoint_f != null && tState?.target_temp_high_f == null;

                // Color coding: does active match profile?
                const activeMatchesProfile = ps != null && (
                  activeIsSingle
                    ? (tState?.current_setpoint_f === profileHeat || tState?.current_setpoint_f === profileCool)
                    : (activeHeat === profileHeat && activeCool === profileCool)
                );

                return (
                  <tr key={rowKey} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    {/* Space name */}
                    {row.isFirstForSpace && (
                      <td className="py-3 px-3 whitespace-nowrap align-top" rowSpan={row.rowSpan}>
                        <Link
                          href={`/sites/${siteId}/spaces/${row.space.space_id}`}
                          className="underline font-medium"
                          style={{ color: "#12723A" }}
                        >
                          {row.space.name}
                        </Link>
                        <div className="text-xs text-gray-500">{row.space.space_type}</div>
                      </td>
                    )}

                    {/* Source */}
                    {row.isFirstForSpace && (
                      <td className="py-3 px-3 whitespace-nowrap align-top" rowSpan={row.rowSpan}>
                        {row.temp_source && row.temp_source !== "—" ? (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            row.temp_source === "Zone Avg"
                              ? "bg-blue-50 text-blue-700"
                              : row.temp_source.includes("Sensor")
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {row.temp_source}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}

                    {/* Temp */}
                    {row.isFirstForSpace && (
                      <td className="py-3 px-3 whitespace-nowrap align-top" rowSpan={row.rowSpan}>
                        {row.weighted_temp !== null ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help font-medium" style={{ color: "#12723A" }}>
                                  {row.weighted_temp}°F
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                                <p className="font-semibold text-sm">Weighted Average</p>
                                <p className="text-xs opacity-90">
                                  {row.weighted_temp_ts ? formatTimeAgo(row.weighted_temp_ts) : "No data"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}

                    {/* Humidity */}
                    {row.isFirstForSpace && (
                      <td className="py-3 px-3 whitespace-nowrap align-top" rowSpan={row.rowSpan}>
                        {row.weighted_humidity !== null ? (
                          <span className="font-medium" style={{ color: "#80B52C" }}>
                            {row.weighted_humidity}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}

                    {/* Feels Like Indoor */}
                    {row.isFirstForSpace && (
                      <td className="py-3 px-3 whitespace-nowrap align-top" rowSpan={row.rowSpan}>
                        {feelsLike !== null ? (
                          <span
                            className="font-medium"
                            style={{
                              color:
                                feelsLike !== null && row.weighted_temp !== null && Math.abs(feelsLike - row.weighted_temp) >= 2
                                  ? "#dc2626"
                                  : "#6b7280",
                            }}
                          >
                            {feelsLike}°F
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}

                    {/* Occupancy */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {(() => {
                        const status = tState?.zone_occupancy_status;
                        if (!status || status === "unknown") {
                          return <span className="text-xs text-gray-400">N/A</span>;
                        }
                        if (status === "occupied") {
                          return (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              Occupied
                            </span>
                          );
                        }
                        return (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 cursor-help">
                                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                                  Unoccupied
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                                <p className="text-xs">Last motion: {tState?.zone_last_motion_at ? formatTimeAgo(tState.zone_last_motion_at) : "Unknown"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </td>

                    {/* Profile Setpoint */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {ps ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs font-medium text-gray-700 cursor-help">
                                {profileMode === "heat"
                                  ? `${profileHeat}°F`
                                  : profileMode === "cool"
                                  ? `${profileCool}°F`
                                  : `${profileHeat}°–${profileCool}°F`}
                                <span className="text-gray-400 ml-1">({phase === "occupied" ? "occ" : "unocc"})</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                              <p className="text-xs font-medium">{ps.profile_name || ps.source}</p>
                              <p className="text-xs opacity-75">
                                {phase === "occupied" ? "Occupied" : "Unoccupied"}: {profileHeat}°–{profileCool}°F ({friendlyMode(profileMode || null)})
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>

                    {/* Active Setpoint (with color coding) */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {tState?.current_setpoint_f != null ? (
                        <span className={`font-medium ${ps ? (activeMatchesProfile ? "text-emerald-700" : "text-amber-600") : ""}`}>
                          {tState.current_setpoint_f}°F
                        </span>
                      ) : tState?.target_temp_high_f != null && tState?.target_temp_low_f != null ? (
                        <span className={`font-medium text-xs ${ps ? (activeMatchesProfile ? "text-emerald-700" : "text-amber-600") : ""}`}>
                          {tState.target_temp_low_f}°–{tState.target_temp_high_f}°F
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Eagle Eye Directive */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <DirectiveBadge directive={tState?.eagle_eye_directive ?? null} />
                    </td>

                    {/* HVAC Equipment */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac ? (
                        <Link
                          href={`/sites/${siteId}/equipment/${row.hvac.equipment_id}/individual-equipment`}
                          className="underline text-blue-700"
                        >
                          {row.hvac.equipment_name}
                        </Link>
                      ) : (
                        <span className="text-gray-400 italic">No HVAC</span>
                      )}
                    </td>

                    {/* HVAC Mode — friendly labels */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {tState?.hvac_mode ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            tState.hvac_mode === "cool"
                              ? "bg-blue-50 text-blue-700"
                              : tState.hvac_mode === "heat"
                              ? "bg-orange-50 text-orange-700"
                              : tState.hvac_mode === "heat_cool" || tState.hvac_mode === "auto"
                              ? "bg-purple-50 text-purple-700"
                              : tState.hvac_mode === "off"
                              ? "bg-gray-100 text-gray-500"
                              : "bg-gray-50 text-gray-600"
                          }`}
                        >
                          {friendlyMode(tState.hvac_mode)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Power */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.power ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{formatSensorValue(row.hvac_sensors.power)}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                              <p className="text-xs">{formatTimeAgo(row.hvac_sensors.power.last_seen_at)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Supply */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.supply_temp ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{formatSensorValue(row.hvac_sensors.supply_temp)}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                              <p className="text-xs">{formatTimeAgo(row.hvac_sensors.supply_temp.last_seen_at)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Return */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.return_temp ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{formatSensorValue(row.hvac_sensors.return_temp)}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                              <p className="text-xs">{formatTimeAgo(row.hvac_sensors.return_temp.last_seen_at)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Delta T */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {(() => {
                        // Use mapped delta_t sensor if available
                        if (row.hvac_sensors?.delta_t?.last_state != null) {
                          const dt = parseFloat(row.hvac_sensors.delta_t.last_state);
                          if (!isNaN(dt)) {
                            const color = dt < 0 ? "text-blue-600" : dt > 15 ? "text-green-600" : dt >= 10 ? "text-gray-700" : "text-amber-600";
                            return <span className={`font-medium ${color}`}>{dt.toFixed(1)}°F</span>;
                          }
                        }
                        // Calculate from return - supply
                        const supplyVal = row.hvac_sensors?.supply_temp?.last_state != null ? parseFloat(row.hvac_sensors.supply_temp.last_state) : NaN;
                        const returnVal = row.hvac_sensors?.return_temp?.last_state != null ? parseFloat(row.hvac_sensors.return_temp.last_state) : NaN;
                        if (!isNaN(supplyVal) && !isNaN(returnVal)) {
                          const dt = returnVal - supplyVal;
                          const color = dt < 0 ? "text-blue-600" : dt > 15 ? "text-green-600" : dt >= 10 ? "text-gray-700" : "text-amber-600";
                          return (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`font-medium cursor-help ${color}`}>{dt.toFixed(1)}°F</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                                  <p className="text-xs">Return {returnVal}°F − Supply {supplyVal}°F</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        return <span className="text-gray-400">—</span>;
                      })()}
                    </td>

                    {/* Fan — friendly labels */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.fan_status ? (
                        <span className="cursor-help">{formatSensorValue(row.hvac_sensors.fan_status)}</span>
                      ) : tState?.fan_mode ? (
                        <span className="text-xs text-gray-600">{friendlyFan(tState.fan_mode)}</span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Compressor */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {(() => {
                        const compSensor = row.hvac_sensors?.compressor_status;
                        if (compSensor?.last_state != null) {
                          const amps = parseFloat(compSensor.last_state);
                          const isOn = !isNaN(amps) && amps > 0.5;
                          return (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`text-xs px-1.5 py-0.5 rounded cursor-help font-medium ${
                                    isOn ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
                                  }`}>
                                    {isOn ? "On" : "Off"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                                  <p className="text-xs">{compSensor.last_state} {compSensor.unit_of_measurement || "A"}</p>
                                  <p className="text-xs opacity-75">{formatTimeAgo(compSensor.last_seen_at)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        if (tState?.hvac_action) {
                          return (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              tState.hvac_action === "heating"
                                ? "bg-orange-50 text-orange-600"
                                : tState.hvac_action === "cooling"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-gray-50 text-gray-500"
                            }`}>
                              {tState.hvac_action}
                            </span>
                          );
                        }
                        return "—";
                      })()}
                    </td>

                    {/* Smart Start */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.thermostat ? (
                        <SmartStartCell
                          enabled={row.thermostat.smart_start_enabled}
                          deviceId={row.thermostat.device_id}
                          resetAt={row.thermostat.smart_start_reset_at}
                          onToggle={handleSmartStartToggle}
                          onReset={handleSmartStartReset}
                        />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {tState?.last_synced_at ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`text-xs px-2 py-0.5 rounded cursor-help ${
                                  Date.now() - new Date(tState.last_synced_at).getTime() < 10 * 60 * 1000
                                    ? "bg-green-100 text-green-800"
                                    : Date.now() - new Date(tState.last_synced_at).getTime() < 30 * 60 * 1000
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {Date.now() - new Date(tState.last_synced_at).getTime() < 10 * 60 * 1000
                                  ? "live"
                                  : Date.now() - new Date(tState.last_synced_at).getTime() < 30 * 60 * 1000
                                  ? "stale"
                                  : "offline"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                              <p className="text-xs">Synced {formatTimeAgo(tState.last_synced_at)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : row.hvac ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            row.hvac.status === "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {row.hvac.status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Outdoor conditions bar */}
      {spaceRows.some((r) => r.thermostats.some((t) => t.state?.outdoor_temp_f)) && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Site Conditions:</span>
          {(() => {
            const firstOutdoor = spaceRows
              .flatMap((r) => r.thermostats)
              .find((t) => t.state?.outdoor_temp_f);
            if (!firstOutdoor?.state) return null;
            return (
              <>
                <span>
                  Outdoor: <strong className="text-gray-700">{firstOutdoor.state.outdoor_temp_f}°F</strong>
                </span>
                {firstOutdoor.state.feels_like_outdoor_f && (
                  <span>
                    Feels like: <strong className="text-gray-700">{firstOutdoor.state.feels_like_outdoor_f}°F</strong>
                  </span>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
