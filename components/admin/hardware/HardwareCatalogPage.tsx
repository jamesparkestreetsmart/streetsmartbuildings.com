"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import ProductCatalogueTab from "./ProductCatalogueTab";
import PurchaseOrdersTab from "./PurchaseOrdersTab";
import VendorRegistryTab from "./VendorRegistryTab";
import DocumentsTab from "./DocumentsTab";

const TABS = [
  { key: "catalogue", label: "Product Catalogue" },
  { key: "purchase-orders", label: "Purchase Orders" },
  { key: "vendors", label: "Vendor Registry" },
  { key: "documents", label: "Documents" },
] as const;

type TabKey = typeof TABS[number]["key"];

/** Strip leading zeros for display: P-00001 → P-1 */
export function displayProjectCode(code: string): string {
  if (!code) return code;
  const parts = code.split("-");
  if (parts.length !== 2) return code;
  return "P-" + parseInt(parts[1]);
}

export default function HardwareCatalogPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("purchase-orders");

  // Attention banner data
  const [reviewCount, setReviewCount] = useState(0);
  const [w9Vendors, setW9Vendors] = useState<string[]>([]);
  const [receiptStats, setReceiptStats] = useState({ total: 0, covered: 0 });

  useEffect(() => {
    const fetchBannerData = async () => {
      // Review items
      const { count: rc } = await supabase
        .from("c_project_purchase_orders")
        .select("po_id", { count: "exact", head: true })
        .ilike("notes", "Review:%");
      setReviewCount(rc || 0);

      // W-9 needed vendors
      const { data: vendors } = await supabase
        .from("c_vendors")
        .select("vendor_name")
        .eq("requires_1099", true)
        .eq("w9_on_file", false);
      setW9Vendors((vendors || []).map((v: any) => v.vendor_name));

      // Receipt coverage
      const { data: pos } = await supabase
        .from("c_project_purchase_orders")
        .select("po_id, unit_cost");
      const { data: docLines } = await supabase
        .from("c_po_document_lines")
        .select("po_id");
      const coveredSet = new Set((docLines || []).map((d: any) => d.po_id));
      setReceiptStats({
        total: (pos || []).length,
        covered: (pos || []).filter((p: any) => coveredSet.has(p.po_id)).length,
      });
    };
    fetchBannerData();
  }, []);

  return (
    <div className="space-y-4">
      {/* Attention banners */}
      {reviewCount > 0 && (
        <div
          className="border-l-4 border-l-orange-400 bg-orange-50 px-4 py-3 rounded-r-lg cursor-pointer hover:bg-orange-100"
          onClick={() => setActiveTab("purchase-orders")}
        >
          <p className="text-sm text-orange-800 font-medium">
            {reviewCount} purchase order line{reviewCount !== 1 ? "s" : ""} need your review
          </p>
        </div>
      )}
      {w9Vendors.length > 0 && (
        <div
          className="border-l-4 border-l-red-400 bg-red-50 px-4 py-3 rounded-r-lg cursor-pointer hover:bg-red-100"
          onClick={() => setActiveTab("vendors")}
        >
          <p className="text-sm text-red-800 font-medium">
            {w9Vendors.length} vendor{w9Vendors.length !== 1 ? "s" : ""} need W-9 on file: {w9Vendors.join(", ")}
          </p>
        </div>
      )}
      {receiptStats.total > 0 && receiptStats.covered === 0 && (
        <div className="border-l-4 border-l-amber-400 bg-amber-50 px-4 py-3 rounded-r-lg">
          <p className="text-sm text-amber-800 font-medium">
            0 of {receiptStats.total} purchase orders have receipts uploaded — add receipts to complete your accounting records
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-green-700 border-b-2 border-green-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "catalogue" && <ProductCatalogueTab />}
      {activeTab === "purchase-orders" && <PurchaseOrdersTab />}
      {activeTab === "vendors" && <VendorRegistryTab />}
      {activeTab === "documents" && <DocumentsTab />}
    </div>
  );
}
