"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnomalyEventRow {
  id: number;
  anomaly_type: string;
  severity: string;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  peak_value: number | null;
  peak_value_unit: string | null;
  trigger_snapshot: Record<string, any> | null;
  resolution_snapshot: Record<string, any> | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  alert_sent: boolean;
  hvac_zone_id: string | null;
  equipment_id: string | null;
  resolved_reason: string | null;
}

interface Props {
  siteId: string;
  orgId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ANOMALY_LABELS: Record<string, string> = {
  coil_freeze: "Coil Freeze",
  short_cycling: "Short Cycling",
  long_cycle: "Long Cycle",
  filter_restriction: "Filter Restriction",
  refrigerant_low: "Low Refrigerant",
  idle_heat_gain: "Idle Heat Gain",
  delayed_temp_response: "Delayed Response",
  low_efficiency: "Low Efficiency",
};

function formatAnomalyType(type: string): string {
  return ANOMALY_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "--";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours < 24) return remainMins > 0 ? `${hours}h ${remainMins}m ago` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Sort rows: active first (by started_at DESC), resolved below (by ended_at DESC) */
function sortAnomalyRows(rows: AnomalyEventRow[]): AnomalyEventRow[] {
  return [...rows].sort((a, b) => {
    const aActive = a.ended_at === null ? 0 : 1;
    const bActive = b.ended_at === null ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    // Both active: sort by started_at DESC
    if (aActive === 0) {
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    }
    // Both resolved: sort by ended_at DESC
    const aEnd = a.ended_at ? new Date(a.ended_at).getTime() : 0;
    const bEnd = b.ended_at ? new Date(b.ended_at).getTime() : 0;
    return bEnd - aEnd;
  });
}

/** Severity badge */
function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    critical: { bg: "bg-red-100", text: "text-red-800" },
    warning: { bg: "bg-amber-100", text: "text-amber-800" },
    info: { bg: "bg-blue-100", text: "text-blue-700" },
  };
  const s = styles[severity] || styles.info;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>
      {severity}
    </span>
  );
}

