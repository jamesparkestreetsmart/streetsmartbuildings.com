"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SensorReading {
  value: any;
  ts: string;
  unit: string;
  velocity?: number | null;
  acceleration?: number | null;
}

interface Sensor {
  sensor_id: string;
  entity_id: string;
  sensor_type: string;
  sensor_role: string;
  log_table: string | null;
  readings: SensorReading[];
}

interface EquipmentItem {
  equipment_id: string;
  equipment_name: string;
  equipment_type_id: string | null;
  space_name: string | null;
  status: string;
  sensors: Sensor[];
}

interface Group {
  group: string;
  items: EquipmentItem[];
}

type RangeKey = "latest" | "7d" | "14d" | "30d" | "45d" | "90d";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "latest", label: "Last Updated" },
  { key: "7d",     label: "7 Days" },
  { key: "14d",    label: "14 Days" },
  { key: "30d",    label: "30 Days" },
  { key: "45d",    label: "45 Days" },
  { key: "90d",    label: "90 Days" },
];

const VEL_ACCEL_TABLES = ["log_temperatures", "log_humidities"];

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  dummy:    "bg-yellow-100 text-yellow-700",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatValue(value: any): string {
  if (value === null || value === undefined) return "—";
  const n = parseFloat(value);
  if (isNaN(n)) return String(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function velLabel(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const abs = Math.abs(v);
  const arrow = v > 0 ? "↑" : "↓";
  return `${arrow} ${abs.toFixed(2)}/min`;
}

function accelLabel(a: number | null | undefined): string {
  if (a === null || a === undefined) return "";
  const abs = Math.abs(a);
  const arrow = a > 0 ? "⬆" : "⬇";
  return `${arrow} ${abs.toFixed(3)}/min²`;
}

// Collect all unique sensor roles across a group's items for table headers
function getGroupSensorRoles(items: EquipmentItem[]): string[] {
  const roles = new Set<string>();
  items.forEach((item) => item.sensors.forEach((s) => roles.add(s.sensor_role)));
  return Array.from(roles);
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ readings }: { readings: SensorReading[] }) {
  if (readings.length < 2) return <span className="text-gray-400 text-xs">—</span>;

  const values = readings.map((r) => parseFloat(r.value)).filter((v) => !isNaN(v));
  if (values.length < 2) return <span className="text-gray-400 text-xs">—</span>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const last = values[values.length - 1];
  const unit = readings[readings.length - 1]?.unit || "";

  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h} className="overflow-visible">
        <polyline
          points={pts}
          fill="none"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xs text-gray-600 whitespace-nowrap">
        {formatValue(last)}{unit}
      </span>
    </div>
  );
}

// ─── Group Section ────────────────────────────────────────────────────────────

function GroupSection({
  group,
  items,
  mode,
  siteId,
}: {
  group: string;
  items: EquipmentItem[];
  mode: RangeKey;
  siteId: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const roles = getGroupSensorRoles(items);
  const isLatest = mode === "latest";

  return (
    <div className="mb-6 border rounded-xl overflow-hidden shadow-sm">
      {/* Group Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800 text-sm">{group}</span>
          <span className="text-xs text-gray-400 bg-white border rounded-full px-2 py-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Equipment</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Type</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Space</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Status</th>
                {roles.map((role) => (
                  <th key={role} className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap capitalize">
                    {role.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                // Build sensor map by role for this item
                const sensorByRole: Record<string, Sensor> = {};
                item.sensors.forEach((s) => { sensorByRole[s.sensor_role] = s; });

                return (
                  <tr key={item.equipment_id} className="hover:bg-gray-50">
                    {/* Name */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/sites/${siteId}/equipment/${item.equipment_id}/individual-equipment`}
                        className="text-blue-700 underline font-medium"
                      >
                        {item.equipment_name}
                      </Link>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {item.equipment_type_id?.replace(/_/g, " ") || "—"}
                    </td>

                    {/* Space */}
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                      {item.space_name || "—"}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[item.status] || "bg-gray-100 text-gray-500"}`}>
                        {item.status}
                      </span>
                    </td>

                    {/* Sensor columns */}
                    {roles.map((role) => {
                      const sensor = sensorByRole[role];
                      if (!sensor || sensor.readings.length === 0) {
                        return (
                          <td key={role} className="px-4 py-3 text-gray-400">—</td>
                        );
                      }

                      const showVelAccel =
                        isLatest && sensor.log_table && VEL_ACCEL_TABLES.includes(sensor.log_table);
                      const latest = sensor.readings[0];

                      return (
                        <td key={role} className="px-4 py-3 whitespace-nowrap">
                          {isLatest ? (
                            <div>
                              <div className="font-medium text-gray-900">
                                {formatValue(latest.value)}
                                <span className="text-gray-400 text-xs ml-1">{latest.unit}</span>
                              </div>
                              {showVelAccel && (
                                <div className="flex gap-2 mt-0.5">
                                  {latest.velocity !== null && latest.velocity !== undefined && (
                                    <span className={`text-xs ${latest.velocity > 0 ? "text-orange-500" : "text-blue-500"}`}>
                                      {velLabel(latest.velocity)}
                                    </span>
                                  )}
                                  {latest.acceleration !== null && latest.acceleration !== undefined && (
                                    <span className="text-xs text-gray-400">
                                      {accelLabel(latest.acceleration)}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mt-0.5">
                                {formatTs(latest.ts)}
                              </div>
                            </div>
                          ) : (
                            <Sparkline readings={sensor.readings} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  siteId: string;
}

export default function EquipmentCheckupTable({ siteId }: Props) {
  const [mode, setMode] = useState<RangeKey>("latest");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/equipment-checkup?mode=${mode}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setGroups(data.groups || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [siteId, mode]);

  useEffect(() => {
    fetchData();
    if (mode === "latest") {
      const interval = setInterval(fetchData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchData, mode]);

  const exportCSV = () => {
    const rows: string[][] = [["Group", "Equipment", "Type", "Space", "Status", "Sensor Role", "Value", "Unit", "Timestamp"]];
    groups.forEach(({ group, items }) => {
      items.forEach((item) => {
        if (item.sensors.length === 0) {
          rows.push([group, item.equipment_name, item.equipment_type_id || "", item.space_name || "", item.status, "", "", "", ""]);
        } else {
          item.sensors.forEach((s) => {
            const latest = s.readings[0];
            rows.push([
              group,
              item.equipment_name,
              item.equipment_type_id || "",
              item.space_name || "",
              item.status,
              s.sensor_role,
              latest ? formatValue(latest.value) : "",
              latest?.unit || "",
              latest?.ts || "",
            ]);
          });
        }
      });
    });
    const csv = rows.map((r) => r.map((c) => JSON.stringify(c)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `equipment_checkup_${siteId}_${mode}.csv`;
    link.click();
  };

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="mt-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">Equipment Checkup</h2>
          {!loading && (
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              {totalItems} items across {groups.length} group{groups.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Range Toggle */}
          <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
            {RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`px-3 py-1.5 transition-colors whitespace-nowrap ${
                  mode === key
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400 animate-pulse">
          Loading equipment data…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          Failed to load: {error}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
          No equipment found for this site.
        </div>
      ) : (
        groups.map(({ group, items }) => (
          <GroupSection
            key={group}
            group={group}
            items={items}
            mode={mode}
            siteId={siteId}
          />
        ))
      )}
    </div>
  );
}
