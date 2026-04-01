"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Vendor {
  vendor_id: string;
  vendor_name: string;
  vendor_type: string | null;
  website: string | null;
  primary_contact: string | null;
  email: string | null;
  phone: string | null;
  w9_on_file: boolean;
  w9_received_date: string | null;
  requires_1099: boolean;
  notes: string | null;
  ytd_payments: number;
}

export default function VendorRegistryTab() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVendors = async () => {
      setLoading(true);
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;

      // Fetch vendors
      const { data: vendorRows } = await supabase
        .from("c_vendors")
        .select("vendor_id, vendor_name, vendor_type, website, primary_contact, email, phone, w9_on_file, w9_received_date, requires_1099, notes")
        .order("vendor_name");

      // Fetch YTD payments per vendor
      const { data: pos } = await supabase
        .from("c_project_purchase_orders")
        .select("vendor_id, total_cost, order_date")
        .gte("order_date", yearStart)
        .lte("order_date", yearEnd);

      const ytdMap = new Map<string, number>();
      for (const po of pos || []) {
        if (po.vendor_id) {
          ytdMap.set(po.vendor_id, (ytdMap.get(po.vendor_id) || 0) + Number(po.total_cost || 0));
        }
      }

      const result: Vendor[] = (vendorRows || []).map((v: any) => ({
        ...v,
        ytd_payments: ytdMap.get(v.vendor_id) || 0,
      }));

      // Sort by YTD payments desc
      result.sort((a, b) => b.ytd_payments - a.ytd_payments);

      setVendors(result);
      setLoading(false);
    };
    fetchVendors();
  }, []);

  function getWarnings(v: Vendor): { label: string; color: string }[] {
    const warnings: { label: string; color: string }[] = [];
    if (v.requires_1099 && !v.w9_on_file) {
      warnings.push({ label: "W-9 NEEDED", color: "bg-red-100 text-red-700" });
    }
    if (v.requires_1099 && v.ytd_payments >= 2000) {
      warnings.push({ label: "1099 REQUIRED (post-2025)", color: "bg-red-100 text-red-700" });
    } else if (v.requires_1099 && v.ytd_payments >= 600) {
      warnings.push({ label: "1099 THRESHOLD MET", color: "bg-orange-100 text-orange-700" });
    }
    return warnings;
  }

  const handleW9Upload = async (vendorId: string, file: File | undefined) => {
    if (!file) return;
    const filePath = `w9s/${vendorId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("vendor-w9s").upload(filePath, file, { upsert: true });
    if (uploadError) { console.error("W-9 upload failed:", uploadError); alert("Upload failed: " + uploadError.message); return; }

    const today = new Date().toISOString().split("T")[0];
    await supabase.from("c_vendors").update({ w9_on_file: true, w9_received_date: today, w9_file_url: filePath }).eq("vendor_id", vendorId);

    setVendors((prev) => prev.map((v) => v.vendor_id === vendorId ? { ...v, w9_on_file: true, w9_received_date: today } : v));
  };

  if (loading) {
    return <div className="border rounded-lg bg-white p-8 text-center text-sm text-gray-400">Loading vendors...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vendor Name</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Type</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">W-9</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">1099</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">YTD Payments</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Warnings</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {vendors.map((v) => {
              const warnings = getWarnings(v);
              return (
                <tr key={v.vendor_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {v.vendor_name}
                    {v.website && (
                      <a href={v.website.startsWith("http") ? v.website : `https://${v.website}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-blue-500 hover:underline">
                        site
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 capitalize">{v.vendor_type?.replace("_", " ") || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {v.w9_on_file ? (
                      <span className="text-green-600" title={v.w9_received_date ? `Received ${v.w9_received_date}` : "On file"}>&#10003;</span>
                    ) : v.requires_1099 ? (
                      <span className="text-red-500">&#10007;</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {v.requires_1099 ? (
                      <span className="text-amber-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {v.ytd_payments > 0 ? `$${v.ytd_payments.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {warnings.map((w, i) => (
                        <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${w.color}`}>{w.label}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleW9Upload(v.vendor_id, e.target.files?.[0])} />
                      {v.w9_on_file ? "Replace W-9" : "Upload W-9"}
                    </label>
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
