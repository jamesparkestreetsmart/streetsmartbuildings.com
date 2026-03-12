"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  SOP_METRICS,
  SOP_UNITS,
  SOP_EVALUATION_WINDOWS,
  SOP_SCOPE_RANK,
} from "@/lib/sop/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SOPConfigRow {
  id: string;
  org_id: string;
  site_id: string | null;
  equipment_id: string | null;
  label: string;
  metric: string;
  min_value: number | null;
  max_value: number | null;
  evaluation_window: string;
  unit: string;
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  // Joined display names
  org_name?: string;
  site_name?: string;
  equipment_name?: string;
  equipment_code?: string;
}

interface OrgOption {
  org_id: string;
  org_name: string;
}
interface SiteOption {
  site_id: string;
  site_name: string;
}
interface EquipOption {
  equipment_id: string;
  equipment_name: string;
  equipment_code: string | null;
}

type StatusFilter = "all" | "active" | "future" | "expired";
type ScopeLevel = "org" | "site" | "equipment";

interface ModalState {
  open: boolean;
  mode: "add" | "edit";
  editId?: string;
  defaults?: Partial<ModalFormData>;
}

interface ModalFormData {
  org_id: string;
  scopeLevel: ScopeLevel;
  site_id: string;
  equipment_id: string;
  label: string;
  metric: string;
  min_value: string;
  max_value: string;
  unit: string;
  evaluation_window: string;
  effective_from: string;
  effective_to: string;
  notes: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

function getStatusLabel(row: SOPConfigRow): { label: string; expired: boolean } {
  const t = today();
  if (row.effective_to && row.effective_to < t) {
    return { label: `Expired ${fmtDate(row.effective_to)}`, expired: true };
  }
  if (row.effective_from && row.effective_from > t) {
    return { label: `From ${fmtDate(row.effective_from)}`, expired: false };
  }
  if (row.effective_to) {
    return { label: `Until ${fmtDate(row.effective_to)}`, expired: false };
  }
  return { label: "Active", expired: false };
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function getScopeLabel(row: SOPConfigRow): string {
  if (row.equipment_id) {
    const equip = row.equipment_name || "Unknown";
    const site = row.site_name || "Unknown";
    return `Equip: ${equip} @ ${site}`;
  }
  if (row.site_id) return `Site: ${row.site_name || "Unknown"}`;
  return "Org";
}

function getScopeRank(row: SOPConfigRow): number {
  if (row.equipment_id) return SOP_SCOPE_RANK.equipment;
  if (row.site_id) return SOP_SCOPE_RANK.site;
  return SOP_SCOPE_RANK.org;
}

function getRangeLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min} \u2013 ${max}`;
  if (min != null) return `\u2265 ${min}`;
  if (max != null) return `\u2264 ${max}`;
  return "\u2014";
}

function getMetricLabel(metric: string): string {
  return SOP_METRICS.find((m) => m.value === metric)?.label || metric;
}

function getUnitLabel(unit: string): string {
  return SOP_UNITS.find((u) => u.value === unit)?.label || unit;
}

function getWindowLabel(w: string): string {
  return SOP_EVALUATION_WINDOWS.find((e) => e.value === w)?.label || w;
}

const TH = "px-3 py-2 text-left text-xs font-semibold text-white whitespace-nowrap";
const TD = "px-3 py-2 text-xs whitespace-nowrap border-b border-gray-100";

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SOPConfigsClient() {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [configs, setConfigs] = useState<SOPConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedMetric, setSelectedMetric] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Modal
  const [modal, setModal] = useState<ModalState>({ open: false, mode: "add" });

  // Inline confirm state
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    type: "retire" | "delete";
  } | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Compliance counts for delete eligibility
  const [complianceCounts, setComplianceCounts] = useState<Record<string, number>>({});

  // ─── Data Fetching ───────────────────────────────────────────────────────

  // Fetch all orgs
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("a_organizations")
        .select("org_id, org_name")
        .order("org_name");
      setOrgs(data || []);
      if (data && data.length > 0 && !selectedOrg) {
        setSelectedOrg(data[0].org_id);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch sites when org changes
  useEffect(() => {
    if (!selectedOrg) { setSites([]); return; }
    (async () => {
      const { data } = await supabase
        .from("a_sites")
        .select("site_id, site_name")
        .eq("org_id", selectedOrg)
        .order("site_name");
      setSites(data || []);
    })();
    setSelectedSite("");
  }, [selectedOrg]);

  // Fetch configs
  const fetchConfigs = useCallback(async () => {
    if (!selectedOrg) return;
    setLoading(true);
    try {
      let query = supabase
        .from("a_sop_configs")
        .select("*")
        .eq("org_id", selectedOrg)
        .order("created_at", { ascending: false });

      if (selectedSite) query = query.eq("site_id", selectedSite);
      if (selectedMetric) query = query.eq("metric", selectedMetric);

      const { data } = await query;
      const rows = (data || []) as SOPConfigRow[];

      // Enrich with display names
      const siteIds = [...new Set(rows.map((r) => r.site_id).filter(Boolean))] as string[];
      const equipIds = [...new Set(rows.map((r) => r.equipment_id).filter(Boolean))] as string[];

      const siteMap: Record<string, string> = {};
      if (siteIds.length) {
        const { data: s } = await supabase.from("a_sites").select("site_id, site_name").in("site_id", siteIds);
        for (const si of s || []) siteMap[si.site_id] = si.site_name;
      }

      const equipMap: Record<string, { name: string; code: string | null }> = {};
      if (equipIds.length) {
        const { data: e } = await supabase.from("a_equipments").select("equipment_id, equipment_name, equipment_code").in("equipment_id", equipIds);
        for (const ei of e || []) equipMap[ei.equipment_id] = { name: ei.equipment_name, code: ei.equipment_code };
      }

      const orgObj = orgs.find((o) => o.org_id === selectedOrg);

      for (const r of rows) {
        r.org_name = orgObj?.org_name || "";
        if (r.site_id) r.site_name = siteMap[r.site_id] || "";
        if (r.equipment_id) {
          const eq = equipMap[r.equipment_id];
          r.equipment_name = eq?.name || "";
          r.equipment_code = eq?.code || undefined;
        }
      }

      setConfigs(rows);

      // Fetch compliance counts for delete eligibility
      const configIds = rows.map((r) => r.id);
      if (configIds.length) {
        const counts: Record<string, number> = {};
        // Batch check: get all compliance rows for these config ids
        const { data: compRows } = await supabase
          .from("b_sop_compliance_log")
          .select("sop_config_id")
          .in("sop_config_id", configIds);
        for (const cr of compRows || []) {
          counts[cr.sop_config_id] = (counts[cr.sop_config_id] || 0) + 1;
        }
        setComplianceCounts(counts);
      } else {
        setComplianceCounts({});
      }
    } finally {
      setLoading(false);
    }
  }, [selectedOrg, selectedSite, selectedMetric, orgs]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // ─── Filtering & Sorting ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const t = today();
    return configs.filter((r) => {
      if (statusFilter === "active") {
        if (r.effective_from && r.effective_from > t) return false;
        if (r.effective_to && r.effective_to < t) return false;
      } else if (statusFilter === "future") {
        if (!r.effective_from || r.effective_from <= t) return false;
      } else if (statusFilter === "expired") {
        if (!r.effective_to || r.effective_to >= t) return false;
      }
      return true;
    });
  }, [configs, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      // 1. org name
      const orgCmp = (a.org_name || "").localeCompare(b.org_name || "");
      if (orgCmp !== 0) return orgCmp;
      // 2. scope rank
      const ra = getScopeRank(a), rb = getScopeRank(b);
      if (ra !== rb) return ra - rb;
      // 3. site name
      const siteCmp = (a.site_name || "").localeCompare(b.site_name || "");
      if (siteCmp !== 0) return siteCmp;
      // 4. equipment label
      const eqCmp = (a.equipment_name || "").localeCompare(b.equipment_name || "");
      if (eqCmp !== 0) return eqCmp;
      // 5. metric
      const metCmp = a.metric.localeCompare(b.metric);
      if (metCmp !== 0) return metCmp;
      // 6. label
      return a.label.localeCompare(b.label);
    });
    return copy;
  }, [filtered]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function handleRetire(id: string) {
    const { error } = await supabase
      .from("a_sop_configs")
      .update({ effective_to: today() })
      .eq("id", id);
    if (error) {
      setToast("Error retiring config: " + error.message);
    } else {
      setToast("Config retired.");
      fetchConfigs();
    }
    setConfirmAction(null);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("a_sop_configs").delete().eq("id", id);
    if (error) {
      setToast("Error deleting config: " + error.message);
    } else {
      setToast("Config deleted.");
      fetchConfigs();
    }
    setConfirmAction(null);
  }

  function openAdd() {
    setModal({ open: true, mode: "add", defaults: { org_id: selectedOrg } });
  }

  function openEdit(row: SOPConfigRow) {
    const scopeLevel: ScopeLevel = row.equipment_id ? "equipment" : row.site_id ? "site" : "org";
    setModal({
      open: true,
      mode: "edit",
      editId: row.id,
      defaults: {
        org_id: row.org_id,
        scopeLevel,
        site_id: row.site_id || "",
        equipment_id: row.equipment_id || "",
        label: row.label,
        metric: row.metric,
        min_value: row.min_value != null ? String(row.min_value) : "",
        max_value: row.max_value != null ? String(row.max_value) : "",
        unit: row.unit,
        evaluation_window: row.evaluation_window,
        effective_from: row.effective_from || "",
        effective_to: row.effective_to || "",
        notes: row.notes || "",
      },
    });
  }

  function openDuplicate(row: SOPConfigRow) {
    const scopeLevel: ScopeLevel = row.equipment_id ? "equipment" : row.site_id ? "site" : "org";
    setModal({
      open: true,
      mode: "add",
      defaults: {
        org_id: row.org_id,
        scopeLevel,
        site_id: row.site_id || "",
        equipment_id: row.equipment_id || "",
        label: `Copy of ${row.label}`,
        metric: row.metric,
        min_value: row.min_value != null ? String(row.min_value) : "",
        max_value: row.max_value != null ? String(row.max_value) : "",
        unit: row.unit,
        evaluation_window: row.evaluation_window,
        effective_from: "",
        effective_to: "",
        notes: row.notes || "",
      },
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SOP Configs</h1>
          <p className="text-xs text-gray-400 mt-1">
            Manage Standard Operating Procedure compliance thresholds
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
        >
          + Add Config
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={selectedOrg}
          onChange={(e) => setSelectedOrg(e.target.value)}
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5"
        >
          <option value="">Select Org</option>
          {orgs.map((o) => (
            <option key={o.org_id} value={o.org_id}>{o.org_name}</option>
          ))}
        </select>
        <select
          value={selectedSite}
          onChange={(e) => setSelectedSite(e.target.value)}
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5"
        >
          <option value="">All Sites</option>
          {sites.map((s) => (
            <option key={s.site_id} value={s.site_id}>{s.site_name}</option>
          ))}
        </select>
        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5"
        >
          <option value="">All Metrics</option>
          {SOP_METRICS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 border border-gray-200 rounded-md overflow-hidden">
          {(["all", "active", "future", "expired"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-2 py-1.5 capitalize transition-colors ${
                statusFilter === s
                  ? "bg-emerald-100 text-emerald-800 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{sorted.length} configs</span>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH} style={{ backgroundColor: "#047857", borderTopLeftRadius: 8 }}>Label</th>
                <th className={TH} style={{ backgroundColor: "#047857" }}>Metric</th>
                <th className={TH} style={{ backgroundColor: "#047857" }}>Scope</th>
                <th className={TH} style={{ backgroundColor: "#047857" }}>Range</th>
                <th className={TH} style={{ backgroundColor: "#047857" }}>Window</th>
                <th className={TH} style={{ backgroundColor: "#047857" }}>Unit</th>
                <th className={TH} style={{ backgroundColor: "#047857" }}>Status</th>
                <th className={TH} style={{ backgroundColor: "#047857" }}>Notes</th>
                <th className={TH} style={{ backgroundColor: "#047857", borderTopRightRadius: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-gray-500 text-center">Loading...</td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-gray-500 text-center">No SOP configs found</td>
                </tr>
              ) : (
                sorted.map((row, idx) => {
                  const status = getStatusLabel(row);
                  const isExpired = status.expired;
                  const rowClass = `${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${isExpired ? "opacity-50" : ""}`;
                  const hasCompliance = (complianceCounts[row.id] || 0) > 0;
                  const isConfirming = confirmAction?.id === row.id;

                  return (
                    <tr key={row.id} className={rowClass}>
                      <td className={`${TD} font-medium text-gray-800 max-w-[200px] truncate`}>{row.label}</td>
                      <td className={TD}>{getMetricLabel(row.metric)}</td>
                      <td className={TD}>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          !row.site_id ? "bg-purple-50 text-purple-700" :
                          !row.equipment_id ? "bg-blue-50 text-blue-700" :
                          "bg-amber-50 text-amber-700"
                        }`}>
                          {getScopeLabel(row)}
                        </span>
                      </td>
                      <td className={TD}>{getRangeLabel(row.min_value, row.max_value)}</td>
                      <td className={TD}>{getWindowLabel(row.evaluation_window)}</td>
                      <td className={TD}>{getUnitLabel(row.unit)}</td>
                      <td className={TD}>
                        <span className={`text-xs ${isExpired ? "text-gray-400" : "text-green-700"}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className={TD}>
                        {row.notes ? (
                          <span title={row.notes} className="cursor-help text-gray-400 hover:text-gray-600">
                            <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </span>
                        ) : null}
                      </td>
                      <td className={TD}>
                        {isConfirming ? (
                          <div className="flex flex-col gap-1 min-w-[200px]">
                            <span className="text-[10px] text-gray-600">
                              {confirmAction.type === "retire"
                                ? "Retire this config? It will stop applying after today. Historical compliance data will be preserved."
                                : "Permanently delete this config? This config has no compliance history. This cannot be undone."}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() =>
                                  confirmAction.type === "retire"
                                    ? handleRetire(row.id)
                                    : handleDelete(row.id)
                                }
                                className={`text-[10px] px-2 py-0.5 rounded font-medium text-white ${
                                  confirmAction.type === "retire" ? "bg-amber-600" : "bg-red-600"
                                }`}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmAction(null)}
                                className="text-[10px] px-2 py-0.5 rounded text-gray-600 hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEdit(row)} className="text-blue-600 hover:text-blue-800 text-[11px]">Edit</button>
                            <button onClick={() => openDuplicate(row)} className="text-gray-500 hover:text-gray-700 text-[11px]">Dup</button>
                            <button
                              onClick={() => setConfirmAction({ id: row.id, type: "retire" })}
                              className="text-amber-600 hover:text-amber-800 text-[11px]"
                            >
                              Retire
                            </button>
                            {!hasCompliance && (
                              <button
                                onClick={() => setConfirmAction({ id: row.id, type: "delete" })}
                                className="text-red-400 hover:text-red-600 text-[11px]"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <SOPConfigModal
          mode={modal.mode}
          editId={modal.editId}
          defaults={modal.defaults}
          orgs={orgs}
          onClose={() => setModal({ open: false, mode: "add" })}
          onSaved={() => {
            setModal({ open: false, mode: "add" });
            fetchConfigs();
            setToast(modal.mode === "edit" ? "Config updated." : "Config created.");
          }}
        />
      )}
    </div>
  );
}

// ─── Modal Component ──────────────────────────────────────────────────────────

function SOPConfigModal({
  mode,
  editId,
  defaults,
  orgs,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  editId?: string;
  defaults?: Partial<ModalFormData>;
  orgs: OrgOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ModalFormData>({
    org_id: defaults?.org_id || "",
    scopeLevel: defaults?.scopeLevel || "org",
    site_id: defaults?.site_id || "",
    equipment_id: defaults?.equipment_id || "",
    label: defaults?.label || "",
    metric: defaults?.metric || "",
    min_value: defaults?.min_value || "",
    max_value: defaults?.max_value || "",
    unit: defaults?.unit || "F",
    evaluation_window: defaults?.evaluation_window || "all_hours",
    effective_from: defaults?.effective_from || "",
    effective_to: defaults?.effective_to || "",
    notes: defaults?.notes || "",
  });

  const [sites, setSites] = useState<SiteOption[]>([]);
  const [equipments, setEquipments] = useState<EquipOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Fetch sites when org changes
  useEffect(() => {
    if (!form.org_id) { setSites([]); return; }
    (async () => {
      const { data } = await supabase
        .from("a_sites")
        .select("site_id, site_name")
        .eq("org_id", form.org_id)
        .order("site_name");
      setSites(data || []);
    })();
  }, [form.org_id]);

  // Fetch equipment when site changes
  useEffect(() => {
    if (!form.site_id) { setEquipments([]); return; }
    (async () => {
      const { data } = await supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, equipment_code")
        .eq("site_id", form.site_id)
        .not("status", "in", '("dummy","retired")')
        .order("equipment_name");
      setEquipments(data || []);
    })();
  }, [form.site_id]);

  function updateField(key: keyof ModalFormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Reset dependent fields
      if (key === "org_id") {
        next.site_id = "";
        next.equipment_id = "";
      }
      if (key === "site_id") {
        next.equipment_id = "";
      }
      if (key === "scopeLevel") {
        if (value === "org") {
          next.site_id = "";
          next.equipment_id = "";
        } else if (value === "site") {
          next.equipment_id = "";
        }
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.org_id) errs.org_id = "Required";
    if (!form.label.trim()) errs.label = "Required";
    if (!form.metric) errs.metric = "Required";
    if (form.scopeLevel !== "org" && !form.site_id) errs.site_id = "Required for this scope";
    if (form.scopeLevel === "equipment" && !form.equipment_id) errs.equipment_id = "Required for this scope";

    const minVal = form.min_value ? parseFloat(form.min_value) : null;
    const maxVal = form.max_value ? parseFloat(form.max_value) : null;
    if (form.min_value && isNaN(minVal!)) errs.min_value = "Must be a number";
    if (form.max_value && isNaN(maxVal!)) errs.max_value = "Must be a number";
    if (minVal != null && maxVal != null && maxVal <= minVal) errs.max_value = "Must be greater than min";

    if (form.effective_from && form.effective_to && form.effective_to <= form.effective_from) {
      errs.effective_to = "Must be after effective from";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setSaveError("");

    const payload: Record<string, unknown> = {
      org_id: form.org_id,
      site_id: form.scopeLevel !== "org" ? form.site_id : null,
      equipment_id: form.scopeLevel === "equipment" ? form.equipment_id : null,
      label: form.label.trim(),
      metric: form.metric,
      min_value: form.min_value ? parseFloat(form.min_value) : null,
      max_value: form.max_value ? parseFloat(form.max_value) : null,
      unit: form.unit,
      evaluation_window: form.evaluation_window,
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
      notes: form.notes.trim() || null,
    };

    let error;
    if (mode === "edit" && editId) {
      ({ error } = await supabase.from("a_sop_configs").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("a_sop_configs").insert(payload));
    }

    setSaving(false);
    if (error) {
      setSaveError(error.message);
    } else {
      onSaved();
    }
  }

  const inputClass = "w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500";
  const labelClass = "block text-xs font-medium text-gray-700 mb-1";
  const errorClass = "text-[10px] text-red-500 mt-0.5";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {mode === "edit" ? "Edit SOP Config" : "Add SOP Config"}
        </h2>

        {/* Org */}
        <div className="mb-3">
          <label className={labelClass}>Org *</label>
          <select value={form.org_id} onChange={(e) => updateField("org_id", e.target.value)} className={inputClass}>
            <option value="">Select org</option>
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
          </select>
          {errors.org_id && <div className={errorClass}>{errors.org_id}</div>}
        </div>

        {/* Scope Level */}
        <div className="mb-3">
          <label className={labelClass}>Scope Level *</label>
          <div className="flex gap-1 border border-gray-200 rounded-md overflow-hidden">
            {(["org", "site", "equipment"] as ScopeLevel[]).map((s) => (
              <button
                key={s}
                onClick={() => updateField("scopeLevel", s)}
                className={`flex-1 text-xs py-1.5 capitalize transition-colors ${
                  form.scopeLevel === s ? "bg-emerald-100 text-emerald-800 font-medium" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Site */}
        {form.scopeLevel !== "org" && (
          <div className="mb-3">
            <label className={labelClass}>Site *</label>
            <select value={form.site_id} onChange={(e) => updateField("site_id", e.target.value)} className={inputClass}>
              <option value="">Select site</option>
              {sites.map((s) => <option key={s.site_id} value={s.site_id}>{s.site_name}</option>)}
            </select>
            {errors.site_id && <div className={errorClass}>{errors.site_id}</div>}
          </div>
        )}

        {/* Equipment */}
        {form.scopeLevel === "equipment" && (
          <div className="mb-3">
            <label className={labelClass}>Equipment *</label>
            <select value={form.equipment_id} onChange={(e) => updateField("equipment_id", e.target.value)} className={inputClass}>
              <option value="">Select equipment</option>
              {equipments.map((eq) => (
                <option key={eq.equipment_id} value={eq.equipment_id}>
                  {eq.equipment_name}{eq.equipment_code ? ` (${eq.equipment_code})` : ""}
                </option>
              ))}
            </select>
            {errors.equipment_id && <div className={errorClass}>{errors.equipment_id}</div>}
          </div>
        )}

        {/* Label */}
        <div className="mb-3">
          <label className={labelClass}>Label *</label>
          <input
            value={form.label}
            onChange={(e) => updateField("label", e.target.value)}
            placeholder="e.g. Walk-In Cooler Temp — Brand Standard"
            className={inputClass}
          />
          {errors.label && <div className={errorClass}>{errors.label}</div>}
        </div>

        {/* Metric + Unit row */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelClass}>Metric *</label>
            <select value={form.metric} onChange={(e) => updateField("metric", e.target.value)} className={inputClass}>
              <option value="">Select metric</option>
              {SOP_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {errors.metric && <div className={errorClass}>{errors.metric}</div>}
          </div>
          <div>
            <label className={labelClass}>Unit *</label>
            <select value={form.unit} onChange={(e) => updateField("unit", e.target.value)} className={inputClass}>
              {SOP_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>

        {/* Min / Max row */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelClass}>Min Value</label>
            <input
              type="number"
              value={form.min_value}
              onChange={(e) => updateField("min_value", e.target.value)}
              placeholder="No lower bound"
              className={inputClass}
            />
            {errors.min_value && <div className={errorClass}>{errors.min_value}</div>}
          </div>
          <div>
            <label className={labelClass}>Max Value</label>
            <input
              type="number"
              value={form.max_value}
              onChange={(e) => updateField("max_value", e.target.value)}
              placeholder="No upper bound"
              className={inputClass}
            />
            {errors.max_value && <div className={errorClass}>{errors.max_value}</div>}
          </div>
        </div>

        {/* Evaluation Window */}
        <div className="mb-3">
          <label className={labelClass}>Evaluation Window *</label>
          <div className="flex gap-1 border border-gray-200 rounded-md overflow-hidden">
            {SOP_EVALUATION_WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => updateField("evaluation_window", w.value)}
                className={`flex-1 text-xs py-1.5 transition-colors ${
                  form.evaluation_window === w.value ? "bg-emerald-100 text-emerald-800 font-medium" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Effective dates */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelClass}>Effective From</label>
            <input type="date" value={form.effective_from} onChange={(e) => updateField("effective_from", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Effective To</label>
            <input type="date" value={form.effective_to} onChange={(e) => updateField("effective_to", e.target.value)} className={inputClass} />
            {errors.effective_to && <div className={errorClass}>{errors.effective_to}</div>}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className={labelClass}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="e.g. Per Wendy's Brand Standard v2.3"
            rows={2}
            className={inputClass}
          />
        </div>

        {/* Save error */}
        {saveError && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{saveError}</div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 font-medium"
          >
            {saving ? "Saving..." : "Save Config"}
          </button>
        </div>
      </div>
    </div>
  );
}
