"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

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
  fan_status: HVACSensor | null;
  compressor_status: HVACSensor | null;
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
  weighted_temp: number | null;
  weighted_temp_ts: string | null;
  weighted_humidity: number | null;
  weighted_humidity_ts: string | null;
}

interface Props {
  siteId: string;
}

export default function SpaceHvacTable({ siteId }: Props) {
  const [spaceRows, setSpaceRows] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch all spaces for this site (excluding "Unassigned")
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

      // 2. Fetch all HVAC equipment for this site
      const { data: hvacData, error: hvacError } = await supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, equipment_type_id, status")
        .eq("site_id", siteId)
        .eq("equipment_group", "HVAC");

      if (hvacError) {
        console.error("Error fetching HVAC equipment:", hvacError);
      }

      const hvacEquipments = (hvacData || []) as HVACEquipment[];
      const hvacIds = hvacEquipments.map((h) => h.equipment_id);

      // 3. Fetch served spaces relationships
      const { data: servedData, error: servedError } = await supabase
        .from("a_equipment_served_spaces")
        .select("equipment_id, space_id")
        .in("equipment_id", hvacIds.length > 0 ? hvacIds : ["__none__"]);

      if (servedError) {
        console.error("Error fetching served spaces:", servedError);
      }

      // Build map: space_id -> equipment_ids
      const equipmentsBySpace: Record<string, string[]> = {};
      if (servedData) {
        for (const row of servedData) {
          if (!equipmentsBySpace[row.space_id]) {
            equipmentsBySpace[row.space_id] = [];
          }
          equipmentsBySpace[row.space_id].push(row.equipment_id);
        }
      }

      // 4. Fetch HVAC sensors from view_entity_sync
      const { data: sensorData, error: sensorError } = await supabase
        .from("view_entity_sync")
        .select("equipment_id, entity_id, device_class, last_state, unit_of_measurement, last_seen_at, sensor_role")
        .eq("site_id", siteId)
        .in("equipment_id", hvacIds.length > 0 ? hvacIds : ["__none__"]);

      if (sensorError) {
        console.error("Error fetching sensors:", sensorError);
      }

      // Build sensor map by equipment_id
      const sensorsByEquipment: Record<string, HVACSensor[]> = {};
      if (sensorData) {
        for (const sensor of sensorData as any[]) {
          const equipId = sensor.equipment_id;
          if (!equipId) continue;
          if (!sensorsByEquipment[equipId]) {
            sensorsByEquipment[equipId] = [];
          }
          sensorsByEquipment[equipId].push(sensor);
        }
      }

      // 5. Fetch space ambient sensors from a_devices + b_entity_sync
      const spaceIds = spaces.map((s) => s.space_id);
      const { data: spaceDevicesData, error: spaceDevicesError } = await supabase
        .from("a_devices")
        .select("device_id, ha_device_id, space_id, weight")
        .eq("site_id", siteId)
        .in("space_id", spaceIds.length > 0 ? spaceIds : ["__none__"]);

      if (spaceDevicesError) {
        console.error("Error fetching space devices:", spaceDevicesError);
      }

      // Get entity data for space devices
      const spaceHaDeviceIds = (spaceDevicesData || []).map((d: any) => d.ha_device_id).filter(Boolean);
      const { data: spaceEntitiesData, error: spaceEntitiesError } = await supabase
        .from("b_entity_sync")
        .select("ha_device_id, device_class, last_state, unit_of_measurement, last_seen_at")
        .eq("site_id", siteId)
        .in("ha_device_id", spaceHaDeviceIds.length > 0 ? spaceHaDeviceIds : ["__none__"])
        .in("device_class", ["temperature", "humidity"]);

      if (spaceEntitiesError) {
        console.error("Error fetching space entities:", spaceEntitiesError);
      }

      // Build map: space_id -> devices with readings
      const deviceReadingsBySpace: Record<string, SpaceDevice[]> = {};
      if (spaceDevicesData && spaceEntitiesData) {
        for (const device of spaceDevicesData as any[]) {
          const spaceId = device.space_id;
          if (!spaceId) continue;

          // Find entities for this device
          const entities = (spaceEntitiesData as any[]).filter(
            (e) => e.ha_device_id === device.ha_device_id
          );

          for (const entity of entities) {
            if (!deviceReadingsBySpace[spaceId]) {
              deviceReadingsBySpace[spaceId] = [];
            }
            deviceReadingsBySpace[spaceId].push({
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

      // Helper: classify sensors for HVAC equipment
      const classifySensors = (sensors: HVACSensor[]): HVACSensorData => {
        const data: HVACSensorData = {
          power: null,
          supply_temp: null,
          return_temp: null,
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
            case "fan":
            case "fan_status":
              data.fan_status = sensor;
              break;
            case "compressor":
            case "compressor_status":
            case "compressor_state":
              data.compressor_status = sensor;
              break;
          }
        }

        return data;
      };

      // Helper: calculate weighted average
      const calculateWeightedAverage = (
        devices: SpaceDevice[],
        deviceClass: string
      ): { value: number | null; ts: string | null } => {
        const readings = devices.filter(
          (d) =>
            d.device_class === deviceClass &&
            d.last_state !== null &&
            !isNaN(parseFloat(d.last_state))
        );

        if (readings.length === 0) {
          return { value: null, ts: null };
        }

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
      };

      // 6. Build space rows
      const rows: SpaceRow[] = spaces.map((space) => {
        // Get HVAC equipment for this space
        const equipIds = equipmentsBySpace[space.space_id] || [];
        const hvac_equipments = hvacEquipments.filter((h) =>
          equipIds.includes(h.equipment_id)
        );

        // Get sensors for each HVAC equipment
        const hvac_sensors_by_equipment: Record<string, HVACSensorData> = {};
        for (const equip of hvac_equipments) {
          const sensors = sensorsByEquipment[equip.equipment_id] || [];
          hvac_sensors_by_equipment[equip.equipment_id] = classifySensors(sensors);
        }

        // Calculate weighted temp/humidity for space
        const spaceDevices = deviceReadingsBySpace[space.space_id] || [];
        const tempResult = calculateWeightedAverage(spaceDevices, "temperature");
        const humidityResult = calculateWeightedAverage(spaceDevices, "humidity");

        return {
          space,
          hvac_equipments,
          hvac_sensors_by_equipment,
          weighted_temp: tempResult.value,
          weighted_temp_ts: tempResult.ts,
          weighted_humidity: humidityResult.value,
          weighted_humidity_ts: humidityResult.ts,
        };
      });

      // Sort: Spaces with HVAC first (alphabetically), then spaces without HVAC (alphabetically)
      rows.sort((a, b) => {
        const aHasHvac = a.hvac_equipments.length > 0 ? 1 : 0;
        const bHasHvac = b.hvac_equipments.length > 0 ? 1 : 0;
        
        // First sort by whether they have HVAC (with HVAC first)
        if (bHasHvac !== aHasHvac) {
          return bHasHvac - aHasHvac;
        }
        
        // Then sort alphabetically by space name
        return a.space.name.localeCompare(b.space.name);
      });

      setSpaceRows(rows);
      setLoading(false);
    };

    fetchData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [siteId]);

  const formatSensorValue = (sensor: HVACSensor | null) => {
    if (!sensor || sensor.last_state === null) return "—";
    const value = sensor.last_state;
    const unit = sensor.unit_of_measurement || "";
    return `${value}${unit ? " " + unit : ""}`;
  };

  // Flatten rows: one row per space-HVAC combination (or just space if no HVAC)
  const flattenedRows: {
    space: Space;
    hvac: HVACEquipment | null;
    hvac_sensors: HVACSensorData | null;
    weighted_temp: number | null;
    weighted_temp_ts: string | null;
    weighted_humidity: number | null;
    weighted_humidity_ts: string | null;
    isFirstForSpace: boolean;
    rowSpan: number;
  }[] = [];

  for (const row of spaceRows) {
    if (row.hvac_equipments.length === 0) {
      // Space with no HVAC
      flattenedRows.push({
        space: row.space,
        hvac: null,
        hvac_sensors: null,
        weighted_temp: row.weighted_temp,
        weighted_temp_ts: row.weighted_temp_ts,
        weighted_humidity: row.weighted_humidity,
        weighted_humidity_ts: row.weighted_humidity_ts,
        isFirstForSpace: true,
        rowSpan: 1,
      });
    } else {
      // Space with one or more HVAC units
      row.hvac_equipments.forEach((hvac, idx) => {
        flattenedRows.push({
          space: row.space,
          hvac,
          hvac_sensors: row.hvac_sensors_by_equipment[hvac.equipment_id] || null,
          weighted_temp: row.weighted_temp,
          weighted_temp_ts: row.weighted_temp_ts,
          weighted_humidity: row.weighted_humidity,
          weighted_humidity_ts: row.weighted_humidity_ts,
          isFirstForSpace: idx === 0,
          rowSpan: row.hvac_equipments.length,
        });
      });
    }
  }

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      <h2 className="text-xl font-semibold mb-4">Space & HVAC</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead>
            <tr className="text-left border-b">
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Space</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Temp</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Humidity</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">HVAC Equipment</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Type</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Power</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Supply</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Return</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Fan</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Comp</th>
              <th className="py-3 px-3 font-semibold whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="py-4 px-4 text-gray-500 text-center">
                  Loading...
                </td>
              </tr>
            ) : flattenedRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-4 px-4 text-gray-500 text-center">
                  No spaces found
                </td>
              </tr>
            ) : (
              flattenedRows.map((row, idx) => {
                const rowKey = `${row.space.space_id}-${row.hvac?.equipment_id || "no-hvac"}-${idx}`;

                return (
                  <tr key={rowKey} className="border-b hover:bg-gray-50">
                    {/* Space - only show on first row for this space */}
                    {row.isFirstForSpace && (
                      <td
                        className="py-3 px-3 whitespace-nowrap align-top"
                        rowSpan={row.rowSpan}
                      >
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

                    {/* Temp - only show on first row for this space */}
                    {row.isFirstForSpace && (
                      <td
                        className="py-3 px-3 whitespace-nowrap align-top"
                        rowSpan={row.rowSpan}
                      >
                        {row.weighted_temp !== null ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help font-medium" style={{ color: "#12723A" }}>
                                  {row.weighted_temp}°F
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl"
                              >
                                <p className="font-semibold text-sm">Weighted Average</p>
                                <p className="text-xs opacity-90">
                                  {row.weighted_temp_ts
                                    ? new Date(row.weighted_temp_ts).toLocaleString()
                                    : "No data"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}

                    {/* Humidity - only show on first row for this space */}
                    {row.isFirstForSpace && (
                      <td
                        className="py-3 px-3 whitespace-nowrap align-top"
                        rowSpan={row.rowSpan}
                      >
                        {row.weighted_humidity !== null ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help font-medium" style={{ color: "#80B52C" }}>
                                  {row.weighted_humidity}%
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl"
                              >
                                <p className="font-semibold text-sm">Weighted Average</p>
                                <p className="text-xs opacity-90">
                                  {row.weighted_humidity_ts
                                    ? new Date(row.weighted_humidity_ts).toLocaleString()
                                    : "No data"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}

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

                    {/* Type */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac?.equipment_type_id ?? "—"}
                    </td>

                    {/* Power */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.power ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {formatSensorValue(row.hvac_sensors.power)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl"
                            >
                              <p className="font-semibold text-sm">Last Updated:</p>
                              <p className="text-xs opacity-90">
                                {row.hvac_sensors.power.last_seen_at
                                  ? new Date(row.hvac_sensors.power.last_seen_at).toLocaleString()
                                  : "No data"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Supply Temp */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.supply_temp ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {formatSensorValue(row.hvac_sensors.supply_temp)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl"
                            >
                              <p className="font-semibold text-sm">Last Updated:</p>
                              <p className="text-xs opacity-90">
                                {row.hvac_sensors.supply_temp.last_seen_at
                                  ? new Date(row.hvac_sensors.supply_temp.last_seen_at).toLocaleString()
                                  : "No data"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Return Temp */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.return_temp ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {formatSensorValue(row.hvac_sensors.return_temp)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl"
                            >
                              <p className="font-semibold text-sm">Last Updated:</p>
                              <p className="text-xs opacity-90">
                                {row.hvac_sensors.return_temp.last_seen_at
                                  ? new Date(row.hvac_sensors.return_temp.last_seen_at).toLocaleString()
                                  : "No data"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Fan Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.fan_status ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {formatSensorValue(row.hvac_sensors.fan_status)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl"
                            >
                              <p className="font-semibold text-sm">Last Updated:</p>
                              <p className="text-xs opacity-90">
                                {row.hvac_sensors.fan_status.last_seen_at
                                  ? new Date(row.hvac_sensors.fan_status.last_seen_at).toLocaleString()
                                  : "No data"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Compressor Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac_sensors?.compressor_status ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {formatSensorValue(row.hvac_sensors.compressor_status)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl"
                            >
                              <p className="font-semibold text-sm">Last Updated:</p>
                              <p className="text-xs opacity-90">
                                {row.hvac_sensors.compressor_status.last_seen_at
                                  ? new Date(
                                      row.hvac_sensors.compressor_status.last_seen_at
                                    ).toLocaleString()
                                  : "No data"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.hvac ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            row.hvac.status === "active"
                              ? "bg-green-100 text-green-800"
                              : row.hvac.status === "inactive"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-yellow-100 text-yellow-800"
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
    </div>
  );
}
