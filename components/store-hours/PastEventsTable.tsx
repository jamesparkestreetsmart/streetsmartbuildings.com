"use client";

import type { PastStoreHour } from "./usePastStoreHours";

function formatHours(e: PastStoreHour) {
  if (e.is_closed) return "Closed";
  if (e.open_time && e.close_time) return `${e.open_time} – ${e.close_time}`;
  return "Hours unchanged";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventType(eventType: string) {
  switch (eventType) {
    case "store_hours":
      return <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">Store Hours</span>;
    case "planned_maintenance":
      return <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">Maintenance</span>;
    case "hotel_occupancy":
      return <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800">Hotel</span>;
  }
}

export function PastEventsTable({ rows }: { rows: PastStoreHour[] }) {
  return (
    <div className="border rounded bg-green-50">
      <div className="p-3 font-semibold text-green-900">Past Events</div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-t border-green-200">
            <th className="p-2">Type</th>
            <th className="p-2">Name</th>
            <th className="p-2">Date</th>
            <th className="p-2">Hours</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr className="border-t border-green-200">
              <td className="p-2 text-gray-500" colSpan={4}>
                No past events.
              </td>
            </tr>
          ) : (
            rows.map((e, idx) => (
              <tr key={e.occurrence_id ?? idx} className="border-t border-green-200">
                <td className="p-2">{formatEventType(e.event_type)}</td>
                <td className="p-2 text-green-900">{e.name ?? "—"}</td>
                <td className="p-2">{formatDate(e.occurrence_date)}</td>
                <td className="p-2">{formatHours(e)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