/** Status indicator — shows amber "Reset" badge for manually reset anomalies */
function StatusIndicator({ endedAt, resolvedReason }: { endedAt: string | null; resolvedReason: string | null }) {
  if (!endedAt) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-red-700 font-medium text-xs">Active</span>
      </span>
    );
  }
  if (resolvedReason === "manual_reset") {
    return (
      <span className="inline-flex items-center gap-1.5" title="Manually reset — detection restarted from this point">
        <span className="text-amber-600 text-sm">{"\u21BA"}</span>
        <span className="text-amber-700 text-xs">Resolved</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
          Reset
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-green-600 text-sm">{"\u2713"}</span>
      <span className="text-green-700 text-xs">Resolved</span>
    </span>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const TH_BASE = "py-2 px-3 font-semibold whitespace-nowrap text-xs text-left";
const TD = "py-2 px-3 whitespace-nowrap text-xs";

// ─── Component ───────────────────────────────────────────────────────────────

export default function AnomalyEventsTable({ siteId, orgId }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<AnomalyEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [confirmingReset, setConfirmingReset] = useState<number | null>(null);
  const [resetting, setResetting] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleRowDrillThrough = (row: AnomalyEventRow) => {
    const params = new URLSearchParams();
    if (row.equipment_id) params.set("equipmentId", row.equipment_id);
    if (siteId) params.set("siteId", siteId);
    if (row.anomaly_type) params.set("anomalyType", row.anomaly_type);
    router.push(`/benchmark/anomalies?${params.toString()}`);
  };

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (activeOnly) params.set("active_only", "true");
      const res = await fetch(`/api/sites/${siteId}/anomaly-events?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("[AnomalyEvents] Fetch error:", err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [siteId, activeOnly]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Re-render live timers every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Auto-clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Sorted rows: active first, then resolved
  const sortedRows = useMemo(() => sortAnomalyRows(rows), [rows]);

  /** Handle reset confirm */
  const handleReset = useCallback(async (row: AnomalyEventRow) => {
    setResetting(row.id);
    try {
      const res = await fetch("/api/anomaly/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_id: row.id,
          zone_id: row.hvac_zone_id,
          alert_type: row.anomaly_type,
          site_id: siteId,
          org_id: orgId || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Update the row in-place
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  ended_at: updated.ended_at || new Date().toISOString(),
                  duration_min: updated.duration_min ?? r.duration_min,
                  resolved_reason: updated.resolved_reason || "manual_reset",
                }
              : r
          )
        );
        setToastMessage("Reset confirmed");
      } else {
        const err = await res.json().catch(() => ({}));
        setToastMessage(`Reset failed: ${err.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("[AnomalyEvents] Reset error:", err);
      setToastMessage("Reset failed: network error");
    } finally {
      setResetting(null);
      setConfirmingReset(null);
    }
  }, [siteId, orgId]);

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6 relative">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`absolute top-2 right-4 z-10 text-xs px-3 py-1.5 rounded-md shadow-md font-medium transition-opacity ${
            toastMessage.startsWith("Reset confirmed")
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}
        >
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 group"
        >
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: "#b45309" }}
          />
          <h2 className="text-lg font-semibold text-gray-800 group-hover:text-amber-700 transition-colors">
            Anomaly Events
          </h2>
          <span className="text-gray-400 text-sm">{collapsed ? "\u25B6" : "\u25BC"}</span>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveOnly((a) => !a)}
            className={`text-xs px-3 py-1 rounded-md border transition-colors ${
              activeOnly
                ? "bg-red-50 border-red-200 text-red-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {activeOnly ? "Active Only" : "All Events"}
          </button>
          <Link
            href="/benchmark/anomalies"
            className="text-xs px-3 py-1 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors text-amber-700 font-medium"
          >
            Org-Wide View &rarr;
          </Link>
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
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white", borderTopLeftRadius: 6 }}>
                  Status
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white" }}>
                  Type
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white" }}>
                  Severity
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white" }}>
                  Started
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white" }}>
                  Duration
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white" }}>
                  Peak Value
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white" }}>
                  Trigger Conditions
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white" }}>
                  Actions
                </th>
                <th className={TH_BASE} style={{ backgroundColor: "#b45309", color: "white", borderTopRightRadius: 6, width: 32 }}>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-gray-500 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading anomaly events...
                    </div>
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-gray-500 text-center">
                    {activeOnly ? "No active anomaly events" : "No anomaly events recorded yet"}
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => {
                  const isExpanded = expandedRow === row.id;
                  const isActive = row.ended_at === null;
                  const isConfirming = confirmingReset === row.id;
                  const isResettingThis = resetting === row.id;
                  const triggerKeys = row.trigger_snapshot
                    ? Object.entries(row.trigger_snapshot).filter(
                        ([, v]) => v !== null && v !== undefined
                      )
                    : [];

                  return (
                    <tr
                      key={row.id}
                      className={`${
                        idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                      } ${
                        isActive ? "bg-red-50/30" : ""
                      } hover:bg-amber-50/30 transition-colors border-b border-gray-100 cursor-pointer`}
                      onClick={() => handleRowDrillThrough(row)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && handleRowDrillThrough(row)}
                    >
                      <td className={TD}>
                        <StatusIndicator endedAt={row.ended_at} resolvedReason={row.resolved_reason} />
                      </td>
                      <td className={TD}>
                        <span className="font-medium text-gray-800">
                          {formatAnomalyType(row.anomaly_type)}
                        </span>
                      </td>
                      <td className={TD}>
                        <SeverityBadge severity={row.severity} />
                      </td>
                      <td className={TD}>
                        <div className="flex flex-col">
                          <span className="text-gray-500 text-[10px]">{formatDate(row.started_at)}</span>
                          <span className="text-gray-700">{formatTime(row.started_at)}</span>
                        </div>
                      </td>
                      <td className={TD}>
                        {row.ended_at === null ? (
                          <span className="text-red-600 font-medium">
                            {timeAgo(row.started_at)}
                          </span>
                        ) : (
                          <span className="text-gray-600">
                            {formatDuration(row.duration_min)}
                          </span>
                        )}
                      </td>
                      <td className={TD}>
                        {row.peak_value != null ? (
                          <span className="font-medium text-gray-800">
                            {row.peak_value}
                            {row.peak_value_unit ? ` ${row.peak_value_unit}` : ""}
                          </span>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className={`${TD} max-w-[300px]`} onClick={(e) => e.stopPropagation()}>
                        {triggerKeys.length > 0 ? (
                          <div>
                            <button
                              onClick={() =>
                                setExpandedRow(isExpanded ? null : row.id)
                              }
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                            >
                              {isExpanded ? "Hide" : `${triggerKeys.length} conditions`}
                            </button>
                            {isExpanded && (
                              <div className="mt-1 p-2 bg-gray-50 rounded text-[11px] font-mono space-y-0.5">
                                {triggerKeys.map(([k, v]) => (
                                  <div key={k} className="text-gray-600">
                                    <span className="text-gray-500">{k}:</span>{" "}
                                    <span className="text-gray-800">
                                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className={`${TD} min-w-[140px]`} onClick={(e) => e.stopPropagation()}>
                        {isConfirming ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-gray-600 leading-tight">
                              Reset this anomaly? This clears the alert and restarts detection.
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleReset(row)}
                                disabled={isResettingThis}
                                className="text-[11px] px-2 py-0.5 rounded bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                              >
                                {isResettingThis ? "..." : "Confirm"}
                              </button>
                              <button
                                onClick={() => setConfirmingReset(null)}
                                disabled={isResettingThis}
                                className="text-[11px] px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmingReset(row.id)}
                            className={`text-[11px] px-2.5 py-1 rounded-md border font-medium transition-colors ${
                              isActive
                                ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                : "border-gray-300 text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            Reset
                          </button>
                        )}
                      </td>
                      <td className={`${TD} text-center`}>
                        <span className="text-gray-300 text-xs">&#x203A;</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
