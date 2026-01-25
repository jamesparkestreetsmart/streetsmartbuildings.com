"use client";

import type { FutureException } from "./useFutureExceptions";

function formatHours(e: FutureException) {
  if (e.is_closed) return "Closed";
  if (e.open_time && e.close_time) return `${e.open_time} – ${e.close_time}`;
  return "Hours unchanged";
}

function formatDate(iso: string) {
  // iso is YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventType(eventType: string) {
  switch (eventType) {
    case "store_hours_schedule":
      return <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">Store Hours</span>;
    case "planned_maintenance":
      return <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">Maintenance</span>;
    case "hotel_occupancy":
      return <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800">Hotel</span>;
    default:
      return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800">{eventType}</span>;
  }
}

export default function UpcomingEventsTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: FutureException[];
  onEdit: (e: FutureException) => void;
  onDelete: (e: FutureException) => void;
}) {
  if (!rows.length) {
    return (
      <div className="border rounded p-3 text-sm text-gray-500">
        No upcoming events.
      </div>
    );
  }

  return (
    <div className="border rounded">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left">
            <th className="p-2">Type</th>
            <th className="p-2">Name</th>
            <th className="p-2">Date</th>
            <th className="p-2">Hours</th>
            <th className="p-2 text-right">Action</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((e) => (
            <tr key={e.event_id} className="border-t">
              <td className="p-2">{formatEventType(e.event_type)}</td>
              <td className="p-2">{e.event_name}</td>
              <td className="p-2">{formatDate(e.event_date)}</td>
              <td className="p-2">{formatHours(e)}</td>
              <td className="p-2 text-right space-x-2">
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => onEdit(e)}
                >
                  Edit
                </button>
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => onDelete(e)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
