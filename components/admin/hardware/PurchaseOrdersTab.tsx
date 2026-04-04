"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { displayProjectCode } from "./HardwareCatalogPage";

interface POLine {
  po_id: string;
  project_id: string;
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
  purchase_url: string | null;
}

interface Project {
  project_id: string;
  project_code: string;
  project_name: string;
}

const TAX_CATEGORIES = [
  "cogs_hardware",
  "contract_labor",
  "inventory",
  "legal_filing",
  "marketing",
  "software_saas",
  "travel",
];

const STATUS_OPTIONS = [
  "received",
  "pending",
  "ordered",
  "cancelled",
  "returned",
];

type SortKey = keyof POLine | "";
type SortDir = "asc" | "desc";

export default function PurchaseOrdersTab() {
  const [lines, setLines] = useState<POLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLine, setEditingLine] = useState<POLine | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<POLine>>({});
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [taxCatFilter, setTaxCatFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [showMissingReceipts, setShowMissingReceipts] = useState(false);
  const [showCapitalOnly, setShowCapitalOnly] = useState(false);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("part_number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const [{ data: projectData }, { data: pos }, { data: docLines }] =
        await Promise.all([
          supabase
            .from("c_projects")
            .select("project_id, project_code, project_name")
            .order("project_code"),
          supabase
            .from("c_project_purchase_orders")
            .select(`
              po_id, part_number, item_name, vendor, expense_type, tax_category,
              qty, unit_cost, total_cost, sales_tax_amount, shipping_amount,
              receipt_status, is_capital_asset, is_billable_to_client,
              business_purpose, order_date, received_date, notes,
              payment_method, is_reimbursable, purchase_url, project_id,
              inventory_space_id, deployed_device_id,
              c_projects(project_code, project_name)
            `)
            .order("part_number", { ascending: true }),
          supabase.from("c_po_document_lines").select("po_id"),
        ]);

      setProjects(projectData || []);

      // Space + device maps
      const spaceIds = [...new Set((pos || []).filter((p: any) => p.inventory_space_id).map((p: any) => p.inventory_space_id))];
      const deviceIds = [...new Set((pos || []).filter((p: any) => p.deployed_device_id).map((p: any) => p.deployed_device_id))];
      const spaceMap = new Map<string, string>();
      const deviceMap = new Map<string, string>();

      if (spaceIds.length > 0) {
        const { data: spaces } = await supabase.from("a_spaces").select("space_id, name").in("space_id", spaceIds);
        for (const s of spaces || []) spaceMap.set(s.space_id, s.name);
      }
      if (deviceIds.length > 0) {
        const { data: devices } = await supabase.from("a_devices").select("device_id, device_name").in("device_id", deviceIds);
        for (const d of devices || []) deviceMap.set(d.device_id, d.device_name);
      }

      const docCounts = new Map<string, number>();
      for (const dl of docLines || []) {
        docCounts.set(dl.po_id, (docCounts.get(dl.po_id) || 0) + 1);
      }

      const result: POLine[] = (pos || []).map((po: any) => ({
        po_id: po.po_id,
        project_id: po.project_id,
        project_code: po.c_projects?.project_code || "?",
        project_name: po.c_projects?.project_name || "",
        part_number: po.part_number,
        item_name: po.item_name,
        vendor_name: po.vendor || null,
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
        purchase_url: po.purchase_url || null,
      }));

      setLines(result);
      setLoading(false);
    };
    fetchData();
  }, []);

  // --- Edit helpers ---
  function openEditor(line: POLine) {
    setEditingLine(line);
    setEditDraft({ ...line });
  }

  function closeEditor() {
    setEditingLine(null);
    setEditDraft({});
    setIsCreating(false);
  }

  function openCreate() {
    setEditingLine(null);
    setIsCreating(true);
    setEditDraft({
      project_id: projects[0]?.project_id || "",
      item_name: "",
      vendor_name: "",
      part_number: "",
      qty: 1,
      unit_cost: 0,
      total_cost: 0,
      tax_category: "",
      receipt_status: "received",
      is_capital_asset: false,
      is_billable_to_client: false,
      notes: "",
      order_date: "",
      purchase_url: "",
    });
  }

  function updateDraft(field: keyof POLine, value: any) {
    setEditDraft((prev) => {
      const updated = { ...prev, [field]: value };
      // Recalculate total live
      if (field === "qty" || field === "unit_cost") {
        const qty = field === "qty" ? Number(value) : Number(prev.qty);
        const unit = field === "unit_cost" ? Number(value) : Number(prev.unit_cost);
        updated.total_cost = qty * unit;
      }
      return updated;
    });
  }

  async function saveEdit() {
    const qty = Number(editDraft.qty);
    const unit = Number(editDraft.unit_cost);
    if (!editDraft.item_name?.trim()) { alert("Item name is required."); return; }
    if (isNaN(qty) || qty <= 0) { alert("Qty must be a positive number."); return; }
    if (isNaN(unit) || unit < 0) { alert("Unit cost must be a valid number."); return; }

    setSaving(true);
    const projectId = editDraft.project_id || projects[0]?.project_id;
    const proj = projects.find((p) => p.project_id === projectId);
    const payload = {
      project_id: projectId,
      item_name: editDraft.item_name,
      vendor: editDraft.vendor_name,
      part_number: editDraft.part_number || null,
      qty: qty,
      unit_cost: unit,
      total_cost: qty * unit,
      tax_category: editDraft.tax_category || null,
      receipt_status: editDraft.receipt_status || null,
      is_capital_asset: editDraft.is_capital_asset || false,
      is_billable_to_client: editDraft.is_billable_to_client || false,
      notes: editDraft.notes || null,
      order_date: editDraft.order_date || null,
      purchase_url: editDraft.purchase_url || null,
      updated_at: new Date().toISOString(),
    };

    if (isCreating) {
      const { data: newRow, error } = await supabase
        .from("c_project_purchase_orders")
        .insert({ ...payload, expense_type: "hardware" })
        .select("po_id")
        .single();
      if (error || !newRow) { alert("Create failed: " + error?.message); setSaving(false); return; }
      const newLine: POLine = {
        po_id: newRow.po_id,
        project_id: projectId!,
        project_code: proj?.project_code || "",
        project_name: proj?.project_name || "",
        part_number: editDraft.part_number || null,
        item_name: editDraft.item_name!,
        vendor_name: editDraft.vendor_name || null,
        expense_type: "hardware",
        tax_category: editDraft.tax_category || null,
        qty,
        unit_cost: unit,
        total_cost: qty * unit,
        sales_tax_amount: 0,
        shipping_amount: 0,
        receipt_status: editDraft.receipt_status || null,
        is_capital_asset: editDraft.is_capital_asset || false,
        is_billable_to_client: editDraft.is_billable_to_client || false,
        business_purpose: null,
        order_date: editDraft.order_date || null,
        received_date: null,
        inventory_space: null,
        deployed_device: null,
        doc_count: 0,
        notes: editDraft.notes || null,
        payment_method: null,
        is_reimbursable: false,
        purchase_url: editDraft.purchase_url || null,
      };
      setLines((prev) => [newLine, ...prev]);
    } else {
      if (!editingLine) { setSaving(false); return; }
      const { error } = await supabase
        .from("c_project_purchase_orders")
        .update(payload)
        .eq("po_id", editingLine.po_id);
      if (error) { alert("Save failed: " + error.message); setSaving(false); return; }
      setLines((prev) =>
        prev.map((l) =>
          l.po_id === editingLine.po_id
            ? { ...l, ...editDraft, project_id: projectId!, project_code: proj?.project_code || l.project_code, project_name: proj?.project_name || l.project_name, qty, unit_cost: unit, total_cost: qty * unit }
            : l
        )
      );
    }

    setSaving(false);
    closeEditor();
  }

  const handleReceiptUpload = async (poId: string, file: File | undefined) => {
    if (!file) return;
    const filePath = `receipts/${poId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("po-receipts").upload(filePath, file);
    if (uploadError) { alert("Upload failed: " + uploadError.message); return; }
    const { data: doc, error: docError } = await supabase
      .from("c_po_documents")
      .insert({ doc_type: "receipt", doc_name: file.name, file_url: filePath, file_uploaded_at: new Date().toISOString() })
      .select("doc_id").single();
    if (docError || !doc) return;
    await supabase.from("c_po_document_lines").insert({ doc_id: doc.doc_id, po_id: poId });
    await supabase.from("c_project_purchase_orders").update({ receipt_status: "uploaded" }).eq("po_id", poId);
    setLines((prev) => prev.map((l) => l.po_id === poId ? { ...l, receipt_status: "uploaded", doc_count: l.doc_count + 1 } : l));
  };

  // --- Sort ---
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-green-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // Distinct filter options
  const vendorOptions = useMemo(() => [...new Set(lines.filter((l) => l.vendor_name).map((l) => l.vendor_name!))].sort(), [lines]);

  const filtered = useMemo(() => {
    let result = lines.filter((l) => {
      if (search) {
        const q = search.toLowerCase().trim();
        const matchesItem = l.item_name.toLowerCase().includes(q);
        const matchesPart = l.part_number ? l.part_number.toLowerCase().includes(q) : false;
        const matchesVendor = l.vendor_name ? l.vendor_name.toLowerCase().includes(q) : false;
        const matchesProject = displayProjectCode(l.project_code).toLowerCase().includes(q);
        if (!(matchesItem || matchesPart || matchesVendor || matchesProject)) return false;
      }
      if (projectFilter && l.project_code !== projectFilter) return false;
      if (taxCatFilter && l.tax_category !== taxCatFilter) return false;
      if (vendorFilter && l.vendor_name !== vendorFilter) return false;
      if (statusFilter && l.receipt_status !== statusFilter) return false;
      if (showReviewOnly && !(l.notes && l.notes.toLowerCase().startsWith("review:"))) return false;
      if (showMissingReceipts && !(l.doc_count === 0 && l.unit_cost >= 75)) return false;
      if (showCapitalOnly && !l.is_capital_asset) return false;
      return true;
    });

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey as keyof POLine];
        const bv = b[sortKey as keyof POLine];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }

    return result;
  }, [lines, search, projectFilter, taxCatFilter, vendorFilter, statusFilter,
      showReviewOnly, showMissingReceipts, showCapitalOnly, sortKey, sortDir]);

  const summary = useMemo(() => {
    const total = filtered.reduce((s, l) => s + l.total_cost, 0);
    const hardware = filtered.filter((l) => l.expense_type === "hardware").reduce((s, l) => s + l.total_cost, 0);
    const labor = filtered.filter((l) => l.expense_type === "labor").reduce((s, l) => s + l.total_cost, 0);
    const capital = filtered.filter((l) => l.is_capital_asset).reduce((s, l) => s + l.total_cost, 0);
    const billable = filtered.filter((l) => l.is_billable_to_client).reduce((s, l) => s + l.total_cost, 0);
    return { total, hardware, labor, capital, billable };
  }, [filtered]);

  function getRowColor(l: POLine): string {
    if (l.item_name.toUpperCase().includes("DO NOT USE")) return "bg-red-50";
    if (l.deployed_device) return l.doc_count > 0 ? "bg-green-50/50" : "bg-green-50/30";
    if (l.inventory_space) return l.doc_count > 0 ? "bg-blue-50/50" : "bg-blue-50/30";
    if (l.receipt_status === "pending") return "bg-yellow-50/50";
    return "";
  }

  function hasReviewFlag(l: POLine): boolean {
    return !!(l.notes && l.notes.toLowerCase().startsWith("review:"));
  }

  function ThCell({ col, label, className = "" }: { col: SortKey; label: string; className?: string }) {
    return (
      <th
        className={`px-3 py-2 text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-800 ${className}`}
        onClick={() => handleSort(col)}
      >
        {label}<SortIcon col={col} />
      </th>
    );
  }

  if (loading) {
    return <div className="border rounded-lg bg-white p-8 text-center text-sm text-gray-400">Loading purchase orders...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Project legend */}
      <div className="flex flex-wrap gap-3 text-xs bg-gray-50 border rounded-lg px-4 py-2">
        <span className="font-semibold text-gray-600">Projects:</span>
        {projects.map((p) => (
          <span key={p.project_id} className="text-gray-600">
            <a
              href={`/admin/projects/${p.project_id}`}
              className="font-mono font-semibold text-green-700 hover:underline"
            >
              {displayProjectCode(p.project_code)}
            </a>
            {" — "}{p.project_name}
          </span>
        ))}
      </div>

      {/* Filters row 1 */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search item, vendor, or part #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.project_id} value={p.project_code}>{displayProjectCode(p.project_code)} — {p.project_name}</option>)}
        </select>
        <select value={taxCatFilter} onChange={(e) => setTaxCatFilter(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">All Tax Categories</option>
          {TAX_CATEGORIES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">All Vendors</option>
          {vendorOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Filters row 2 */}
      <div className="flex flex-wrap gap-4 items-center text-xs">
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
        <button
          onClick={openCreate}
          className="ml-3 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition-colors"
        >
          + New Line
        </button>
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
              <ThCell col="project_code" label="Project" className="text-left" />
              <ThCell col="part_number" label="Part #" className="text-left" />
              <ThCell col="item_name" label="Item" className="text-left" />
              <ThCell col="vendor_name" label="Vendor" className="text-left" />
              <ThCell col="tax_category" label="Tax Cat." className="text-left" />
              <ThCell col="qty" label="Qty" className="text-right" />
              <ThCell col="unit_cost" label="Unit" className="text-right" />
              <ThCell col="total_cost" label="Total" className="text-right" />
              <th className="text-center px-3 py-2 text-xs font-medium text-gray-500" title="Upload receipts: PDF, JPG, PNG accepted">Docs <span className="text-gray-300 font-normal">(PDF/IMG)</span></th>
              <ThCell col="receipt_status" label="Status" className="text-left" />
              <ThCell col="order_date" label="Date" className="text-left" />
              <th className="px-3 py-2 text-xs font-medium text-gray-500"></th>
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
                  <td className="px-3 py-2 font-mono text-xs"><a href={`/admin/projects/${l.project_id}`} className="text-green-700 hover:underline font-semibold">{displayProjectCode(l.project_code)}</a></td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{l.part_number || "—"}</td>
                  <td className={`px-3 py-2 ${isDoNotUse ? "line-through text-red-500" : "text-gray-900"}`}>
                    {l.purchase_url ? (
                      <a href={l.purchase_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{l.item_name}</a>
                    ) : l.item_name}
                    {l.is_capital_asset && <span className="ml-1.5 text-[10px] px-1 rounded bg-amber-100 text-amber-700 font-medium">ASSET</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{l.vendor_name || "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{l.tax_category || "—"}</td>
                  <td className="px-3 py-2 text-right">{l.qty}</td>
                  <td className="px-3 py-2 text-right font-mono">${l.unit_cost.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">${l.total_cost.toFixed(2)}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {l.doc_count > 0 ? (
                        <span className="text-green-600 text-xs" title={`${l.doc_count} document(s)`}>✓ {l.doc_count}</span>
                      ) : l.unit_cost >= 75 ? (
                        <span className="text-orange-500" title="Receipt recommended (>=$75)">⚠</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      <label className="cursor-pointer text-[10px] text-blue-500 hover:text-blue-700" title="Upload receipt">
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleReceiptUpload(l.po_id, e.target.files?.[0])} />
                        +
                      </label>
                    </div>
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
                  <td className="px-3 py-2 text-xs text-gray-500">{l.order_date || "—"}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => openEditor(l)}
                      className="text-xs text-gray-400 hover:text-green-600 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Panel */}
      {(editingLine || isCreating) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={closeEditor} />
          <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-800">{isCreating ? "New Line" : "Edit Line"}</h2>
              <button onClick={closeEditor} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-4 space-y-4 flex-1">
              {/* Project */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
                <select
                  value={editDraft.project_id || ""}
                  onChange={(e) => updateDraft("project_id", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {projects.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {displayProjectCode(p.project_code)} — {p.project_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Item name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editDraft.item_name || ""}
                  onChange={(e) => updateDraft("item_name", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Vendor */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                <input
                  type="text"
                  value={editDraft.vendor_name || ""}
                  onChange={(e) => updateDraft("vendor_name", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Part # */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Part #</label>
                <input
                  type="text"
                  value={editDraft.part_number || ""}
                  onChange={(e) => updateDraft("part_number", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Qty + Unit cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Qty <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    value={editDraft.qty ?? ""}
                    onChange={(e) => updateDraft("qty", e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit Cost <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editDraft.unit_cost ?? ""}
                    onChange={(e) => updateDraft("unit_cost", e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Line total (read-only) */}
              <div className="text-xs text-gray-500">
                Line total: <span className="font-semibold text-gray-800">
                  ${((Number(editDraft.qty) || 0) * (Number(editDraft.unit_cost) || 0)).toFixed(2)}
                </span>
              </div>

              {/* Tax category */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tax Category</label>
                <select
                  value={editDraft.tax_category || ""}
                  onChange={(e) => updateDraft("tax_category", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="">— none —</option>
                  {TAX_CATEGORIES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={editDraft.receipt_status || ""}
                  onChange={(e) => updateDraft("receipt_status", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="">— none —</option>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Order date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Order Date</label>
                <input
                  type="date"
                  value={editDraft.order_date || ""}
                  onChange={(e) => updateDraft("order_date", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Purchase URL */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Link (URL)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={editDraft.purchase_url || ""}
                  onChange={(e) => updateDraft("purchase_url", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Checkboxes */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editDraft.is_capital_asset || false}
                    onChange={(e) => updateDraft("is_capital_asset", e.target.checked)}
                    className="rounded"
                  />
                  Capital asset
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editDraft.is_billable_to_client || false}
                    onChange={(e) => updateDraft("is_billable_to_client", e.target.checked)}
                    className="rounded"
                  />
                  Billable to client
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={editDraft.notes || ""}
                  onChange={(e) => updateDraft("notes", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t flex gap-3">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-md transition-colors"
              >
                {saving ? "Saving…" : isCreating ? "Create Line" : "Save Changes"}
              </button>
              <button
                onClick={closeEditor}
                className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium py-2 rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
