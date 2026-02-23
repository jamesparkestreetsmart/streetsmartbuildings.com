"use client";

import { X } from "lucide-react";
import { DailyHealthRow } from "@/lib/daily-health";

interface SiteInfo {
  site_id: string;
  site_name: string;
}

interface Props {
  date: string;
  rows: DailyHealthRow[];
  sites: SiteInfo[];
  onSiteClick: (siteId: string) => void;
  onClose: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  green: "bg-green-100 text-green-700",
  yellow: "bg-yellow-100 text-yellow-700",
  red: "bg-red-100 text-red-700",
  no_data: "bg-gray-100 text-gray-500",
};

export default function TrustDayDetail({ date, rows, sites, onSiteClick, onClose }: Props) {
  const siteMap = new Map(sites.map((s) => [s.site_id, s.site_name]));

  const formatted = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="border rounded-lg bg-white shadow-sm mt-4">
      <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Day Detail</h3>
          <p className="text-xs text-gray-500">{formatted}</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-400">
          No health data for this date.
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Site</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Score</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr
                  key={row.site_id}
                  onClick={() => onSiteClick(row.site_id)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2 text-gray-800 font-medium">
                    {siteMap.get(row.site_id) || row.site_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[row.overall_status]}`}>
                      {row.overall_status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-gray-700">{row.score}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {row.critical_failure_reason || (row.sla_breach ? "SLA breach" : row.sla_warning ? "SLA warning" : "—")}
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
