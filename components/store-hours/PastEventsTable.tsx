"use client";

import React from "react";
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

export function PastEventsTable({
  rows,
  commentsByDate,
  onCommentClick,
}: {
  rows: PastStoreHour[];
  commentsByDate?: Map<string, any[]>;
  onCommentClick?: (date: string, dateLabel: string) => void;
}) {
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
            <th className="p-2">💬</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr className="border-t border-green-200">
              <td className="p-2 text-gray-500" colSpan={5}>
                No past events.
              </td>
            </tr>
          ) : (
            rows.map((e, idx) => {
              const dateComments = commentsByDate?.get(e.occurrence_date) || [];
              return (
                <React.Fragment key={e.occurrence_id ?? idx}>
                  <tr className="border-t border-green-200">
                    <td className="p-2">{formatEventType(e.event_type)}</td>
                    <td className="p-2 text-green-900">{e.name ?? "—"}</td>
                    <td className="p-2">{formatDate(e.occurrence_date)}</td>
                    <td className="p-2">{formatHours(e)}</td>
                    <td className="p-2">
                      <button
                        onClick={() => onCommentClick?.(e.occurrence_date, formatDate(e.occurrence_date))}
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
                  </tr>
                  {dateComments.length > 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-1 bg-yellow-50 border-b border-green-200">
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
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
