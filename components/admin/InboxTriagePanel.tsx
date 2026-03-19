"use client";

import { useState, useEffect, useCallback } from "react";

interface TriageRow {
  triage_id: string;
  gmail_message_id: string;
  sender_email: string;
  sender_name: string;
  subject: string;
  snippet: string;
  received_at: string;
  is_unread: boolean;
  assigned_to: string | null;
  next_steps: string | null;
  next_event_date: string | null;
  status: string;
}

const STATUS_OPTIONS = ["new", "in_progress", "waiting", "done", "ignored"] as const;

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isOverdue(row: TriageRow): boolean {
  if (!row.next_event_date) return false;
  if (row.status === "done" || row.status === "ignored") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(row.next_event_date) < today;
}

function isDimmed(row: TriageRow): boolean {
  return row.status === "done" || row.status === "ignored";
}

export default function InboxTriagePanel() {
  const [rows, setRows] = useState<TriageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/inbox");
      const data = await res.json();
      if (data.rows) setRows(data.rows);
    } catch {
      showToast("Failed to load inbox data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const patchRow = async (triageId: string, field: string, value: string | null) => {
    try {
      const res = await fetch("/api/admin/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triage_id: triageId, [field]: value }),
      });
      if (!res.ok) throw new Error("PATCH failed");
      await fetchData();
    } catch {
      showToast("Failed to save change", "error");
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gmail-inbox-sync`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (!res.ok) throw new Error("Sync failed");
      showToast("Inbox synced successfully", "success");
      await fetchData();
    } catch {
      showToast("Sync failed — check edge function logs", "error");
    } finally {
      setSyncing(false);
    }
  };

  // KPI count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const needsAttentionCount = rows.filter((r) => {
    if (r.status === "done" || r.status === "ignored") return false;
    if (r.is_unread) return true;
    if (r.next_event_date && new Date(r.next_event_date) < today) return true;
    return false;
  }).length;

  if (loading) {
    return <div className="text-sm text-gray-500 py-8 text-center">Loading inbox...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* KPI Badge + Sync Button */}
      <div className="flex items-center gap-4">
        <div
          className={`px-5 py-3 rounded-lg text-white font-semibold text-lg ${
            needsAttentionCount > 0 ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {needsAttentionCount > 0
            ? `${needsAttentionCount} need attention`
            : "All clear"}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Inbox"}
        </button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Received</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">From</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 min-w-[250px]">Subject</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Assigned To</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 min-w-[200px]">Next Steps</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Next Event</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr
                key={row.triage_id}
                className={`hover:bg-gray-50 ${
                  isDimmed(row)
                    ? "opacity-50"
                    : isOverdue(row)
                    ? "bg-amber-50"
                    : ""
                }`}
              >
                {/* Received */}
                <td
                  className={`px-3 py-2 whitespace-nowrap ${
                    row.is_unread && !isDimmed(row) ? "border-l-4 border-l-red-500" : ""
                  }`}
                  title={new Date(row.received_at).toLocaleString()}
                >
                  <span className={row.is_unread && !isDimmed(row) ? "text-red-600 font-semibold" : ""}>
                    {relativeTime(row.received_at)}
                  </span>
                </td>

                {/* From */}
                <td className="px-3 py-2">
                  <div className="font-medium">{row.sender_name || "\u2014"}</div>
                  <div className="text-xs text-gray-400">{row.sender_email}</div>
                </td>

                {/* Subject */}
                <td className="px-3 py-2">
                  <div className="font-medium">{row.subject}</div>
                  <div className="text-xs text-gray-400 truncate max-w-[350px]">{row.snippet}</div>
                </td>

                {/* Assigned To — inline editable */}
                <td className="px-3 py-2">
                  <InlineText
                    value={row.assigned_to}
                    onSave={(v) => patchRow(row.triage_id, "assigned_to", v)}
                  />
                </td>

                {/* Next Steps — inline editable */}
                <td className="px-3 py-2">
                  <InlineText
                    value={row.next_steps}
                    onSave={(v) => patchRow(row.triage_id, "next_steps", v)}
                  />
                </td>

                {/* Next Event — date picker */}
                <td className="px-3 py-2">
                  <input
                    type="date"
                    value={row.next_event_date || ""}
                    onChange={(e) =>
                      patchRow(row.triage_id, "next_event_date", e.target.value || null)
                    }
                    className="border rounded px-2 py-1 text-sm w-[130px]"
                  />
                </td>

                {/* Status — dropdown */}
                <td className="px-3 py-2">
                  <select
                    value={row.status}
                    onChange={(e) => patchRow(row.triage_id, "status", e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  No emails found. Click &quot;Sync Inbox&quot; to pull in messages.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Inline editable text field ── */
function InlineText({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim() || null;
    if (trimmed !== (value || null)) {
      onSave(trimmed);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value || "");
            setEditing(false);
          }
        }}
        className="w-full border rounded px-2 py-1 text-sm"
      />
    );
  }

  return (
    <span
      onClick={() => {
        setDraft(value || "");
        setEditing(true);
      }}
      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 min-w-[60px] inline-block"
    >
      {value || <span className="text-gray-300">\u2014</span>}
    </span>
  );
}
