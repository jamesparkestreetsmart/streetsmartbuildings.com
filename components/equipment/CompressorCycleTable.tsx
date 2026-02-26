"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CycleRow {
  id: number;
  hvac_zone_id: string | null;
  equipment_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  hvac_mode: string | null;
  avg_power_kw: number | null;
  peak_power_kw: number | null;
  total_energy_kwh: number | null;
  peak_current_a: number | null;
  start_zone_temp_f: number | null;
  end_zone_temp_f: number | null;
  temp_delta_f: number | null;
  start_supply_temp_f: number | null;
  end_supply_temp_f: number | null;
  start_setpoint_f: number | null;
  efficiency_ratio: number | null;
}

interface Props {
  siteId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "--";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function liveMinutes(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode || mode === "unknown") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">unknown</span>;
  }
  const styles: Record<string, { bg: string; text: string }> = {
    cooling: { bg: "bg-blue-100", text: "text-blue-800" },
    heating: { bg: "bg-orange-100", text: "text-orange-800" },
    fan_only: { bg: "bg-gray-100", text: "text-gray-600" },
    fan: { bg: "bg-gray-100", text: "text-gray-600" },
  };
  const s = styles[mode] || { bg: "bg-slate-100", text: "text-slate-700" };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>
      {mode}
    </span>
  );
}

function fmtNum(val: number | null, decimals: number, unit: string): string {
  if (val === null) return "--";
  return `${val.toFixed(decimals)} ${unit}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const TH_BASE = "py-2 px-3 font-semibold whitespace-nowrap text-xs text-left";
const TD = "py-2 px-3 whitespace-nowrap text-xs";

// ─── Component ───────────────────────────────────────────────────────────────

export default function CompressorCycleTable({ siteId }: Props) {
  const [rows, setRows] = useState<CycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/compressor-cycles?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("[CompressorCycles] Fetch error:", err);
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

  // Re-render live timers every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const hdrStyle = { backgroundColor: "#3730a3", color: "white" };

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 group"
        >
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#3730a3" }} />
          <h2 className="text-lg font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
            Compressor Cycle Log
          </h2>
          <span className="text-gray-400 text-sm">{collapsed ? "\u25B6" : "\u25BC"}</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">Last: {lastRefresh.toLocaleTimeString()}</span>
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
                <th className={TH_BASE} style={{ ...hdrStyle, borderTopLeftRadius: 6 }}>Status</th>
                <th className={TH_BASE} style={hdrStyle}>Mode</th>
                <th className={TH_BASE} style={hdrStyle}>Start</th>
                <th className={TH_BASE} style={hdrStyle}>End</th>
                <th className={TH_BASE} style={hdrStyle}>Duration</th>
                <th className={TH_BASE} style={hdrStyle}>Avg kW</th>
                <th className={TH_BASE} style={hdrStyle}>Peak kW</th>
                <th className={TH_BASE} style={hdrStyle}>Energy</th>
                <th className={TH_BASE} style={hdrStyle}>Peak Amps</th>
                <th className={TH_BASE} style={hdrStyle}>Start Temp</th>
                <th className={TH_BASE} style={hdrStyle}>End Temp</th>
                <th className={TH_BASE} style={hdrStyle}>{"\u0394"} Temp</th>
                <th className={TH_BASE} style={{ ...hdrStyle, borderTopRightRadius: 6 }}>Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-8 text-gray-500 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading cycles...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-gray-500 text-center">
                    No compressor cycles recorded yet
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const isRunning = row.ended_at === null;

                  // Efficiency coloring: >3 green, 1-3 yellow, <1 red
                  let effColor = "text-gray-600";
                  if (row.efficiency_ratio != null) {
                    if (row.efficiency_ratio >= 3) effColor = "text-green-700";
                    else if (row.efficiency_ratio >= 1) effColor = "text-yellow-700";
                    else effColor = "text-red-600";
                  }

                  // Delta temp coloring
                  let dtColor = "text-gray-600";
                  if (row.temp_delta_f != null) {
                    dtColor = row.temp_delta_f < 0 ? "text-blue-600" : row.temp_delta_f > 0 ? "text-orange-600" : "text-gray-600";
                  }

                  return (
                    <tr
                      key={row.id}
                      className={`${
                        idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                      } ${
                        isRunning ? "bg-green-50/30" : ""
                      } hover:bg-indigo-50/30 transition-colors border-b border-gray-100`}
                    >
                      <td className={TD}>
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-green-700 font-medium text-xs">Running</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-gray-400" />
                            <span className="text-gray-600 text-xs">Complete</span>
                          </span>
                        )}
                      </td>
                      <td className={TD}>
                        <ModeBadge mode={row.hvac_mode} />
                      </td>
                      <td className={TD} title={formatDate(row.started_at)}>
                        <span className="font-mono text-gray-700">{formatTime(row.started_at)}</span>
                      </td>
                      <td className={TD}>
                        {row.ended_at ? (
                          <span className="font-mono text-gray-700" title={formatDate(row.ended_at)}>
                            {formatTime(row.ended_at)}
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">--</span>
                        )}
                      </td>
                      <td className={TD}>
                        {isRunning ? (
                          <span className="text-green-700 font-medium">{liveMinutes(row.started_at)}</span>
                        ) : (
                          <span className="text-gray-700">{formatDuration(row.duration_min)}</span>
                        )}
                      </td>
                      <td className={TD}>
                        <span className="text-gray-700">{fmtNum(row.avg_power_kw, 1, "kW")}</span>
                      </td>
                      <td className={TD}>
                        <span className="text-gray-700">{fmtNum(row.peak_power_kw, 1, "kW")}</span>
                      </td>
                      <td className={TD}>
                        <span className="text-gray-700">{fmtNum(row.total_energy_kwh, 2, "kWh")}</span>
                      </td>
                      <td className={TD}>
                        <span className="text-gray-700">{fmtNum(row.peak_current_a, 1, "A")}</span>
                      </td>
                      <td className={TD}>
                        {row.start_zone_temp_f != null ? (
                          <span className="text-gray-700">{row.start_zone_temp_f}{"\u00B0"}F</span>
                        ) : <span className="text-gray-400">--</span>}
                      </td>
                      <td className={TD}>
                        {row.end_zone_temp_f != null ? (
                          <span className="text-gray-700">{row.end_zone_temp_f}{"\u00B0"}F</span>
                        ) : <span className="text-gray-400">--</span>}
                      </td>
                      <td className={TD}>
                        {row.temp_delta_f != null ? (
                          <span className={`font-medium ${dtColor}`}>
                            {row.temp_delta_f > 0 ? "+" : ""}{row.temp_delta_f}{"\u00B0"}F
                          </span>
                        ) : <span className="text-gray-400">--</span>}
                      </td>
                      <td className={TD}>
                        {row.efficiency_ratio != null ? (
                          <span className={`font-medium ${effColor}`}>
                            {row.efficiency_ratio.toFixed(1)} {"\u00B0"}F/kWh
                          </span>
                        ) : <span className="text-gray-400">--</span>}
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
