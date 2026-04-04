"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { displayProjectCode } from "./HardwareCatalogPage";

interface Project {
  project_id: string;
  project_code: string;
  project_name: string;
  project_type: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

interface POLine {
  po_id: string;
  part_number: string | null;
  item_name: string;
  vendor: string | null;
  expense_type: string;
  tax_category: string | null;
  qty: number;
  unit_cost: number;
  total_cost: number;
  receipt_status: string | null;
  is_capital_asset: boolean;
  is_billable_to_client: boolean;
  order_date: string | null;
  purchase_url: string | null;
  notes: string | null;
}

interface Quote {
  quote_id: string;
  site_name_override: string | null;
  hardware_cost_est: number | null;
  labor_hours_est: number | null;
  labor_rate: number | null;
  labor_cost_est: number | null;
  travel_cost_est: number | null;
  other_cost_est: number | null;
  total_billable_est: number | null;
  monthly_recurring: number | null;
  quote_status: string | null;
  quoted_date: string | null;
  notes: string | null;
}

interface Contract {
  contract_id: string;
  contract_name: string | null;
  contract_number: string | null;
  contract_value: number | null;
  signed_date: string | null;
  start_date: string | null;
  billing_model: string | null;
  doc_url: string | null;
  status: string | null;
  notes: string | null;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function ProjectDetailPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<POLine[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);

      const [
        { data: proj },
        { data: pos },
        { data: quoteData },
        { data: contractData },
      ] = await Promise.all([
        supabase.from("c_projects").select("*").eq("project_id", projectId).single(),
        supabase
          .from("c_project_purchase_orders")
          .select("po_id, part_number, item_name, vendor, expense_type, tax_category, qty, unit_cost, total_cost, receipt_status, is_capital_asset, is_billable_to_client, order_date, purchase_url, notes")
          .eq("project_id", projectId)
          .order("part_number", { ascending: true }),
        supabase.from("c_project_install_quotes").select("*").eq("project_id", projectId),
        supabase.from("c_project_contracts").select("*").eq("project_id", projectId),
      ]);

