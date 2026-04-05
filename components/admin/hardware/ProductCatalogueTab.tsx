"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Product {
  part_number: string;
  name: string;
  vendor: string;
  unit_price: number | null;
  purchase_url: string | null;
  status: string;
  notes: string | null;
}

const STATUS_OPTIONS = ["confirmed", "price_tbd", "not_sourced", "obsolete", "do_not_use"] as const;

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string; strike?: boolean }> = {
  confirmed:   { label: "Confirmed",   bg: "bg-[#D4EDDA]", text: "text-green-800" },
  price_tbd:   { label: "Price TBD",   bg: "bg-[#FFF3CD]", text: "text-yellow-800" },
  not_sourced: { label: "Not Sourced", bg: "bg-[#FDECEA]", text: "text-red-800" },
  obsolete:    { label: "Obsolete",    bg: "bg-[#E8E8E8]", text: "text-gray-600" },
  do_not_use:  { label: "Do Not Use",  bg: "bg-[#FDECEA]", text: "text-red-800", strike: true },
};

const CATEGORY_NAMES: Record<string, string> = {
  "01": "Hub & Infrastructure",
  "02": "Equipment Controls",
  "03": "Component Monitoring",
};

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function ProductCatalogueTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Edit panel state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Product>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("library_products")
      .select("part_number, name, vendor, unit_price, purchase_url, status, notes")
      .order("part_number");
    if (error) {
      console.error("Failed to load products:", error);
    }
    setProducts(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (search) {
        const q = search.toLowerCase().trim();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.part_number.toLowerCase().includes(q) &&
          !p.vendor.toLowerCase().includes(q)
        )
          return false;
      }
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [products, search, statusFilter]);

  // Group by category code (first segment of part_number) then by family (first two segments)
  const grouped = useMemo(() => {
    const cats = new Map<string, Map<string, Product[]>>();
    for (const p of filtered) {
      const segments = p.part_number.split("-");
      const catCode = segments[0] || "??";
      const familyCode = segments.length >= 2 ? `${segments[0]}-${segments[1]}` : catCode;
      if (!cats.has(catCode)) cats.set(catCode, new Map());
      const families = cats.get(catCode)!;
      if (!families.has(familyCode)) families.set(familyCode, []);
      families.get(familyCode)!.push(p);
    }
    return cats;
  }, [filtered]);

  const urlCount = products.filter((p) => p.purchase_url).length;

  function openEditor(product: Product) {
    setEditingProduct(product);
    setEditDraft({ ...product });
  }

  function closeEditor() {
    setEditingProduct(null);
    setEditDraft({});
  }

  function updateDraft(field: keyof Product, value: any) {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  }

  async function saveEdit() {
    if (!editingProduct) return;
    setSaving(true);
    const { error } = await supabase
      .from("library_products")
      .update({
        name: editDraft.name,
        vendor: editDraft.vendor,
        unit_price: editDraft.unit_price != null ? Number(editDraft.unit_price) : null,
        purchase_url: editDraft.purchase_url || null,
        status: editDraft.status || "confirmed",
        notes: editDraft.notes || null,
      })
      .eq("part_number", editingProduct.part_number);

    if (error) {
      alert("Save failed: " + error.message);
      setSaving(false);
      return;
    }

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) =>
        p.part_number === editingProduct.part_number
          ? {
              ...p,
              name: editDraft.name || p.name,
              vendor: editDraft.vendor || p.vendor,
              unit_price: editDraft.unit_price != null ? Number(editDraft.unit_price) : null,
              purchase_url: editDraft.purchase_url || null,
              status: editDraft.status || p.status,
              notes: editDraft.notes || null,
            }
          : p
      )
    );
    setSaving(false);
    closeEditor();
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading product catalogue...</div>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search by name, part #, or vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_STYLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {filtered.length} products · {urlCount} with links
        </span>
      </div>

      {/* Product tables grouped by category, then family */}
      {[...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([catCode, families]) => {
          const catName = CATEGORY_NAMES[catCode] || `Category ${catCode}`;
          return (
            <div key={catCode} className="border rounded-lg bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <h3 className="text-sm font-semibold text-gray-700">
                  {catCode} — {catName}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-24">Part #</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Product Name</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vendor</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-24">Unit Price</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 w-28">Status</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...families.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([familyCode, familyProducts], fi) => (
                      <Fragment key={familyCode}>
                        {fi > 0 && (
                          <tr>
                            <td colSpan={6} className="h-px bg-gray-200" />
                          </tr>
                        )}
                        {familyProducts.map((p) => {
                          const st = STATUS_STYLES[p.status] || STATUS_STYLES.confirmed;
                          return (
                            <tr key={p.part_number} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.part_number}</td>
                              <td className={`px-3 py-2 ${st.strike ? "line-through text-red-600" : "text-gray-900"}`}>
                                {p.purchase_url ? (
                                  <a
                                    href={p.purchase_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                  >
                                    {p.name}
                                  </a>
                                ) : (
                                  p.name
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{p.vendor}</td>
                              <td className="px-3 py-2 text-right font-mono">
                                {p.unit_price != null ? fmt(Number(p.unit_price)) : "—"}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${st.bg} ${st.text}`}>
                                  {st.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => openEditor(p)}
                                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                </tbody>
              </table>
            </div>
          );
        })}

      {filtered.length === 0 && (
        <div className="border rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">
          No products match the current filters.
        </div>
      )}

      {/* Edit Panel — slide-out */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={closeEditor} />
          <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-800">Edit Product</h2>
              <button onClick={closeEditor} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 flex-1">
              {/* Part Number (read-only) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Part Number</label>
                <div className="w-full border rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500 font-mono">
                  {editingProduct.part_number}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editDraft.name || ""}
                  onChange={(e) => updateDraft("name", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Vendor */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Vendor <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editDraft.vendor || ""}
                  onChange={(e) => updateDraft("vendor", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Unit Price */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={editDraft.unit_price ?? ""}
                  onChange={(e) => updateDraft("unit_price", e.target.value === "" ? null : e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Purchase URL */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Purchase URL</label>
                <input
                  type="url"
                  value={editDraft.purchase_url || ""}
                  onChange={(e) => updateDraft("purchase_url", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={editDraft.status || "confirmed"}
                  onChange={(e) => updateDraft("status", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_STYLES[s]?.label || s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={editDraft.notes || ""}
                  onChange={(e) => updateDraft("notes", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t flex items-center justify-end gap-3">
              <button
                onClick={closeEditor}
                className="px-4 py-2 text-sm border rounded-md text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
