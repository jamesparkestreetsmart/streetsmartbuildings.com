"use client";

import { useState, useEffect, useCallback } from "react";

interface Activity {
  id: string;
  deal_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  type: string;
  subject: string | null;
  notes: string | null;
  outcome: string | null;
  activity_date: string;
  owner: string | null;
  created_at: string;
  contact_name: string | null;
  deal_name: string | null;
}

const TYPE_META: Record<string, { label: string; bg: string; text: string }> = {
  call:          { label: "Call",          bg: "bg-green-100",  text: "text-green-800" },
  email:         { label: "Email",        bg: "bg-green-50",   text: "text-green-700" },
  meeting:       { label: "Meeting",      bg: "bg-amber-100",  text: "text-amber-800" },
  note:          { label: "Note",         bg: "bg-stone-100",  text: "text-stone-600" },
  demo:          { label: "Demo",         bg: "bg-green-200",  text: "text-green-900" },
  proposal_sent: { label: "Proposal",     bg: "bg-amber-200",  text: "text-amber-900" },
  follow_up:     { label: "Follow-up",    bg: "bg-amber-100",  text: "text-amber-800" },
};

const OUTCOME_META: Record<string, { label: string; bg: string; text: string }> = {
  positive:            { label: "Positive",    bg: "bg-green-100",  text: "text-green-800" },
  neutral:             { label: "Neutral",     bg: "bg-stone-100",  text: "text-stone-600" },
  negative:            { label: "Negative",    bg: "bg-red-100",    text: "text-red-800" },
  no_answer:           { label: "No Answer",   bg: "bg-stone-100",  text: "text-stone-600" },
  scheduled_follow_up: { label: "Follow-up",   bg: "bg-amber-100",  text: "text-amber-800" },
};

function Badge({ value, meta }: { value: string; meta: Record<string, { label: string; bg: string; text: string }> }) {
  const m = meta[value] ?? { label: value, bg: "bg-stone-100", text: "text-stone-600" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
      {m.label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day;
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default function AdminActivitiesPanel() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/activities");
      const data = await res.json();
      if (data.activities) setActivities(data.activities);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const today = todayDateStr();
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisWeekCount = activities.filter((a) => new Date(a.activity_date) >= thisWeekStart).length;
  const lastWeekCount = activities.filter((a) => {
    const d = new Date(a.activity_date);
    return d >= lastWeekStart && d < thisWeekStart;
  }).length;

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading activities...</div>;

  return (
    <div className="space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Activities</h2>
          <p className="text-xs text-gray-400">
            {thisWeekCount} activit{thisWeekCount !== 1 ? "ies" : "y"} this week &middot; {lastWeekCount} last week
          </p>
        </div>
        <button onClick={fetchData} disabled={loading} className="px-4 py-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50">
          Refresh
        </button>
      </div>

      <div className="border rounded-lg overflow-auto bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 min-w-[250px]">Subject / Notes</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Contact</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Deal</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Outcome</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {activities.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No activities yet. Log calls, emails, and meetings to track engagement.</td></tr>
            ) : activities.map((a) => {
              const actDateStr = a.activity_date.slice(0, 10);
              const isToday = actDateStr === today;
              return (
                <tr key={a.id} className={`hover:bg-gray-50 ${isToday ? "border-l-4 border-l-green-500" : ""}`}>
                  <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{formatDate(a.activity_date)}</td>
                  <td className="px-3 py-2"><Badge value={a.type} meta={TYPE_META} /></td>
                  <td className="px-3 py-2">
                    {a.subject && <span className="font-medium">{a.subject}</span>}
                    {a.subject && a.notes && <span className="text-gray-400"> &mdash; </span>}
                    {a.notes && (
                      <span className="text-gray-500">
                        {(() => {
                          const combined = a.subject ? a.notes : a.notes;
                          const maxLen = a.subject ? 80 - a.subject.length : 80;
                          return combined.length > maxLen ? combined.slice(0, maxLen) + "\u2026" : combined;
                        })()}
                      </span>
                    )}
                    {!a.subject && !a.notes && "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{a.contact_name || "\u2014"}</td>
                  <td className="px-3 py-2 text-gray-600">{a.deal_name || "\u2014"}</td>
                  <td className="px-3 py-2">{a.outcome ? <Badge value={a.outcome} meta={OUTCOME_META} /> : "\u2014"}</td>
                  <td className="px-3 py-2 text-gray-600">{a.owner || "\u2014"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
