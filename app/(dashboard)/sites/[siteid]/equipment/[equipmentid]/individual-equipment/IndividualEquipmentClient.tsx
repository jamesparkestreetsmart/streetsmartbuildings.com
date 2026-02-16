"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import AddRecordNote from "@/components/AddRecordNote";

/* ---------- Types ---------- */

interface ServedSpace {
  space_id: string;
  name: string;
  space_type: string;
}

interface SensorBinding {
  sensor_id: string;
  sensor_role: string;
  sensor_type: string;
  entity_id: string;
  label: string | null;
  requirement_id: string;
  req_domain: string | null;
  req_device_class: string | null;
  req_unit: string | null;
  req_required: boolean;
  req_description: string | null;
  package: number | null;
  derived: boolean;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface PhaseConfig {
  phase_code: string;
  description: string;
}

interface Alert {
  alert_id: number;
  alert_type: string;
  alert_group: string | null;
  severity: string | null;
  trigger_value: number | null;
  threshold_value: number | null;
  status: string;
  start_time: string | null;
  end_time: string | null;
  duration: string | null;
  metadata: any;
  notification_count: number;
  created_at: string;
  updated_at: string;
}

interface AlertType {
  alert_type_id: string;
  alert_group: string;
  name: string;
  description: string | null;
  severity_default: string;
  detection_method: string;
  default_threshold: number | null;
  threshold_unit: string | null;
  equipment_types: string[] | null;
}

/* ---------- Helpers ---------- */

function formatDateTime(value: string | null, tz: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatRelativeTime(date: string | null) {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const lastSeenColor = (date: string | null) => {
  if (!date) return "text-red-500";
  const hours = (Date.now() - new Date(date).getTime()) / 36e5;
  if (hours >= 24) return "text-red-500";
  if (hours >= 6) return "text-amber-500";
  return "text-emerald-600";
};

const PACKAGE_NAMES: Record<number, string> = {
  1: "Basic Essentials",
  2: "Street Smarts",
  3: "Eagle Eyes Pro",
};

/* ======================================================
 Component
====================================================== */

export default function IndividualEquipmentClient(props: any) {
  const {
    siteid,
    equipment,
    devices = [],
    entitiesByHaDevice = {},
    recordList: initialRecordList = [],
    siteTimezone,
    orgId,
    returnTo,
  } = props;

  const [activeTab, setActiveTab] = useState<"analytics" | "setup">("analytics");
  const [servedSpaces, setServedSpaces] = useState<ServedSpace[]>([]);
  const [installedLocation, setInstalledLocation] = useState<string | null>(null);
  const [sensorBindings, setSensorBindings] = useState<SensorBinding[]>([]);
  const [phaseConfig, setPhaseConfig] = useState<string | null>(null);
  const [phaseConfigurations, setPhaseConfigurations] = useState<PhaseConfig[]>([]);
  const [recordList, setRecordList] = useState(initialRecordList);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertTypes, setAlertTypes] = useState<AlertType[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);

  /* ---------- Fetch on mount ---------- */

  useEffect(() => {
    if (!equipment) return;

    const fetchAll = async () => {
      // Served spaces
      const { data: spacesData } = await supabase
        .from("a_equipment_served_spaces")
        .select("space_id, a_spaces(name, space_type)")
        .eq("equipment_id", equipment.equipment_id);

      setServedSpaces(
        (spacesData || []).map((r: any) => ({
          space_id: r.space_id,
          name: r.a_spaces?.name || "Unknown",
          space_type: r.a_spaces?.space_type || "",
        }))
      );

      // Installed location
      if (equipment.space_id) {
        const { data: spaceData } = await supabase
          .from("a_spaces")
          .select("name")
          .eq("space_id", equipment.space_id)
          .single();
        setInstalledLocation(spaceData?.name || null);
      }

      // Sensor bindings via view
      const { data: sensors } = await supabase
        .from("view_equipment_sensors")
        .select("*")
        .eq("equipment_id", equipment.equipment_id);

      setSensorBindings((sensors || []) as SensorBinding[]);

      // Phase config from device
      const { data: devs } = await supabase
        .from("a_devices")
        .select("phase_configuration")
        .eq("equipment_id", equipment.equipment_id)
        .not("phase_configuration", "is", null)
        .limit(1);

      if (devs && devs.length > 0) {
        setPhaseConfig(devs[0].phase_configuration);
      }

      // Phase configuration options
      const { data: phases } = await supabase
        .from("library_phase_configurations")
        .select("phase_code, description")
        .order("sort_order");

      setPhaseConfigurations((phases || []) as PhaseConfig[]);

      // Active + recent resolved alerts for this equipment
      const { data: alertData } = await supabase
        .from("log_alerts")
        .select("*")
        .eq("equipment_id", equipment.equipment_id)
        .order("created_at", { ascending: false })
        .limit(50);

      setAlerts((alertData || []) as Alert[]);

      // Alert types applicable to this equipment type
      const { data: alertTypeData } = await supabase
        .from("library_alert_types")
        .select("*")
        .or(`equipment_types.cs.{${equipment.equipment_type_id}},equipment_types.is.null`);

      setAlertTypes((alertTypeData || []) as AlertType[]);

      setLoadingLive(false);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [equipment]);

  /* ---------- Guard ---------- */

  if (!equipment) {
    return (
      <div className="p-6 text-red-600">
        <h2 className="text-lg font-semibold mb-2">Equipment data not loaded</h2>
      </div>
    );
  }

  const isHvac = (equipment.equipment_type_id || "").toLowerCase().includes("hvac");

  /* ======================================================
   Analytics Tab
  ====================================================== */

  const renderAnalyticsTab = () => {
    // Separate physical vs derived
    const physical = sensorBindings.filter((s) => !s.derived);
    const derived = sensorBindings.filter((s) => s.derived);

    // Key readings for the status card
    const getValue = (role: string) => {
      const s = sensorBindings.find((b) => b.sensor_role === role);
      if (!s || !s.last_state || s.last_state === "unknown" || s.last_state === "unavailable") return null;
      return { value: s.last_state, unit: s.unit_of_measurement, last_seen: s.last_seen_at };
    };

    const compCurrent = getValue("compressor_current");
    const supplyTemp = getValue("supply_air_temp");
    const returnTemp = getValue("return_air_temp");
    const thermostat = getValue("thermostat_state");
    const voltage = getValue("line_voltage");
    const powerKw = getValue("power_kw");
    const powerFactor = getValue("power_factor");
    const frequency = getValue("frequency");
    const energyKwh = getValue("energy_kwh");
    const reactivePower = getValue("reactive_power");
    const apparentPower = getValue("apparent_power");

    // Compute delta_t
    const deltaT =
      supplyTemp && returnTemp
        ? (parseFloat(returnTemp.value) - parseFloat(supplyTemp.value)).toFixed(1)
        : null;

    // Running state
    const isRunning = compCurrent ? parseFloat(compCurrent.value) > 1.0 : null;

    // Power factor status
    const pfValue = powerFactor ? parseFloat(powerFactor.value) : null;
    const pfStatus = pfValue === null ? "gray" : pfValue >= 0.9 ? "green" : pfValue >= 0.8 ? "amber" : "red";

    // Voltage status (nominal 240V for 1PH3W)
    const vValue = voltage ? parseFloat(voltage.value) : null;
    const vStatus = vValue === null ? "gray" : (vValue >= 228 && vValue <= 252) ? "green" : (vValue >= 216 || vValue <= 264) ? "amber" : "red";

    const statusColor = (s: string) =>
      s === "green" ? "bg-emerald-100 text-emerald-800 border-emerald-300"
        : s === "amber" ? "bg-amber-100 text-amber-800 border-amber-300"
        : s === "red" ? "bg-red-100 text-red-800 border-red-300"
        : "bg-gray-100 text-gray-500 border-gray-300";

    return (
      <div className="space-y-6">
        {/* Live Status */}
        <section className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Live Status</h2>
            {isRunning !== null && (
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  isRunning
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {isRunning ? "● Running" : "○ Idle"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Thermostat Mode */}
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Mode</div>
              <div className="text-xl font-bold capitalize">
                {thermostat?.value || "—"}
              </div>
            </div>

            {/* Compressor Current */}
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Compressor</div>
              <div className="text-xl font-bold">
                {compCurrent ? `${compCurrent.value} A` : "—"}
              </div>
            </div>

            {/* Supply Temp */}
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Supply Air</div>
              <div className="text-xl font-bold">
                {supplyTemp ? `${supplyTemp.value}°F` : "—"}
              </div>
            </div>

            {/* Return Temp */}
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Return Air</div>
              <div className="text-xl font-bold">
                {returnTemp ? `${returnTemp.value}°F` : "—"}
              </div>
            </div>

            {/* Delta T */}
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Delta T</div>
              <div className={`text-xl font-bold ${
                deltaT
                  ? Math.abs(parseFloat(deltaT)) >= 14 && Math.abs(parseFloat(deltaT)) <= 22
                    ? "text-emerald-600"
                    : "text-amber-600"
                  : ""
              }`}>
                {deltaT ? `${deltaT}°F` : "—"}
              </div>
            </div>

            {/* Power */}
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Power</div>
              <div className="text-xl font-bold">
                {powerKw ? `${powerKw.value} kW` : "—"}
              </div>
            </div>

            {/* Energy */}
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Energy Total</div>
              <div className="text-xl font-bold">
                {energyKwh ? `${energyKwh.value} kWh` : "—"}
              </div>
            </div>

            {/* Frequency */}
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Frequency</div>
              <div className="text-xl font-bold">
                {frequency ? `${frequency.value} Hz` : "—"}
              </div>
            </div>
          </div>
        </section>

        {/* Power Quality */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Power Quality</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`rounded-lg border p-3 text-center ${statusColor(vStatus)}`}>
              <div className="text-xs mb-1">Voltage</div>
              <div className="text-lg font-bold">
                {vValue ? `${vValue.toFixed(1)} V` : "—"}
              </div>
              <div className="text-[10px] mt-1">Nominal: 240V ±5%</div>
            </div>

            <div className={`rounded-lg border p-3 text-center ${statusColor(pfStatus)}`}>
              <div className="text-xs mb-1">Power Factor</div>
              <div className="text-lg font-bold">
                {pfValue !== null ? pfValue.toFixed(3) : "—"}
              </div>
              <div className="text-[10px] mt-1">Target: ≥ 0.90</div>
            </div>

            <div className="rounded-lg border p-3 text-center bg-gray-50 border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Reactive Power</div>
              <div className="text-lg font-bold">
                {reactivePower ? `${reactivePower.value} kVAR` : "—"}
              </div>
            </div>

            <div className="rounded-lg border p-3 text-center bg-gray-50 border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Apparent Power</div>
              <div className="text-lg font-bold">
                {apparentPower ? `${apparentPower.value} kVA` : "—"}
              </div>
            </div>
          </div>
        </section>

        {/* Fault Detection */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Fault Detection</h2>
          {(() => {
            const groups = [
              { key: "power_quality", label: "Electrical Signatures" },
              { key: "operational", label: "Thermal / Mechanical Signatures" },
              { key: "threshold", label: "Threshold Alerts" },
              { key: "connectivity", label: "Connectivity" },
              { key: "maintenance", label: "Maintenance" },
            ];

            const activeAlerts = alerts.filter((a) => a.status === 'active');
            const recentResolved = alerts.filter((a) => a.status === 'resolved').slice(0, 10);

            const alertTypeMap = new Map(alertTypes.map((at) => [at.alert_type_id, at]));

            const getAlertStatus = (typeId: string) => {
              const active = activeAlerts.find((a) => a.alert_type === typeId);
              if (active) return { status: "active", alert: active };
              const resolved = recentResolved.find((a) => a.alert_type === typeId);
              if (resolved) return { status: "resolved", alert: resolved };
              return { status: "monitoring", alert: null };
            };

            const severityColor = (severity: string | null) => {
              switch (severity) {
                case "critical": return "bg-red-100 text-red-700 border-red-300";
                case "warning": return "bg-amber-100 text-amber-700 border-amber-300";
                case "info": return "bg-blue-100 text-blue-700 border-blue-300";
                default: return "bg-gray-100 text-gray-500 border-gray-200";
              }
            };

            return (
              <div className="space-y-4">
                {activeAlerts.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
                    <span className="text-sm font-semibold text-red-700">
                      ⚠ {activeAlerts.length} active alert{activeAlerts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {groups.map(({ key, label }) => {
                  const groupTypes = alertTypes.filter((at) => at.alert_group === key);
                  if (groupTypes.length === 0) return null;

                  return (
                    <div key={key}>
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">{label}</h3>
                      <div className="space-y-1.5">
                        {groupTypes.map((at) => {
                          const { status, alert } = getAlertStatus(at.alert_type_id);

                          return (
                            <div
                              key={at.alert_type_id}
                              className={`flex items-center justify-between rounded px-3 py-2 text-sm border ${
                                status === "active"
                                  ? severityColor(alert?.severity || at.severity_default)
                                  : status === "resolved"
                                  ? "bg-emerald-50 border-emerald-200"
                                  : "bg-gray-50 border-gray-200"
                              }`}
                            >
                              <div className="flex-1">
                                <span className="font-medium">{at.name}</span>
                                {status === "active" && alert && (
                                  <span className="text-xs ml-2">
                                    — triggered: {alert.trigger_value}{at.threshold_unit ? ` ${at.threshold_unit}` : ""}
                                    {alert.notification_count > 1 && ` (×${alert.notification_count})`}
                                  </span>
                                )}
                                {status === "resolved" && alert && (
                                  <span className="text-xs text-emerald-600 ml-2">
                                    — resolved {formatRelativeTime(alert.end_time)}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  status === "active"
                                    ? "bg-red-200 text-red-800"
                                    : status === "resolved"
                                    ? "bg-emerald-200 text-emerald-800"
                                    : "bg-gray-200 text-gray-500"
                                }`}
                              >
                                {status === "active" ? "Active" : status === "resolved" ? "Resolved" : "Monitoring"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <p className="text-xs text-gray-400 mt-2">
                  Fault scan runs every 5 minutes. Last scan results update automatically.
                </p>
              </div>
            );
          })()}
        </section>

        {/* Sensor Data Table */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">All Sensor Readings</h2>
          {loadingLive ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : sensorBindings.length === 0 ? (
            <p className="text-sm text-gray-500">
              No sensors mapped.{" "}
              <Link href={`/sites/${siteid}/gateways`} className="text-blue-600 hover:underline">
                Map sensors →
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Role</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Entity</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Value</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {sensorBindings.map((s) => (
                    <tr key={s.sensor_id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{s.sensor_role}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{s.sensor_type}</td>
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono">
                        {s.entity_id?.replace("sensor.", "").replace("binary_sensor.", "").replace("climate.", "")}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {s.last_state && s.last_state !== "unknown"
                          ? `${s.last_state}${s.unit_of_measurement ? " " + s.unit_of_measurement : ""}`
                          : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs ${lastSeenColor(s.last_seen_at)}`}>
                        {formatRelativeTime(s.last_seen_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  };

  /* ======================================================
   Setup Tab
  ====================================================== */

  const renderSetupTab = () => {
    return (
      <div className="space-y-6">
        {/* Equipment Details + Technical Info */}
        <section className="bg-white rounded-xl shadow p-6 grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Equipment Details</h2>
            <p><strong>Group:</strong> {equipment.equipment_group || "—"}</p>
            <p><strong>Type:</strong> {equipment.equipment_type_id || "—"}</p>
            <p><strong>Installed Location:</strong> {installedLocation || "—"}</p>
            {phaseConfig && (
              <p><strong>Phase Configuration:</strong> {phaseConfig}</p>
            )}
            {equipment.description && (
              <p className="text-sm text-gray-700">
                <strong>Description:</strong> {equipment.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Technical Info</h2>
            <p><strong>Manufacturer:</strong> {equipment.manufacturer || "—"}</p>
            <p><strong>Model:</strong> {equipment.model || "—"}</p>
            <p><strong>Serial:</strong> {equipment.serial_number || "—"}</p>
            <p><strong>Voltage:</strong> {equipment.voltage || "—"}</p>
            <p><strong>Amperage:</strong> {equipment.amperage || "—"}</p>
            <p><strong>Status:</strong> {equipment.status}</p>
          </div>
        </section>

        {/* Served Spaces */}
        {isHvac && (
          <section className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Serves Spaces</h2>
              <Link
                href={`/sites/${siteid}/equipment/${equipment.equipment_id}/edit`}
                className="text-sm text-blue-600 hover:underline"
              >
                Edit →
              </Link>
            </div>
            {servedSpaces.length === 0 ? (
              <p className="text-sm text-gray-500">No spaces assigned.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {servedSpaces.map((space) => (
                  <span
                    key={space.space_id}
                    className="inline-flex items-center bg-emerald-100 text-emerald-800 text-sm px-3 py-1 rounded-full"
                  >
                    {space.name}
                    <span className="text-xs text-emerald-600 ml-1">({space.space_type})</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Sensor Mapping Summary */}
        <section className="bg-white rounded-xl shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Sensor Mapping</h2>
            <Link
              href={`/sites/${siteid}/gateways`}
              className="text-sm text-blue-600 hover:underline"
            >
              Edit mapping →
            </Link>
          </div>

          {sensorBindings.length === 0 ? (
            <p className="text-sm text-gray-500">
              No sensors mapped.{" "}
              <Link href={`/sites/${siteid}/gateways`} className="text-blue-600 hover:underline">
                Map sensors →
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Role</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Entity</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Value</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sensorBindings.map((s) => (
                    <tr key={s.sensor_id} className="border-t">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{s.sensor_role}</span>
                        {s.derived && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-600">
                            derived
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono">
                        {s.derived
                          ? "auto"
                          : s.entity_id?.replace("sensor.", "").replace("binary_sensor.", "").replace("climate.", "")}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {s.last_state && s.last_state !== "unknown"
                          ? `${s.last_state}${s.unit_of_measurement ? " " + s.unit_of_measurement : ""}`
                          : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs ${lastSeenColor(s.last_seen_at)}`}>
                        {s.last_seen_at ? "●" : "○"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Devices */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Devices</h2>
          {devices.length === 0 ? (
            <p className="text-sm text-gray-500">No devices linked.</p>
          ) : (
            <div className="space-y-3">
              {devices.map((device: any) => (
                <div key={device.device_id} className="border rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{device.device_name}</p>
                    <p className="text-xs text-gray-500">
                      {device.device_role || device.device_type || "—"} • {device.protocol || "—"}
                    </p>
                  </div>
                  {device.ha_device_id && (
                    <Link
                      href={`/sites/${siteid}/devices/${device.ha_device_id}?returnTo=equipment&equipmentId=${equipment.equipment_id}`}
                      className="text-xs text-green-700 underline"
                    >
                      View device →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Activity Log */}
        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Activity Log</h2>
            <span className="text-xs text-gray-500">Last 15 records</span>
          </div>

          <AddRecordNote
            orgId={orgId}
            siteId={siteid}
            equipmentId={equipment.equipment_id}
          />

          {recordList.length === 0 ? (
            <p className="text-sm text-gray-500">No activity recorded.</p>
          ) : (
            <ul className="space-y-3">
              {recordList.map((r: any) => (
                <li key={r.id} className="border-l-4 border-emerald-500 pl-3">
                  <p className="text-sm font-medium">
                    {r.metadata?.note ?? r.message}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.event_type} • {formatDateTime(r.created_at, siteTimezone)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  };

  /* ======================================================
   Main Render
  ====================================================== */

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-600 via-green-500 to-yellow-400 text-white p-6 shadow">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{equipment.equipment_name}</h1>
            <div className="flex items-center gap-2 text-sm opacity-90">
              <span>{equipment.equipment_group} • {equipment.equipment_type_id}</span>
              {phaseConfig && (
                <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-mono">
                  {phaseConfig}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/sites/${siteid}`}
              className="inline-flex items-center rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25"
            >
              ← Back
            </Link>
            <Link
              href={`/sites/${siteid}/equipment/${equipment.equipment_id}/edit`}
              className="inline-flex items-center rounded-full bg-white text-green-700 px-4 py-2 text-sm font-semibold shadow hover:bg-gray-100"
            >
              ✏️ Edit
            </Link>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="max-w-6xl mx-auto px-6 pt-4">
        <div className="flex gap-1 border-b">
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "analytics"
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTab("setup")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "setup"
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Setup
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-6xl mx-auto p-6">
        {activeTab === "analytics" ? renderAnalyticsTab() : renderSetupTab()}
      </main>
    </div>
  );
}
