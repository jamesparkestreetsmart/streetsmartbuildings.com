"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

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

export default function AdminContactsPanel() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const promotedCount = contacts.filter((c) => c.lead_id).length;

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading contacts...</div>;

  return (
    <div className="space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Contacts</h2>
          <p className="text-xs text-gray-400">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} &middot; {promotedCount} promoted from leads
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
                  <td className="px-3 py-2">
                    {c.lead_id ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">From lead ✓</span>
                    ) : "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{formatDate(c.created_at)}</td>
                  <td className="px-3 py-2 text-center"><span className="text-xs text-gray-400">{expandedId === c.id ? "\u25B2" : "\u25BC"}</span></td>
                </tr>
                {expandedId === c.id && (
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={10} className="px-6 py-4">
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
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
