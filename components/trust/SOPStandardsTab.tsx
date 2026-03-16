"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useOrg } from "@/context/OrgContext";
import { Lock, Copy, X } from "lucide-react";
import {
  SOP_METRICS, SOP_EVALUATION_WINDOWS,
  SOP_TARGET_KINDS, METRIC_DEFAULT_UNIT,
  metricLabel, appliesToLabel, scopeLevelColor,
  scopeLevelsForTrack, metricsForTrack, unitLabel,
} from "@/lib/sop/constants";

// ── Types ───────────────────────────────────────────────────

interface AssignmentRow {
  id: string;
  template_id: string;
  owner_kind: "ssb" | "org";
  org_id: string | null;
  scope_level: string;
  site_id: string | null;
  equipment_type_id: string | null;
  equipment_id: string | null;
  space_type: string | null;
  space_id: string | null;
  effective_from: string | null;
  effective_to: string | null;
  retired_at: string | null;
  // Flattened template fields
  target_kind: string;
  label: string;
  metric: string;
  unit: string;
  min_value: number | null;
  max_value: number | null;
  evaluation_window: string;
  notes: string | null;
  // Resolved names
  org_name?: string | null;
  site_name?: string | null;
  equipment_name?: string | null;
  equipment_group?: string | null;
  space_name?: string | null;
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
  const u = unitLabel(unit);
  if (min != null && max != null) return `${min} – ${max} ${u}`;
  if (max != null) return `≤ ${max} ${u}`;
  if (min != null) return `≥ ${min} ${u}`;
  return "—";
}

function assignmentStatus(c: AssignmentRow): "active" | "future" | "expired" | "retired" {
  if (c.retired_at) return "retired";
  const today = new Date().toISOString().slice(0, 10);
  if (c.effective_to && c.effective_to < today) return "expired";
  if (c.effective_from && c.effective_from > today) return "future";
  return "active";
}

function scopeDetail(c: AssignmentRow): string {
  switch (c.scope_level) {
    case "ssb": return "All organizations";
    case "org": return c.org_name || "—";
    case "site": return c.site_name || "—";
    case "space_type": return `${c.space_type} spaces at ${c.site_name || "—"}`;
    case "space": return `${c.space_name || "—"} at ${c.site_name || "—"}`;
    case "equipment_type": return `All ${c.equipment_type_id} in ${c.org_name || "—"}`;
    case "equipment": return c.equipment_name || "—";
    default: return "—";
  }
}

const STATUS_BADGE: Record<string, string> = {
  active:  "bg-green-100 text-green-700",
  future:  "bg-blue-100 text-blue-700",
  expired: "bg-gray-100 text-gray-500",
  retired: "bg-red-100 text-red-600",
};

// ── Main Component ──────────────────────────────────────────

