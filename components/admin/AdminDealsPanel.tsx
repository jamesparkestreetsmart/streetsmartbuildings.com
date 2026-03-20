"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

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

export default function AdminDealsPanel() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  // Stage counts
  const stageCounts: Record<string, number> = {};
  for (const d of deals) stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;

  const today = todayDateStr();

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading deals...</div>;

  return (
    <div className="space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Deals</h2>
          <div className="flex items-center gap-2 mt-1">
            {["discovery", "demo", "proposal", "negotiation", "closed_won", "closed_lost"].map((s) => (
              stageCounts[s] ? (
                <span key={s} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_META[s]?.bg || "bg-stone-100"} ${STAGE_META[s]?.text || "text-stone-600"}`}>
                  {stageCounts[s]} {STAGE_META[s]?.label || s}
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
                    <td className="px-3 py-2">
                      {d.org_id ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Converted ✓</span>
                      ) : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-center"><span className="text-xs text-gray-400">{expandedId === d.id ? "\u25B2" : "\u25BC"}</span></td>
                  </tr>
                  {expandedId === d.id && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan={11} className="px-6 py-4">
                        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                          {d.notes && (<><span className="font-semibold text-gray-400">Notes</span><span className="text-gray-700">{d.notes}</span></>)}
                          {d.lost_reason && (<><span className="font-semibold text-gray-400">Lost Reason</span><span className="text-red-600">{d.lost_reason}</span></>)}
                          {d.closed_at && (<><span className="font-semibold text-gray-400">Closed At</span><span className="text-gray-700">{formatDate(d.closed_at)}</span></>)}
                          {d.org_name && (<><span className="font-semibold text-gray-400">Org Name</span><span className="text-gray-700">{d.org_name}</span></>)}
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
    </div>
  );
}
