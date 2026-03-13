"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useOrg } from "@/context/OrgContext";
import { Lock, Copy, X } from "lucide-react";
import {
  SOP_METRICS, SOP_UNITS, SOP_EVALUATION_WINDOWS,
  SOP_TARGET_KINDS, SOP_SCOPE_LEVELS,
  metricLabel, scopeLevelLabel, scopeLevelColor, scopeLevelRank,
  metricsForTrack, scopeLevelsForTrack,
} from "@/lib/sop/constants";

// ── Types ───────────────────────────────────────────────────

interface SOPConfigRow {
  id: string;
  org_id: string | null;
  site_id: string | null;
  equipment_id: string | null;
  space_id: string | null;
  target_kind: string;
  scope_level: string;
  equipment_type: string | null;
  space_type: string | null;
  label: string;
  metric: string;
  min_value: number | null;
  max_value: number | null;
  evaluation_window: string;
  unit: string;
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  // Resolved names
  org_name?: string;
  site_name?: string;
  equipment_name?: string;
  space_name?: string;
}

// ── Helpers ─────────────────────────────────────────────────

const SCOPE_BADGE_COLORS: Record<string, string> = {
  blue:   "bg-blue-100 text-blue-700 border-blue-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
  teal:   "bg-teal-100 text-teal-700 border-teal-200",
  green:  "bg-green-100 text-green-700 border-green-200",
  amber:  "bg-amber-100 text-amber-700 border-amber-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  gray:   "bg-gray-100 text-gray-500 border-gray-200",
};

function formatRange(min: number | null, max: number | null, unit: string): string {
  const u = unit === "F" ? "°F" : unit === "C" ? "°C" : unit === "percent" ? "%" : ` ${unit}`;
  if (min != null && max != null) return `${min} – ${max}${u}`;
  if (max != null) return `≤ ${max}${u}`;
  if (min != null) return `≥ ${min}${u}`;
  return "—";
}

function configStatus(c: SOPConfigRow): "active" | "future" | "expired" {
  const today = new Date().toISOString().slice(0, 10);
  if (c.effective_to && c.effective_to < today) return "expired";
  if (c.effective_from && c.effective_from > today) return "future";
  return "active";
}

function appliesTo(c: SOPConfigRow): string {
  switch (c.scope_level) {
    case "ssb": return "All organizations";
    case "org": return c.org_name || "—";
    case "site": return c.site_name || "—";
    case "space_type": return `${c.space_type} spaces at ${c.site_name || "—"}`;
    case "space": return `${c.space_name || "—"} at ${c.site_name || "—"}`;
    case "equipment_type": return `${c.equipment_type} units in ${c.org_name || "—"}`;
    case "equipment": return `${c.equipment_name || "—"}`;
    default: return "—";
  }
}

// ── Main Component ──────────────────────────────────────────

