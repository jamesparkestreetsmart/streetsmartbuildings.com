// app/page.tsx (or wherever your Live page is)
"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type LiveAlert = {
  id: number;
  site_id: string | null;         // hidden in UI
  site_name: string;
  equipment_name: string;
  space_name: string;
  alert_type: string;
  notification_count: number;
  latest_value: number | null;
  status: "active" | "resolved";
  start_time: string;
  end_time: string | null;
  duration: string | null;        // interval text if you SELECT duration::text
};

export default function LiveAlertsPage() {
  const [rows, setRows] = useState<LiveAlert[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const formatCST = (d: Date) =>
    d.toLocaleString("en-US", { timeZone: "America/Chicago", hour12: true, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  const fetchLive = async () => {
    const { data, error } = await supabase
      .from("live_alerts_view")
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
    const t = setInterval(fetchLive, 60_000);
    return () => clearInterval(t);
  }, []);

  // ...render a table with columns:
  // Site, Equipment, Space, Alert Type, Latest Value, Status, Start, (End if resolved), Duration, Notifications
  return (
  <div className="p-6">
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-2xl font-bold">Live Alerts</h1>
      <span className="text-sm text-gray-500">Last updated: {lastUpdated}</span>
    </div>

    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-100 text-left text-xs uppercase font-semibold tracking-wider">
          <tr>
            <th className="py-3 px-3">Site</th>
            <th className="py-3 px-3">Equipment</th>
            <th className="py-3 px-3">Space</th>
            <th className="py-3 px-3">Alert</th>
            <th className="py-3 px-3">Latest Value</th>
            <th className="py-3 px-3">Status</th>
            <th className="py-3 px-3">Start</th>
            <th className="py-3 px-3">End</th>
            <th className="py-3 px-3">Duration</th>
            <th className="py-3 px-3">Notifications</th>
          </tr>
        </thead>
        
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="text-center py-6 text-gray-500">
                ✅ No active alerts
              </td>
            </tr>
          )}

          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-t hover:bg-gray-50"
            >
              <td className="py-2 px-3">{row.site_name}</td>
              <td className="py-2 px-3">{row.equipment_name}</td>
              <td className="py-2 px-3">{row.space_name}</td>
              <td className="py-2 px-3">{row.alert_type}</td>

              <td className="py-2 px-3">
                {row.latest_value !== null ? `${row.latest_value}` : "--"}
              </td>

              <td className="py-2 px-3">
                <span
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    row.status === "active"
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {row.status.toUpperCase()}
                </span>
              </td>

              <td className="py-2 px-3">
                {formatCST(new Date(row.start_time))}
              </td>

              <td className="py-2 px-3">
                {row.end_time ? formatCST(new Date(row.end_time)) : "--"}
              </td>

              <td className="py-2 px-3">{row.duration ?? "--"}</td>
              <td className="py-2 px-3">{row.notification_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
;
}









