"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Plus, Pencil, X, Check, ChevronDown } from "lucide-react";

interface Organization {
  org_id: string;
  org_name: string;
  org_identifier: string;
  owner_email: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  dummy_site_id: string | null;
  dummy_equipment_id: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY_ORG = {
  org_name: "",
  org_identifier: "",
  owner_email: "",
  owner_first_name: "",
  owner_last_name: "",
};

export default function OrganizationsAdminCard() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Organization>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Add org state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newOrg, setNewOrg] = useState(EMPTY_ORG);
  const [addingOrg, setAddingOrg] = useState(false);

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/organizations");
      const data = await res.json();
      setOrgs(data.organizations || []);
    } catch (err) {
      console.error("Failed to load orgs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const selectedOrg = orgs.find((o) => o.org_id === selectedOrgId) || null;

  function startEdit() {
    if (!selectedOrg) return;
    setEditing(true);
    setEditForm({
      org_name: selectedOrg.org_name,
      owner_email: selectedOrg.owner_email,
      owner_first_name: selectedOrg.owner_first_name || "",
      owner_last_name: selectedOrg.owner_last_name || "",
      billing_street: selectedOrg.billing_street || "",
      billing_city: selectedOrg.billing_city || "",
      billing_state: selectedOrg.billing_state || "",
      billing_postal_code: selectedOrg.billing_postal_code || "",
      billing_country: selectedOrg.billing_country || "US",
    });
  }

  async function handleSave() {
    if (!selectedOrgId) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: selectedOrgId, updates: editForm }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMessage("Saved");
        setEditing(false);
        fetchOrgs();
      } else {
        setSaveMessage(`Error: ${data.error || "Failed"}`);
      }
    } catch {
      setSaveMessage("Error: Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  async function handleAddOrg() {
    if (!newOrg.org_name || !newOrg.org_identifier) return;
    setAddingOrg(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOrg),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddForm(false);
        setNewOrg(EMPTY_ORG);
        fetchOrgs();
      } else {
        alert(`Error: ${data.error || "Failed to create org"}`);
      }
    } catch {
      alert("Error: Failed to create org");
    } finally {
      setAddingOrg(false);
    }
  }

  // Sort: SSB first, then alphabetical
  const sortedOrgs = [...orgs].sort((a, b) => {
    if (a.org_identifier === "SSB1") return -1;
    if (b.org_identifier === "SSB1") return 1;
    return a.org_name.localeCompare(b.org_name);
  });

  if (loading) {
    return (
      <div className="border rounded-lg p-6 bg-white">
        <div className="animate-pulse text-gray-400">Loading organizations…</div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Organizations</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {orgs.length} organization{orgs.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(!showAddForm); setSelectedOrgId(null); setEditing(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700"
        >
          <Plus className="w-4 h-4" />
          Add Org
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* Add Org Form */}
        {showAddForm && (
          <div className="border-2 border-dashed border-green-300 rounded-lg p-4 bg-green-50">
            <h4 className="font-semibold text-sm text-green-800 mb-3">New Organization</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Org Name *</label>
                <input
                  type="text"
                  value={newOrg.org_name}
                  onChange={(e) => setNewOrg({ ...newOrg, org_name: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Org Code * (4 letters)</label>
                <input
                  type="text"
                  value={newOrg.org_identifier}
                  onChange={(e) => setNewOrg({ ...newOrg, org_identifier: e.target.value.toUpperCase().slice(0, 4) })}
                  className="w-full border rounded px-2 py-1.5 text-sm uppercase tracking-widest"
                  placeholder="ACME"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner First Name</label>
                <input
                  type="text"
                  value={newOrg.owner_first_name}
                  onChange={(e) => setNewOrg({ ...newOrg, owner_first_name: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner Last Name</label>
                <input
                  type="text"
                  value={newOrg.owner_last_name}
                  onChange={(e) => setNewOrg({ ...newOrg, owner_last_name: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner Email</label>
                <input
                  type="email"
                  value={newOrg.owner_email}
                  onChange={(e) => setNewOrg({ ...newOrg, owner_email: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="owner@company.com"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddOrg}
                disabled={addingOrg || !newOrg.org_name || !newOrg.org_identifier}
                className="px-4 py-1.5 rounded text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {addingOrg ? "Creating…" : "Create Organization"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewOrg(EMPTY_ORG); }}
                className="px-4 py-1.5 rounded text-sm font-semibold border text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Org Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 border rounded-lg bg-gray-50 hover:bg-gray-100 text-sm"
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-green-600" />
              <span className="font-medium">
                {selectedOrg ? (
                  <>
                    {selectedOrg.org_name}
                    <span className="text-gray-400 ml-2 font-normal">{selectedOrg.org_identifier}</span>
                  </>
                ) : (
                  <span className="text-gray-400">Select an organization to view details…</span>
                )}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 border rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto z-10">
              {sortedOrgs.map((org) => {
                const isSSB = org.org_identifier === "SSB1";
                const isSelected = selectedOrgId === org.org_id;
                return (
                  <button
                    key={org.org_id}
                    onClick={() => {
                      setSelectedOrgId(org.org_id);
                      setDropdownOpen(false);
                      setEditing(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      isSelected
                        ? "bg-green-50 text-green-700 font-semibold"
                        : isSSB
                        ? "bg-gradient-to-r from-green-50 to-yellow-50 hover:from-green-100 hover:to-yellow-100 text-green-800"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isSSB && <span className="text-yellow-500 text-xs">★</span>}
                        <span className="font-medium">{org.org_name}</span>
                        <span className="text-xs text-gray-400">{org.org_identifier}</span>
                      </div>
                      {org.dummy_site_id && (
                        <span className="text-green-500 text-xs">✓ Inventory</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Org Details */}
        {selectedOrg && !editing && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <div>
                <span className="text-gray-400 text-xs">Owner</span>
                <div className="text-gray-900">{selectedOrg.owner_first_name} {selectedOrg.owner_last_name}</div>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Email</span>
                <div className="text-gray-900">{selectedOrg.owner_email}</div>
              </div>
              {selectedOrg.billing_street && (
                <div className="col-span-2">
                  <span className="text-gray-400 text-xs">Billing</span>
                  <div className="text-gray-900">
                    {selectedOrg.billing_street}, {selectedOrg.billing_city}, {selectedOrg.billing_state} {selectedOrg.billing_postal_code}
                  </div>
                </div>
              )}
              <div>
                <span className="text-gray-400 text-xs">Inventory</span>
                <div className={selectedOrg.dummy_site_id ? "text-green-600" : "text-red-500"}>
                  {selectedOrg.dummy_site_id ? "✓ Created" : "✗ Missing"}
                </div>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Org Code</span>
                <div className="text-gray-900 font-mono">{selectedOrg.org_identifier}</div>
              </div>
            </div>
            <button
              onClick={startEdit}
              className="mt-3 flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium border text-gray-600 hover:bg-gray-100"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>
        )}

        {/* Edit Mode */}
        {selectedOrg && editing && (
          <div className="border rounded-lg p-4 bg-white">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Org Name</label>
                <input
                  type="text"
                  value={editForm.org_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, org_name: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Org Code</label>
                <input
                  type="text"
                  value={selectedOrg.org_identifier}
                  disabled
                  className="w-full border rounded px-2 py-1.5 text-sm bg-gray-100 text-gray-500 cursor-not-allowed uppercase tracking-widest"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Owner First Name</label>
                <input
                  type="text"
                  value={editForm.owner_first_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, owner_first_name: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Owner Last Name</label>
                <input
                  type="text"
                  value={editForm.owner_last_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, owner_last_name: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Owner Email</label>
                <input
                  type="email"
                  value={editForm.owner_email || ""}
                  onChange={(e) => setEditForm({ ...editForm, owner_email: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Billing Street</label>
                <input
                  type="text"
                  value={editForm.billing_street || ""}
                  onChange={(e) => setEditForm({ ...editForm, billing_street: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <input
                  type="text"
                  value={editForm.billing_city || ""}
                  onChange={(e) => setEditForm({ ...editForm, billing_city: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                <input
                  type="text"
                  value={editForm.billing_state || ""}
                  onChange={(e) => setEditForm({ ...editForm, billing_state: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Postal Code</label>
                <input
                  type="text"
                  value={editForm.billing_postal_code || ""}
                  onChange={(e) => setEditForm({ ...editForm, billing_postal_code: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                <input
                  type="text"
                  value={editForm.billing_country || ""}
                  onChange={(e) => setEditForm({ ...editForm, billing_country: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-semibold border text-gray-600 hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              {saveMessage && (
                <span className={`text-xs ${saveMessage.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                  {saveMessage}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
