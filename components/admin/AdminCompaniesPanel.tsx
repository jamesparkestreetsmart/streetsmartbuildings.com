"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  hq_location: string | null;
  hq_state: string | null;
  estimated_sites: number | null;
  status: string;
  org_id: string | null;
  source: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  contact_count: number;
  deal_count: number;
  org_name: string | null;
}

const STATUS_OPTIONS = ["prospect", "active_deal", "customer", "churned", "dead"] as const;
const SOURCE_OPTIONS = ["inbound_form", "scraped", "apollo", "referral", "manual", "import"] as const;

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  prospect:    { label: "Prospect",    bg: "bg-amber-100",  text: "text-amber-800" },
  active_deal: { label: "Active Deal", bg: "bg-amber-100",  text: "text-amber-800" },
  customer:    { label: "Customer",    bg: "bg-green-100",  text: "text-green-800" },
  churned:     { label: "Churned",     bg: "bg-red-100",    text: "text-red-800" },
  dead:        { label: "Dead",        bg: "bg-red-100",    text: "text-red-800" },
};

const SOURCE_META: Record<string, { label: string; bg: string; text: string }> = {
  inbound_form: { label: "Inbound",   bg: "bg-green-100",  text: "text-green-800" },
  scraped:      { label: "Scraped",   bg: "bg-amber-100",  text: "text-amber-800" },
  apollo:       { label: "Apollo",    bg: "bg-amber-100",  text: "text-amber-800" },
  referral:     { label: "Referral",  bg: "bg-green-100",  text: "text-green-800" },
  manual:       { label: "Manual",    bg: "bg-stone-100",  text: "text-stone-600" },
  import:       { label: "Import",    bg: "bg-stone-100",  text: "text-stone-600" },
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

const EMPTY_FORM = { name: "", industry: "", hq_location: "", hq_state: "", estimated_sites: "", status: "prospect", source: "", assigned_to: "", website: "", notes: "" };

export default function AdminCompaniesPanel() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/companies");
      const data = await res.json();
      if (data.companies) setCompanies(data.companies);
      if (data.industries) setIndustryOptions(data.industries);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setForm({
      name: c.name,
      industry: c.industry || "",
      hq_location: c.hq_location || "",
      hq_state: c.hq_state || "",
      estimated_sites: c.estimated_sites != null ? String(c.estimated_sites) : "",
      status: c.status,
      source: c.source || "",
      assigned_to: c.assigned_to || "",
      website: c.website || "",
      notes: c.notes || "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.status) { showToast("Name and status are required", "error"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        status: form.status,
        industry: form.industry || null,
        hq_location: form.hq_location || null,
        hq_state: form.hq_state || null,
        estimated_sites: form.estimated_sites ? parseInt(form.estimated_sites, 10) : null,
        source: form.source || null,
        assigned_to: form.assigned_to || null,
        website: form.website || null,
        notes: form.notes || null,
      };
      if (editing) payload.id = editing.id;

      const res = await fetch("/api/admin/companies", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setModalOpen(false);
      showToast(editing ? "Company updated" : "Company created", "success");
      await fetchData();
    } catch (err: unknown) {
      showToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  const statusCounts: Record<string, number> = {};
  for (const c of companies) statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading companies...</div>;

  return (
    <div className="space-y-4 mt-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Companies</h2>
          <div className="flex items-center gap-2 mt-1">
            {(["prospect", "active_deal", "customer", "churned", "dead"] as const).map((s) => (
              statusCounts[s] ? (
                <span key={s} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_META[s]?.bg || "bg-stone-100"} ${STATUS_META[s]?.text || "text-stone-600"}`}>
                  {statusCounts[s]} {STATUS_META[s]?.label || s}
                </span>
              ) : null
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
            + New Company
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
              <th className="text-left px-3 py-2 font-medium text-gray-600">Industry</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">HQ</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Est. Sites</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Contacts</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Deals</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Linked Org</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Assigned To</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {companies.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">No companies yet. Add companies to start tracking your pipeline.</td></tr>
            ) : companies.map((c) => (
              <Fragment key={c.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-gray-600">{c.industry || "\u2014"}</td>
                  <td className="px-3 py-2 text-gray-600">{c.hq_location || c.hq_state || "\u2014"}</td>
                  <td className="px-3 py-2 text-gray-600">{c.estimated_sites ?? "\u2014"}</td>
                  <td className="px-3 py-2"><Badge value={c.status} meta={STATUS_META} /></td>
                  <td className="px-3 py-2">{c.source ? <Badge value={c.source} meta={SOURCE_META} /> : "\u2014"}</td>
                  <td className="px-3 py-2 text-gray-600">{c.contact_count}</td>
                  <td className="px-3 py-2 text-gray-600">{c.deal_count}</td>
                  <td className="px-3 py-2">{c.org_id ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Live ✓</span> : "\u2014"}</td>
                  <td className="px-3 py-2 text-gray-600">{c.assigned_to || "\u2014"}</td>
                  <td className="px-3 py-2 text-center"><span className="text-xs text-gray-400">{expandedId === c.id ? "\u25B2" : "\u25BC"}</span></td>
                </tr>
                {expandedId === c.id && (
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={11} className="px-6 py-4">
                      <div className="flex items-start justify-between">
                        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                          {c.website && (<><span className="font-semibold text-gray-400">Website</span><span className="text-gray-700">{c.website}</span></>)}
                          {c.notes && (<><span className="font-semibold text-gray-400">Notes</span><span className="text-gray-700">{c.notes}</span></>)}
                          {c.org_name && (<><span className="font-semibold text-gray-400">Org Name</span><span className="text-gray-700">{c.org_name}</span></>)}
                          <span className="font-semibold text-gray-400">Created</span><span className="text-gray-700">{formatDate(c.created_at)}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="px-3 py-1 rounded text-xs font-medium border text-gray-600 hover:bg-gray-100">
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Company" : "New Company"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status *</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
              <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                <option value="">--</option>
                {industryOptions.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                <option value="">--</option>
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{SOURCE_META[s]?.label || s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">HQ Location</label>
              <input type="text" value={form.hq_location} onChange={(e) => setForm({ ...form, hq_location: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">HQ State</label>
              <input type="text" value={form.hq_state} onChange={(e) => setForm({ ...form, hq_state: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Est. Sites</label>
              <input type="number" value={form.estimated_sites} onChange={(e) => setForm({ ...form, estimated_sites: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
              <input type="text" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Website</label>
              <input type="text" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? "Saving..." : editing ? "Save Changes" : "Create Company"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
