"use client";

import { FutureException } from "./useFutureExceptions";

interface FutureExceptionsTableProps {
  title: string;
  exceptions: FutureException[];
  readOnly?: boolean;
  onEdit?: (exception: FutureException) => void;
  onDelete?: (exception: FutureException) => void;
}

function formatDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDayOfWeek(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
  }).format(date);
}

function formatTime(timeStr: string | null) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function FutureExceptionsTable({
  title,
  exceptions,
  readOnly = false,
  onEdit,
  onDelete,
}: FutureExceptionsTableProps) {
  if (!exceptions.length) {
    return (
      <div className="border rounded p-4 bg-white">
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-500">No exceptions</p>
      </div>
    );
  }

  return (
    <div className="border rounded bg-white">
      <div className="p-4 border-b">
        <h3 className="font-semibold">{title}</h3>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="p-2 text-left">Name</th>
            <th className="p-2">Date</th>
            <th className="p-2">Hours</th>
            <th className="p-2">Status</th>
            {!readOnly && (onEdit || onDelete) && (
              <th className="p-2 text-right">Action</th>
            )}
          </tr>
        </thead>

        <tbody>
          {exceptions.map((ex) => {
            const hoursLabel = ex.is_closed
              ? "Closed"
              : `${formatTime(ex.open_time)} – ${formatTime(ex.close_time)}`;

            const isRecurring = Boolean(ex.source_rule?.recurrence_rule);

            return (
              <tr key={ex.exception_id} className="border-b last:border-b-0">
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <span>{ex.name}</span>
                    {isRecurring && <span className="text-xs">🔁</span>}
                  </div>
                </td>

                <td className="p-2 text-center">
                  <div>{formatDate(ex.event_date)}</div>
                  <div className="text-xs text-gray-500">
                    {formatDayOfWeek(ex.event_date)}
                  </div>
                </td>

                <td className="p-2 text-center">{hoursLabel}</td>

                <td className="p-2 text-center">
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-green-200 text-green-900">
                    Upcoming
                  </span>
                </td>

                {!readOnly && (onEdit || onDelete) && (
                  <td className="p-2 text-right space-x-3">
                    {onEdit && (
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => onEdit(ex)}
                      >
                        Edit
                      </button>
                    )}

                    {onDelete && (
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          const ok = confirm(
                            `Delete "${ex.name}" on ${ex.event_date}?`
                          );
                          if (ok) onDelete(ex);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
