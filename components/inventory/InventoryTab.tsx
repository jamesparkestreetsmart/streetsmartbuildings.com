"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────

interface InventorySpace {
  space_id: string;
  name: string;
  space_type: string;
  site_id: string;
  device_count: number;
}

interface SiteInfo {
  site_id: string;
  site_name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  status: string;
}

interface OrgSite {
  site_id: string;
  site_name: string;
  address_line1: string;
  city: string;
  state: string;
}

type SortField = "name" | "site" | "type" | "device_count";
type SortDir = "asc" | "desc";

// ─── Component ───────────────────────────────────────────────

export default function InventoryTab({
  siteId,
  mode = "org",
}: {
  siteId: string;
  mode?: "org" | "site";
}) {
  const [spaces, setSpaces] = useState<InventorySpace[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, SiteInfo>>({});
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [showAddSpace, setShowAddSpace] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const loadData = useCallback(async () => {
    setLoading(true);

    // Get org_id from this site
    const { data: siteData } = await supabase
      .from("a_sites")
      .select("org_id")
      .eq("site_id", siteId)
      .single();

    const currentOrgId = siteData?.org_id;
    if (currentOrgId) {
      setOrgId(currentOrgId);
    }

    let spaceData: InventorySpace[] = [];

    if (mode === "org" && currentOrgId) {
      // ORG MODE: Get all sites in the org
      const { data: allSites } = await supabase
        .from("a_sites")
        .select("site_id, site_name, address_line1, city, state, status")
        .eq("org_id", currentOrgId)
        .order("site_name");

      const sMap: Record<string, SiteInfo> = {};
      for (const s of allSites || []) {
        sMap[s.site_id] = s;
      }
      setSitesMap(sMap);

      // Get ALL storage spaces across all sites in the org
      const siteIds = (allSites || []).map((s) => s.site_id);
      if (siteIds.length > 0) {
        const { data: spacesResult } = await supabase
          .from("a_spaces")
          .select("space_id, name, space_type, site_id")
          .in("site_id", siteIds)
          .eq("space_type", "inventory_storage")
          .neq("name", "Unassigned")
          .order("name");

        spaceData = (spacesResult || []).map((s) => ({ ...s, device_count: 0 }));
      }
    } else {
      // SITE MODE: Get only storage spaces on this specific site
      const { data: spacesResult } = await supabase
        .from("a_spaces")
        .select("space_id, name, space_type, site_id")
        .eq("site_id", siteId)
        .eq("space_type", "inventory_storage")
        .neq("name", "Unassigned")
        .order("name");

      spaceData = (spacesResult || []).map((s) => ({ ...s, device_count: 0 }));

      // Get this site's info
      const { data: thisSite } = await supabase
        .from("a_sites")
        .select("site_id, site_name, address_line1, city, state, status")
        .eq("site_id", siteId)
        .single();

      if (thisSite) {
        setSitesMap({ [thisSite.site_id]: thisSite });
      }
    }

    // Fetch device counts for all spaces
    if (spaceData.length > 0) {
      const spaceIds = spaceData.map((s) => s.space_id);
      const { data: devices } = await supabase
        .from("a_devices")
        .select("space_id")
        .in("space_id", spaceIds);

      if (devices) {
        const countMap: Record<string, number> = {};
        for (const d of devices) {
          if (d.space_id) {
            countMap[d.space_id] = (countMap[d.space_id] || 0) + 1;
          }
        }
        spaceData = spaceData.map((s) => ({
          ...s,
          device_count: countMap[s.space_id] || 0,
        }));
      }
    }

    setSpaces(spaceData);
    setLoading(false);
  }, [siteId, mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Sorting ─────────────────────────────────────────────

  const sortedSpaces = useMemo(() => {
    const sorted = [...spaces].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "site":
          aVal = (sitesMap[a.site_id]?.site_name || "").toLowerCase();
          bVal = (sitesMap[b.site_id]?.site_name || "").toLowerCase();
          break;
        case "type":
          aVal = a.space_type.toLowerCase();
          bVal = b.space_type.toLowerCase();
          break;
        case "device_count":
          aVal = a.device_count;
          bVal = b.device_count;
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [spaces, sortField, sortDir, sitesMap]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function renderSortIcon(field: SortField) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // ─── CSV Export ──────────────────────────────────────────

  function exportCSV() {
    const headers = mode === "org"
      ? ["Space Name", "Devices", "Site", "Type"]
      : ["Space Name", "Devices", "Type"];

    const rows = sortedSpaces.map((space) => {
      const site = sitesMap[space.site_id];
      const siteName = site?.status === "inventory" ? "Org HQ" : (site?.site_name || "—");

      if (mode === "org") {
        return [space.name, String(space.device_count), siteName, space.space_type];
      } else {
        return [space.name, String(space.device_count), space.space_type];
      }
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-spaces-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {mode === "org" ? "Inventory Spaces" : "Inventory"}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {spaces.length} storage location{spaces.length !== 1 ? "s" : ""}
            {mode === "org" ? " across your organization" : " at this site"}
          </p>
        </div>

        <div className="flex gap-2">
          {spaces.length > 0 && (
            <Button
              variant="outline"
              onClick={exportCSV}
              className="text-sm"
            >
              ↓ Export CSV
            </Button>
          )}
          {mode === "org" && (
            <Button
              onClick={() => setShowAddSpace(true)}
              className="bg-green-600 hover:bg-green-700 text-white text-sm"
            >
              + Add Space
            </Button>
          )}
        </div>
      </div>

      {/* Spaces list */}
      {spaces.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">No inventory spaces yet.</p>
          <p className="text-sm text-gray-400">
            {mode === "org"
              ? "Add a space to define where devices and equipment are located."
              : "No storage spaces at this site."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th
                  className="px-5 py-3 font-medium cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleSort("name")}
                >
                  Space Name {renderSortIcon("name")}
                </th>
                <th
                  className="px-5 py-3 font-medium cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleSort("device_count")}
                >
                  Devices {renderSortIcon("device_count")}
                </th>
                {mode === "org" && (
                  <th
                    className="px-5 py-3 font-medium cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort("site")}
                  >
                    Site {renderSortIcon("site")}
                  </th>
                )}
                <th
                  className="px-5 py-3 font-medium cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleSort("type")}
                >
                  Type {renderSortIcon("type")}
                </th>
                {mode === "org" && (
                  <th className="px-5 py-3 font-medium text-right pr-5">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedSpaces.map((space) => {
                const site = sitesMap[space.site_id];
                const isInventorySite = site?.status === "inventory";

                return (
                  <tr
                    key={space.space_id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/sites/${space.site_id}/spaces/${space.space_id}`}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {space.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-medium ${space.device_count > 0 ? "text-gray-900" : "text-gray-400"}`}>
                        {space.device_count}
                      </span>
                    </td>
                    {mode === "org" && (
                      <td className="px-5 py-3 text-gray-700">
                        {site ? (
                          isInventorySite ? (
                            <span className="text-gray-400 italic">Org HQ</span>
                          ) : (
                            <Link
                              href={`/sites/${site.site_id}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {site.site_name}
                            </Link>
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                        {space.space_type}
                      </span>
                    </td>
                    {mode === "org" && (
                      <td className="px-5 py-3 text-right">
                        <DeleteSpaceButton
                          spaceId={space.space_id}
                          spaceName={space.name}
                          onDeleted={loadData}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Space Modal — org mode only */}
      {showAddSpace && orgId && (
        <AddSpaceModal
          inventorySiteId={siteId}
          orgId={orgId}
          existingSpaceNames={spaces.map((s) => s.name)}
          onClose={() => setShowAddSpace(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}

// ─── Delete Space Button ───────────────────────────────────

function DeleteSpaceButton({
  spaceId,
  spaceName,
  onDeleted,
}: {
  spaceId: string;
  spaceName: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${spaceName}"? This cannot be undone.`)) return;

    setDeleting(true);

    const { error } = await supabase
      .from("a_spaces")
      .delete()
      .eq("space_id", spaceId);

    if (error) {
      console.error("Delete error:", error);
      if (error.message?.includes("RESTRICT") || error.message?.includes("violates")) {
        alert(
          "Cannot delete this space — it has equipment attached. Move or remove equipment first."
        );
      } else {
        alert("Failed to delete space: " + error.message);
      }
      setDeleting(false);
      return;
    }

    setDeleting(false);
    onDeleted();
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
    >
      {deleting ? "Deleting..." : "Remove"}
    </button>
  );
}

// ─── Helper: generate unique space name ────────────────────

function getUniqueSpaceName(baseName: string, existingNames: string[]): string {
  const candidate = baseName + " Inventory Storage";
  if (!existingNames.includes(candidate)) return candidate;

  let counter = 2;
  while (existingNames.includes(candidate + " " + counter)) {
    counter++;
  }
  return candidate + " " + counter;
}

// ─── Add Space Modal ───────────────────────────────────────

function AddSpaceModal({
  inventorySiteId,
  orgId,
  existingSpaceNames,
  onClose,
  onSaved,
}: {
  inventorySiteId: string;
  orgId: string;
  existingSpaceNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [orgSites, setOrgSites] = useState<OrgSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);

  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newPostalCode, setNewPostalCode] = useState("");
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    const fetchSites = async () => {
      const { data: sites } = await supabase
        .from("a_sites")
        .select("site_id, site_name, address_line1, city, state")
        .eq("org_id", orgId)
        .neq("status", "inventory")
        .order("site_name");

      setOrgSites(sites || []);
      setLoadingSites(false);
    };
    fetchSites();
  }, [orgId]);

  useEffect(() => {
    if (mode === "existing" && selectedSiteId) {
      const site = orgSites.find((s) => s.site_id === selectedSiteId);
      if (site) {
        setCustomName(getUniqueSpaceName(site.site_name, existingSpaceNames));
      }
    }
  }, [selectedSiteId, mode, orgSites, existingSpaceNames]);

  useEffect(() => {
    if (mode === "new" && newAddress) {
      setCustomName(getUniqueSpaceName(newAddress, existingSpaceNames));
    }
  }, [newAddress, mode, existingSpaceNames]);

  useEffect(() => {
    if (customName && existingSpaceNames.includes(customName)) {
      setNameError("A space with this name already exists. Please customize it.");
    } else {
      setNameError("");
    }
  }, [customName, existingSpaceNames]);

  const canSave =
    customName.trim() &&
    !nameError &&
    (mode === "existing"
      ? !!selectedSiteId
      : newAddress.trim() &&
        newCity.trim() &&
        newState.trim() &&
        newPostalCode.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    const targetSiteId = mode === "existing" ? selectedSiteId : inventorySiteId;

    const { error } = await supabase.from("a_spaces").insert({
      site_id: targetSiteId,
      name: customName.trim(),
      space_type: "inventory_storage",
    });

    if (error) {
      console.error("Space insert error:", error);
      if (error.code === "23505") {
        alert("A space with this name already exists.");
      } else {
        alert("Failed to add space: " + error.message);
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    onClose();
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Add Space</h2>

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setMode("existing")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "existing"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Existing Site
          </button>
          <button
            onClick={() => setMode("new")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "new"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            New Address
          </button>
        </div>

        <div className="space-y-4">
          {mode === "existing" ? (
            <div>
              <Label className="text-sm font-medium">Select Site *</Label>
              {loadingSites ? (
                <Input value="Loading..." disabled />
              ) : orgSites.length === 0 ? (
                <p className="text-sm text-gray-500 mt-1">No sites found.</p>
              ) : (
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Choose a site" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-[60]">
                    {orgSites.map((site) => (
                      <SelectItem
                        key={site.site_id}
                        value={site.site_id}
                        className="bg-white hover:bg-blue-50 cursor-pointer"
                      >
                        {site.site_name}
                        {site.address_line1 && (
                          <span className="text-xs text-gray-500 ml-2">
                            — {site.address_line1}, {site.city}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <>
              <div>
                <Label className="text-sm font-medium">Address *</Label>
                <Input
                  placeholder="e.g., 123 Main St"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm font-medium">City *</Label>
                  <Input
                    placeholder="Nashville"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">State *</Label>
                  <Input
                    placeholder="TN"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">ZIP *</Label>
                  <Input
                    placeholder="37207"
                    value={newPostalCode}
                    onChange={(e) => setNewPostalCode(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <Label className="text-sm font-medium">Space Name *</Label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Auto-generated — customize if needed"
            />
            {nameError && (
              <p className="text-xs text-red-600 mt-1">{nameError}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Must be unique. Add detail like &quot;Kitchen&quot; or &quot;Roof&quot; to distinguish.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Creating..." : "Create Space"}
          </Button>
        </div>
      </div>
    </div>
  );
}
