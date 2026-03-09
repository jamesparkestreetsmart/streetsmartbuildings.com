"use client";

import React from "react";
import type { PastStoreHour } from "./usePastStoreHours";

function formatTime12(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatHoursSubtype(e: PastStoreHour): string {
  if (e.is_closed) return "Closed";
  if (e.open_time && e.close_time) return `${formatTime12(e.open_time)} to ${formatTime12(e.close_time)}`;
  return "Hours unchanged";
}

function formatDate(iso: string | null) {
  if (!iso) return "\u2014";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function TypeBadge({ isException, eventType }: { isException: boolean; eventType: string }) {
  if (!isException) {
    return <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">Base Hours</span>;
  }
  switch (eventType) {
    case "planned_maintenance":
      return <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">Maintenance</span>;
    case "hotel_occupancy":
      return <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800">Hotel</span>;
    default:
      return <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">Exception</span>;
  }
}

function ExceptionDetail({ row }: { row: PastStoreHour }) {
  const hours = formatHoursSubtype(row);
  const name = row.name;
  if (name) {
    return <span className="text-gray-700">{hours} <span className="text-gray-400">&mdash; {name}</span></span>;
  }
  return <span className="text-gray-700">{hours}</span>;
}

export function PastEventsTable({
  rows,
  commentsByDate,
  onCommentClick,
  timezone,
}: {
  rows: PastStoreHour[];
  commentsByDate?: Map<string, any[]>;
  onCommentClick?: (date: string, dateLabel: string) => void;
  timezone?: string;
}) {
  // Deduplicate: one effective row per date. Exception wins over base.
  const byDate = new Map<string, PastStoreHour>();
  for (const row of rows) {
    const existing = byDate.get(row.occurrence_date);
    if (!existing) {
      byDate.set(row.occurrence_date, row);
    } else {
      // Exception (has event_id) takes precedence over base
      if (row.event_id && !existing.event_id) {
        byDate.set(row.occurrence_date, row);
      }
    }
  }
  const dedupedRows = [...byDate.values()];

  return (
    <div className="border rounded bg-green-50">
      <div className="p-3 font-semibold text-green-900">
        {(() => {
          const tz = timezone || "America/Chicago";
          const y = parseInt(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric" }).format(new Date()), 10);
          return `Past Events \u2014 ${y} & ${y - 1}`;
        })()}
      </div>
      <p className="px-3 pb-2 text-xs text-gray-500 italic">
        Exceptions override base schedule for their effective date.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-t border-green-200">
            <th className="p-2">Type</th>
            <th className="p-2">Name / Hours</th>
            <th className="p-2">Date</th>
            <th className="p-2">💬</th>
          </tr>
        </thead>

        <tbody>
          {dedupedRows.length === 0 ? (
            <tr className="border-t border-green-200">
              <td className="p-2 text-gray-500" colSpan={4}>
                No past events.
              </td>
            </tr>
          ) : (
            dedupedRows.map((e, idx) => {
              const dateComments = commentsByDate?.get(e.occurrence_date) || [];
              const isException = !!e.event_id;
              return (
                <React.Fragment key={e.occurrence_id ?? idx}>
                  <tr className="border-t border-green-200">
                    <td className="p-2">
                      <TypeBadge isException={isException} eventType={e.event_type} />
                    </td>
                    <td className="p-2">
                      {isException ? (
                        <ExceptionDetail row={e} />
                      ) : (
                        <span className="text-gray-700">{formatHoursSubtype(e)}</span>
                      )}
                    </td>
                    <td className="p-2">{formatDate(e.occurrence_date)}</td>
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
                      <td colSpan={4} className="px-4 py-1 bg-yellow-50 border-b border-green-200">
                        {dateComments.map((c: any) => (
                          <div key={c.id} className="text-xs text-gray-600 py-0.5">
                            <span className="text-gray-400 mr-1">💬</span>
                            {c.message}
                            <span className="text-gray-400 ml-2">
                              &mdash; {c.created_by},{" "}
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
