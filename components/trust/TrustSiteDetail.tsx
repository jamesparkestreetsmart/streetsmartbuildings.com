"use client";

import { ArrowLeft, X } from "lucide-react";
import { DailyHealthRow, HealthChecks } from "@/lib/daily-health";

// ── Types ──────────────────────────────────────────────────────────

interface SensorDetail {
  role: string;
  entity_id: string | null;
  value: string | null;
  freshness: "fresh" | "warn" | "stale" | "unmapped" | "derived";
  required: boolean;
  last_seen: string | null;
}

interface DeviceDetail {
  name: string;
  status: string;
  battery: number | null;
  last_seen: string | null;
}

export interface EquipmentItem {
  name: string;
  type: string;
  status: string;
  zone: string | null;
  control: string | null;
  device: DeviceDetail | null;
  sensors: SensorDetail[];
  health: "green" | "yellow" | "red" | "no_data";
}

interface SpaceDevice {
  name: string;
  role: string;
  status: string;
}

interface SpaceSensor {
  role: string;
  value: string | null;
}

export interface SpaceItem {
  name: string;
  type: string;
  hvac_equipment: string | null;
  thermostat_name: string | null;
  devices: SpaceDevice[];
  sensors: SpaceSensor[];
}

interface Props {
  siteName: string;
  date: string;
  row: DailyHealthRow | null;
  equipment: EquipmentItem[];
  spaces: SpaceItem[];
  onBack: () => void;
}

// ── Health check cards ─────────────────────────────────────────────

const CHECK_LABELS: { key: keyof HealthChecks; label: string; metric: (c: HealthChecks) => string }[] = [
  {
    key: "cron",
    label: "Cron Jobs",
    metric: (c) => `${c.cron.runs_today} runs, gap ${c.cron.gap_minutes}min`,
  },
  {
    key: "ha_connection",
    label: "HA Connection",
    metric: (c) => c.ha_connection.reachable ? `Online, ${c.ha_connection.downtime_minutes}min downtime` : "Offline",
  },
  {
    key: "devices",
    label: "Devices",
    metric: (c) => c.devices.total > 0 ? `${c.devices.responsive}/${c.devices.total} responsive` : "No devices",
  },
  {
    key: "sensors",
    label: "Sensors",
    metric: (c) => c.sensors.total > 0 ? `${c.sensors.fresh}/${c.sensors.total} fresh` : "No sensors",
  },
  {
    key: "directives",
    label: "Directives",
    metric: (c) => c.directives.total > 0 ? `${c.directives.pushed} pushed, ${c.directives.failed} failed` : "No directives",
  },
  {
    key: "entity_sync",
    label: "Entity Sync",
    metric: (c) => c.entity_sync.total > 0 ? `${c.entity_sync.synced}/${c.entity_sync.total} synced` : "No entities",
  },
];

// ── Helpers ────────────────────────────────────────────────────────

const HEALTH_DOT: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
  no_data: "bg-gray-300",
};

