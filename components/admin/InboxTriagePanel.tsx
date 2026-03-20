"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

interface TriageRow {
  triage_id: string;
  gmail_message_id: string;
  gmail_thread_id?: string;
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

type InboxStatus = "new" | "in_progress" | "waiting" | "done" | "ignored";

const STATUS_OPTIONS: InboxStatus[] = ["new", "in_progress", "waiting", "done", "ignored"];

const STATUS_META: Record<InboxStatus, { label: string; bg: string; text: string; dot: string }> = {
  new:         { label: "New",         bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
  in_progress: { label: "In Progress", bg: "bg-blue-100",   text: "text-blue-800",   dot: "bg-blue-500" },
  waiting:     { label: "Waiting",     bg: "bg-amber-100",  text: "text-amber-800",  dot: "bg-amber-500" },
  done:        { label: "Done",        bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-500" },
  ignored:     { label: "Ignored",     bg: "bg-gray-100",   text: "text-gray-500",   dot: "bg-gray-300" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status as InboxStatus] ?? STATUS_META.new;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

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

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isOverdue(row: TriageRow): boolean {
  if (!row.next_event_date) return false;
  if (row.status === "done" || row.status === "ignored") return false;
  return row.next_event_date < todayDateStr();
}

function isDimmed(row: TriageRow): boolean {
  return row.status === "done" || row.status === "ignored";
}

export default function InboxTriagePanel() {
  const [rows, setRows] = useState<TriageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNextSteps, setEditingNextSteps] = useState<string | null>(null);
  const [nextStepsValue, setNextStepsValue] = useState("");

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

  const saveNextSteps = async (triageId: string) => {
    const trimmed = nextStepsValue.trim() || null;
    const current = rows.find((r) => r.triage_id === triageId)?.next_steps || null;
    setEditingNextSteps(null);
    if (trimmed !== current) {
      await patchRow(triageId, "next_steps", trimmed);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/inbox/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      showToast("Inbox synced successfully", "success");
      await fetchData();
    } catch {
      showToast("Sync failed \u2014 check edge function logs", "error");
    } finally {
      setSyncing(false);
    }
  };

  const toggleExpanded = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setEditingNextSteps(null);
    } else {
      setExpandedId(id);
      setEditingNextSteps(null);
    }
  };

  // KPI count
  const td = todayDateStr();
  const needsAttentionCount = rows.filter((r) => {
    if (r.status === "done" || r.status === "ignored") return false;
    if (r.is_unread) return true;
    if (r.next_event_date && r.next_event_date < td) return true;
    return false;
  }).length;

  const activeCount = rows.filter((r) => r.status !== "done" && r.status !== "ignored").length;

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

      {/* KPI indicator + Sync Button */}
      <div className="flex items-center gap-4">
        {activeCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-red-100 text-red-800">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {activeCount} open
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-green-100 text-green-800">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            All clear
          </span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Inbox"}
        </button>
        <span className="text-xs text-gray-400">
          {rows.length} message{rows.length !== 1 ? "s" : ""}
        </span>
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
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <Fragment key={row.triage_id}>
                <tr
                  className={`hover:bg-gray-50 cursor-pointer ${
                    isDimmed(row)
                      ? "opacity-50"
                      : isOverdue(row)
                      ? "bg-amber-50"
                      : ""
                  }`}
                  onClick={() => toggleExpanded(row.triage_id)}
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
                    <div className="font-medium">{row.sender_name || row.sender_email}</div>
                    {row.sender_name && (
                      <div className="text-xs text-gray-400">{row.sender_email}</div>
                    )}
                  </td>

                  {/* Subject */}
                  <td className="px-3 py-2">
                    <div className={`font-medium ${row.is_unread && !isDimmed(row) ? "font-bold" : ""}`}>
                      {row.subject}
                    </div>
                    {row.snippet && (
                      <div className="text-xs text-gray-400 truncate max-w-[350px]">
                        {row.snippet.length > 100 ? row.snippet.slice(0, 100) + "\u2026" : row.snippet}
                      </div>
                    )}
                  </td>

                  {/* Assigned To */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <InlineText
                      value={row.assigned_to}
                      onSave={(v) => patchRow(row.triage_id, "assigned_to", v)}
                    />
                  </td>

                  {/* Next Steps */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {editingNextSteps === row.triage_id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="text"
                          value={nextStepsValue}
                          onChange={(e) => setNextStepsValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNextSteps(row.triage_id);
                            if (e.key === "Escape") setEditingNextSteps(null);
                          }}
                          onBlur={() => saveNextSteps(row.triage_id)}
                          className="flex-1 border rounded px-2 py-1 text-sm"
                        />
                      </div>
                    ) : (
                      <span
                        onClick={() => {
                          setEditingNextSteps(row.triage_id);
                          setNextStepsValue(row.next_steps ?? "");
                        }}
                        className="cursor-text hover:bg-gray-100 rounded px-1 py-0.5 min-w-[60px] inline-block text-sm"
                      >
                        {row.next_steps || <span className="text-gray-300 italic">click to add...</span>}
                      </span>
                    )}
                  </td>

                  {/* Next Event */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="date"
                      value={row.next_event_date || ""}
                      onChange={(e) =>
                        patchRow(row.triage_id, "next_event_date", e.target.value || null)
                      }
                      className="border rounded px-2 py-1 text-sm w-[130px]"
                    />
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={row.status}
                      onChange={(e) => patchRow(row.triage_id, "status", e.target.value)}
                      className="border rounded px-2 py-1 text-sm bg-white"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Expand toggle */}
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs text-gray-400">
                      {expandedId === row.triage_id ? "\u25B2" : "\u25BC"}
                    </span>
                  </td>
                </tr>

                {/* Expanded detail row */}
                {expandedId === row.triage_id && (
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={8} className="px-6 py-4">
                      <div className="flex items-start gap-4">
                        <StatusBadge status={row.status} />
                        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                          {row.gmail_thread_id && (
                            <>
                              <span className="font-semibold text-gray-400">Thread ID</span>
                              <span className="font-mono text-gray-700">{row.gmail_thread_id}</span>
                            </>
                          )}
                          <span className="font-semibold text-gray-400">Message ID</span>
                          <span className="font-mono text-gray-700">{row.gmail_message_id}</span>
                          {row.next_event_date && (
                            <>
                              <span className="font-semibold text-gray-400">Follow-up Date</span>
                              <span className={row.next_event_date < todayDateStr() ? "text-red-500 font-semibold" : "text-gray-700"}>
                                {row.next_event_date}
                                {row.next_event_date < todayDateStr() && " \u26A0 Past due"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
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
      {value || <span className="text-gray-300 italic">click to edit</span>}
    </span>
  );
}
