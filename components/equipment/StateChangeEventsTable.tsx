"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StateChangeRow {
  id: number;
  entity_id: string;
  equipment_id: string | null;
  previous_state: string | null;
  new_state: string | null;
  changed_at: string;
  state_role: string | null;
  derived_event: string | null;
  metadata: {
    friendly_name?: string;
    domain?: string;
    unit?: string;
  } | null;
}

interface Props {
  siteId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Truncate entity_id: "sensor.pm3255_current_l1" → "pm3255_current_l1" */
function truncateEntity(entityId: string): string {
  const parts = entityId.split(".");
  return parts.length > 1 ? parts[1] : entityId;
}

/** Event badge with color coding */
function EventBadge({ event }: { event: string | null }) {
  if (!event) return <span className="text-gray-400">--</span>;

  const badgeMap: Record<string, { bg: string; text: string }> = {
    compressor_on: { bg: "bg-green-100", text: "text-green-800" },
    compressor_off: { bg: "bg-gray-100", text: "text-gray-600" },
    hvac_heating: { bg: "bg-orange-100", text: "text-orange-800" },
    hvac_cooling: { bg: "bg-blue-100", text: "text-blue-800" },
    hvac_idle: { bg: "bg-gray-100", text: "text-gray-600" },
    hvac_fan_only: { bg: "bg-teal-100", text: "text-teal-700" },
    water_leak_detected: { bg: "bg-red-100", text: "text-red-800" },
    water_leak_cleared: { bg: "bg-green-100", text: "text-green-800" },
    cabinet_opened: { bg: "bg-yellow-100", text: "text-yellow-800" },
    cabinet_closed: { bg: "bg-gray-100", text: "text-gray-600" },
    power_draw_started: { bg: "bg-emerald-100", text: "text-emerald-800" },
    power_draw_stopped: { bg: "bg-gray-100", text: "text-gray-600" },
  };

  const style = badgeMap[event] || { bg: "bg-slate-100", text: "text-slate-700" };

  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
      {event.replace(/_/g, " ")}
    </span>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const TH_BASE = "py-2 px-3 font-semibold whitespace-nowrap text-xs text-left";
const TD = "py-2 px-3 whitespace-nowrap text-xs";

// ─── Component ───────────────────────────────────────────────────────────────

export default function StateChangeEventsTable({ siteId }: Props) {
  const [rows, setRows] = useState<StateChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/state-changes?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("[StateChangeEvents] Fetch error:", err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [siteId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 group"
        >
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: "#3730a3" }}
          />
          <h2 className="text-lg font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
            Compressor & State Events
          </h2>
          <span className="text-gray-400 text-sm">{collapsed ? "\u25B6" : "\u25BC"}</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">
            Last: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
          >
            Refresh
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH_BASE} style={{ backgroundColor: "#3730a3", color: "white", borderTopLeftRadius: 6 }}>
                  Time
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#3730a3", color: "white" }}>
                  Entity
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#3730a3", color: "white" }}>
                  Role
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#3730a3", color: "white" }}>
                  Event
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#3730a3", color: "white" }}>
                  Previous
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#3730a3", color: "white", borderTopRightRadius: 6 }}>
                  New
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-gray-500 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading events...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-gray-500 text-center">
                    No state change events recorded yet
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`${
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    } hover:bg-indigo-50/30 transition-colors border-b border-gray-100`}
                  >
                    <td className={TD} title={formatDate(row.changed_at)}>
                      <span className="font-mono text-gray-700">
                        {formatTime(row.changed_at)}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="font-mono text-gray-600" title={row.entity_id}>
                        {truncateEntity(row.entity_id)}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="text-gray-600">
                        {row.state_role || "--"}
                      </span>
                    </td>
                    <td className={TD}>
                      <EventBadge event={row.derived_event} />
                    </td>
                    <td className={TD}>
                      <span className="font-mono text-gray-500">
                        {row.previous_state ?? "--"}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="font-mono text-gray-700 font-medium">
                        {row.new_state ?? "--"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
