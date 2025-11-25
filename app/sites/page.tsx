"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Site {
  site_id: string;
  site_name: string;
  address: string;
  postal_code: string;
  active_alerts: number;
  alerts_last_30: number;
  phone_number: string | null;
  status: string;
  last_status_change: string;
  created_at: string;
}

interface SiteFormData {
  name: string;
  brand: string;
  customer_identifier: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  site_email: string;
  phone_number: string;
  total_area_sqft: string; // keep as string in UI, cast before insert
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof Site>("site_name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<SiteFormData>({
    name: "",
    brand: "",
    customer_identifier: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    site_email: "",
    phone_number: "",
    total_area_sqft: "",
  });

  // Helper: trim strings and turn "" -> null
  const cleanAndTrim = (obj: Record<string, any>) => {
    const cleaned: Record<string, any> = {};
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === "string") {
        const trimmed = value.trim();
        cleaned[key] = trimmed === "" ? null : trimmed;
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  // ===== Fetch Sites (using view_sites_summary) =====
const fetchSites = async () => {
  const { data, error } = await supabase
    .from("view_sites_summary")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error fetching sites:", error);
  } else {
    console.log("✅ Sites fetched:", data);
    setSites(data || []);
  }
};

// Load once on page mount
useEffect(() => {
  (async () => {
    await fetchSites();
  })();
}, []);


  // ===== Sorting Logic =====
  const handleSort = (col: keyof Site) => {
    if (sortColumn === col) setSortAsc(!sortAsc);
    else {
      setSortColumn(col);
      setSortAsc(true);
    }
  };

  // ===== Search & Sorting =====
  const query = search.toLowerCase();
  const sorted = [...sites]
    .filter((s) =>
      query === ""
        ? true
        : Object.values(s).some((v) =>
            String(v).toLowerCase().includes(query)
          )
    )
    .sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

  // ===== Export CSV =====
  const exportToCSV = () => {
    if (sorted.length === 0) return;

    const header = [
      "Site Name",
      "Address",
      "Postal Code",
      "Active Alerts",
      "Alerts (Last 30 Days)",
      "Phone Number",
      "Status",
      "Last Status Change",
      "Created",
    ];

    const rows = sorted.map((s) => [
      s.site_name,
      s.address,
      s.postal_code,
      s.active_alerts,
      s.alerts_last_30,
      s.phone_number || "",
      s.status,
      new Date(s.last_status_change).toLocaleString("en-US", {
        timeZone: "America/Chicago",
      }),
      new Date(s.created_at).toLocaleString("en-US", {
        timeZone: "America/Chicago",
      }),
    ]);

    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `sites_export_${new Date().toISOString().slice(0, 19)}.csv`
    );
    link.click();
  };

  console.log("Modal state:", showModal);

  return (
    <div className="p-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sites</h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage site information and onboarding status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search sites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm"
          />
          <Button
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-gradient-to-r from-[#00a859] to-[#d4af37] text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm hover:opacity-90"
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button
            onClick={() => setShowModal(true)}
            className="bg-gradient-to-r from-[#00a859] to-[#d4af37] text-white font-semibold px-3 py-1.5 rounded-lg hover:opacity-90"
          >
            + Add Site
          </Button>
        </div>
      </div>

      {/* ===== Table ===== */}
      <div className="overflow-x-auto border rounded-lg bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase font-semibold tracking-wider">
            <tr>
              {[
                ["site_name", "Site Name"],
                ["address", "Address"],
                ["postal_code", "Postal Code"],
                ["active_alerts", "Active Alerts"],
                ["alerts_last_30", "Alerts (Last 30 Days)"],
                ["phone_number", "Phone"],
                ["status", "Status"],
                ["last_status_change", "Last Status Change"],
                ["created_at", "Created"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  className="py-3 px-3 cursor-pointer select-none"
                  onClick={() => handleSort(key as keyof Site)}
                >
                  {label}
                  {sortColumn === key && (sortAsc ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-6 text-gray-500">
                  No sites found
                </td>
              </tr>
            ) : (
              sorted.map((s, index) => (
                <tr
                  key={s.site_id}
                  className={`border-t transition ${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } hover:bg-gray-100`}
                >
                  <td className="py-2 px-3 text-emerald-700 font-medium hover:underline">
                    <a href={`/sites/${s.site_id}`}>{s.site_name}</a>
                  </td>
                  <td className="py-2 px-3">{s.address}</td>
                  <td className="py-2 px-3">{s.postal_code}</td>
                  <td className="py-2 px-3 text-center">
                    {s.active_alerts}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {s.alerts_last_30}
                  </td>
                  <td className="py-2 px-3">
                    {s.phone_number ? (
                      <a
                        href={`tel:${s.phone_number}`}
                        className="text-blue-600 hover:underline"
                      >
                        {s.phone_number}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td
                    className={`py-2 px-3 font-bold ${
                      s.status === "Pending"
                        ? "text-yellow-600"
                        : s.status === "Active"
                        ? "text-green-600"
                        : "text-gray-500"
                    }`}
                  >
                    {s.status}
                  </td>
                  <td className="py-2 px-3 text-gray-600">
                    {new Date(
                      s.last_status_change
                    ).toLocaleString("en-US", {
                      timeZone: "America/Chicago",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2 px-3 text-gray-600">
                    {new Date(s.created_at).toLocaleString("en-US", {
                      timeZone: "America/Chicago",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Add Site Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[200]">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md relative">
            <h2 className="text-xl font-bold mb-4">Add New Site</h2>

            <form
              onSubmit={async (e) => {
                e.preventDefault();

                const base = {
                  ...formData,
                  timezone: "America/Chicago",
                  org_id: "75d9a833-0359-4042-b760-4e5d587798e6",
                };

                const cleaned = cleanAndTrim(base);

                // cast total_area_sqft to number if present
                if (cleaned.total_area_sqft !== null) {
                  cleaned.total_area_sqft = Number(
                    cleaned.total_area_sqft
                  );
                }

                const { error } = await supabase
                  .from("a_sites")
                  .insert([cleaned]);

                if (error) {
                  console.error("Error adding site:", error);
                  alert("❌ Failed to add site.");
                } else {
                  alert("✅ Site added successfully!");
                  setShowModal(false);
                  setFormData({
                    name: "",
                    brand: "",
                    customer_identifier: "",
                    address_line1: "",
                    address_line2: "",
                    city: "",
                    state: "",
                    postal_code: "",
                    country: "",
                    site_email: "",
                    phone_number: "",
                    total_area_sqft: "",
                  });
                  fetchSites();
                }
              }}
              className="space-y-3"
            >
              <input
                name="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Site Name"
                className="w-full border rounded-md px-3 py-2 text-sm"
                required
              />
              <input
                name="brand"
                value={formData.brand}
                onChange={(e) =>
                  setFormData({ ...formData, brand: e.target.value })
                }
                placeholder="Brand (optional)"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <input
                name="customer_identifier"
                value={formData.customer_identifier}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    customer_identifier: e.target.value,
                  })
                }
                placeholder="Customer Identifier (optional)"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <input
                name="address_line1"
                value={formData.address_line1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address_line1: e.target.value,
                  })
                }
                placeholder="Address Line 1"
                className="w-full border rounded-md px-3 py-2 text-sm"
                required
              />
              <input
                name="address_line2"
                value={formData.address_line2}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address_line2: e.target.value,
                  })
                }
                placeholder="Address Line 2 (optional)"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <input
                  name="city"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  placeholder="City"
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                />
                <input
                  name="state"
                  value={formData.state}
                  onChange={(e) =>
                    setFormData({ ...formData, state: e.target.value })
                  }
                  placeholder="State"
                  className="w-24 border rounded-md px-3 py-2 text-sm"
                />
                <input
                  name="postal_code"
                  value={formData.postal_code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      postal_code: e.target.value,
                    })
                  }
                  placeholder="ZIP"
                  className="w-28 border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <input
                name="country"
                value={formData.country}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    country: e.target.value,
                  })
                }
                placeholder="Country (optional)"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <input
                name="site_email"
                type="email"
                value={formData.site_email}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    site_email: e.target.value,
                  })
                }
                placeholder="Site Email (optional)"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <input
                name="phone_number"
                value={formData.phone_number}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    phone_number: e.target.value,
                  })
                }
                placeholder="Phone Number"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <input
                name="total_area_sqft"
                type="number"
                value={formData.total_area_sqft}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    total_area_sqft: e.target.value,
                  })
                }
                placeholder="Total Area (sqft)"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />

              <div className="flex justify-end gap-3 mt-4">
                <Button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-gray-200 text-gray-800"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-[#00a859] to-[#d4af37] text-white"
                >
                  Save Site
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
