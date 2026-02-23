"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Cpu } from "lucide-react";

/* ======================================================
 Types
====================================================== */

interface DeviceEntity {
  entity_id: string;
  friendly_name: string | null;
  domain: string | null;
  device_class: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
  sensor_type: string | null;
  sensor_role: string | null;
}

interface DeviceItem {
  device_id: string;
  device_name: string;
  device_role: string | null;
  protocol: string | null;
  status: string | null;
  equipment_id: string | null;
  equipment_name: string | null;
  equipment_type_id: string | null;
  ha_device_id: string | null;
  entities: DeviceEntity[];
}

/* ======================================================
 Helpers
====================================================== */

const lastSeenClass = (date: string | null) => {
  if (!date) return "text-red-400";
  const ageMs = Date.now() - new Date(date).getTime();
  const hours = ageMs / 36e5;
  if (hours >= 24) return "text-red-400";
  if (hours >= 6) return "text-amber-300";
  return "text-emerald-300";
};

const formatRelativeTime = (date: string | null) => {
  if (!date) return "\u2014";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
};

const formatValue = (value: string | null, unit: string | null) => {
  if (!value || value === "unknown" || value === "unavailable") return "\u2014";
  return unit ? `${value} ${unit}` : value;
};

/* ======================================================
 Component
====================================================== */

interface Props {
  siteId: string;
}

export default function DeviceListPanel({ siteId }: Props) {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/device-list`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDevices(data.devices || []);
    } catch (err) {
      console.error("Failed to fetch device list:", err);
    }
    setLoading(false);
  }, [siteId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const toggleDevice = (deviceId: string) => {
    setExpandedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const mappedCount = devices.filter((d) => d.equipment_id).length;

  return (
    <div className="sticky top-0 z-10 bg-slate-900 text-white rounded overflow-hidden shadow-lg">
      {/* Panel Header */}
      <div
        className="bg-slate-800 px-4 py-3 cursor-pointer select-none"
        onClick={() => setPanelExpanded((p) => !p)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {panelExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
            <Cpu className="w-4 h-4 text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold">Devices on this Site</h2>
              <p className="text-xs text-slate-400">
                Overview of all devices and their mapping status
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              {devices.length} {devices.length === 1 ? "device" : "devices"}
            </span>
            <span className="text-emerald-400">{mappedCount} mapped</span>
            {devices.length - mappedCount > 0 && (
              <span className="text-amber-400">
                {devices.length - mappedCount} unmapped
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Panel Body — scrollable so sticky header doesn't consume full viewport */}
      {panelExpanded && (
        <div className="overflow-y-auto max-h-[50vh]">
          {loading ? (
            <div className="px-4 py-6 text-center text-slate-400 text-sm">
              Loading devices...
            </div>
          ) : devices.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-400 text-sm">
              No devices found for this site.
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {devices.map((device) => {
                const isExpanded = expandedDevices.has(device.device_id);
                const isMapped = !!device.equipment_id;

                return (
                  <div key={device.device_id}>
                    {/* Device Row */}
                    <div
                      className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                      onClick={() => toggleDevice(device.device_id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      )}

                      {/* Mapping dot */}
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          isMapped ? "bg-emerald-400" : "bg-amber-400"
                        }`}
                      />

                      {/* Device name */}
                      <span className="text-sm font-medium truncate min-w-0">
                        {device.device_name || "Unnamed Device"}
                      </span>

                      {/* Device role */}
                      {device.device_role && (
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {device.device_role}
                        </span>
                      )}

                      {/* Protocol badge */}
                      {device.protocol && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] uppercase flex-shrink-0">
                          {device.protocol}
                        </span>
                      )}

                      <div className="flex-1" />

                      {/* Equipment mapping */}
                      {isMapped ? (
                        <span className="text-xs flex-shrink-0">
                          <span className="text-emerald-300">
                            {device.equipment_name}
                          </span>
                          {device.equipment_type_id && (
                            <span className="text-slate-500 ml-1.5">
                              {device.equipment_type_id.replace(/_/g, " ")}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 text-xs flex-shrink-0">
                          Unmapped
                        </span>
                      )}

                      {/* Status badge */}
                      {device.status && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${
                            device.status === "active"
                              ? "bg-emerald-900/40 text-emerald-300"
                              : "bg-slate-700 text-slate-400"
                          }`}
                        >
                          {device.status}
                        </span>
                      )}

                      {/* Entity count */}
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {device.entities.length}{" "}
                        {device.entities.length === 1 ? "entity" : "entities"}
                      </span>
                    </div>

                    {/* Entity Sub-Table */}
                    {isExpanded && (
                      <div className="bg-slate-900/50 border-t border-slate-700/50">
                        {device.entities.length === 0 ? (
                          <div className="px-8 py-3 text-xs text-slate-500 italic">
                            No entities discovered for this device.
                          </div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-800/50 text-slate-400">
                                <th className="px-8 py-1.5 text-left font-medium">
                                  Entity
                                </th>
                                <th className="px-3 py-1.5 text-left font-medium">
                                  Friendly Name
                                </th>
                                <th className="px-3 py-1.5 text-left font-medium">
                                  Type
                                </th>
                                <th className="px-3 py-1.5 text-left font-medium">
                                  Value
                                </th>
                                <th className="px-3 py-1.5 text-left font-medium">
                                  Last Seen
                                </th>
                                <th className="px-3 py-1.5 text-left font-medium">
                                  Mapping
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {device.entities.map((ent) => (
                                <tr
                                  key={ent.entity_id}
                                  className="border-t border-slate-700/50"
                                >
                                  <td className="px-8 py-1.5 font-mono text-slate-300 truncate max-w-[260px]">
                                    {ent.entity_id}
                                  </td>
                                  <td className="px-3 py-1.5 text-slate-300">
                                    {ent.friendly_name || "\u2014"}
                                  </td>
                                  <td className="px-3 py-1.5 text-slate-400">
                                    {ent.device_class || ent.domain || "\u2014"}
                                  </td>
                                  <td className="px-3 py-1.5 text-slate-300">
                                    {formatValue(
                                      ent.last_state,
                                      ent.unit_of_measurement
                                    )}
                                  </td>
                                  <td
                                    className={`px-3 py-1.5 ${lastSeenClass(
                                      ent.last_seen_at
                                    )}`}
                                  >
                                    {formatRelativeTime(ent.last_seen_at)}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {ent.sensor_role ? (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300">
                                        {ent.sensor_role}
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                                        Available
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
