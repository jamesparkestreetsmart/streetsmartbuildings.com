//app/journey/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface RecordLog {
  id: number;
  org_id: string;
  event_type: string;
  source: string;
  message: string;
  metadata: Record<string, any>;
  created_by: string | null;
  created_by_user: string | null;
  created_at: string;
  event_date: string;
}

export default function JourneyPage() {
  const [records, setRecords] = useState<RecordLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const { data: orgData } = await supabase
        .from("a_organizations")
        .select("org_id")
        .limit(1)
        .single();

      if (orgData) {
        const { data: recordsData, error } = await supabase
          .from("b_records_log")
          .select("*")
          .eq("org_id", orgData.org_id)
          .is("site_id", null)
          .is("equipment_id", null)
          .is("device_id", null)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          console.error("Error fetching records:", error);
        } else {
          setRecords(recordsData || []);
        }
      }

      setLoading(false);
    }

    fetchData();
  }, []);

  return (
    <div className="p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-[#00a859] to-[#e0b53f] bg-clip-text text-transparent mb-2 drop-shadow-[0_0_6px_rgba(224,181,63,0.45)]">
          My Journey
        </h1>
        <p className="text-gray-600 text-sm max-w-2xl mx-auto">
          To be filled out on an annual basis as Eagle Eyes reviews{" "}
          <span className="font-semibold text-gray-800">
            customer savings, efficiency gains, and productivity data
          </span>{" "}
          — tracking your building's evolution toward smarter, leaner operations.
        </p>
      </div>

      {/* Organization Activity Log */}
      <div className="border rounded-lg bg-white shadow-sm max-w-5xl mx-auto">
        <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg">
          <h3 className="text-lg font-semibold text-gray-900">Organization Activity</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {records.length} event{records.length !== 1 ? "s" : ""} recorded
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-gray-400 p-4">Loading…</div>
          ) : records.length === 0 ? (
            <div className="text-sm text-gray-400 border rounded p-4 text-center">
              No organization activity recorded yet. Events will appear here as your team uses the platform.
            </div>
          ) : (
            <div className="border rounded overflow-hidden max-h-[500px] overflow-y-auto">
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
                            : record.event_type.includes("invited")
                            ? "bg-blue-100 text-blue-700"
                            : record.event_type.includes("updated") || record.event_type.includes("config")
                            ? "bg-purple-100 text-purple-700"
                            : record.event_type.includes("retired") || record.event_type.includes("failed")
                            ? "bg-red-100 text-red-700"
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
      </div>

      <div className="mt-8 text-center text-gray-400 italic">
        (Coming soon — annual insights, progress dashboards, and sustainability benchmarks.)
      </div>
    </div>
  );
}