export default function SOPStandardsTab() {
  const { selectedOrgId, isServiceProvider } = useOrg();

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (Your Standards only)
  const [trackFilter, setTrackFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [metricFilter, setMetricFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editAssignment, setEditAssignment] = useState<AssignmentRow | null>(null);

  // Confirm states
  const [confirmRetire, setConfirmRetire] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Data fetch ────────────────────────────────────────────

  const fetchAssignments = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sop-assignments?org_id=${selectedOrgId}`);
      const data = await res.json();
      setAssignments(data.assignments || []);
    } catch (err) {
      console.error("Failed to fetch SOP assignments:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  // ── Derived data ──────────────────────────────────────────

  const ssbAssignments = useMemo(
    () => assignments.filter((a) => a.owner_kind === "ssb" && !a.retired_at),
    [assignments]
  );

  const orgAssignments = useMemo(() => {
    return assignments
      .filter((a) => a.owner_kind === "org")
      .filter((a) => {
        if (trackFilter !== "all" && a.target_kind !== trackFilter) return false;
        if (scopeFilter !== "all" && a.scope_level !== scopeFilter) return false;
        if (metricFilter !== "all" && a.metric !== metricFilter) return false;
        if (statusFilter !== "all" && assignmentStatus(a) !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.target_kind !== b.target_kind) return a.target_kind.localeCompare(b.target_kind);
        if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
        return a.label.localeCompare(b.label);
      });
  }, [assignments, trackFilter, scopeFilter, metricFilter, statusFilter]);

  // ── Actions ───────────────────────────────────────────────

  function openAdd() {
    setEditAssignment(null);
    setShowModal(true);
  }

  function openEdit(a: AssignmentRow) {
    setEditAssignment(a);
    setShowModal(true);
  }

  function openDuplicate(a: AssignmentRow) {
    setEditAssignment({
      ...a,
      id: "", // signals "create new"
      owner_kind: "org",
      scope_level: a.scope_level === "ssb" ? "org" : a.scope_level,
      org_id: selectedOrgId || null,
      label: `Copy of ${a.label}`,
      effective_from: new Date().toISOString().slice(0, 10),
      effective_to: null,
      retired_at: null,
      site_id: a.scope_level === "ssb" ? null : a.site_id,
      equipment_id: a.scope_level === "ssb" ? null : a.equipment_id,
      space_id: a.scope_level === "ssb" ? null : a.space_id,
    });
    setShowModal(true);
  }

  async function retireAssignment(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    await fetch("/api/sop-assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, retired_at: today }),
    });
    setConfirmRetire(null);
    fetchAssignments();
  }

  async function deleteAssignment(id: string) {
    const res = await fetch(`/api/sop-assignments?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Delete failed");
    }
    setConfirmDelete(null);
    fetchAssignments();
  }

  // ── Render ────────────────────────────────────────────────

  if (!selectedOrgId) {
    return <div className="text-center text-sm text-gray-400 py-8">Select an organization.</div>;
  }

  return (
    <div>
      {/* ═══ SSB Admin View: Platform Templates ═══ */}
      {isServiceProvider ? (
        <>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Platform Templates</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Industry standard baselines. Org users can see and duplicate these to create their own standards.
              </p>
            </div>
            <button
              onClick={openAdd}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
            >
              + New Template
            </button>
          </div>

          {loading ? (
            <div className="text-center text-sm text-gray-400 py-8">Loading...</div>
          ) : (
            <AssignmentTable
              rows={[...ssbAssignments, ...orgAssignments]}
              canEdit={() => true}
              isSSBAdmin={true}
              onEdit={openEdit}
              onDuplicate={openDuplicate}
              onRetire={(id) => setConfirmRetire(id)}
              onDelete={(id) => setConfirmDelete(id)}
              confirmRetire={confirmRetire}
              confirmDelete={confirmDelete}
              onConfirmRetire={retireAssignment}
              onConfirmDelete={deleteAssignment}
              onCancelConfirm={() => { setConfirmRetire(null); setConfirmDelete(null); }}
              showScopeDetail={true}
            />
          )}
        </>
      ) : (
        /* ═══ Org User View: Two Sections ═══ */
        <>
          {/* Section 1: Platform Templates (read-only) */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Platform Templates</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Street Smart Buildings industry baselines. Duplicate to create your own standard.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-sm text-gray-400 py-6">Loading...</div>
            ) : ssbAssignments.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-6">No platform templates available.</div>
            ) : (
              <AssignmentTable
                rows={ssbAssignments}
                canEdit={() => false}
                isSSBAdmin={false}
                onEdit={() => {}}
                onDuplicate={openDuplicate}
                onRetire={() => {}}
                onDelete={() => {}}
                confirmRetire={null}
                confirmDelete={null}
                onConfirmRetire={() => {}}
                onConfirmDelete={() => {}}
                onCancelConfirm={() => {}}
                showScopeDetail={false}
              />
            )}
          </div>

          {/* Section 2: Your Standards */}
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Your Standards</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Your overrides. These take precedence over platform templates where they apply.
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
                {scopeLevelsForTrack("equipment", isServiceProvider)
                  .concat(scopeLevelsForTrack("space", isServiceProvider))
                  .filter((s, i, arr) => arr.findIndex((x) => x.value === s.value) === i)
                  .map((s) => <option key={s.value} value={s.value}>{appliesToLabel(s.value)}</option>)
                }
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
                <option value="retired">Retired</option>
              </select>
            </div>

            {loading ? (
              <div className="text-center text-sm text-gray-400 py-6">Loading...</div>
            ) : orgAssignments.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-6">No standards match your filters.</div>
            ) : (
              <AssignmentTable
                rows={orgAssignments}
                canEdit={() => true}
                isSSBAdmin={false}
                onEdit={openEdit}
                onDuplicate={openDuplicate}
                onRetire={(id) => setConfirmRetire(id)}
                onDelete={(id) => setConfirmDelete(id)}
                confirmRetire={confirmRetire}
                confirmDelete={confirmDelete}
                onConfirmRetire={retireAssignment}
                onConfirmDelete={deleteAssignment}
                onCancelConfirm={() => { setConfirmRetire(null); setConfirmDelete(null); }}
                showScopeDetail={true}
              />
            )}
          </div>
        </>
      )}

      {/* ═══ Add/Edit Modal ═══ */}
      {showModal && (
        <AssignmentModal
          editAssignment={editAssignment}
          selectedOrgId={selectedOrgId}
          isServiceProvider={isServiceProvider}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchAssignments(); }}
        />
      )}
    </div>
  );
}