export default function SOPStandardsTab() {
  const { selectedOrgId, isServiceProvider } = useOrg();

  const [configs, setConfigs] = useState<SOPConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [trackFilter, setTrackFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [metricFilter, setMetricFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<SOPConfigRow | null>(null);

  // Modal form state
  const [formTargetKind, setFormTargetKind] = useState<string>("equipment");
  const [formScopeLevel, setFormScopeLevel] = useState<string>("org");
  const [formLabel, setFormLabel] = useState("");
  const [formMetric, setFormMetric] = useState("");
  const [formMin, setFormMin] = useState<string>("");
  const [formMax, setFormMax] = useState<string>("");
  const [formUnit, setFormUnit] = useState("F");
  const [formWindow, setFormWindow] = useState("all_hours");
  const [formEffFrom, setFormEffFrom] = useState("");
  const [formEffTo, setFormEffTo] = useState("");
  const [formNotes, setFormNotes] = useState("");
  // Scope-specific
  const [formEquipmentType, setFormEquipmentType] = useState("");
  const [formEquipmentId, setFormEquipmentId] = useState("");
  const [formSiteId, setFormSiteId] = useState("");
  const [formSpaceType, setFormSpaceType] = useState("");
  const [formSpaceId, setFormSpaceId] = useState("");

  // Dropdown data
  const [sites, setSites] = useState<{ site_id: string; site_name: string }[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<{ equipment_id: string; equipment_name: string; equipment_group: string }[]>([]);
  const [spaceTypes, setSpaceTypes] = useState<string[]>([]);
  const [spaces, setSpaces] = useState<{ space_id: string; name: string; space_type: string }[]>([]);

  const [saving, setSaving] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Fetch configs
  const fetchConfigs = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sop-standards?org_id=${selectedOrgId}`);
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch (err) {
      console.error("Failed to fetch SOP standards:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  // Fetch dropdown data when modal opens
  useEffect(() => {
    if (!showModal || !selectedOrgId) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    // Fetch sites, equipment types, etc. via API
    fetch(`/api/sop-standards/dropdowns?org_id=${selectedOrgId}${formSiteId ? `&site_id=${formSiteId}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        setSites(data.sites || []);
        setEquipmentTypes(data.equipment_types || []);
        setEquipment(data.equipment || []);
        setSpaceTypes(data.space_types || []);
        setSpaces(data.spaces || []);
      })
      .catch(() => {});
  }, [showModal, selectedOrgId, formSiteId]);

  // Filtered + sorted configs
  const filtered = useMemo(() => {
    return configs
      .filter((c) => {
        if (trackFilter !== "all" && c.target_kind !== trackFilter) return false;
        if (scopeFilter !== "all" && c.scope_level !== scopeFilter) return false;
        if (metricFilter !== "all" && c.metric !== metricFilter) return false;
        if (statusFilter !== "all" && configStatus(c) !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const rankA = scopeLevelRank(a.scope_level);
        const rankB = scopeLevelRank(b.scope_level);
        if (rankA !== rankB) return rankA - rankB;
        if (a.target_kind !== b.target_kind) return a.target_kind.localeCompare(b.target_kind);
        if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
        return a.label.localeCompare(b.label);
      });
  }, [configs, trackFilter, scopeFilter, metricFilter, statusFilter]);

  // ── Modal helpers ─────────────────────────────────────────

  function openAdd() {
    setEditRow(null);
    setFormTargetKind("equipment");
    setFormScopeLevel("org");
    setFormLabel("");
    setFormMetric("");
    setFormMin("");
    setFormMax("");
    setFormUnit("F");
    setFormWindow("all_hours");
    setFormEffFrom("");
    setFormEffTo("");
    setFormNotes("");
    setFormEquipmentType("");
    setFormEquipmentId("");
    setFormSiteId("");
    setFormSpaceType("");
    setFormSpaceId("");
    setShowModal(true);
  }

  function openEdit(c: SOPConfigRow) {
    setEditRow(c);
    setFormTargetKind(c.target_kind);
    setFormScopeLevel(c.scope_level);
    setFormLabel(c.label);
    setFormMetric(c.metric);
    setFormMin(c.min_value != null ? String(c.min_value) : "");
    setFormMax(c.max_value != null ? String(c.max_value) : "");
    setFormUnit(c.unit);
    setFormWindow(c.evaluation_window);
    setFormEffFrom(c.effective_from || "");
    setFormEffTo(c.effective_to || "");
    setFormNotes(c.notes || "");
    setFormEquipmentType(c.equipment_type || "");
    setFormEquipmentId(c.equipment_id || "");
    setFormSiteId(c.site_id || "");
    setFormSpaceType(c.space_type || "");
    setFormSpaceId(c.space_id || "");
    setShowModal(true);
  }

  function openDuplicate(c: SOPConfigRow) {
    setEditRow(null);
    setFormTargetKind(c.target_kind);
    setFormScopeLevel(c.scope_level === "ssb" ? "org" : c.scope_level);
    setFormLabel(`Copy of ${c.label}`);
    setFormMetric(c.metric);
    setFormMin(c.min_value != null ? String(c.min_value) : "");
    setFormMax(c.max_value != null ? String(c.max_value) : "");
    setFormUnit(c.unit);
    setFormWindow(c.evaluation_window);
    setFormEffFrom("");
    setFormEffTo("");
    setFormNotes(c.notes || "");
    setFormEquipmentType(c.equipment_type || "");
    setFormEquipmentId("");
    setFormSiteId("");
    setFormSpaceType(c.space_type || "");
    setFormSpaceId("");
    setShowModal(true);
  }

  async function saveConfig() {
    if (!formLabel || !formMetric) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      target_kind: formTargetKind,
      scope_level: formScopeLevel,
      label: formLabel,
      metric: formMetric,
      min_value: formMin ? parseFloat(formMin) : null,
      max_value: formMax ? parseFloat(formMax) : null,
      unit: formUnit,
      evaluation_window: formWindow,
      effective_from: formEffFrom || null,
      effective_to: formEffTo || null,
      notes: formNotes || null,
      org_id: formScopeLevel === "ssb" ? null : selectedOrgId,
      site_id: ["site", "space_type", "space"].includes(formScopeLevel) ? formSiteId || null : null,
      equipment_type: ["equipment_type", "equipment"].includes(formScopeLevel) ? formEquipmentType || null : null,
      equipment_id: formScopeLevel === "equipment" ? formEquipmentId || null : null,
      space_type: ["space_type", "space"].includes(formScopeLevel) ? formSpaceType || null : null,
      space_id: formScopeLevel === "space" ? formSpaceId || null : null,
    };

    try {
      const res = await fetch("/api/sop-standards", {
        method: editRow ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editRow ? { id: editRow.id, ...payload } : payload),
      });
      if (res.ok) {
        setShowModal(false);
        fetchConfigs();
      }
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setSaving(false);
    }
  }

  async function retireConfig(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    await fetch("/api/sop-standards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, effective_to: today }),
    });
    setConfirmRetire(null);
    fetchConfigs();
  }

  async function deleteConfig(id: string) {
    await fetch(`/api/sop-standards?id=${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    fetchConfigs();
  }

  // Available scope levels for modal
  const availableScopes = useMemo(
    () => scopeLevelsForTrack(formTargetKind, isServiceProvider),
    [formTargetKind, isServiceProvider]
  );

  const availableMetrics = useMemo(
    () => metricsForTrack(formTargetKind),
    [formTargetKind]
  );

  // ── Render ────────────────────────────────────────────────

  if (!selectedOrgId) {
    return <div className="text-center text-sm text-gray-400 py-8">Select an organization.</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SOP Standards</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isServiceProvider
              ? "All scope levels. SSB defaults apply to all organizations."
              : "SSB platform defaults and your organization's standards. SSB defaults are read-only — duplicate one to create your own override."}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
        >
          + New Standard
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="all">All Tracks</option>
          {SOP_TARGET_KINDS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="all">All Scopes</option>
          {SOP_SCOPE_LEVELS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={metricFilter} onChange={(e) => setMetricFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="all">All Metrics</option>
          {SOP_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="future">Future</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center text-sm text-gray-400 py-8">Loading standards...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8">No SOP standards match your filters.</div>
      ) : (
        <div className="overflow-auto border rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Scope</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Track</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Label</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Metric</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Range</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Applies To</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Window</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => {
                const status = configStatus(c);
                const isSSB = c.scope_level === "ssb";
                const canEdit = isServiceProvider || !isSSB;
                const color = scopeLevelColor(c.scope_level);
                const badgeClass = SCOPE_BADGE_COLORS[color] || SCOPE_BADGE_COLORS.gray;

                return (
                  <tr
                    key={c.id}
                    className={`${isSSB ? "bg-blue-50/30" : ""} ${status === "expired" ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeClass}`}>
                        {scopeLevelLabel(c.scope_level)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 capitalize">{c.target_kind}</td>
                    <td className="px-3 py-2 text-gray-900 font-medium">{c.label}</td>
                    <td className="px-3 py-2 text-gray-600">{metricLabel(c.metric)}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono">{formatRange(c.min_value, c.max_value, c.unit)}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate" title={appliesTo(c)}>
                      {appliesTo(c)}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {SOP_EVALUATION_WINDOWS.find((w) => w.value === c.evaluation_window)?.label || c.evaluation_window}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        status === "active" ? "bg-green-100 text-green-700" :
                        status === "future" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {!canEdit ? (
                        <span className="text-gray-300" title="SSB standard — read only">
                          <Lock className="w-3.5 h-3.5 inline" />
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {confirmRetire === c.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => retireConfig(c.id)} className="text-red-600 hover:underline">Yes</button>
                              <button onClick={() => setConfirmRetire(null)} className="text-gray-400 hover:underline">No</button>
                            </div>
                          ) : confirmDelete === c.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => deleteConfig(c.id)} className="text-red-600 hover:underline">Yes</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-gray-400 hover:underline">No</button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => openEdit(c)} className="text-blue-600 hover:underline">Edit</button>
                              <button onClick={() => openDuplicate(c)} className="text-gray-500 hover:underline" title="Duplicate">
                                <Copy className="w-3 h-3 inline" />
                              </button>
                              {status !== "expired" && (
                                <button onClick={() => setConfirmRetire(c.id)} className="text-amber-600 hover:underline">Retire</button>
                              )}
                              <button onClick={() => setConfirmDelete(c.id)} className="text-red-500 hover:underline">Del</button>
                            </>
                          )}
                        </div>
                      )}
                      {/* Duplicate is always available, even for SSB read-only */}
                      {!canEdit && (
                        <button onClick={() => openDuplicate(c)} className="ml-1 text-blue-500 hover:underline text-[10px]" title="Duplicate to your org">
                          <Copy className="w-3 h-3 inline" /> Duplicate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                {editRow ? "Edit Standard" : "New Standard"}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Step 1: Target Kind */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Target Kind</label>
                <div className="flex gap-2">
                  {SOP_TARGET_KINDS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => {
                        setFormTargetKind(t.value);
                        // Reset scope to first available
                        const scopes = scopeLevelsForTrack(t.value, isServiceProvider);
                        setFormScopeLevel(scopes[0]?.value || "org");
                        setFormMetric("");
                      }}
                      className={`px-3 py-1.5 rounded text-xs font-medium border ${
                        formTargetKind === t.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Scope Level */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Scope Level</label>
                <div className="flex flex-wrap gap-1">
                  {availableScopes.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setFormScopeLevel(s.value)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border ${
                        formScopeLevel === s.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Scope-specific fields */}
              {formScopeLevel === "equipment_type" && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Equipment Type</label>
                  <select value={formEquipmentType} onChange={(e) => setFormEquipmentType(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">Select...</option>
                    {equipmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {formScopeLevel === "equipment" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Equipment</label>
                    <select
                      value={formEquipmentId}
                      onChange={(e) => {
                        setFormEquipmentId(e.target.value);
                        const eq = equipment.find((x) => x.equipment_id === e.target.value);
                        if (eq) setFormEquipmentType(eq.equipment_group);
                      }}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">Select...</option>
                      {equipment.map((e) => (
                        <option key={e.equipment_id} value={e.equipment_id}>
                          {e.equipment_name} ({e.equipment_group})
                        </option>
                      ))}
                    </select>
                  </div>
                  {formEquipmentType && (
                    <div className="text-xs text-gray-500">Type: {formEquipmentType}</div>
                  )}
                </>
              )}

              {["site", "space_type", "space"].includes(formScopeLevel) && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Site</label>
                  <select value={formSiteId} onChange={(e) => setFormSiteId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">Select...</option>
                    {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.site_name}</option>)}
                  </select>
                </div>
              )}

              {formScopeLevel === "space_type" && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Space Type</label>
                  <select value={formSpaceType} onChange={(e) => setFormSpaceType(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">Select...</option>
                    {spaceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {formScopeLevel === "space" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Space</label>
                    <select
                      value={formSpaceId}
                      onChange={(e) => {
                        setFormSpaceId(e.target.value);
                        const sp = spaces.find((x) => x.space_id === e.target.value);
                        if (sp) setFormSpaceType(sp.space_type);
                      }}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">Select...</option>
                      {spaces.map((s) => (
                        <option key={s.space_id} value={s.space_id}>{s.name} ({s.space_type})</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Step 4: Rule definition */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-700 block mb-1">Label *</label>
                  <input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Metric *</label>
                  <select value={formMetric} onChange={(e) => setFormMetric(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">Select...</option>
                    {availableMetrics.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Unit *</label>
                  <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    {SOP_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Min Value</label>
                  <input type="number" value={formMin} onChange={(e) => setFormMin(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Max Value</label>
                  <input type="number" value={formMax} onChange={(e) => setFormMax(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Window</label>
                  <select value={formWindow} onChange={(e) => setFormWindow(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    {SOP_EVALUATION_WINDOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Effective From</label>
                  <input type="date" value={formEffFrom} onChange={(e) => setFormEffFrom(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Effective To</label>
                  <input type="date" value={formEffTo} onChange={(e) => setFormEffTo(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
                  <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" rows={2} />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 text-xs text-gray-600 border rounded hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={saveConfig}
                disabled={saving || !formLabel || !formMetric}
                className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : editRow ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
