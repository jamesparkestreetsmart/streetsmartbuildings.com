"use client";

/* ======================================================
   Types
====================================================== */

export interface ExceptionOccurrence {
  occurrence_id: string;
  exception_id: string;
  site_id: string;
  name: string;
  date: string; // YYYY-MM-DD
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  is_recurring: boolean;
  source_rule?: {
    recurrence_rule?: any;
    effective_from_date?: string;
    is_recurring?: boolean;
  };
}

interface ExceptionTableProps {
  title: string;
  exceptions: ExceptionOccurrence[];
  readOnly?: boolean;
  onEdit?: (exception: ExceptionOccurrence) => void;
  onDelete?: (exception: ExceptionOccurrence) => void; // ✅ NEW
}

/* ======================================================
   Formatting helpers
====================================================== */

function formatDate(dateStr: string) {
  if (!dateStr) return "—";

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
  const date = new Date();
  date.setHours(h, m, 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/* ======================================================
   Component
====================================================== */

export default function ExceptionTable({
  title,
  exceptions,
  readOnly = false,
  onEdit,
  onDelete,
}: ExceptionTableProps) {
  if (!exceptions || exceptions.length === 0) {
    return (
      <div className="border rounded p-4 bg-white">
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-500">No exceptions</p>
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);

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
          {exceptions.map((ex, index) => {
            const isPast = ex.date < todayStr;

            const hoursLabel = ex.is_closed
              ? "Closed"
              : `${formatTime(ex.open_time)} – ${formatTime(ex.close_time)}`;

            return (
              <tr
                key={ex.occurrence_id}
                className="border-b last:border-b-0"
              >
                {/* NAME */}
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <span>{ex.name}</span>
                    {ex.is_recurring && (
                      <span title="Recurring exception" className="text-xs">
                        🔁
                      </span>
                    )}
                  </div>
                </td>

                {/* DATE */}
                <td className="p-2 text-center">
                  <div>{formatDate(ex.date)}</div>
                  <div className="text-xs text-gray-500">
                    {formatDayOfWeek(ex.date)}
                  </div>
                </td>

                {/* HOURS */}
                <td className="p-2 text-center">{hoursLabel}</td>

                {/* STATUS */}
                <td className="p-2 text-center">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      isPast
                        ? "bg-yellow-200 text-yellow-900"
                        : "bg-green-200 text-green-900"
                    }`}
                  >
                    {isPast ? "Past" : "Upcoming"}
                  </span>
                </td>

                {/* ACTIONS */}
                {!readOnly && (onEdit || onDelete) && (
                  <td className="p-2 text-right space-x-3">
                    {!isPast && onEdit && (
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => onEdit(ex)}
                      >
                        Edit
                      </button>
                    )}

                    {!isPast && onDelete && (
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          const ok = confirm(
                            `Delete "${ex.name}" on ${ex.date}?\n\nThis cannot be undone.`
                          );
                          if (ok) onDelete(ex);
                        }}
                      >
                        Delete
                      </button>
                    )}

                    {isPast && (
                      <span className="text-gray-400 text-xs">Locked</span>
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