// ── Shared Table Component ──────────────────────────────────

function AssignmentTable({
  rows, canEdit, isSSBAdmin,
  onEdit, onDuplicate, onRetire, onDelete,
  confirmRetire, confirmDelete,
  onConfirmRetire, onConfirmDelete, onCancelConfirm,
  showScopeDetail,
}: {
  rows: AssignmentRow[];
  canEdit: (a: AssignmentRow) => boolean;
  isSSBAdmin: boolean;
  onEdit: (a: AssignmentRow) => void;
  onDuplicate: (a: AssignmentRow) => void;
  onRetire: (id: string) => void;
  onDelete: (id: string) => void;
  confirmRetire: string | null;
  confirmDelete: string | null;
  onConfirmRetire: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelConfirm: () => void;
  showScopeDetail: boolean;
}) {
  return (
    <div className="overflow-auto border rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            {showScopeDetail && <th className="text-left px-3 py-2 font-medium text-gray-600">Applies To</th>}
            <th className="text-left px-3 py-2 font-medium text-gray-600">Track</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Label</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Metric</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Range</th>
            {showScopeDetail && <th className="text-left px-3 py-2 font-medium text-gray-600">Scope Detail</th>}
            <th className="text-left px-3 py-2 font-medium text-gray-600">Window</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((a) => {
            const status = assignmentStatus(a);
            const editable = canEdit(a);
            const color = scopeLevelColor(a.scope_level);
            const badgeClass = SCOPE_BADGE_COLORS[color] || SCOPE_BADGE_COLORS.gray;

            return (
              <tr
                key={a.id}
                className={`${a.owner_kind === "ssb" ? "bg-blue-50/30" : ""} ${status === "retired" || status === "expired" ? "opacity-50" : ""}`}
              >
                {showScopeDetail && (
                  <td className="px-3 py-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeClass}`}>
                      {appliesToLabel(a.scope_level)}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 text-gray-600 capitalize">{a.target_kind}</td>
                <td className="px-3 py-2 text-gray-900 font-medium">{a.label}</td>
                <td className="px-3 py-2 text-gray-600">{metricLabel(a.metric)}</td>
                <td className="px-3 py-2 text-gray-600 font-mono">{formatRange(a.min_value, a.max_value, a.unit)}</td>
                {showScopeDetail && (
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate" title={scopeDetail(a)}>
                    {scopeDetail(a)}
                  </td>
                )}
                <td className="px-3 py-2 text-gray-500">
                  {SOP_EVALUATION_WINDOWS.find((w) => w.value === a.evaluation_window)?.label || a.evaluation_window}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_BADGE[status] || STATUS_BADGE.expired}`}>
                    {status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {!editable ? (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-300" title="Platform template — read only">
                        <Lock className="w-3.5 h-3.5 inline" />
                      </span>
                      <button onClick={() => onDuplicate(a)} className="ml-1 text-blue-500 hover:underline text-[10px]" title="Duplicate to your org">
                        <Copy className="w-3 h-3 inline" /> Duplicate
                      </button>
                    </div>
                  ) : confirmRetire === a.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-500">Retire?</span>
                      <button onClick={() => onConfirmRetire(a.id)} className="text-red-600 hover:underline text-[10px]">Yes</button>
                      <button onClick={onCancelConfirm} className="text-gray-400 hover:underline text-[10px]">No</button>
                    </div>
                  ) : confirmDelete === a.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-500">Delete?</span>
                      <button onClick={() => onConfirmDelete(a.id)} className="text-red-600 hover:underline text-[10px]">Yes</button>
                      <button onClick={onCancelConfirm} className="text-gray-400 hover:underline text-[10px]">No</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button onClick={() => onEdit(a)} className="text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => onDuplicate(a)} className="text-gray-500 hover:underline" title="Duplicate">
                        <Copy className="w-3 h-3 inline" />
                      </button>
                      {status !== "retired" && status !== "expired" && (
                        <button onClick={() => onRetire(a.id)} className="text-amber-600 hover:underline">Retire</button>
                      )}
                      <button onClick={() => onDelete(a.id)} className="text-red-500 hover:underline">Del</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Modal Component ─────────────────────────────────────────

function AssignmentModal({
  editAssignment,
  selectedOrgId,
  isServiceProvider,
  onClose,
  onSaved,
}: {
  editAssignment: AssignmentRow | null;
  selectedOrgId: string;
  isServiceProvider: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = editAssignment && editAssignment.id !== "";
  const isDuplicate = editAssignment && editAssignment.id === "";

  // Template fields
  const [targetKind, setTargetKind] = useState(editAssignment?.target_kind || "equipment");
  const [label, setLabel] = useState(editAssignment?.label || "");
  const [metric, setMetric] = useState(editAssignment?.metric || "");
  const [minVal, setMinVal] = useState(editAssignment?.min_value != null ? String(editAssignment.min_value) : "");
  const [maxVal, setMaxVal] = useState(editAssignment?.max_value != null ? String(editAssignment.max_value) : "");
  const [evalWindow, setEvalWindow] = useState(editAssignment?.evaluation_window || "all_hours");
  const [notes, setNotes] = useState(editAssignment?.notes || "");

  // Assignment fields
  const [scopeLevel, setScopeLevel] = useState(editAssignment?.scope_level || "org");
  const [effFrom, setEffFrom] = useState(editAssignment?.effective_from || new Date().toISOString().slice(0, 10));
  const [showExpiry, setShowExpiry] = useState(!!editAssignment?.effective_to);
  const [effTo, setEffTo] = useState(editAssignment?.effective_to || "");

  // Scope targeting
  const [formSiteId, setFormSiteId] = useState(editAssignment?.site_id || "");
  const [formEquipType, setFormEquipType] = useState(editAssignment?.equipment_type_id || "");
  const [formEquipId, setFormEquipId] = useState(editAssignment?.equipment_id || "");
  const [formSpaceType, setFormSpaceType] = useState(editAssignment?.space_type || "");
  const [formSpaceId, setFormSpaceId] = useState(editAssignment?.space_id || "");

  // Dropdown data
  const [sites, setSites] = useState<{ site_id: string; site_name: string }[]>([]);
  const [equipTypes, setEquipTypes] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<{ equipment_id: string; equipment_name: string; equipment_group: string }[]>([]);
  const [spaceTypes, setSpaceTypes] = useState<string[]>([]);
  const [spaces, setSpaces] = useState<{ space_id: string; name: string; space_type: string }[]>([]);

  const [saving, setSaving] = useState(false);

  // Derived unit from metric
  const derivedUnit = metric ? (METRIC_DEFAULT_UNIT[metric] || "F") : "";

  // Fetch dropdown data
  useEffect(() => {
    if (!selectedOrgId) return;
    fetch(`/api/sop-standards/dropdowns?org_id=${selectedOrgId}${formSiteId ? `&site_id=${formSiteId}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        setSites(data.sites || []);
        setEquipTypes(data.equipment_types || []);
        setEquipment(data.equipment || []);
        setSpaceTypes(data.space_types || []);
        setSpaces(data.spaces || []);
      })
      .catch(() => {});
  }, [selectedOrgId, formSiteId]);

  const availableScopes = useMemo(
    () => scopeLevelsForTrack(targetKind, isServiceProvider),
    [targetKind, isServiceProvider]
  );

  const availableMetrics = useMemo(
    () => metricsForTrack(targetKind),
    [targetKind]
  );

  async function handleSave() {
    if (!label || !metric) return;
    setSaving(true);

    try {
      const unit = METRIC_DEFAULT_UNIT[metric] || "F";

      if (isEdit) {
        // Update template
        await fetch("/api/sop-templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editAssignment!.template_id,
            target_kind: targetKind,
            label, metric, unit,
            min_value: minVal ? parseFloat(minVal) : null,
            max_value: maxVal ? parseFloat(maxVal) : null,
            evaluation_window: evalWindow,
            notes: notes || null,
          }),
        });

        // Update assignment
        await fetch("/api/sop-assignments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editAssignment!.id,
            scope_level: scopeLevel,
            org_id: scopeLevel === "ssb" ? null : selectedOrgId,
            site_id: ["site", "space_type", "space"].includes(scopeLevel) ? formSiteId || null : null,
            equipment_type_id: ["equipment_type", "equipment"].includes(scopeLevel) ? formEquipType || null : null,
            equipment_id: scopeLevel === "equipment" ? formEquipId || null : null,
            space_type: ["space_type", "space"].includes(scopeLevel) ? formSpaceType || null : null,
            space_id: scopeLevel === "space" ? formSpaceId || null : null,
            effective_from: effFrom || null,
            effective_to: showExpiry ? effTo || null : null,
          }),
        });
      } else {
        // Create template first
        const tRes = await fetch("/api/sop-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_kind: targetKind,
            label, metric, unit,
            min_value: minVal ? parseFloat(minVal) : null,
            max_value: maxVal ? parseFloat(maxVal) : null,
            evaluation_window: evalWindow,
            notes: notes || null,
          }),
        });
        const tData = await tRes.json();
        if (!tRes.ok || !tData.template?.id) {
          console.error("Failed to create template:", tData.error);
          setSaving(false);
          return;
        }

        // Then create assignment
        const ownerKind = scopeLevel === "ssb" ? "ssb" : "org";
        await fetch("/api/sop-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_id: tData.template.id,
            owner_kind: ownerKind,
            org_id: ownerKind === "ssb" ? null : selectedOrgId,
            scope_level: scopeLevel,
            site_id: ["site", "space_type", "space"].includes(scopeLevel) ? formSiteId || null : null,
            equipment_type_id: ["equipment_type", "equipment"].includes(scopeLevel) ? formEquipType || null : null,
            equipment_id: scopeLevel === "equipment" ? formEquipId || null : null,
            space_type: ["space_type", "space"].includes(scopeLevel) ? formSpaceType || null : null,
            space_id: scopeLevel === "space" ? formSpaceId || null : null,
            effective_from: effFrom || null,
            effective_to: showExpiry ? effTo || null : null,
          }),
        });
      }

      onSaved();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {isEdit ? "Edit Standard" : isDuplicate ? "Duplicate Standard" : "New Standard"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Target Kind */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Target Kind</label>
            <div className="flex gap-2">
              {SOP_TARGET_KINDS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setTargetKind(t.value);
                    const scopes = scopeLevelsForTrack(t.value, isServiceProvider);
                    setScopeLevel(scopes[0]?.value || "org");
                    setMetric("");
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-medium border ${
                    targetKind === t.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Applies To */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Applies To</label>
            <div className="flex flex-wrap gap-1">
              {availableScopes.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setScopeLevel(s.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border ${
                    scopeLevel === s.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {appliesToLabel(s.value)}
                </button>
              ))}
            </div>
          </div>

          {/* Scope-specific targeting */}
          {["site", "space_type", "space"].includes(scopeLevel) && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Site</label>
              <select value={formSiteId} onChange={(e) => setFormSiteId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                <option value="">Select...</option>
                {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.site_name}</option>)}
              </select>
            </div>
          )}

          {scopeLevel === "equipment_type" && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Equipment Type</label>
              <select value={formEquipType} onChange={(e) => setFormEquipType(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                <option value="">Select...</option>
                {equipTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {scopeLevel === "equipment" && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Equipment</label>
              <select
                value={formEquipId}
                onChange={(e) => {
                  setFormEquipId(e.target.value);
                  const eq = equipment.find((x) => x.equipment_id === e.target.value);
                  if (eq) setFormEquipType(eq.equipment_group);
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
          )}

          {scopeLevel === "space_type" && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Space Type</label>
              <select value={formSpaceType} onChange={(e) => setFormSpaceType(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                <option value="">Select...</option>
                {spaceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {scopeLevel === "space" && (
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
          )}

          {/* Label */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Label *</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>

          {/* Metric + auto-derived unit */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Metric *</label>
            <div className="flex items-center gap-2">
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className="flex-1 border rounded px-2 py-1.5 text-sm">
                <option value="">Select...</option>
                {availableMetrics.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {derivedUnit && (
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded border">
                  {unitLabel(derivedUnit)}
                </span>
              )}
            </div>
          </div>

          {/* Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Min Value</label>
              <input type="number" value={minVal} onChange={(e) => setMinVal(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Max Value</label>
              <input type="number" value={maxVal} onChange={(e) => setMaxVal(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
          </div>

          {/* Window */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Window</label>
            <div className="flex gap-1">
              {SOP_EVALUATION_WINDOWS.map((w) => (
                <button
                  key={w.value}
                  onClick={() => setEvalWindow(w.value)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border ${
                    evalWindow === w.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Effective From */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Effective From</label>
            <input type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>

          {/* Effective To (toggle) */}
          <div>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showExpiry}
                onChange={(e) => setShowExpiry(e.target.checked)}
                className="rounded border-gray-300"
              />
              Set expiry date
            </label>
            {showExpiry && (
              <input type="date" value={effTo} onChange={(e) => setEffTo(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm mt-2" />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" rows={2} />
          </div>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-gray-600 border rounded hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !label || !metric}
            className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
