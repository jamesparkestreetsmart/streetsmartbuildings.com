"use client";

import { ChangeLogEntry } from "./useStoreHoursChangeLog";

interface Props {
  entries: ChangeLogEntry[];
  loading: boolean;
  error: string | null;
}

export default function StoreHoursChangeLog({ entries, loading, error }: Props) {
  if (loading) {
    return (
      <div className="border rounded bg-gray-50 p-4 text-sm text-gray-400">
        Loading change log...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded bg-red-50 p-4 text-sm text-red-600">
        Failed to load change log: {error}
      </div>
    );
  }

  return (
    <div className="border rounded bg-white shadow-sm">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Change Log</h3>
        <span className="text-xs text-gray-400">{entries.length} entries</span>
      </div>

      <div className="max-h-[800px] overflow-y-auto">
        {entries.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">
            No changes recorded yet.
          </div>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <ChangeLogRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChangeLogRow({ entry }: { entry: ChangeLogEntry }) {
  const badgeStyles: Record<string, string> = {
    created: "bg-green-100 text-green-700",
    insert: "bg-green-100 text-green-700",
    edited: "bg-purple-100 text-purple-700",
    update: "bg-purple-100 text-purple-700",
    deleted: "bg-red-100 text-red-700",
    delete: "bg-red-100 text-red-700",
    comment: "bg-yellow-100 text-yellow-700",
  };

  const badge = badgeStyles[entry.action] || "bg-gray-100 text-gray-600";
  const sourceIcon = entry.source === "base_hours" ? "\u{1F554}" : entry.source === "comment" ? "\u{1F4AC}" : "\u{1F4CB}";

  const timeStr = new Date(entry.timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="px-4 py-3 hover:bg-gray-50">
      <div className="flex items-start gap-2">
        <span className="text-sm mt-0.5">{sourceIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}
            >
              {entry.action}
            </span>
            <span className="text-xs text-gray-400">{timeStr}</span>
          </div>
          <p className="text-sm text-gray-700 leading-snug">{entry.message}</p>
          {entry.changed_by &&
            entry.changed_by !== "system" &&
            entry.changed_by !== "unknown" && (
              <p className="text-xs text-gray-400 mt-1">
                by {entry.changed_by}
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