const TYPE_BADGE: Record<string, string> = {
  HVAC: "bg-blue-100 text-blue-700",
  Lighting: "bg-yellow-100 text-yellow-700",
  Refrigeration: "bg-cyan-100 text-cyan-700",
  Kitchen: "bg-orange-100 text-orange-700",
  Electrical: "bg-purple-100 text-purple-700",
  Plumbing: "bg-teal-100 text-teal-700",
  Security: "bg-red-100 text-red-700",
  Other: "bg-gray-100 text-gray-600",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ── Component ──────────────────────────────────────────────────────

export default function TrustSiteDetail({ siteName, date, row, equipment, spaces, onBack }: Props) {
  const checks = row?.checks;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 border-b bg-gray-50 rounded-t-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1 hover:bg-gray-200 rounded">
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{siteName}</h3>
              <p className="text-xs text-gray-500">{date}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {row && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                row.overall_status === "green" ? "bg-green-100 text-green-700" :
                row.overall_status === "yellow" ? "bg-yellow-100 text-yellow-700" :
                row.overall_status === "red" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-500"
              }`}>
                Score: {row.score}
              </span>
            )}
            <button onClick={onBack} className="p-1 hover:bg-gray-200 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Health checks grid */}
          {checks && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Health Checks</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CHECK_LABELS.map(({ key, label, metric }) => (
                  <div key={key} className="border rounded-lg p-3 bg-gray-50">
                    <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
                    <div className="text-sm text-gray-800">{metric(checks)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Critical failure alert */}
          {row?.critical_failure && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-red-700 uppercase mb-1">Critical Failure</div>
              <div className="text-sm text-red-600">{row.critical_failure_reason}</div>
            </div>
          )}

          {/* ── Equipment ─────────────────────────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Equipment</h4>
            {equipment.length === 0 ? (
              <p className="text-sm text-gray-400">No equipment data available.</p>
            ) : (
              <div className="space-y-3">
                {equipment.map((eq, i) => (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    {/* Equipment header */}
                    <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[eq.health]}`} />
                        <span className="text-sm font-semibold text-gray-800">{eq.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          TYPE_BADGE[eq.type] || TYPE_BADGE.Other
                        }`}>
                          {eq.type}
                        </span>
                      </div>
                      <span className={`text-[10px] font-medium uppercase ${
                        eq.status === "active" ? "text-green-600" : "text-gray-400"
                      }`}>
                        {eq.status}
                      </span>
                    </div>

                    <div className="px-4 py-3 space-y-3">
                      {/* Zone + Control info */}
                      {eq.zone && (
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Zone: <span className="text-gray-700 font-medium">{eq.zone}</span></span>
                          {eq.control && (
                            <span>Control: <span className={`font-medium ${
                              eq.control === "managed" ? "text-green-600" : "text-gray-600"
                            }`}>
                              {eq.control === "managed" ? "Managed" : "Open"}
                            </span></span>
                          )}
                        </div>
                      )}

                      {/* Device row */}
                      {eq.device && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-500">Device:</span>
                          <span className="font-medium text-gray-800">{eq.device.name}</span>
                          <span className={`flex items-center gap-1 ${
                            eq.device.status === "online" ? "text-green-600" :
                            eq.device.status === "offline" ? "text-red-500" :
                            "text-gray-400"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              eq.device.status === "online" ? "bg-green-500" :
                              eq.device.status === "offline" ? "bg-red-500" :
                              "bg-gray-300"
                            }`} />
                            {eq.device.status === "online" ? "Online" :
                             eq.device.status === "offline" ? "Offline" : "Unknown"}
                          </span>
                          {eq.device.battery != null && (
                            <span className="text-gray-500">
                              {eq.device.battery}%
                            </span>
                          )}
                          {eq.device.last_seen && (
                            <span className="text-gray-400">{timeAgo(eq.device.last_seen)}</span>
                          )}
                        </div>
                      )}

                      {/* Sensors table */}
                      {eq.sensors.length > 0 && (
                        <div>
                          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                            Sensors
                            <span className="ml-2 font-normal text-gray-300">
                              {eq.sensors.filter((s) => s.freshness !== "unmapped" && s.freshness !== "derived").length} mapped
                              {eq.sensors.some((s) => s.freshness === "derived") &&
                                ` + ${eq.sensors.filter((s) => s.freshness === "derived").length} derived`}
                              {eq.sensors.some((s) => s.freshness === "unmapped") &&
                                ` / ${eq.sensors.filter((s) => s.freshness === "unmapped").length} unmapped`}
                            </span>
                          </div>
                          <div className="border rounded overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="text-left px-3 py-1.5 font-medium text-gray-500">Role</th>
                                  <th className="text-left px-3 py-1.5 font-medium text-gray-500">Entity</th>
                                  <th className="text-left px-3 py-1.5 font-medium text-gray-500">Value</th>
                                  <th className="text-left px-3 py-1.5 font-medium text-gray-500">Status</th>
                                  <th className="text-left px-3 py-1.5 font-medium text-gray-500">Last Seen</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {eq.sensors.map((s, j) => (
                                  <tr key={j} className={s.freshness === "unmapped" ? "bg-gray-50/50" : ""}>
                                    <td className="px-3 py-1.5 text-gray-700">
                                      {s.role}
                                      {s.required && <span className="text-red-400 ml-0.5">*</span>}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-gray-500 max-w-[140px] truncate" title={s.entity_id || ""}>
                                      {s.freshness === "derived" ? (
                                        <span className="text-violet-500 italic">auto-derived</span>
                                      ) : s.entity_id ? (
                                        s.entity_id.replace(/^sensor\./, "")
                                      ) : (
                                        <span className="text-gray-300">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-gray-800">{s.value ?? "—"}</td>
                                    <td className="px-3 py-1.5">
                                      {s.freshness === "fresh" && (
                                        <span className="flex items-center gap-1 text-green-600">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                          Fresh
                                        </span>
                                      )}
                                      {s.freshness === "warn" && (
                                        <span className="flex items-center gap-1 text-yellow-600">
                                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                                          Aging
                                        </span>
                                      )}
                                      {s.freshness === "stale" && (
                                        <span className="flex items-center gap-1 text-red-500">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                          Stale
                                        </span>
                                      )}
                                      {s.freshness === "unmapped" && (
                                        <span className="flex items-center gap-1 text-gray-400">
                                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                          Not mapped
                                        </span>
                                      )}
                                      {s.freshness === "derived" && (
                                        <span className="flex items-center gap-1 text-violet-500">
                                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                                          Auto
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5 text-gray-500">{timeAgo(s.last_seen)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {eq.sensors.length === 0 && !eq.device && (
                        <p className="text-xs text-gray-400 italic">No sensors or devices mapped</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Spaces ────────────────────────────────────────── */}
          {spaces.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Spaces</h4>
              <div className="space-y-2">
                {spaces.map((sp, i) => (
                  <div key={i} className="border rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-800">{sp.name}</span>
                      {sp.type && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                          {sp.type}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {sp.hvac_equipment && (
                        <span>HVAC: <span className="text-gray-700 font-medium">{sp.hvac_equipment}</span></span>
                      )}
                      {!sp.hvac_equipment && (
                        <span>HVAC: <span className="text-gray-400">None</span></span>
                      )}
                      {sp.devices.length > 0 ? (
                        <span>Devices: <span className="text-gray-700">{sp.devices.map((d) => d.name).join(", ")}</span></span>
                      ) : (
                        <span>Devices: <span className="text-gray-400">(none)</span></span>
                      )}
                      {sp.sensors.length > 0 ? (
                        <span>Sensors: <span className="text-gray-700">{sp.sensors.length}</span></span>
                      ) : sp.thermostat_name ? (
                        <span>Sensors: <span className="text-gray-400 italic">using {sp.thermostat_name} builtin</span></span>
                      ) : (
                        <span>Sensors: <span className="text-gray-400">(none)</span></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
