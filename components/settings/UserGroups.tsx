"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { Users, MapPin, Pencil, Trash2, Plus, ChevronDown, ChevronRight, Upload, Info } from "lucide-react";

interface Member {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface SiteOption {
  site_id: string;
  site_name: string;
}

interface GroupMember {
  user_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface GroupSite {
  site_id: string;
  site_name?: string;
}

interface Group {
  group_id: string;
  org_id: string;
  name: string;
  alerts_enabled: boolean;
  member_count: number;
  site_count: number;
  members: GroupMember[];
  sites: GroupSite[];
}

interface UserGroupsProps {
  orgId: string;
  members: Member[];
  sites: SiteOption[];
}

export default function UserGroups({ orgId, members, sites }: UserGroupsProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formName, setFormName] = useState("");
  const [formAlerts, setFormAlerts] = useState(true);
  const [formUserIds, setFormUserIds] = useState<string[]>([]);
  const [formSiteIds, setFormSiteIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingStep, setMappingStep] = useState<"pick" | "map" | "done">("pick");
  const [suggestingMapping, setSuggestingMapping] = useState(false);

  const MAPPING_FIELDS = [
    { key: "region_name", label: "Region/Group Name" },
    { key: "dm_email", label: "Manager Email" },
    { key: "dm_name", label: "Manager Name" },
    { key: "site_name", label: "Site Name" },
    { key: "site_code", label: "Site Code" },
  ];

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
        setExpandedIds(new Set(data.map((g: Group) => g.group_id)));
      }
    } catch (err) {
      console.error("Failed to fetch groups:", err);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const openCreate = () => {
    setEditingGroup(null);
    setFormName("");
    setFormAlerts(true);
    setFormUserIds([]);
    setFormSiteIds([]);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (group: Group) => {
    setEditingGroup(group);
    setFormName(group.name);
    setFormAlerts(group.alerts_enabled);
    setFormUserIds(group.members.map((m) => m.user_id));
    setFormSiteIds(group.sites.map((s) => s.site_id));
    setFormError(null);
    setShowModal(true);
  };

  const saveGroup = async () => {
    if (!formName.trim()) {
      setFormError("Group name is required");
      return;
    }
    setSaving(true);
    setFormError(null);

    try {
      const url = editingGroup
        ? `/api/groups/${editingGroup.group_id}`
        : "/api/groups";
      const method = editingGroup ? "PUT" : "POST";

      const body: Record<string, unknown> = {
        name: formName.trim(),
        alerts_enabled: formAlerts,
        user_ids: formUserIds,
        site_ids: formSiteIds,
      };
      if (!editingGroup) body.org_id = orgId;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || "Failed to save group");
        setSaving(false);
        return;
      }

      setShowModal(false);
      fetchGroups();
    } catch {
      setFormError("Network error");
    }
    setSaving(false);
  };

  const deleteGroup = async (groupId: string, groupName: string) => {
    if (!window.confirm(`Delete group "${groupName}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
    if (res.ok) {
      fetchGroups();
    } else {
      alert("Failed to delete group");
    }
  };

  const toggleAlerts = async (group: Group) => {
    await fetch(`/api/groups/${group.group_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alerts_enabled: !group.alerts_enabled }),
    });
    fetchGroups();
  };

  const toggleUserId = (userId: string) => {
    setFormUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSiteId = (siteId: string) => {
    setFormSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  };

  // ===== Excel Upload =====
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadResult(null);
    setMappingStep("map");

    // Extract headers client-side using SheetJS
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      if (data.length > 0) {
        const hdrs = (data[0] as string[]).map(String);
        setHeaders(hdrs);

        // Try to get AI mapping suggestion
        setSuggestingMapping(true);
        try {
          const sampleRows = data.slice(1, 4).map((row) =>
            (row as string[]).map(String)
          );
          const res = await fetch("/api/groups/mapping/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ headers: hdrs, sampleRows }),
          });
          if (res.ok) {
            const suggested = await res.json();
            setMapping(suggested.mapping || {});
          }
        } catch {
          // AI suggestion failed — user maps manually
        }
        setSuggestingMapping(false);
      }
    } catch {
      setFormError("Could not read file headers");
    }
  };

  const submitUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);

    // First save the mapping
    await fetch("/api/groups/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, mapping, sample_headers: headers }),
    });

    // Then upload the file
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("org_id", orgId);
    formData.append("mapping", JSON.stringify(mapping));

    try {
      const res = await fetch("/api/groups/upload", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      setUploadResult(result);
      setMappingStep("done");
      fetchGroups();
    } catch {
      setUploadResult({ error: "Upload failed" });
    }
    setUploading(false);
  };

  const resetUpload = () => {
    setShowUpload(false);
    setUploadFile(null);
    setHeaders([]);
    setMapping({});
    setMappingStep("pick");
    setUploadResult(null);
  };

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-green-700" />
          <h2 className="text-lg font-semibold">User Groups (Regions)</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50"
          >
            <Upload className="w-4 h-4" /> Upload Region File
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400 hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Add Group
          </button>
        </div>
      </div>

      {/* Groups Table */}
      {loading ? (
        <div className="text-sm text-gray-500 py-4">Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-gray-500 py-4 text-center border rounded-lg bg-gray-50">
          No groups yet. Create a group or upload a region file to get started.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left text-xs uppercase font-semibold tracking-wider">
              <tr>
                <th className="py-2.5 px-3 w-8"></th>
                <th className="py-2.5 px-3">Group Name</th>
                <th className="py-2.5 px-3 text-center">Sites</th>
                <th className="py-2.5 px-3 text-center">Members</th>
                <th className="py-2.5 px-3 text-center">Alerts</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isExpanded = expandedIds.has(group.group_id);
                return (
                  <Fragment key={group.group_id}>
                    <tr className="border-t hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <button
                          onClick={() =>
                            setExpandedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.group_id)) next.delete(group.group_id);
                              else next.add(group.group_id);
                              return next;
                            })
                          }
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-2 px-3 font-medium">{group.name}</td>
                      <td className="py-2 px-3 text-center">{group.site_count}</td>
                      <td className="py-2 px-3 text-center">{group.member_count}</td>
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => toggleAlerts(group)}
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            group.alerts_enabled
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {group.alerts_enabled ? "On" : "Off"}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => openEdit(group)}
                          className="text-gray-400 hover:text-blue-600 mr-2"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => deleteGroup(group.group_id, group.name)}
                          className="text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-3">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" /> Sites
                              </h4>
                              {group.sites.length === 0 ? (
                                <p className="text-xs text-gray-400">No sites assigned</p>
                              ) : (
                                <ul className="text-xs text-gray-700 space-y-0.5">
                                  {group.sites.map((s) => (
                                    <li key={s.site_id}>
                                      {s.site_name || s.site_id}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" /> Members
                              </h4>
                              {group.members.length === 0 ? (
                                <p className="text-xs text-gray-400">No members assigned</p>
                              ) : (
                                <ul className="text-xs text-gray-700 space-y-0.5">
                                  {group.members.map((m) => (
                                    <li key={m.user_id}>
                                      {m.first_name} {m.last_name}{" "}
                                      <span className="text-gray-400">({m.email})</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Create/Edit Modal ===== */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">
              {editingGroup ? "Edit Group" : "Create Group"}
            </h3>

            {formError && (
              <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded">
                {formError}
              </div>
            )}

            {/* Group Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Group Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full border rounded-md px-3 py-1.5 text-sm"
                placeholder="e.g. Northeast Region"
              />
            </div>

            {/* Alerts Toggle */}
            <div className="mb-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="alerts-toggle"
                checked={formAlerts}
                onChange={(e) => setFormAlerts(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="alerts-toggle" className="text-sm text-gray-700">
                Enable alerts for this group
              </label>
            </div>

            {/* Members Multi-select */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Members ({formUserIds.length} selected)
              </label>
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {members.map((m) => (
                  <label
                    key={m.user_id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={formUserIds.includes(m.user_id)}
                      onChange={() => toggleUserId(m.user_id)}
                      className="rounded"
                    />
                    <span>
                      {m.first_name} {m.last_name}{" "}
                      <span className="text-gray-400">({m.email})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Sites Multi-select */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sites ({formSiteIds.length} selected)
              </label>
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {sites.map((s) => (
                  <label
                    key={s.site_id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={formSiteIds.includes(s.site_id)}
                      onChange={() => toggleSiteId(s.site_id)}
                      className="rounded"
                    />
                    <span>{s.site_name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={saveGroup}
                disabled={saving}
                className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400 hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Upload Modal ===== */}
      {showUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={resetUpload}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Upload Region File</h3>

            <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-blue-50 rounded text-xs text-blue-700">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Uploads are additive — existing groups and assignments are preserved.
                New data is merged in. Supported formats: .xlsx, .xls, .csv
              </span>
            </div>

            {mappingStep === "pick" && (
              <div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                <div className="flex justify-end pt-3 mt-3 border-t">
                  <button
                    onClick={resetUpload}
                    className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {mappingStep === "map" && (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Map your file columns to the required fields:
                </p>
                {suggestingMapping && (
                  <p className="text-xs text-blue-600 mb-2">AI is suggesting column mappings...</p>
                )}
                <div className="space-y-2">
                  {MAPPING_FIELDS.map((field) => (
                    <div key={field.key} className="flex items-center gap-3">
                      <label className="text-sm w-36 text-gray-700">{field.label}</label>
                      <select
                        value={mapping[field.key] || ""}
                        onChange={(e) =>
                          setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="flex-1 border rounded-md px-2 py-1.5 text-sm"
                      >
                        <option value="">— Skip —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-4 pt-3 border-t">
                  <button
                    onClick={() => {
                      setMappingStep("pick");
                      setUploadFile(null);
                      setHeaders([]);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Re-map Columns
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={resetUpload}
                      className="px-4 py-1.5 text-sm text-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitUpload}
                      disabled={uploading || !mapping.region_name}
                      className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400 hover:opacity-90 disabled:opacity-50"
                    >
                      {uploading ? "Processing..." : "Upload & Process"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {mappingStep === "done" && uploadResult && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Results</h4>
                {uploadResult.error ? (
                  <div className="px-3 py-2 bg-red-50 text-red-700 text-sm rounded">
                    {uploadResult.error}
                  </div>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p>Rows processed: <strong>{uploadResult.rows_processed ?? 0}</strong></p>
                    <p>Groups created: <strong>{uploadResult.groups_created ?? 0}</strong></p>
                    <p>Groups updated: <strong>{uploadResult.groups_updated ?? 0}</strong></p>
                    <p>Users assigned: <strong>{uploadResult.users_assigned ?? 0}</strong></p>
                    <p>Sites assigned: <strong>{uploadResult.sites_assigned ?? 0}</strong></p>
                    {uploadResult.unmatched_users?.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-amber-600">
                          Unmatched users ({uploadResult.unmatched_users.length}):
                        </p>
                        <ul className="mt-1 text-xs text-amber-700 max-h-24 overflow-y-auto">
                          {uploadResult.unmatched_users.map((u: any, i: number) => (
                            <li key={i}>Row {u.row}: {u.email} (group: {u.group})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {uploadResult.unmatched_sites?.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-amber-600">
                          Unmatched sites ({uploadResult.unmatched_sites.length}):
                        </p>
                        <ul className="mt-1 text-xs text-amber-700 max-h-24 overflow-y-auto">
                          {uploadResult.unmatched_sites.map((s: any, i: number) => (
                            <li key={i}>
                              Row {s.row}: {s.site_code || s.site_name} (group: {s.group})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {uploadResult.errors?.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium text-red-600">
                          Errors ({uploadResult.errors.length}):
                        </p>
                        <ul className="mt-1 text-xs text-red-600 max-h-24 overflow-y-auto">
                          {uploadResult.errors.map((err: any, i: number) => (
                            <li key={i}>Row {err.row}: {err.reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-end mt-4 pt-3 border-t">
                  <button
                    onClick={resetUpload}
                    className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400 hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

