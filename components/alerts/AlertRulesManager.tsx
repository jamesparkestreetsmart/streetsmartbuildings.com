"use client";

import { useState, useEffect, useCallback } from "react";

interface AlertDefinition {
  id: string;
  name: string;
  description: string | null;
  severity: string;
  entity_type: string;
  entity_id: string | null;
  derived_metric: string | null;
  anomaly_type: string | null;
  condition_type: string;
  threshold_value: number | null;
  target_value: string | null;
  target_value_type: string;
  stale_minutes: number | null;
  delta_value: number | null;
  delta_direction: string;
  window_minutes: number | null;
  sustain_minutes: number;
  scope_level: string;
  scope_mode: string;
  scope_ids: string[] | null;
  eval_path: string;
  equipment_type: string | null;
  sensor_role: string | null;
  enabled: boolean;
  active_instances: number;
  created_at: string;
}

interface SiteOption { site_id: string; name: string }

interface EquipmentType {
  type: string;
  label: string;
  count: number;
  equipment: { id: string; name: string; site_id: string; site_name: string }[];
}

interface SensorOption {
  entity_id?: string;
  sensor_type?: string;
  label: string;
  unit: string | null;
  entity_count?: number;
  total_equipment?: number;
}

interface DerivedMetric { key: string; label: string; unit: string }
interface AnomalyType { key: string; label: string; description: string }

const SEVERITY_LEVELS = [
  { key: "info", label: "Info", cls: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "warning", label: "Warning", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "critical", label: "Critical", cls: "bg-red-100 text-red-700 border-red-300" },
];

const CONDITION_TYPES = [
  { key: "above_threshold", label: "Above Threshold" },
  { key: "below_threshold", label: "Below Threshold" },
  { key: "changes_to", label: "Changes To" },
  { key: "stale", label: "Stale (No Data)" },
  { key: "rate_of_change", label: "Rate of Change" },
];

const defaultForm = {
  name: "",
  description: "",
  severity: "warning",
  entity_type: "sensor" as "sensor" | "derived" | "anomaly",
  // Sensor selection
  selectedSites: [] as string[],
  sensorMode: "equipment_type" as "equipment_type" | "specific_equipment",
  selectedEquipmentType: "",
  selectedEquipmentId: "",
  selectedEntityId: "",
  selectedSensorType: "",
  // Derived / Anomaly
  derived_metric: "",
  anomaly_type: "",
  // Condition
  condition_type: "above_threshold",
  threshold_value: "",
  target_value: "",
  target_value_type: "string",
  stale_minutes: "30",
  delta_value: "",
  delta_direction: "any",
  window_minutes: "15",
  // Settings
  sustain_minutes: "0",
};

