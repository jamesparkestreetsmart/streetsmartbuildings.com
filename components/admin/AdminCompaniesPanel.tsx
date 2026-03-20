"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

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

export default function AdminCompaniesPanel() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/companies");
      const data = await res.json();
      if (data.companies) setCompanies(data.companies);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Status counts for stat pills
  const statusCounts: Record<string, number> = {};
  for (const c of companies) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  }

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading companies...</div>;

  return (
    <div className="space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Companies</h2>
          <div className="flex items-center gap-2 mt-1">
            {["prospect", "active_deal", "customer", "churned", "dead"].map((s) => (
              statusCounts[s] ? (
                <span key={s} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_META[s]?.bg || "bg-stone-100"} ${STATUS_META[s]?.text || "text-stone-600"}`}>
                  {statusCounts[s]} {STATUS_META[s]?.label || s}
                </span>
              ) : null
            ))}
          </div>
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
                  <td className="px-3 py-2">
                    {c.org_id ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Live ✓</span>
                    ) : "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{c.assigned_to || "\u2014"}</td>
                  <td className="px-3 py-2 text-center"><span className="text-xs text-gray-400">{expandedId === c.id ? "\u25B2" : "\u25BC"}</span></td>
                </tr>
                {expandedId === c.id && (
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={11} className="px-6 py-4">
                      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                        {c.website && (<><span className="font-semibold text-gray-400">Website</span><span className="text-gray-700">{c.website}</span></>)}
                        {c.notes && (<><span className="font-semibold text-gray-400">Notes</span><span className="text-gray-700">{c.notes}</span></>)}
                        {c.org_name && (<><span className="font-semibold text-gray-400">Org Name</span><span className="text-gray-700">{c.org_name}</span></>)}
                        <span className="font-semibold text-gray-400">Created</span><span className="text-gray-700">{formatDate(c.created_at)}</span>
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
