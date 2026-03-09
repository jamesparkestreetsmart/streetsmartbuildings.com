"use client";

import React from "react";
import type { FutureException } from "./useFutureExceptions";

function formatTime12(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatSubtype(e: FutureException) {
  const hours = e.is_closed
    ? "Closed"
    : e.open_time && e.close_time
    ? `${formatTime12(e.open_time)} to ${formatTime12(e.close_time)}`
    : "Hours unchanged";
  const name = e.event_name;
  if (name) {
    return <span>{hours} <span className="text-gray-400">&mdash; {name}</span></span>;
  }
  return <span>{hours}</span>;
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
      return <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">Exception</span>;
    case "planned_maintenance":
      return <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">Maintenance</span>;
    case "hotel_occupancy":
      return <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800">Hotel</span>;
    default:
      return <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">Exception</span>;
  }
}

export default function UpcomingEventsTable({
  rows,
  onEdit,
  onDelete,
  commentsByDate,
  onCommentClick,
}: {
  rows: FutureException[];
  onEdit: (e: FutureException) => void;
  onDelete: (e: FutureException) => void;
  commentsByDate?: Map<string, any[]>;
  onCommentClick?: (date: string, dateLabel: string) => void;
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
            <th className="p-2">Detail</th>
            <th className="p-2">Date</th>
            <th className="p-2">💬</th>
            <th className="p-2 text-right">Action</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((e, index) => {
            const dateComments = commentsByDate?.get(e.event_date) || [];
            const isLastRowForDate =
              index === rows.length - 1 || rows[index + 1].event_date !== e.event_date;

            return (
              <React.Fragment key={e.event_id}>
                <tr className="border-t">
                  <td className="p-2">{formatEventType(e.event_type)}</td>
                  <td className="p-2">{formatSubtype(e)}</td>
                  <td className="p-2">{formatDate(e.event_date)}</td>
                  <td className="p-2">
                    <button
                      onClick={() => onCommentClick?.(e.event_date, formatDate(e.event_date))}
                      className="text-gray-400 hover:text-green-600 relative"
                      title="Comments"
                    >
                      💬
                      {dateComments.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                          {dateComments.length}
                        </span>
                      )}
                    </button>
                  </td>
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
                {isLastRowForDate && dateComments.length > 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-1 bg-yellow-50 border-b">
                      {dateComments.map((c: any) => (
                        <div key={c.id} className="text-xs text-gray-600 py-0.5">
                          <span className="text-gray-400 mr-1">💬</span>
                          {c.message}
                          <span className="text-gray-400 ml-2">
                            — {c.created_by},{" "}
                            {new Date(c.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
