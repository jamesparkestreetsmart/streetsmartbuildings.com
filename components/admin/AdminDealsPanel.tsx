"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Deal {
  id: string;
  lead_id: string | null;
  primary_contact_id: string | null;
  org_id: string | null;
  company_id: string | null;
  name: string;
  stage: string;
  value_estimate: number | null;
  close_probability: number | null;
  projected_sites: number | null;
  next_step: string | null;
  next_step_date: string | null;
  owner: string | null;
  lost_reason: string | null;
  notes: string | null;
  closed_at: string | null;
  created_at: string;
  company_name: string | null;
  contact_name: string | null;
  org_name: string | null;
}

interface CompanyOption { id: string; name: string; }
interface ContactOption { id: string; name: string; }

const STAGE_OPTIONS = ["discovery", "demo", "proposal", "negotiation", "closed_won", "closed_lost"] as const;

const STAGE_META: Record<string, { label: string; bg: string; text: string }> = {
  discovery:    { label: "Discovery",    bg: "bg-green-50",   text: "text-green-700" },
  demo:         { label: "Demo",         bg: "bg-green-100",  text: "text-green-800" },
  proposal:     { label: "Proposal",     bg: "bg-green-200",  text: "text-green-900" },
  negotiation:  { label: "Negotiation",  bg: "bg-green-300",  text: "text-green-900" },
  closed_won:   { label: "Closed Won",   bg: "bg-green-600",  text: "text-white" },
  closed_lost:  { label: "Closed Lost",  bg: "bg-red-100",    text: "text-red-800" },
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

const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY_FORM = { name: "", stage: "discovery", company_id: "", primary_contact_id: "", value_estimate: "", close_probability: "", projected_sites: "", next_step: "", next_step_date: "", owner: "", lost_reason: "", notes: "" };

export default function AdminDealsPanel() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/deals");
      const data = await res.json();
      if (data.deals) setDeals(data.deals);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const fetchOptions = useCallback(async () => {
    try {
      const [compRes, contRes] = await Promise.all([
        fetch("/api/admin/companies"),
        fetch("/api/admin/contacts"),
      ]);
      const compData = await compRes.json();
      const contData = await contRes.json();
      if (compData.companies) setCompanyOptions(compData.companies.map((c: any) => ({ id: c.id, name: c.name })));
      if (contData.contacts) setContactOptions(contData.contacts.map((c: any) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` })));
    } catch {}
  }, []);

  useEffect(() => { fetchData(); fetchOptions(); }, [fetchData, fetchOptions]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(d: Deal) {
    setEditing(d);
    setForm({
      name: d.name,
      stage: d.stage,
      company_id: d.company_id || "",
      primary_contact_id: d.primary_contact_id || "",
      value_estimate: d.value_estimate != null ? String(d.value_estimate) : "",
      close_probability: d.close_probability != null ? String(d.close_probability) : "",
      projected_sites: d.projected_sites != null ? String(d.projected_sites) : "",
      next_step: d.next_step || "",
      next_step_date: d.next_step_date || "",
      owner: d.owner || "",
      lost_reason: d.lost_reason || "",
      notes: d.notes || "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.stage) { showToast("Name and stage are required", "error"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        stage: form.stage,
        company_id: form.company_id || null,
        primary_contact_id: form.primary_contact_id || null,
        value_estimate: form.value_estimate ? parseFloat(form.value_estimate) : null,
        close_probability: form.close_probability ? parseInt(form.close_probability, 10) : null,
        projected_sites: form.projected_sites ? parseInt(form.projected_sites, 10) : null,
        next_step: form.next_step || null,
        next_step_date: form.next_step_date || null,
        owner: form.owner || null,
        lost_reason: form.lost_reason || null,
        notes: form.notes || null,
      };
      if (editing) payload.id = editing.id;

      const res = await fetch("/api/admin/deals", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setModalOpen(false);
      showToast(editing ? "Deal updated" : "Deal created", "success");
      await fetchData();
    } catch (err: unknown) {
      showToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  const stageCounts: Record<string, number> = {};
  for (const d of deals) stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
  const today = todayDateStr();

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading deals...</div>;

  return (
    <div className="space-y-4 mt-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Deals</h2>
          <div className="flex items-center gap-2 mt-1">
            {STAGE_OPTIONS.map((s) => (
              stageCounts[s] ? (
                <span key={s} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_META[s]?.bg || "bg-stone-100"} ${STAGE_META[s]?.text || "text-stone-600"}`}>
                  {stageCounts[s]} {STAGE_META[s]?.label || s}
                </span>
              ) : null
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
            + New Deal
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
              <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Company</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Stage</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Contact</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Sites</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Value</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Prob.</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Next Step</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Owner</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Org</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {deals.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">No deals yet. Create deals to track your sales pipeline.</td></tr>
            ) : deals.map((d) => {
              const overdue = d.next_step_date && d.next_step_date < today && d.stage !== "closed_won" && d.stage !== "closed_lost";
              return (
                <Fragment key={d.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                    <td className="px-3 py-2 font-medium">{d.name}</td>
                    <td className="px-3 py-2 text-gray-600">{d.company_name || "\u2014"}</td>
                    <td className="px-3 py-2"><Badge value={d.stage} meta={STAGE_META} /></td>
                    <td className="px-3 py-2 text-gray-600">{d.contact_name || "\u2014"}</td>
                    <td className="px-3 py-2 text-gray-600">{d.projected_sites ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-gray-600">{d.value_estimate != null ? currencyFmt.format(Number(d.value_estimate)) : "\u2014"}</td>
                    <td className="px-3 py-2 text-gray-600">{d.close_probability != null ? `${d.close_probability}%` : "\u2014"}</td>
                    <td className="px-3 py-2">
                      {d.next_step ? (
                        <div>
                          <span className={overdue ? "text-red-600 font-semibold" : "text-gray-700"}>{d.next_step}</span>
                          {d.next_step_date && (
                            <div className={`text-xs ${overdue ? "text-red-500" : "text-gray-400"}`}>
                              {formatDate(d.next_step_date)}{overdue ? " \u26A0 Past due" : ""}
                            </div>
                          )}
                        </div>
                      ) : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{d.owner || "\u2014"}</td>
                    <td className="px-3 py-2">{d.org_id ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Converted ✓</span> : "\u2014"}</td>
                    <td className="px-3 py-2 text-center"><span className="text-xs text-gray-400">{expandedId === d.id ? "\u25B2" : "\u25BC"}</span></td>
                  </tr>
                  {expandedId === d.id && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan={11} className="px-6 py-4">
                        <div className="flex items-start justify-between">
                          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                            {d.notes && (<><span className="font-semibold text-gray-400">Notes</span><span className="text-gray-700">{d.notes}</span></>)}
                            {d.lost_reason && (<><span className="font-semibold text-gray-400">Lost Reason</span><span className="text-red-600">{d.lost_reason}</span></>)}
                            {d.closed_at && (<><span className="font-semibold text-gray-400">Closed At</span><span className="text-gray-700">{formatDate(d.closed_at)}</span></>)}
                            {d.org_name && (<><span className="font-semibold text-gray-400">Org Name</span><span className="text-gray-700">{d.org_name}</span></>)}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); openEdit(d); }} className="px-3 py-1 rounded text-xs font-medium border text-gray-600 hover:bg-gray-100">
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
            <DialogTitle>{editing ? "Edit Deal" : "New Deal"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stage *</label>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{STAGE_META[s]?.label || s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                <option value="">-- No company --</option>
                {companyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Primary Contact</label>
              <select value={form.primary_contact_id} onChange={(e) => setForm({ ...form, primary_contact_id: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                <option value="">-- No contact --</option>
                {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Value Estimate ($)</label>
              <input type="number" value={form.value_estimate} onChange={(e) => setForm({ ...form, value_estimate: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Close Probability (%)</label>
              <input type="number" min={0} max={100} value={form.close_probability} onChange={(e) => setForm({ ...form, close_probability: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Projected Sites</label>
              <input type="number" value={form.projected_sites} onChange={(e) => setForm({ ...form, projected_sites: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
              <input type="text" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Next Step</label>
              <input type="text" value={form.next_step} onChange={(e) => setForm({ ...form, next_step: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Next Step Date</label>
              <input type="date" value={form.next_step_date} onChange={(e) => setForm({ ...form, next_step_date: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            {form.stage === "closed_lost" && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Lost Reason</label>
                <input type="text" value={form.lost_reason} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
            )}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? "Saving..." : editing ? "Save Changes" : "Create Deal"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
