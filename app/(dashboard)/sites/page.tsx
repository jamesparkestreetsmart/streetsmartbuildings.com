"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useOrg } from "@/context/OrgContext";
import { Button } from "@/components/ui/button";
import { Download, Archive } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Site {
  site_id: string;
  org_id: string;
  site_name: string;
  address: string;
  postal_code: string;
  active_alerts: number;
  alerts_last_30: number;
  phone_number: string | null;
  status: string;
  last_status_change: string;
  created_at: string;
  industry: string | null;
  brand: string | null;
}

interface SiteFormData {
  name: string;
  industry_id: string;
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
  total_area_sqft: string;
}

interface Industry {
  industry_id: string;
  name: string;
}

interface Brand {
  brand_id: string;
  industry_id: string;
  name: string;
}

// Helper type for cleaning form payloads (no `any`)
type Cleanable = {
  [key: string]: string | number | null | undefined;
};

export default function SitesPage() {
  const { selectedOrgId } = useOrg();
  const [sites, setSites] = useState<Site[]>([]);
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<keyof Site>("site_name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // Industry & Brand data
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<Brand[]>([]);
  const [loadingIndustries, setLoadingIndustries] = useState(true);
  const [loadingBrands, setLoadingBrands] = useState(true);

  const [formData, setFormData] = useState<SiteFormData>({
    name: "",
    industry_id: "",
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
  const [siteType, setSiteType] = useState<"Pending" | "inventory">("Pending");

  // NOT NULL columns that must keep "" instead of becoming null
  const notNullStringCols = new Set(["site_email", "address_line1", "country"]);

  // Helper: trim strings and turn "" -> null (except NOT NULL cols)
  const cleanAndTrim = (obj: Cleanable): Cleanable => {
    const cleaned: Cleanable = {};
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === "string") {
        const trimmed = value.trim();
        cleaned[key] = trimmed === "" ? (notNullStringCols.has(key) ? "" : null) : trimmed;
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  // ===== Fetch Sites (using view_sites_summary) =====
  const fetchSites = async () => {
    if (!selectedOrgId) {
      setSites([]);
      return;
    }

    const { data, error } = await supabase
      .from("view_sites_summary")
      .select("*")
      .eq("org_id", selectedOrgId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error fetching sites:", error);
    } else {
      console.log("✅ Sites fetched:", data);
      setSites((data as Site[]) || []);
    }
  };

  // ===== Retire Site =====
  const handleRetireSite = async (site: Site) => {
    const confirmed = window.confirm(
      `Retire "${site.site_name}"?\n\nThis site will remain visible for 90 days, then disappear from the list. Data is preserved.`
    );
    if (!confirmed) return;

    setDeleting(site.site_id);
    try {
      const { error } = await supabase
        .from("a_sites")
        .update({ status: "Retired" })
        .eq("site_id", site.site_id);

      if (error) {
        console.error("Error retiring site:", error);
        alert(`❌ Failed to retire site: ${error.message}`);
      } else {
        // Log to audit trail
        await supabase.from("b_records_log").insert({
          org_id: site.org_id,
          site_id: site.site_id,
          event_type: "site_retired",
          source: "sites_ui",
          message: `Site retired: ${site.site_name}`,
          metadata: {
            site_name: site.site_name,
            previous_status: site.status,
          },
          created_by: "admin",
          event_date: new Date().toISOString().split("T")[0],
        });
        fetchSites();
      }
    } catch (err) {
      console.error("Retire error:", err);
      alert("❌ Unexpected error retiring site");
    } finally {
      setDeleting(null);
    }
  };

  // ===== Fetch Industries =====
  const fetchIndustries = async () => {
    const { data, error } = await supabase
      .from("library_industries")
      .select("industry_id, name")
      .order("name");

    if (error) {
      console.error("Error fetching industries:", error);
    } else {
      setIndustries(data || []);
    }
    setLoadingIndustries(false);
  };

  // ===== Fetch Brands =====
  const fetchBrands = async () => {
    const { data, error } = await supabase
      .from("library_brands")
      .select("brand_id, industry_id, name")
      .order("name");

    if (error) {
      console.error("Error fetching brands:", error);
    } else {
      setBrands(data || []);
    }
    setLoadingBrands(false);
  };

  // Re-fetch sites when org changes
  useEffect(() => {
    fetchSites();
  }, [selectedOrgId]);

  // Load industries and brands once
  useEffect(() => {
    fetchIndustries();
    fetchBrands();
  }, []);

  // Filter brands when industry changes
  useEffect(() => {
    if (formData.industry_id) {
      const filtered = brands.filter(b => b.industry_id === formData.industry_id);
      setFilteredBrands(filtered);
    } else {
      setFilteredBrands([]);
    }
  }, [formData.industry_id, brands]);

  // Handle industry change - clear brand when industry changes
  const handleIndustryChange = (industryId: string) => {
    setFormData(prev => ({
      ...prev,
      industry_id: industryId,
      brand: "", // Clear brand when industry changes
    }));
  };

  // ===== Separate inventory site from real sites =====
  const inventorySite = sites.find((s) => s.status === "inventory");
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const realSites = sites.filter((s) => {
    if (s.status === "inventory") return false;
    if (s.status === "Retired") {
      // Show retired sites for 90 days after retirement
      const changed = new Date(s.last_status_change);
      return changed >= ninetyDaysAgo;
    }
    return true;
  });

  // ===== Sorting Logic =====
  const handleSort = (col: keyof Site) => {
    if (sortColumn === col) setSortAsc(!sortAsc);
    else {
      setSortColumn(col);
      setSortAsc(true);
    }
  };

  // ===== Search & Sorting (real sites only) =====
  const query = search.toLowerCase();
  const sorted = [...realSites]
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
      "Industry",
      "Brand",
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
      s.industry || "",
      s.brand || "",
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

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      industry_id: "",
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
    setSiteType("Pending");
  };

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

      {/* ===== Inventory Site Banner ===== */}
      {inventorySite && (
        <div className="mb-4 border rounded-lg bg-amber-50 border-amber-200 shadow-sm">
          <a
            href={`/sites/${inventorySite.site_id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-amber-100 transition rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-amber-200 flex items-center justify-center">
                <span className="text-amber-700 text-sm font-bold">📦</span>
              </div>
              <div>
                <div className="font-semibold text-amber-800 text-sm">Inventory</div>
                <div className="text-xs text-amber-600">Unassigned equipment &amp; devices</div>
              </div>
            </div>
            <div className="text-xs text-amber-500">View →</div>
          </a>
        </div>
      )}

      {/* ===== Table ===== */}
      <div className="overflow-x-auto border rounded-lg bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase font-semibold tracking-wider">
            <tr>
              {[
                ["site_name", "Site Name"],
                ["industry", "Industry"],
                ["brand", "Brand"],
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
              <th className="py-3 px-3 w-10"></th>
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-6 text-gray-500">
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
                  <td className="py-2 px-3">{s.industry || "-"}</td>
                  <td className="py-2 px-3">{s.brand || "-"}</td>
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
                        : s.status === "Retired"
                        ? "text-red-400 line-through"
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
                  <td className="py-2 px-2 text-center">
                    {s.status === "Retired" ? (
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm(`Restore "${s.site_name}" to Pending?`);
                          if (!confirmed) return;
                          const { error } = await supabase
                            .from("a_sites")
                            .update({ status: "Pending" })
                            .eq("site_id", s.site_id);
                          if (error) {
                            alert(`❌ Failed: ${error.message}`);
                          } else {
                            await supabase.from("b_records_log").insert({
                              org_id: s.org_id,
                              site_id: s.site_id,
                              event_type: "site_restored",
                              source: "sites_ui",
                              message: `Site restored: ${s.site_name}`,
                              metadata: { site_name: s.site_name, previous_status: "Retired" },
                              created_by: "admin",
                              event_date: new Date().toISOString().split("T")[0],
                            });
                            fetchSites();
                          }
                        }}
                        className="text-[10px] text-blue-500 hover:text-blue-700 underline"
                      >
                        restore
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRetireSite(s)}
                        disabled={deleting === s.site_id}
                        className="text-gray-400 hover:text-amber-600 transition disabled:opacity-50"
                        title={`Retire ${s.site_name}`}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
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
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Add New Site</h2>

            <form
              onSubmit={async (e) => {
                e.preventDefault();

                if (!selectedOrgId) {
                  alert("Please select an organization first");
                  return;
                }

                // Validation
                if (!formData.industry_id) {
                  alert("Please select an industry");
                  return;
                }
                if (!formData.brand) {
                  alert("Please select a brand");
                  return;
                }

                const base: Cleanable = {
                  site_name: formData.name,
                  industry: formData.industry_id,
                  brand: formData.brand,
                  customer_identifier_number: formData.customer_identifier,
                  address_line1: formData.address_line1 || "",
                  address_line2: formData.address_line2,
                  city: formData.city,
                  state: formData.state,
                  postal_code: formData.postal_code,
                  country: formData.country || "",
                  site_email: formData.site_email || "",
                  phone_number: formData.phone_number,
                  total_area_sqft: formData.total_area_sqft,
                  timezone: "America/Chicago",
                  org_id: selectedOrgId,
                };

                const cleaned = cleanAndTrim(base);

                // cast total_area_sqft to number if present
                if (cleaned.total_area_sqft != null) {
                  cleaned.total_area_sqft = Number(cleaned.total_area_sqft);
                }

                const { data: newSite, error } = await supabase
                  .from("a_sites")
                  .insert([cleaned])
                  .select("site_id, site_name")
                  .single();

                if (error) {
                  console.error("Error adding site:", error);
                  alert("❌ Failed to add site: " + error.message);
                } else {
                  // Log to audit trail
                  await supabase.from("b_records_log").insert({
                    org_id: selectedOrgId,
                    site_id: newSite.site_id,
                    event_type: "site_created",
                    source: "sites_ui",
                    message: `Site created: ${newSite.site_name}`,
                    metadata: {
                      site_name: newSite.site_name,
                      industry: formData.industry_id,
                      brand: formData.brand,
                      address: formData.address_line1,
                      postal_code: formData.postal_code,
                    },
                    created_by: "admin",
                    event_date: new Date().toISOString().split("T")[0],
                  });

                  alert("✅ Site added successfully!");
                  setShowModal(false);
                  resetForm();
                  fetchSites();
                }
              }}
              className="space-y-3"
            >
              {/* Site Name */}
              <div>
                <Label className="text-sm font-medium">Site Name *</Label>
                <input
                  name="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Wendy's #24 - Oneida"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>

              {/* Industry Dropdown */}
              <div>
                <Label className="text-sm font-medium">Industry *</Label>
                {loadingIndustries ? (
                  <div className="w-full border rounded-md px-3 py-2 text-sm text-gray-500">
                    Loading...
                  </div>
                ) : (
                  <Select
                    value={formData.industry_id}
                    onValueChange={handleIndustryChange}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-[250]">
                      {industries.map((ind) => (
                        <SelectItem
                          key={ind.industry_id}
                          value={ind.industry_id}
                          className="bg-white hover:bg-blue-50 cursor-pointer"
                        >
                          {ind.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Brand Dropdown (filtered by industry) */}
              <div>
                <Label className="text-sm font-medium">Brand *</Label>
                {loadingBrands ? (
                  <div className="w-full border rounded-md px-3 py-2 text-sm text-gray-500">
                    Loading...
                  </div>
                ) : !formData.industry_id ? (
                  <div className="w-full border rounded-md px-3 py-2 text-sm text-gray-400 bg-gray-50">
                    Select industry first
                  </div>
                ) : (
                  <Select
                    value={formData.brand}
                    onValueChange={(val) =>
                      setFormData({ ...formData, brand: val })
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-[250]">
                      {filteredBrands.map((brand) => (
                        <SelectItem
                          key={brand.brand_id}
                          value={brand.name}
                          className="bg-white hover:bg-blue-50 cursor-pointer"
                        >
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Customer Identifier */}
              <div>
                <Label className="text-sm font-medium">Customer Identifier (optional)</Label>
                <input
                  name="customer_identifier"
                  value={formData.customer_identifier}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      customer_identifier: e.target.value,
                    })
                  }
                  placeholder="e.g., Store #24"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* Address Line 1 */}
              <div>
                <Label className="text-sm font-medium">Address Line 1 *</Label>
                <input
                  name="address_line1"
                  value={formData.address_line1}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address_line1: e.target.value,
                    })
                  }
                  placeholder="Street address"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>

              {/* Address Line 2 */}
              <div>
                <Label className="text-sm font-medium">Address Line 2 (optional)</Label>
                <input
                  name="address_line2"
                  value={formData.address_line2}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address_line2: e.target.value,
                    })
                  }
                  placeholder="Suite, unit, building, floor, etc."
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* City / State / ZIP */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-sm font-medium">City *</Label>
                  <input
                    name="city"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    placeholder="City"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="w-20">
                  <Label className="text-sm font-medium">State *</Label>
                  <input
                    name="state"
                    value={formData.state}
                    onChange={(e) =>
                      setFormData({ ...formData, state: e.target.value })
                    }
                    placeholder="TN"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="w-24">
                  <Label className="text-sm font-medium">ZIP *</Label>
                  <input
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        postal_code: e.target.value,
                      })
                    }
                    placeholder="37207"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Country */}
              <div>
                <Label className="text-sm font-medium">Country (optional)</Label>
                <input
                  name="country"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      country: e.target.value,
                    })
                  }
                  placeholder="USA"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* Phone Number */}

              {/* Total Area */}
              <div>
                <Label className="text-sm font-medium">Total Area (sqft) (optional)</Label>
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
                  placeholder="2500"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
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
