"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { displayProjectCode } from "./HardwareCatalogPage";

interface POLine {
  po_id: string;
  project_code: string;
  project_name: string;
  part_number: string | null;
  item_name: string;
  vendor_name: string | null;
  expense_type: string;
  tax_category: string | null;
  qty: number;
  unit_cost: number;
  total_cost: number;
  sales_tax_amount: number;
  shipping_amount: number;
  receipt_status: string | null;
  is_capital_asset: boolean;
  is_billable_to_client: boolean;
  business_purpose: string | null;
  order_date: string | null;
  received_date: string | null;
  inventory_space: string | null;
  deployed_device: string | null;
  doc_count: number;
  notes: string | null;
  payment_method: string | null;
  is_reimbursable: boolean;
}

export default function PurchaseOrdersTab() {
  const [lines, setLines] = useState<POLine[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [taxCatFilter, setTaxCatFilter] = useState("");
  const [receiptFilter, setReceiptFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [showMissingReceipts, setShowMissingReceipts] = useState(false);
  const [showCapitalOnly, setShowCapitalOnly] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch PO lines with joins
      const { data: pos } = await supabase
        .from("c_project_purchase_orders")
        .select(`
          po_id, part_number, item_name, expense_type, tax_category, qty, unit_cost,
          total_cost, sales_tax_amount, shipping_amount, receipt_status,
          is_capital_asset, is_billable_to_client, business_purpose,
          order_date, received_date, notes, payment_method, is_reimbursable,
          project_id,
          c_projects(project_code, project_name),
          c_vendors(vendor_name),
          inventory_space_id,
          deployed_device_id
        `)
        .order("part_number", { ascending: true });

      // Fetch space names for inventory_space_id
      const spaceIds = [...new Set((pos || []).filter((p: any) => p.inventory_space_id).map((p: any) => p.inventory_space_id))];
      const spaceMap = new Map<string, string>();
      if (spaceIds.length > 0) {
        const { data: spaces } = await supabase.from("a_spaces").select("space_id, name").in("space_id", spaceIds);
        for (const s of spaces || []) spaceMap.set(s.space_id, s.name);
      }

      // Fetch device names for deployed_device_id
      const deviceIds = [...new Set((pos || []).filter((p: any) => p.deployed_device_id).map((p: any) => p.deployed_device_id))];
      const deviceMap = new Map<string, string>();
      if (deviceIds.length > 0) {
        const { data: devices } = await supabase.from("a_devices").select("device_id, device_name").in("device_id", deviceIds);
        for (const d of devices || []) deviceMap.set(d.device_id, d.device_name);
      }

      // Fetch document counts
      const { data: docLines } = await supabase.from("c_po_document_lines").select("po_id");
      const docCounts = new Map<string, number>();
      for (const dl of docLines || []) {
        docCounts.set(dl.po_id, (docCounts.get(dl.po_id) || 0) + 1);
      }

      const result: POLine[] = (pos || []).map((po: any) => ({
        po_id: po.po_id,
        project_code: po.c_projects?.project_code || "?",
        project_name: po.c_projects?.project_name || "",
        part_number: po.part_number,
        item_name: po.item_name,
        vendor_name: po.c_vendors?.vendor_name || null,
        expense_type: po.expense_type,
        tax_category: po.tax_category,
        qty: po.qty,
        unit_cost: Number(po.unit_cost),
        total_cost: Number(po.total_cost),
        sales_tax_amount: Number(po.sales_tax_amount || 0),
        shipping_amount: Number(po.shipping_amount || 0),
        receipt_status: po.receipt_status,
        is_capital_asset: po.is_capital_asset || false,
        is_billable_to_client: po.is_billable_to_client || false,
        business_purpose: po.business_purpose,
        order_date: po.order_date,
        received_date: po.received_date,
        inventory_space: po.inventory_space_id ? (spaceMap.get(po.inventory_space_id) || null) : null,
        deployed_device: po.deployed_device_id ? (deviceMap.get(po.deployed_device_id) || null) : null,
        doc_count: docCounts.get(po.po_id) || 0,
        notes: po.notes,
        payment_method: po.payment_method,
        is_reimbursable: po.is_reimbursable || false,
      }));

      setLines(result);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Distinct values for filters
  const projects = useMemo(() => [...new Set(lines.map((l) => l.project_code))].sort(), [lines]);
  const taxCategories = useMemo(() => [...new Set(lines.filter((l) => l.tax_category).map((l) => l.tax_category!))].sort(), [lines]);
  const vendors = useMemo(() => [...new Set(lines.filter((l) => l.vendor_name).map((l) => l.vendor_name!))].sort(), [lines]);

  const filtered = useMemo(() => {
    return lines.filter((l) => {
      if (search) {
        const q = search.toLowerCase();
        if (!(l.item_name.toLowerCase().includes(q) || (l.part_number && l.part_number.includes(q)))) return false;
      }
      if (projectFilter && l.project_code !== projectFilter) return false;
      if (taxCatFilter && l.tax_category !== taxCatFilter) return false;
      if (receiptFilter && l.receipt_status !== receiptFilter) return false;
      if (vendorFilter && l.vendor_name !== vendorFilter) return false;
      if (showReviewOnly && !(l.notes && l.notes.toLowerCase().startsWith("review:"))) return false;
      if (showMissingReceipts && !(l.doc_count === 0 && l.unit_cost >= 75)) return false;
      if (showCapitalOnly && !l.is_capital_asset) return false;
      return true;
    });
  }, [lines, search, projectFilter, taxCatFilter, receiptFilter, vendorFilter, showReviewOnly, showMissingReceipts, showCapitalOnly]);

  // Summary
  const summary = useMemo(() => {
    const total = filtered.reduce((s, l) => s + l.total_cost, 0);
    const hardware = filtered.filter((l) => l.expense_type === "hardware").reduce((s, l) => s + l.total_cost, 0);
    const labor = filtered.filter((l) => l.expense_type === "labor").reduce((s, l) => s + l.total_cost, 0);
    const capital = filtered.filter((l) => l.is_capital_asset).reduce((s, l) => s + l.total_cost, 0);
    const billable = filtered.filter((l) => l.is_billable_to_client).reduce((s, l) => s + l.total_cost, 0);
    return { total, hardware, labor, capital, billable };
  }, [filtered]);

  function getRowColor(l: POLine): string {
    const isDoNotUse = l.item_name.toUpperCase().includes("DO NOT USE");
    if (isDoNotUse) return "bg-red-50";
    if (l.deployed_device) return l.doc_count > 0 ? "bg-green-50/50" : "bg-green-50/30";
    if (l.inventory_space) return l.doc_count > 0 ? "bg-blue-50/50" : "bg-blue-50/30";
    if (l.receipt_status === "pending") return "bg-yellow-50/50";
    return "";
  }

  function hasReviewFlag(l: POLine): boolean {
    return !!(l.notes && l.notes.toLowerCase().startsWith("review:"));
  }

  if (loading) {
    return <div className="border rounded-lg bg-white p-8 text-center text-sm text-gray-400">Loading purchase orders...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input type="text" placeholder="Search item or part #..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-[180px] border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p} value={p}>{displayProjectCode(p)}</option>)}
        </select>
        <select value={taxCatFilter} onChange={(e) => setTaxCatFilter(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">All Tax Categories</option>
          {taxCategories.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">All Vendors</option>
          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-3 items-center text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showReviewOnly} onChange={(e) => setShowReviewOnly(e.target.checked)} className="rounded" />
          Needs review
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showMissingReceipts} onChange={(e) => setShowMissingReceipts(e.target.checked)} className="rounded" />
          Missing receipts
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showCapitalOnly} onChange={(e) => setShowCapitalOnly(e.target.checked)} className="rounded" />
          Capital assets only
        </label>
        <span className="text-gray-400 ml-auto">{filtered.length} of {lines.length} lines</span>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-6 text-xs text-gray-500 border rounded-lg bg-gray-50 px-4 py-3">
        <span>Total: <span className="font-semibold text-gray-800">${summary.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></span>
        <span>Hardware: <span className="font-semibold text-gray-800">${summary.hardware.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></span>
        <span>Labor: <span className="font-semibold text-gray-800">${summary.labor.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></span>
        <span>Capital Assets: <span className="font-semibold text-gray-800">${summary.capital.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></span>
        <span>Billable: <span className="font-semibold text-gray-800">${summary.billable.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></span>
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Project</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Part #</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Item</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vendor</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tax Cat.</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Qty</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Unit</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Total</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">Docs</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Location</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((l) => {
              const isDoNotUse = l.item_name.toUpperCase().includes("DO NOT USE");
              const reviewFlag = hasReviewFlag(l);
              return (
                <tr
                  key={l.po_id}
                  className={`hover:bg-gray-50 ${getRowColor(l)} ${reviewFlag ? "border-l-4 border-l-orange-400" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{displayProjectCode(l.project_code)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{l.part_number || "—"}</td>
                  <td className={`px-3 py-2 ${isDoNotUse ? "line-through text-red-500" : "text-gray-900"}`}>
                    {l.item_name}
                    {l.is_capital_asset && <span className="ml-1.5 text-[10px] px-1 rounded bg-amber-100 text-amber-700 font-medium">ASSET</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{l.vendor_name || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{l.tax_category || "—"}</td>
                  <td className="px-3 py-2 text-right">{l.qty}</td>
                  <td className="px-3 py-2 text-right font-mono">${l.unit_cost.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">${l.total_cost.toFixed(2)}</td>
                  <td className="px-3 py-2 text-center">
                    {l.doc_count > 0 ? (
                      <span className="text-green-600" title={`${l.doc_count} document(s)`}>&#10003; {l.doc_count}</span>
                    ) : l.unit_cost >= 75 ? (
                      <span className="text-orange-500" title="Receipt recommended (>=$75)">&#9888;</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {l.deployed_device ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Deployed</span>
                    ) : l.inventory_space ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">In Inventory</span>
                    ) : l.receipt_status === "pending" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">Pending</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">{l.receipt_status || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[150px]">
                    {l.deployed_device || l.inventory_space || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
