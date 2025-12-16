"use client";

export interface ExceptionRow {
  exception_id: string;
  name: string;
  resolved_date: string; // YYYY-MM-DD
  day_of_week: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;

  source_rule?: {
    is_recurring: boolean;
  };

  ui_state?: {
    is_past: boolean;
  };
}

interface ExceptionTableProps {
  title: string;
  exceptions: ExceptionRow[];
  readOnly?: boolean;
  onEdit?: (exception: ExceptionRow) => void;
}

export default function ExceptionTable({
  title,
  exceptions,
  readOnly = false,
  onEdit,
}: ExceptionTableProps) {
  if (!exceptions || exceptions.length === 0) {
    return (
      <div className="border rounded p-4 bg-white">
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-500">
          No exceptions
        </p>
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
            {!readOnly && onEdit && (
              <th className="p-2 text-right">Action</th>
            )}
          </tr>
        </thead>

        <tbody>
          {exceptions.map((ex) => {
            const isPast =
              ex.ui_state?.is_past ?? false;

            return (
              <tr
                key={`${ex.exception_id}-${ex.resolved_date}`}
                className="border-b last:border-b-0"
              >
                {/* NAME */}
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <span>{ex.name}</span>
                    {ex.source_rule?.is_recurring && (
                      <span
                        title="Recurring exception"
                        className="text-xs"
                      >
                        🔁
                      </span>
                    )}
                  </div>
                </td>

                {/* DATE */}
                <td className="p-2 text-center">
                  <div>{ex.resolved_date}</div>
                  <div className="text-xs text-gray-500">
                    {ex.day_of_week}
                  </div>
                </td>

                {/* HOURS */}
                <td className="p-2 text-center">
                  {ex.is_closed
                    ? "Closed"
                    : `${ex.open_time} – ${ex.close_time}`}
                </td>

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

                {/* ACTION */}
                {!readOnly && onEdit && (
                  <td className="p-2 text-right">
                    {!isPast ? (
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => onEdit(ex)}
                      >
                        Edit
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">
                        Locked
                      </span>
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
