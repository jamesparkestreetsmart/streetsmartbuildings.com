"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

interface DealOption { id: string; name: string; }
interface ContactOption { id: string; name: string; }

const TYPE_OPTIONS = ["call", "email", "meeting", "note", "demo", "proposal_sent", "follow_up"] as const;
const OUTCOME_OPTIONS = ["positive", "neutral", "negative", "no_answer", "scheduled_follow_up"] as const;

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

const EMPTY_FORM = { type: "call", activity_date: todayDateStr(), subject: "", deal_id: "", contact_id: "", outcome: "", owner: "", notes: "" };

export default function AdminActivitiesPanel() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [dealOptions, setDealOptions] = useState<DealOption[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

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

  const fetchOptions = useCallback(async () => {
    try {
      const [dealRes, contRes] = await Promise.all([
        fetch("/api/admin/deals"),
        fetch("/api/admin/contacts"),
      ]);
      const dealData = await dealRes.json();
      const contData = await contRes.json();
      if (dealData.deals) setDealOptions(dealData.deals.map((d: any) => ({ id: d.id, name: d.name })));
      if (contData.contacts) setContactOptions(contData.contacts.map((c: any) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` })));
    } catch {}
  }, []);

  useEffect(() => { fetchData(); fetchOptions(); }, [fetchData, fetchOptions]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, activity_date: todayDateStr() });
    setModalOpen(true);
  }

  function openEdit(a: Activity) {
    setEditing(a);
    setForm({
      type: a.type,
      activity_date: a.activity_date.slice(0, 10),
      subject: a.subject || "",
      deal_id: a.deal_id || "",
      contact_id: a.contact_id || "",
      outcome: a.outcome || "",
      owner: a.owner || "",
      notes: a.notes || "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.type || !form.activity_date) { showToast("Type and date are required", "error"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        type: form.type,
        activity_date: form.activity_date,
        subject: form.subject || null,
        deal_id: form.deal_id || null,
        contact_id: form.contact_id || null,
        outcome: form.outcome || null,
        owner: form.owner || null,
        notes: form.notes || null,
      };
      if (editing) payload.id = editing.id;

      const res = await fetch("/api/admin/activities", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setModalOpen(false);
      showToast(editing ? "Activity updated" : "Activity logged", "success");
      await fetchData();
    } catch (err: unknown) {
      showToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  const today = todayDateStr();
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thisWeekCount = activities.filter((a) => new Date(a.activity_date) >= thisWeekStart).length;
  const lastWeekCount = activities.filter((a) => { const d = new Date(a.activity_date); return d >= lastWeekStart && d < thisWeekStart; }).length;

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading activities...</div>;

  return (
    <div className="space-y-4 mt-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Activities</h2>
          <p className="text-xs text-gray-400">
            {thisWeekCount} activit{thisWeekCount !== 1 ? "ies" : "y"} this week &middot; {lastWeekCount} last week
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
            + Log Activity
          </button>
          <button onClick={fetchData} disabled={loading} className="px-4 py-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50">
            Refresh
          </button>
        </div>
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
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {activities.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No activities yet. Log calls, emails, and meetings to track engagement.</td></tr>
            ) : activities.map((a) => {
              const actDateStr = a.activity_date.slice(0, 10);
              const isToday = actDateStr === today;
              return (
                <Fragment key={a.id}>
                  <tr className={`hover:bg-gray-50 cursor-pointer ${isToday ? "border-l-4 border-l-green-500" : ""}`} onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                    <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{formatDate(a.activity_date)}</td>
                    <td className="px-3 py-2"><Badge value={a.type} meta={TYPE_META} /></td>
                    <td className="px-3 py-2">
                      {a.subject && <span className="font-medium">{a.subject}</span>}
                      {a.subject && a.notes && <span className="text-gray-400"> &mdash; </span>}
                      {a.notes && (
                        <span className="text-gray-500">
                          {(() => {
                            const maxLen = a.subject ? 80 - a.subject.length : 80;
                            return a.notes.length > maxLen ? a.notes.slice(0, maxLen) + "\u2026" : a.notes;
                          })()}
                        </span>
                      )}
                      {!a.subject && !a.notes && "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{a.contact_name || "\u2014"}</td>
                    <td className="px-3 py-2 text-gray-600">{a.deal_name || "\u2014"}</td>
                    <td className="px-3 py-2">{a.outcome ? <Badge value={a.outcome} meta={OUTCOME_META} /> : "\u2014"}</td>
                    <td className="px-3 py-2 text-gray-600">{a.owner || "\u2014"}</td>
                    <td className="px-3 py-2 text-center"><span className="text-xs text-gray-400">{expandedId === a.id ? "\u25B2" : "\u25BC"}</span></td>
                  </tr>
                  {expandedId === a.id && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="flex items-start justify-between">
                          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                            {a.subject && (<><span className="font-semibold text-gray-400">Subject</span><span className="text-gray-700">{a.subject}</span></>)}
                            {a.notes && (<><span className="font-semibold text-gray-400">Notes</span><span className="text-gray-700 whitespace-pre-wrap">{a.notes}</span></>)}
                            {a.owner && (<><span className="font-semibold text-gray-400">Owner</span><span className="text-gray-700">{a.owner}</span></>)}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); openEdit(a); }} className="px-3 py-1 rounded text-xs font-medium border text-gray-600 hover:bg-gray-100">
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Activity" : "Log Activity"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_META[t]?.label || t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={form.activity_date} onChange={(e) => setForm({ ...form, activity_date: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
              <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deal</label>
              <select value={form.deal_id} onChange={(e) => setForm({ ...form, deal_id: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                <option value="">-- No deal --</option>
                {dealOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact</label>
              <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                <option value="">-- No contact --</option>
                {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Outcome</label>
              <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                <option value="">--</option>
                {OUTCOME_OPTIONS.map((o) => <option key={o} value={o}>{OUTCOME_META[o]?.label || o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
              <input type="text" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? "Saving..." : editing ? "Save Changes" : "Log Activity"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
