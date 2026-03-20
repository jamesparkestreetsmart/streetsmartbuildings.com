"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Contact {
  id: string;
  lead_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  title: string;
  role_type: string | null;
  linkedin_url: string | null;
  organization_name: string | null;
  industry: string | null;
  source_type: string;
  assigned_to: string | null;
  notes: string | null;
  duplicate_of: string | null;
  company_id: string | null;
  company_name: string | null;
  created_at: string;
}

interface CompanyOption { id: string; name: string; }

const ROLE_OPTIONS = ["decision_maker", "influencer", "gatekeeper", "unknown"] as const;
const SOURCE_OPTIONS = ["inbound_form", "scraped", "apollo", "referral", "manual", "import"] as const;

const ROLE_META: Record<string, { label: string; bg: string; text: string }> = {
  decision_maker: { label: "Decision Maker", bg: "bg-green-100",  text: "text-green-800" },
  influencer:     { label: "Influencer",     bg: "bg-amber-100",  text: "text-amber-800" },
  gatekeeper:     { label: "Gatekeeper",     bg: "bg-amber-100",  text: "text-amber-800" },
  unknown:        { label: "Unknown",        bg: "bg-stone-100",  text: "text-stone-600" },
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

const EMPTY_FORM = { first_name: "", last_name: "", email: "", title: "", phone: "", role_type: "", source_type: "manual", company_id: "", organization_name: "", linkedin_url: "", assigned_to: "", notes: "" };

export default function AdminContactsPanel() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contacts");
      const data = await res.json();
      if (data.contacts) setContacts(data.contacts);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/companies");
      const data = await res.json();
      if (data.companies) setCompanyOptions(data.companies.map((c: any) => ({ id: c.id, name: c.name })));
    } catch {}
  }, []);

  useEffect(() => { fetchData(); fetchCompanies(); }, [fetchData, fetchCompanies]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(c: Contact) {
    setEditing(c);
    setForm({
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      title: c.title,
      phone: c.phone || "",
      role_type: c.role_type || "",
      source_type: c.source_type,
      company_id: c.company_id || "",
      organization_name: c.organization_name || "",
      linkedin_url: c.linkedin_url || "",
      assigned_to: c.assigned_to || "",
      notes: c.notes || "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.first_name || !form.last_name || !form.email || !form.title || !form.source_type) {
      showToast("First name, last name, email, title, and source type are required", "error"); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        title: form.title,
        source_type: form.source_type,
        phone: form.phone || null,
        role_type: form.role_type || null,
        company_id: form.company_id || null,
        organization_name: form.organization_name || null,
        linkedin_url: form.linkedin_url || null,
        assigned_to: form.assigned_to || null,
        notes: form.notes || null,
      };
      if (editing) payload.id = editing.id;

      const res = await fetch("/api/admin/contacts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setModalOpen(false);
      showToast(editing ? "Contact updated" : "Contact created", "success");
      await fetchData();
    } catch (err: unknown) {
      showToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  const promotedCount = contacts.filter((c) => c.lead_id).length;

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading contacts...</div>;

  return (
    <div className="space-y-4 mt-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Contacts</h2>
          <p className="text-xs text-gray-400">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} &middot; {promotedCount} promoted from leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
            + New Contact
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
              <th className="text-left px-3 py-2 font-medium text-gray-600">Title</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Company</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Email</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Phone</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Role</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">From Lead</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Created</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {contacts.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">No contacts yet. Promote leads or add contacts to get started.</td></tr>
            ) : contacts.map((c) => (
              <Fragment key={c.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                  <td className="px-3 py-2 font-medium">{c.first_name} {c.last_name}</td>
                  <td className="px-3 py-2 text-gray-600">{c.title}</td>
                  <td className="px-3 py-2 text-gray-600">{c.company_name || c.organization_name || "\u2014"}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{c.email}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{c.phone || "\u2014"}</td>
                  <td className="px-3 py-2">{c.role_type ? <Badge value={c.role_type} meta={ROLE_META} /> : "\u2014"}</td>
                  <td className="px-3 py-2"><Badge value={c.source_type} meta={SOURCE_META} /></td>
                  <td className="px-3 py-2">{c.lead_id ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">From lead ✓</span> : "\u2014"}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{formatDate(c.created_at)}</td>
                  <td className="px-3 py-2 text-center"><span className="text-xs text-gray-400">{expandedId === c.id ? "\u25B2" : "\u25BC"}</span></td>
                </tr>
                {expandedId === c.id && (
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={10} className="px-6 py-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 text-xs">
                          {c.duplicate_of && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-50 border border-red-200">
                              <span className="font-semibold text-red-700">Duplicate Warning:</span>
                              <span className="text-red-600 font-mono">{c.duplicate_of}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                            {c.linkedin_url && (<><span className="font-semibold text-gray-400">LinkedIn</span><span className="text-gray-700">{c.linkedin_url}</span></>)}
                            {c.notes && (<><span className="font-semibold text-gray-400">Notes</span><span className="text-gray-700">{c.notes}</span></>)}
                            {c.assigned_to && (<><span className="font-semibold text-gray-400">Assigned To</span><span className="text-gray-700">{c.assigned_to}</span></>)}
                          </div>
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
            <DialogTitle>{editing ? "Edit Contact" : "New Contact"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
              <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
              <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role Type</label>
              <select value={form.role_type} onChange={(e) => setForm({ ...form, role_type: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                <option value="">--</option>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source Type *</label>
              <select value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{SOURCE_META[s]?.label || s}</option>)}
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Organization Name</label>
              <input type="text" value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" placeholder="Fallback if no company" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
              <input type="text" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
              <input type="text" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? "Saving..." : editing ? "Save Changes" : "Create Contact"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
