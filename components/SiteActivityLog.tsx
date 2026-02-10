"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface RecordLog {
  id: number;
  org_id: string;
  site_id: string | null;
  equipment_id: string | null;
  device_id: string | null;
  event_type: string;
  source: string;
  message: string;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
}

export default function SiteActivityLog({ siteId }: { siteId: string }) {
  const [records, setRecords] = useState<RecordLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      const { data, error } = await supabase
        .from("b_records_log")
        .select("*")
        .eq("site_id", siteId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("Error fetching site activity:", error);
      } else {
        setRecords(data || []);
      }
      setLoading(false);
    }

    fetchLogs();
  }, [siteId]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Activity Log</h2>
      <p className="text-sm text-gray-500 mb-4">
        {records.length} event{records.length !== 1 ? "s" : ""} recorded for this site
      </p>

      {loading ? (
        <div className="text-sm text-gray-400 p-4">Loading…</div>
      ) : records.length === 0 ? (
        <div className="text-sm text-gray-400 border rounded p-6 text-center bg-white">
          No activity recorded for this site yet. Events will appear here as changes are made.
        </div>
      ) : (
        <div className="border rounded overflow-hidden bg-white max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Event Type</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Message</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Created By</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                    {new Date(record.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      record.event_type.includes("created") || record.event_type.includes("joined")
                        ? "bg-green-100 text-green-700"
                        : record.event_type.includes("retired") || record.event_type.includes("failed")
                        ? "bg-red-100 text-red-700"
                        : record.event_type.includes("updated") || record.event_type.includes("edit")
                        ? "bg-purple-100 text-purple-700"
                        : record.event_type.includes("restored")
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {record.event_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">
                    {record.source}
                  </td>
                  <td className="px-3 py-2 text-gray-700 text-xs max-w-[400px] truncate" title={record.message}>
                    {record.message}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                    {record.created_by || "system"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
