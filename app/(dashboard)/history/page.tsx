"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

type RangeOption = "7" | "30" | "90" | "custom";

export default function AlertHistoryPage() {
  const [logs, setLogs] = useState<AlertHistoryRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [range, setRange] = useState<RangeOption>("30");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const [sortColumn, setSortColumn] = useState<keyof AlertHistoryRow>("start");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // 🕒 Format CST date/time
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

  // ⏱️ Date range logic
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

  // 📦 Fetch from Supabase view
  const fetchLogs = async () => {
    const { start, end } = getDateRange();
    if (range === "custom" && (!start || !end)) return;

    const { data, error } = await supabase
      .from("view_alert_history")
      .select("*")
      .gte("start", start)
      .lte("start", end)
      .order("start", { ascending: false });

    if (!error && data) {
      setLogs(data);
      setLastUpdated(formatCST(new Date()));
    } else {
      console.error("Error fetching alert history:", error);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchLogs();
    })();
  }, [range, customStart, customEnd]);

  // 🧮 Duration formatter
  const formatDuration = (duration: string | null) => {
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

  // 📁 Export to CSV
  const exportToCSV = () => {
    if (logs.length === 0) return;

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

    const csvRows = logs.map((r) => [
      r.site_name,
      r.equipment_name,
      r.space_name,
      r.alert_type,
      r.status,
      formatDateTime(r.start),
      formatDateTime(r.end),
      formatDuration(r.duration),
      r.notification_count ?? 0,
    ]);

    const csvContent =
      [header, ...csvRows].map((e) => e.join(",")).join("\n");

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

  // 🔽 Sorting logic
  const handleSort = (column: keyof AlertHistoryRow) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedLogs = [...logs].sort((a, b) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }
    return sortDirection === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  return (
    <div className="p-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alert History</h1>
          <p className="text-xs text-gray-500 mt-1">
            Historical log of all active and resolved alerts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Last updated: {lastUpdated}
          </span>
          <button
            onClick={exportToCSV}
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

      {/* ===== Date Range Controls ===== */}
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
              onClick={fetchLogs}
              className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ===== Table ===== */}
      <div className="overflow-x-auto border rounded-lg bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase font-semibold tracking-wider">
            <tr>
              <th onClick={() => handleSort("site_name")} className="py-3 px-3 cursor-pointer">
                Site {sortColumn === "site_name" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th onClick={() => handleSort("equipment_name")} className="py-3 px-3 cursor-pointer">
                Equipment {sortColumn === "equipment_name" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th onClick={() => handleSort("space_name")} className="py-3 px-3 cursor-pointer">
                Space {sortColumn === "space_name" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th onClick={() => handleSort("alert_type")} className="py-3 px-3 cursor-pointer">
                Alert Type {sortColumn === "alert_type" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th onClick={() => handleSort("status")} className="py-3 px-3 cursor-pointer">
                Status {sortColumn === "status" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th onClick={() => handleSort("start")} className="py-3 px-3 cursor-pointer">
                Start {sortColumn === "start" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th onClick={() => handleSort("end")} className="py-3 px-3 cursor-pointer">
                End {sortColumn === "end" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th onClick={() => handleSort("duration")} className="py-3 px-3 cursor-pointer">
                Duration {sortColumn === "duration" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th>Notifications</th>
            </tr>
          </thead>

          <tbody>
            {sortedLogs.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-gray-500">
                  No logged alerts
                </td>
              </tr>
            )}

            {sortedLogs.map((row) => (
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
                <td className="py-2 px-3">{formatDuration(row.duration)}</td>
                <td className="py-2 px-3">{row.notification_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
