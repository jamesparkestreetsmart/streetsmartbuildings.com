"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type LiveAlert = {
  alert_id: number;
  site_id: string | null;
  site_name: string;
  equipment_name: string;
  space_name: string;
  alert_type: string;
  notification_count: number;
  trigger_value: number | null;
  last_recorded_value: number | null;
  status: "active" | "resolved";
  start_time: string;
  end_time: string | null;
  duration: string | number | null;
  live_value_state: string | null;
};

interface AlertHistoryRow {
  alert_id: number;
  site_name: string;
  equipment_name: string;
  space_name: string;
  alert_type: string;
  status: string;
  start: string;
  end: string | null;
  duration: string | null;
  notification_count: number | null;
}

type SortColumn = keyof LiveAlert;
type SortOrder = "asc" | "desc";
type RangeOption = "7" | "30" | "90" | "custom";
type Tab = "live" | "history";

export default function AlertsPage() {
  const searchParams = useSearchParams();
  const activeTab: Tab = searchParams.get("tab") === "history" ? "history" : "live";

  // Live Alerts state
  const [liveRows, setLiveRows] = useState<LiveAlert[]>([]);
  const [liveLastUpdated, setLiveLastUpdated] = useState<string>("");
  const [liveSortColumn, setLiveSortColumn] = useState<SortColumn>("start_time");
  const [liveSortOrder, setLiveSortOrder] = useState<SortOrder>("desc");

  // Alert History state
  const [historyLogs, setHistoryLogs] = useState<AlertHistoryRow[]>([]);
  const [historyLastUpdated, setHistoryLastUpdated] = useState<string>("");
  const [range, setRange] = useState<RangeOption>("30");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [historySortColumn, setHistorySortColumn] = useState<keyof AlertHistoryRow>("start");
  const [historySortDirection, setHistorySortDirection] = useState<"asc" | "desc">("desc");

  const formatDateTime = (value?: string | null) => {
    if (!value) return "--";
    const d = new Date(value);
    return d.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatCST = (d: Date) =>
    d.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      hour12: true,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  // ===== Live Alerts Functions =====
  const fetchLive = async () => {
    const { data, error } = await supabase
      .from("view_live_alerts")
      .select("*")
      .order("start_time", { ascending: false });

    if (!error) {
      setLiveRows((data as LiveAlert[]) || []);
      setLiveLastUpdated(formatCST(new Date()));
    } else {
      console.error("fetch live failed", error);
    }
  };

  const formatDuration = (duration: string | number | null | undefined) => {
    if (duration === null || duration === undefined) return "--";
    if (typeof duration === "number") {
      const hours = Math.floor(duration);
      const minutes = Math.round((duration - hours) * 60);
      return `${hours}h ${minutes}m`;
    }
    if (typeof duration === "string") {
      const match = duration.match(/(\d+)\s+days\s+(\d+):(\d+)/);
      if (match) {
        const days = match[1];
        const hours = match[2].padStart(2, "0");
        const minutes = match[3].padStart(2, "0");
        return `${days} days ${hours}:${minutes}`;
      }
      return duration.replace(/(\.\d+)?$/, "").replace(/:(\d{2})$/, "");
    }
    return String(duration);
  };

  const exportLiveToCSV = () => {
    if (liveRows.length === 0) return;
    const header = [
      "Site",
      "Equipment",
      "Space",
      "Alert Type",
      "Trigger Value",
      "Last Recorded Value",
      "Status",
      "Start Time",
      "End Time",
      "Duration",
      "Notifications",
    ];
    const csvRows = liveRows.map((r) => [
      r.site_name,
      r.equipment_name,
      r.space_name,
      r.alert_type,
      r.trigger_value ?? "",
      r.last_recorded_value ?? "",
      r.status,
      formatDateTime(r.start_time),
      formatDateTime(r.end_time),
      formatDuration(r.duration),
      r.notification_count,
    ]);
    const csvContent = [header, ...csvRows].map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `live_alerts_${new Date().toISOString().slice(0, 19)}.csv`
    );
    link.click();
  };

  const handleLiveSort = (column: SortColumn) => {
    if (liveSortColumn === column) {
      setLiveSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setLiveSortColumn(column);
      setLiveSortOrder("asc");
    }
  };

  const sortedLiveRows = [...liveRows].sort((a, b) => {
    const aVal = a[liveSortColumn];
    const bVal = b[liveSortColumn];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (typeof aVal === "number" && typeof bVal === "number")
      return liveSortOrder === "asc" ? aVal - bVal : bVal - aVal;
    return liveSortOrder === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  // ===== Alert History Functions =====
  const getDateRange = () => {
    const now = new Date();
    if (range === "custom") {
      if (customStart && customEnd) {
        return {
          start: new Date(customStart).toISOString(),
          end: new Date(customEnd).toISOString(),
        };
      }
      return { start: null, end: null };
    }
    const days = parseInt(range, 10);
    const start = new Date();
    start.setDate(now.getDate() - days);
    return {
      start: start.toISOString(),
      end: now.toISOString(),
    };
  };

  const fetchHistory = async () => {
    const { start, end } = getDateRange();
    if (range === "custom" && (!start || !end)) return;

    const { data, error } = await supabase
      .from("view_alert_history")
      .select("*")
      .gte("start", start)
      .lte("start", end)
      .order("start", { ascending: false });

    if (!error && data) {
      setHistoryLogs(data);
      setHistoryLastUpdated(formatCST(new Date()));
    } else {
      console.error("Error fetching alert history:", error);
    }
  };

  const formatHistoryDuration = (duration: string | null) => {
    if (!duration) return "--";
    const match = duration.match(/(\d+)\s+days\s+(\d+):(\d+)/);
    if (match) {
      const days = match[1];
      const hours = match[2].padStart(2, "0");
      const minutes = match[3].padStart(2, "0");
      return `${days}d ${hours}:${minutes}`;
    }
    return duration.replace(/(\.\d+)?$/, "").replace(/:(\d{2})$/, "");
  };

  const exportHistoryToCSV = () => {
    if (historyLogs.length === 0) return;

    const header = [
      "Site",
      "Equipment",
      "Space",
      "Alert Type",
      "Status",
      "Start",
      "End",
      "Duration",
      "Notifications",
    ];

    const csvRows = historyLogs.map((r) => [
      r.site_name,
      r.equipment_name,
      r.space_name,
      r.alert_type,
      r.status,
      formatDateTime(r.start),
      formatDateTime(r.end),
      formatHistoryDuration(r.duration),
      r.notification_count ?? 0,
    ]);

    const csvContent = [header, ...csvRows].map((e) => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `alert_history_${new Date().toISOString().slice(0, 19)}.csv`
    );
    link.click();
  };

  const handleHistorySort = (column: keyof AlertHistoryRow) => {
    if (historySortColumn === column) {
      setHistorySortDirection(historySortDirection === "asc" ? "desc" : "asc");
    } else {
      setHistorySortColumn(column);
      setHistorySortDirection("asc");
    }
  };

  const sortedHistoryLogs = [...historyLogs].sort((a, b) => {
    const aVal = a[historySortColumn];
    const bVal = b[historySortColumn];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (typeof aVal === "number" && typeof bVal === "number") {
      return historySortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }
    return historySortDirection === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  // ===== Effects =====
  useEffect(() => {
    (async () => {
      await fetchLive();
    })();
    const interval = setInterval(fetchLive, 300_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, range, customStart, customEnd]);

  return (
    <div className="p-6">
      {/* ===== Tabs ===== */}
      <div className="flex gap-1 mb-6 border-b">
        <Link
          href="/live"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "live"
              ? "border-b-2 border-green-600 text-green-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Live Alerts
        </Link>
        <Link
          href="/live?tab=history"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "border-b-2 border-green-600 text-green-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Alert History
        </Link>
      </div>

      {/* ===== Live Alerts Tab ===== */}
      {activeTab === "live" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Live Alerts</h1>
              <p className="text-xs text-gray-500 mt-1">
                Dashboard refreshes automatically every 5 minutes.
                <br />
                Resolved alerts remain visible for 24 hours after resolution.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                Last updated: {liveLastUpdated}
              </span>
              <button
                onClick={exportLiveToCSV}
                className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg transition
                           bg-gradient-to-r from-[#00a859] to-[#d4af37]
                           hover:from-[#15b864] hover:to-[#e1bf4b]
                           shadow-sm shadow-green-700/30 flex items-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                  />
                </svg>
                Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-left text-xs uppercase font-semibold tracking-wider">
                <tr>
                  {[
                    "site_name",
                    "equipment_name",
                    "space_name",
                    "alert_type",
                    "trigger_value",
                    "last_recorded_value",
                    "status",
                    "start_time",
                    "end_time",
                    "duration",
                    "notification_count",
                  ].map((col) => (
                    <th
                      key={col}
                      className="py-3 px-3 cursor-pointer select-none hover:bg-gray-200"
                      onClick={() => handleLiveSort(col as SortColumn)}
                    >
                      {col
                        .replaceAll("_", " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                      {liveSortColumn === col && (
                        <span>{liveSortOrder === "asc" ? " ▲" : " ▼"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {sortedLiveRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-6 text-gray-500">
                      No active or recent alerts
                    </td>
                  </tr>
                )}

                {sortedLiveRows.map((row) => (
                  <tr
                    key={row.alert_id}
                    className={`border-t hover:bg-gray-50 ${
                      row.status === "resolved" ? "bg-green-50" : ""
                    }`}
                  >
                    <td className="py-2 px-3">{row.site_name}</td>
                    <td className="py-2 px-3">{row.equipment_name}</td>
                    <td className="py-2 px-3">{row.space_name}</td>
                    <td className="py-2 px-3">{row.alert_type}</td>
                    <td className="py-2 px-3">{row.trigger_value ?? "--"}</td>
                    <td className="py-2 px-3">{row.last_recorded_value ?? "--"}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          row.status === "active"
                            ? "bg-[#d4af37] text-white border border-[#d4af37]"
                            : "bg-[#00a859]/10 text-[#00a859] border border-[#00a859]/40"
                        }`}
                      >
                        {row.live_value_state || row.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 px-3">{formatDateTime(row.start_time)}</td>
                    <td className="py-2 px-3">{formatDateTime(row.end_time)}</td>
                    <td className="py-2 px-3">{formatDuration(row.duration)}</td>
                    <td className="py-2 px-3">{row.notification_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== Alert History Tab ===== */}
      {activeTab === "history" && (
        <>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
            <div>
              <h1 className="text-2xl font-bold">Alert History</h1>
              <p className="text-xs text-gray-500 mt-1">
                Historical log of all active and resolved alerts.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                Last updated: {historyLastUpdated}
              </span>
              <button
                onClick={exportHistoryToCSV}
                className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg transition
                           bg-gradient-to-r from-[#00a859] to-[#d4af37]
                           hover:from-[#15b864] hover:to-[#e1bf4b]
                           shadow-sm shadow-green-700/30 flex items-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                  />
                </svg>
                Export CSV
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="text-sm font-semibold">Time Range:</label>
            <select
              className="border rounded-md px-2 py-1 text-sm"
              value={range}
              onChange={(e) => setRange(e.target.value as RangeOption)}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>

            {range === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="border rounded-md px-2 py-1 text-sm"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <span className="text-sm">to</span>
                <input
                  type="date"
                  className="border rounded-md px-2 py-1 text-sm"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
                <button
                  onClick={fetchHistory}
                  className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-left text-xs uppercase font-semibold tracking-wider">
                <tr>
                  <th onClick={() => handleHistorySort("site_name")} className="py-3 px-3 cursor-pointer">
                    Site {historySortColumn === "site_name" && (historySortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleHistorySort("equipment_name")} className="py-3 px-3 cursor-pointer">
                    Equipment {historySortColumn === "equipment_name" && (historySortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleHistorySort("space_name")} className="py-3 px-3 cursor-pointer">
                    Space {historySortColumn === "space_name" && (historySortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleHistorySort("alert_type")} className="py-3 px-3 cursor-pointer">
                    Alert Type {historySortColumn === "alert_type" && (historySortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleHistorySort("status")} className="py-3 px-3 cursor-pointer">
                    Status {historySortColumn === "status" && (historySortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleHistorySort("start")} className="py-3 px-3 cursor-pointer">
                    Start {historySortColumn === "start" && (historySortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleHistorySort("end")} className="py-3 px-3 cursor-pointer">
                    End {historySortColumn === "end" && (historySortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleHistorySort("duration")} className="py-3 px-3 cursor-pointer">
                    Duration {historySortColumn === "duration" && (historySortDirection === "asc" ? "▲" : "▼")}
                  </th>
                  <th>Notifications</th>
                </tr>
              </thead>

              <tbody>
                {sortedHistoryLogs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-6 text-gray-500">
                      No logged alerts
                    </td>
                  </tr>
                )}

                {sortedHistoryLogs.map((row) => (
                  <tr
                    key={row.alert_id}
                    className={`border-t hover:bg-gray-50 ${
                      row.status === "resolved" ? "bg-green-50" : ""
                    }`}
                  >
                    <td className="py-2 px-3">{row.site_name}</td>
                    <td className="py-2 px-3">{row.equipment_name}</td>
                    <td className="py-2 px-3">{row.space_name}</td>
                    <td className="py-2 px-3">{row.alert_type}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          row.status === "active"
                            ? "bg-[#d4af37] text-white border border-[#d4af37]"
                            : "bg-[#00a859]/10 text-[#00a859] border border-[#00a859]/40"
                        }`}
                      >
                        {row.status === "active" ? "Active" : "Resolved"}
                      </span>
                    </td>
                    <td className="py-2 px-3">{formatDateTime(row.start)}</td>
                    <td className="py-2 px-3">{formatDateTime(row.end)}</td>
                    <td className="py-2 px-3">{formatHistoryDuration(row.duration)}</td>
                    <td className="py-2 px-3">{row.notification_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
