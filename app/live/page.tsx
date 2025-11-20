"use client";

import { useEffect, useState } from "react";
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

type SortColumn = keyof LiveAlert;
type SortOrder = "asc" | "desc";

export default function LiveAlertsPage() {
  const [rows, setRows] = useState<LiveAlert[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("start_time");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

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

  const fetchLive = async () => {
    const { data, error } = await supabase
      .from("view_live_alerts")
      .select("*")
      .order("start_time", { ascending: false });

    if (!error) {
      setRows((data as any[]) || []);
      setLastUpdated(formatCST(new Date()));
    } else {
      console.error("fetch live failed", error);
    }
  };

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 300_000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (duration: any) => {
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

  const exportToCSV = () => {
    if (rows.length === 0) return;
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
    const csvRows = rows.map((r) => [
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

  // 🧩 Sorting logic
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (typeof aVal === "number" && typeof bVal === "number")
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    return sortOrder === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  return (
    <div className="p-6">
      {/* ===== Header ===== */}
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

      {/* ===== Alerts Table ===== */}
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
                  onClick={() => handleSort(col as SortColumn)}
                >
                  {col
                    .replaceAll("_", " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                  {sortColumn === col && (
                    <span>{sortOrder === "asc" ? " ▲" : " ▼"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-6 text-gray-500">
                  ✅ No active or recent alerts
                </td>
              </tr>
            )}

            {sortedRows.map((row) => (
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
    </div>
  );
}