      setProject(proj);
      setLines((pos || []).map((p: any) => ({
        ...p,
        unit_cost: Number(p.unit_cost),
        total_cost: Number(p.total_cost),
      })));
      setQuotes(quoteData || []);
      setContracts(contractData || []);
      setLoading(false);
    };
    fetchAll();
  }, [projectId]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Loading project...</div>;
  }

  if (!project) {
    return <div className="p-8 text-sm text-red-500">Project not found.</div>;
  }

  // Spend summary
  const totalSpend = lines.reduce((s, l) => s + l.total_cost, 0);
  const hardwareSpend = lines.filter((l) => l.expense_type === "hardware" || l.tax_category === "cogs_hardware" || l.tax_category === "inventory").reduce((s, l) => s + l.total_cost, 0);
  const laborSpend = lines.filter((l) => l.expense_type === "labor" || l.tax_category === "contract_labor").reduce((s, l) => s + l.total_cost, 0);
  const capitalSpend = lines.filter((l) => l.is_capital_asset).reduce((s, l) => s + l.total_cost, 0);
  const billableSpend = lines.filter((l) => l.is_billable_to_client).reduce((s, l) => s + l.total_cost, 0);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Back nav */}
      <button
        onClick={() => router.push("/admin/hardware-catalog")}
        className="text-sm text-gray-500 hover:text-green-600 flex items-center gap-1"
      >
        ← Back to Hardware Catalog
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {displayProjectCode(project.project_code)}
            </span>
            {project.status && (
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                project.status === "active" ? "bg-green-100 text-green-700" :
                project.status === "complete" ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {project.status}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold mt-1">{project.project_name}</h1>
          {project.notes && (
            <p className="text-sm text-gray-500 mt-1">{project.notes}</p>
          )}
        </div>
      </div>

      {/* Spend summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Spend", value: totalSpend, bold: true },
          { label: "Hardware / Inventory", value: hardwareSpend },
          { label: "Labor", value: laborSpend },
          { label: "Capital Assets", value: capitalSpend },
          { label: "Billable to Client", value: billableSpend },
        ].map((card) => (
          <div key={card.label} className={`border rounded-lg p-4 bg-white ${card.bold ? "border-green-200" : ""}`}>
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className={`text-lg font-semibold mt-1 ${card.bold ? "text-green-700" : "text-gray-800"}`}>
              {fmt(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Installation Paperwork */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Installation Paperwork</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Estimates */}
          <div className="border rounded-lg bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Estimates / Quotes</h3>
              <span className="text-xs text-gray-400">{quotes.length} record{quotes.length !== 1 ? "s" : ""}</span>
            </div>
            {quotes.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No quotes on file yet.
              </div>
            ) : (
              <div className="divide-y">
                {quotes.map((q) => (
                  <div key={q.quote_id} className="px-4 py-3 space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-gray-800">
                        {q.site_name_override || "Installation Quote"}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        q.quote_status === "approved" ? "bg-green-100 text-green-700" :
                        q.quote_status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {q.quote_status || "draft"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-500">
                      <span>Hardware est: {fmt(q.hardware_cost_est)}</span>
                      <span>Labor est: {fmt(q.labor_cost_est)}</span>
                      <span>Travel est: {fmt(q.travel_cost_est)}</span>
                      <span>Total billable: {fmt(q.total_billable_est)}</span>
                      {q.monthly_recurring && <span>Monthly recurring: {fmt(q.monthly_recurring)}</span>}
                      {q.quoted_date && <span>Quoted: {q.quoted_date}</span>}
                    </div>
                    {q.notes && <p className="text-xs text-gray-400 italic">{q.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contracts / Actuals */}
          <div className="border rounded-lg bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Contracts / Actuals</h3>
              <span className="text-xs text-gray-400">{contracts.length} record{contracts.length !== 1 ? "s" : ""}</span>
            </div>
            {contracts.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No contracts on file yet.
              </div>
            ) : (
              <div className="divide-y">
                {contracts.map((c) => (
                  <div key={c.contract_id} className="px-4 py-3 space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium text-gray-800">
                        {c.contract_name || c.contract_number || "Contract"}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        c.status === "active" ? "bg-green-100 text-green-700" :
                        c.status === "signed" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {c.status || "draft"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-500">
                      <span>Value: {fmt(c.contract_value)}</span>
                      <span>Billing: {c.billing_model || "—"}</span>
                      {c.signed_date && <span>Signed: {c.signed_date}</span>}
                      {c.start_date && <span>Start: {c.start_date}</span>}
                    </div>
                    {c.doc_url && (
                      <a href={c.doc_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline">
                        View document →
                      </a>
                    )}
                    {c.notes && <p className="text-xs text-gray-400 italic">{c.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PO Line Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Purchase Order Lines</h2>
          <span className="text-xs text-gray-400">{lines.length} lines</span>
        </div>
        <div className="border rounded-lg bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Part #</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Item</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vendor</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tax Cat.</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Qty</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Unit</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Total</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => {
                const isDoNotUse = l.item_name.toUpperCase().includes("DO NOT USE");
                return (
                  <tr key={l.po_id} className={`hover:bg-gray-50 ${isDoNotUse ? "bg-red-50" : ""}`}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{l.part_number || "—"}</td>
                    <td className={`px-3 py-2 ${isDoNotUse ? "line-through text-red-500" : "text-gray-900"}`}>
                      {l.purchase_url ? (
                        <a href={l.purchase_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline">{l.item_name}</a>
                      ) : l.item_name}
                      {l.is_capital_asset && (
                        <span className="ml-1.5 text-[10px] px-1 rounded bg-amber-100 text-amber-700 font-medium">ASSET</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{l.vendor || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{l.tax_category || "—"}</td>
                    <td className="px-3 py-2 text-right text-xs">{l.qty}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">${l.unit_cost.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-xs">${l.total_cost.toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{l.receipt_status || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{l.order_date || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">Total</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-sm text-gray-800">
                  {fmt(totalSpend)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