export default function AlertRulesManager({ orgId }: { orgId: string }) {
  const [definitions, setDefinitions] = useState<AlertDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });

  // Cascading data
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [derivedMetrics, setDerivedMetrics] = useState<DerivedMetric[]>([]);
  const [anomalyTypes, setAnomalyTypes] = useState<AnomalyType[]>([]);

  // ─── Fetch definitions ──────────────────────────────────────────────────
  const fetchDefinitions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/rules?org_id=${orgId}`);
      const data = await res.json();
      setDefinitions(data.definitions || []);
    } catch (err) {
      console.error("Failed to fetch definitions:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchDefinitions(); }, [fetchDefinitions]);

  // ─── Cascading data fetchers ────────────────────────────────────────────
  const fetchSites = useCallback(async () => {
    const res = await fetch(`/api/alerts/entities?org_id=${orgId}&level=sites`);
    const data = await res.json();
    setSites(data.sites || []);
  }, [orgId]);

  const fetchEquipment = useCallback(async (siteFilter?: string) => {
    let url = `/api/alerts/entities?org_id=${orgId}&level=equipment`;
    if (siteFilter) url += `&site_id=${siteFilter}`;
    const res = await fetch(url);
    const data = await res.json();
    setEquipmentTypes(data.equipment_types || []);
  }, [orgId]);

  const fetchSensorsForType = useCallback(async (eqGroup: string) => {
    const url = `/api/alerts/entities?org_id=${orgId}&level=sensors&equipment_group=${encodeURIComponent(eqGroup)}`;
    console.log("[AlertRulesManager] fetchSensorsForType URL:", url);
    const res = await fetch(url);
    const data = await res.json();
    console.log("[AlertRulesManager] fetchSensorsForType response:", JSON.stringify(data));
    setSensors(data.sensors || []);
  }, [orgId]);

  const fetchSensorsForEquipment = useCallback(async (eqId: string) => {
    const res = await fetch(`/api/alerts/entities?org_id=${orgId}&level=sensors&equipment_id=${eqId}`);
    const data = await res.json();
    setSensors(data.sensors || []);
  }, [orgId]);

  const fetchDerivedAndAnomalies = useCallback(async () => {
    const res = await fetch(`/api/alerts/entities?org_id=${orgId}`);
    const data = await res.json();
    setDerivedMetrics(data.derived || []);
    setAnomalyTypes(data.anomalies || []);
  }, [orgId]);

  // Load sites + derived/anomalies when form opens
  useEffect(() => {
    if (showCreate) {
      fetchSites();
      fetchEquipment();
      fetchDerivedAndAnomalies();
    }
  }, [showCreate, fetchSites, fetchEquipment, fetchDerivedAndAnomalies]);

  // Reload equipment when site filter changes (for site-specific filtering)
  // We always load all equipment and filter visually
  useEffect(() => {
    if (form.selectedEquipmentType) {
      fetchSensorsForType(form.selectedEquipmentType);
    }
  }, [form.selectedEquipmentType, fetchSensorsForType]);

  useEffect(() => {
    if (form.selectedEquipmentId) {
      fetchSensorsForEquipment(form.selectedEquipmentId);
    }
  }, [form.selectedEquipmentId, fetchSensorsForEquipment]);

  // ─── Create definition ──────────────────────────────────────────────────
  const createDefinition = async () => {
    setSaving(true);
    try {
      const body: any = {
        org_id: orgId,
        name: form.name,
        description: form.description || null,
        severity: form.severity,
        entity_type: form.entity_type,
        condition_type: form.entity_type === "anomaly" ? "changes_to" : form.condition_type,
        sustain_minutes: parseInt(form.sustain_minutes) || 0,
        eval_path: "auto",
      };

      // Scope from site selection
      if (form.selectedSites.length > 0) {
        body.scope_mode = "include";
        body.scope_level = "site";
        body.scope_ids = form.selectedSites;
      } else {
        body.scope_mode = "all";
        body.scope_level = "org";
      }

      if (form.entity_type === "sensor") {
        if (form.sensorMode === "equipment_type" && form.selectedEquipmentType) {
          // Equipment-type alert
          body.entity_id = null;
          body.equipment_type = form.selectedEquipmentType;
          body.sensor_role = form.selectedSensorType || null;
        } else if (form.sensorMode === "specific_equipment" && form.selectedEntityId) {
          // Specific sensor
          body.entity_id = form.selectedEntityId;
        }
      } else if (form.entity_type === "derived") {
        body.derived_metric = form.derived_metric || null;
      } else if (form.entity_type === "anomaly") {
        body.anomaly_type = form.anomaly_type || null;
        body.target_value = "true";
        body.target_value_type = "boolean";
      }

      // Condition fields
      if (["above_threshold", "below_threshold"].includes(body.condition_type)) {
        body.threshold_value = parseFloat(form.threshold_value) || null;
      }
      if (body.condition_type === "changes_to" && form.entity_type !== "anomaly") {
        body.target_value = form.target_value;
        body.target_value_type = form.target_value_type;
      }
      if (body.condition_type === "stale") {
        body.stale_minutes = parseInt(form.stale_minutes) || 30;
      }
      if (body.condition_type === "rate_of_change") {
        body.delta_value = parseFloat(form.delta_value) || null;
        body.delta_direction = form.delta_direction;
        body.window_minutes = parseInt(form.window_minutes) || 15;
      }

      console.log("[AlertRulesManager] POST body:", JSON.stringify(body, null, 2));

      const res = await fetch("/api/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[AlertRulesManager] API error:", data);
        return;
      }
      if (data.definition) {
        setDefinitions((prev) => [{ ...data.definition, active_instances: 0 }, ...prev]);
        setShowCreate(false);
        setForm({ ...defaultForm });
      }
    } catch (err) {
      console.error("Failed to create definition:", err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle / Delete ────────────────────────────────────────────────────
  const toggleDefinition = async (def: AlertDefinition) => {
    await fetch("/api/alerts/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: def.id, enabled: !def.enabled }),
    });
    setDefinitions((prev) =>
      prev.map((d) => (d.id === def.id ? { ...d, enabled: !d.enabled } : d))
    );
  };

  const deleteDefinition = async (id: string) => {
    if (!confirm("Delete this alert definition? This will remove all eval state and subscriptions.")) return;
    await fetch(`/api/alerts/rules?id=${id}`, { method: "DELETE" });
    setDefinitions((prev) => prev.filter((d) => d.id !== id));
  };

  // ─── Display helpers ────────────────────────────────────────────────────
  const watchDescription = (def: AlertDefinition) => {
    let what = "";
    if (def.entity_type === "sensor") {
      if (def.equipment_type) {
        what = `${def.equipment_type} → ${def.sensor_role || "sensor"}`;
      } else if (def.entity_id) {
        what = def.entity_id;
      } else {
        what = "Sensor";
      }
    } else if (def.entity_type === "derived") {
      what = def.derived_metric?.replace(/_/g, " ") || "Derived";
    } else if (def.entity_type === "anomaly") {
      what = def.anomaly_type?.replace(/_/g, " ") || "Anomaly";
    }

    let condition = "";
    if (def.condition_type === "above_threshold") condition = `> ${def.threshold_value}`;
    else if (def.condition_type === "below_threshold") condition = `< ${def.threshold_value}`;
    else if (def.condition_type === "changes_to") condition = `= "${def.target_value}"`;
    else if (def.condition_type === "stale") condition = `${def.stale_minutes}min stale`;
    else if (def.condition_type === "rate_of_change") condition = `delta ${def.delta_value} / ${def.window_minutes}min`;

    return `${what} ${condition}`.trim();
  };

  const scopeLabel = (def: AlertDefinition) => {
    if (def.scope_mode === "all") return "All Sites";
    const count = def.scope_ids?.length || 0;
    if (def.scope_mode === "include") return `${count} site${count !== 1 ? "s" : ""}`;
    return `Excluding ${count} site${count !== 1 ? "s" : ""}`;
  };

  // ─── Helpers ────────────────────────────────────────────────────────────
  const toggleSite = (siteId: string) => {
    setForm((prev) => ({
      ...prev,
      selectedSites: prev.selectedSites.includes(siteId)
        ? prev.selectedSites.filter((s) => s !== siteId)
        : [...prev.selectedSites, siteId],
    }));
  };

  // Get flattened equipment for the "Specific Equipment" sub-selector
  const allEquipmentFlat = equipmentTypes.flatMap((et) =>
    et.equipment
      .filter((eq) =>
        form.selectedSites.length === 0 || form.selectedSites.includes(eq.site_id)
      )
      .map((eq) => ({ ...eq, groupLabel: et.label }))
  );

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full bg-amber-500 text-white px-4 py-3 flex items-center justify-between hover:bg-amber-600 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Alert Definitions</span>
          <span className="text-xs bg-amber-400 px-2 py-0.5 rounded-full">
            {definitions.filter((d) => d.enabled).length} active
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <span
              onClick={(e) => { e.stopPropagation(); setShowCreate(!showCreate); }}
              className="text-sm bg-amber-600 hover:bg-amber-700 px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              + New Definition
            </span>
          )}
          <span className={`transition-transform ${collapsed ? "" : "rotate-180"}`}>&#9650;</span>
        </div>
      </button>

      {!collapsed && (
        <div className="p-4">
          {/* ═══════ Create Form ═══════ */}
          {showCreate && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
              <h4 className="font-medium text-gray-900">New Alert Definition</h4>

              {/* ─── Section 1: Name & Description ─── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Walk-in Freezer Over Temp"
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Description (optional)</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional description"
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* ─── Section 2: What to Monitor ─── */}
              <div>
                <label className="text-sm font-medium text-gray-700">What to Monitor</label>
                <div className="mt-1 flex gap-2">
                  {(["sensor", "derived", "anomaly"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm({
                        ...form,
                        entity_type: t,
                        selectedEquipmentType: "",
                        selectedEquipmentId: "",
                        selectedEntityId: "",
                        selectedSensorType: "",
                        derived_metric: "",
                        anomaly_type: "",
                      })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        form.entity_type === t
                          ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                          : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-150"
                      }`}
                    >
                      {t === "sensor" ? "Sensor" : t === "derived" ? "Derived Metric" : "Anomaly Flag"}
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── Site Filter ─── */}
              <div>
                <label className="text-sm font-medium text-gray-700">Which Sites?</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setForm({ ...form, selectedSites: [] })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      form.selectedSites.length === 0
                        ? "bg-green-100 text-green-700 border-green-300"
                        : "bg-gray-100 text-gray-600 border-gray-200"
                    }`}
                  >
                    All Sites
                  </button>
                  {sites.map((site) => (
                    <button
                      key={site.site_id}
                      onClick={() => toggleSite(site.site_id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                        form.selectedSites.includes(site.site_id)
                          ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                    >
                      {site.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── Sensor Mode: Equipment Type or Specific ─── */}
              {form.entity_type === "sensor" && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Equipment</label>
                    <div className="mt-1 flex gap-2 mb-2">
                      <button
                        onClick={() => setForm({
                          ...form,
                          sensorMode: "equipment_type",
                          selectedEquipmentId: "",
                          selectedEntityId: "",
                          selectedSensorType: "",
                        })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          form.sensorMode === "equipment_type"
                            ? "bg-green-100 text-green-700 border-green-300"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        By Equipment Type
                      </button>
                      <button
                        onClick={() => setForm({
                          ...form,
                          sensorMode: "specific_equipment",
                          selectedEquipmentType: "",
                          selectedSensorType: "",
                        })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          form.sensorMode === "specific_equipment"
                            ? "bg-green-100 text-green-700 border-green-300"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        Specific Equipment
                      </button>
                    </div>
                  </div>

                  {/* Equipment Type selector */}
                  {form.sensorMode === "equipment_type" && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Equipment Type</label>
                      <select
                        value={form.selectedEquipmentType}
                        onChange={(e) => setForm({
                          ...form,
                          selectedEquipmentType: e.target.value,
                          selectedSensorType: "",
                        })}
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                      >
                        <option value="">Select equipment type...</option>
                        {equipmentTypes.map((et) => {
                          const filteredCount = form.selectedSites.length > 0
                            ? et.equipment.filter((eq) => form.selectedSites.includes(eq.site_id)).length
                            : et.count;
                          if (filteredCount === 0) return null;
                          return (
                            <option key={et.type} value={et.type}>
                              {et.label} ({filteredCount})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {/* Specific Equipment selector */}
                  {form.sensorMode === "specific_equipment" && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Equipment</label>
                      <select
                        value={form.selectedEquipmentId}
                        onChange={(e) => setForm({
                          ...form,
                          selectedEquipmentId: e.target.value,
                          selectedEntityId: "",
                        })}
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                      >
                        <option value="">Select equipment...</option>
                        {allEquipmentFlat.map((eq) => (
                          <option key={eq.id} value={eq.id}>
                            {eq.name} — {eq.site_name} ({eq.groupLabel})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Reading selector */}
                  {(form.selectedEquipmentType || form.selectedEquipmentId) && sensors.length === 0 && (
                    <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                      No sensor readings found for this equipment type. Ensure sensors are assigned via the Gateways page.
                    </div>
                  )}
                  {(form.selectedEquipmentType || form.selectedEquipmentId) && sensors.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Reading</label>
                      <select
                        value={form.sensorMode === "equipment_type" ? form.selectedSensorType : form.selectedEntityId}
                        onChange={(e) => {
                          if (form.sensorMode === "equipment_type") {
                            setForm({ ...form, selectedSensorType: e.target.value });
                          } else {
                            setForm({ ...form, selectedEntityId: e.target.value });
                          }
                        }}
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                      >
                        <option value="">Select sensor...</option>
                        {sensors.map((s) => {
                          // For equipment_type mode: value is sensor_type
                          // For specific_equipment mode: value is entity_id
                          const val = form.sensorMode === "equipment_type"
                            ? (s.sensor_type || s.label)
                            : (s.entity_id || s.sensor_type || s.label);
                          const display = form.sensorMode === "equipment_type"
                            ? `${s.label}${s.unit ? ` (${s.unit})` : ""} — ${s.entity_count}/${s.total_equipment} equipment`
                            : `${s.label}${s.unit ? ` (${s.unit})` : ""}`;
                          return (
                            <option key={val} value={val}>
                              {display}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* ─── Derived Metric selector ─── */}
              {form.entity_type === "derived" && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Derived Metric</label>
                  <select
                    value={form.derived_metric}
                    onChange={(e) => setForm({ ...form, derived_metric: e.target.value })}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">Select metric...</option>
                    {derivedMetrics.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label} ({d.unit})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* ─── Anomaly Flag selector ─── */}
              {form.entity_type === "anomaly" && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Anomaly Type</label>
                  <select
                    value={form.anomaly_type}
                    onChange={(e) => setForm({ ...form, anomaly_type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">Select anomaly...</option>
                    {anomalyTypes.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label} — {a.description}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-gray-500">
                    Condition: automatically set to &quot;Changes To: true&quot; when anomaly is detected.
                  </div>
                </div>
              )}

              {/* ─── Section 3: Condition ─── */}
              {form.entity_type !== "anomaly" && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Condition</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {CONDITION_TYPES.map((c) => (
                        <button
                          key={c.key}
                          onClick={() => setForm({ ...form, condition_type: c.key })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                            form.condition_type === c.key
                              ? "bg-green-100 text-green-700 border-green-300"
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Condition-specific fields */}
                  {["above_threshold", "below_threshold"].includes(form.condition_type) && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Threshold Value</label>
                      <input
                        type="number"
                        value={form.threshold_value}
                        onChange={(e) => setForm({ ...form, threshold_value: e.target.value })}
                        placeholder="e.g., 42"
                        className="mt-1 w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>
                  )}

                  {form.condition_type === "changes_to" && (
                    <div className="flex gap-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Target Value</label>
                        <input
                          type="text"
                          value={form.target_value}
                          onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                          placeholder="e.g., off"
                          className="mt-1 w-40 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Type</label>
                        <select
                          value={form.target_value_type}
                          onChange={(e) => setForm({ ...form, target_value_type: e.target.value })}
                          className="mt-1 px-2 py-2 text-sm border border-gray-300 rounded-lg"
                        >
                          <option value="string">String</option>
                          <option value="numeric">Numeric</option>
                          <option value="boolean">Boolean</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {form.condition_type === "stale" && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Stale After (minutes)</label>
                      <input
                        type="number"
                        value={form.stale_minutes}
                        onChange={(e) => setForm({ ...form, stale_minutes: e.target.value })}
                        className="mt-1 w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>
                  )}

                  {form.condition_type === "rate_of_change" && (
                    <div className="flex gap-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Delta</label>
                        <input
                          type="number"
                          value={form.delta_value}
                          onChange={(e) => setForm({ ...form, delta_value: e.target.value })}
                          placeholder="e.g., 5"
                          className="mt-1 w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Direction</label>
                        <select
                          value={form.delta_direction}
                          onChange={(e) => setForm({ ...form, delta_direction: e.target.value })}
                          className="mt-1 px-2 py-2 text-sm border border-gray-300 rounded-lg"
                        >
                          <option value="any">Any</option>
                          <option value="increase">Increase</option>
                          <option value="decrease">Decrease</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Window (min)</label>
                        <input
                          type="number"
                          value={form.window_minutes}
                          onChange={(e) => setForm({ ...form, window_minutes: e.target.value })}
                          className="mt-1 w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ─── Section 4: Alert Settings ─── */}
              <div className="flex gap-4 items-end">
                <div>
                  <label className="text-sm font-medium text-gray-700">Severity</label>
                  <div className="mt-1 flex gap-2">
                    {SEVERITY_LEVELS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setForm({ ...form, severity: s.key })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          form.severity === s.key ? s.cls : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Sustain (min)</label>
                  <input
                    type="number"
                    value={form.sustain_minutes}
                    onChange={(e) => setForm({ ...form, sustain_minutes: e.target.value })}
                    className="mt-1 w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    title="0 = fire immediately"
                  />
                </div>
              </div>

              {/* ─── Section 5: Create ─── */}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                <button
                  onClick={() => { setShowCreate(false); setForm({ ...defaultForm }); }}
                  className="px-3 py-1.5 text-sm text-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={createDefinition}
                  disabled={
                    !form.name || saving ||
                    (form.entity_type === "sensor" && form.sensorMode === "equipment_type" && (!form.selectedEquipmentType || !form.selectedSensorType)) ||
                    (form.entity_type === "sensor" && form.sensorMode === "specific_equipment" && !form.selectedEntityId) ||
                    (form.entity_type === "derived" && !form.derived_metric) ||
                    (form.entity_type === "anomaly" && !form.anomaly_type)
                  }
                  className="px-4 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create Definition"}
                </button>
              </div>
            </div>
          )}

          {/* ═══════ Definitions List ═══════ */}
          {loading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading definitions...</div>
          ) : definitions.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">
              No alert definitions configured. Create one to start monitoring.
            </div>
          ) : (
            <div className="space-y-2">
              {definitions.map((def) => (
                <div
                  key={def.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    def.enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleDefinition(def)}
                        className={`w-8 h-5 rounded-full relative transition-colors ${
                          def.enabled ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            def.enabled ? "left-3.5" : "left-0.5"
                          }`}
                        />
                      </button>
                      <span className="font-medium text-sm text-gray-900">{def.name}</span>
                      {def.active_instances > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                          {def.active_instances} active
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteDefinition(def.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 ml-10">
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${
                      def.severity === "critical"
                        ? "bg-red-50 text-red-600 border-red-200"
                        : def.severity === "warning"
                        ? "bg-amber-50 text-amber-600 border-amber-200"
                        : "bg-blue-50 text-blue-600 border-blue-200"
                    }`}>
                      {def.severity}
                    </span>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full border border-indigo-200">
                      {watchDescription(def)}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                      {scopeLabel(def)}
                    </span>
                    {def.sustain_minutes > 0 && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                        {def.sustain_minutes}min sustain
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
