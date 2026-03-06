"use client";

import { useState, useEffect, useCallback } from "react";

interface Override {
  override_id: string;
  org_id: string;
  alert_def_id: string;
  site_id: string | null;
  equipment_id: string | null;
  threshold_override: number | null;
  severity_override: string | null;
  cooldown_override: number | null;
  sustain_override_min: number | null;
  enabled: boolean;
  silence_reason: string | null;
  created_by: string | null;
  site_name: string | null;
  equipment_name: string | null;
}

interface SiteOption { site_id: string; name: string }
interface EquipmentOption { id: string; name: string; site_id: string; site_name: string }

const SEVERITY_OPTIONS = ["info", "warning", "critical"];

const defaultOverrideForm = {
  site_id: "",
  equipment_id: "",
  threshold_override: "",
  severity_override: "",
  sustain_override_min: "",
  enabled: true,
  silence_reason: "",
};

export default function AlertOverrides({
  orgId,
  alertDefId,
}: {
  orgId: string;
  alertDefId: string;
}) {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...defaultOverrideForm });
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);

  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/overrides?alert_def_id=${alertDefId}`);
      const data = await res.json();
      setOverrides(data.overrides || []);
    } catch (err) {
      console.error("Failed to fetch overrides:", err);
    } finally {
      setLoading(false);
    }
  }, [alertDefId]);

  const fetchSitesAndEquipment = useCallback(async () => {
    const [sitesRes, eqRes] = await Promise.all([
      fetch(`/api/alerts/entities?org_id=${orgId}&level=sites`),
      fetch(`/api/alerts/entities?org_id=${orgId}&level=equipment`),
    ]);
    const sitesData = await sitesRes.json();
    const eqData = await eqRes.json();
    setSites(sitesData.sites || []);
    const flat: EquipmentOption[] = (eqData.equipment_types || []).flatMap(
      (et: any) => et.equipment.map((eq: any) => ({
        id: eq.id,
        name: eq.name,
        site_id: eq.site_id,
        site_name: eq.site_name,
      }))
    );
    setEquipment(flat);
  }, [orgId]);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);
  useEffect(() => { if (showAdd) fetchSitesAndEquipment(); }, [showAdd, fetchSitesAndEquipment]);

  const createOverride = async () => {
    setSaving(true);
    try {
      const body: any = {
        org_id: orgId,
        alert_def_id: alertDefId,
        site_id: form.site_id || null,
        equipment_id: form.equipment_id || null,
        threshold_override: form.threshold_override ? parseFloat(form.threshold_override) : null,
        severity_override: form.severity_override || null,
        sustain_override_min: form.sustain_override_min ? parseInt(form.sustain_override_min) : null,
        enabled: form.enabled,
        silence_reason: !form.enabled ? form.silence_reason : null,
      };

      const res = await fetch("/api/alerts/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Override creation failed:", data);
        return;
      }
      await fetchOverrides();
      setShowAdd(false);
      setForm({ ...defaultOverrideForm });
    } catch (err) {
      console.error("Failed to create override:", err);
    } finally {
      setSaving(false);
    }
  };

  const deleteOverride = async (overrideId: string) => {
    if (!confirm("Remove this override?")) return;
    await fetch(`/api/alerts/overrides?override_id=${overrideId}`, { method: "DELETE" });
    setOverrides((prev) => prev.filter((o) => o.override_id !== overrideId));
  };

  const scopeLabel = (o: Override) => {
    if (o.equipment_id) return o.equipment_name || "Equipment";
    if (o.site_id) return o.site_name || "Site";
    return "Org-wide";
  };

  const filteredEquipment = form.site_id
    ? equipment.filter((eq) => eq.site_id === form.site_id)
    : equipment;

  return (
    <div className="mt-2 ml-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Overrides</span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          {showAdd ? "Cancel" : "+ Add Override"}
        </button>
      </div>

      {/* Add override form */}
      {showAdd && (
        <div className="p-3 mb-2 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600">Site (optional)</label>
              <select
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value, equipment_id: "" })}
                className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Org-wide</option>
                {sites.map((s) => (
                  <option key={s.site_id} value={s.site_id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Equipment (optional)</label>
              <select
                value={form.equipment_id}
                onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}
                className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="">None</option>
                {filteredEquipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name} — {eq.site_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600">Threshold</label>
              <input
                type="number"
                value={form.threshold_override}
                onChange={(e) => setForm({ ...form, threshold_override: e.target.value })}
                placeholder="inherit"
                className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Sustain (min)</label>
              <input
                type="number"
                value={form.sustain_override_min}
                onChange={(e) => setForm({ ...form, sustain_override_min: e.target.value })}
                placeholder="inherit"
                className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Severity</label>
              <select
                value={form.severity_override}
                onChange={(e) => setForm({ ...form, severity_override: e.target.value })}
                className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="">inherit</option>
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              Enabled
            </label>
            {!form.enabled && (
              <input
                type="text"
                value={form.silence_reason}
                onChange={(e) => setForm({ ...form, silence_reason: e.target.value })}
                placeholder="Silence reason (required)"
                className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
              />
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={createOverride}
              disabled={saving || (!form.enabled && !form.silence_reason)}
              className="px-3 py-1 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Override"}
            </button>
          </div>
        </div>
      )}

      {/* Overrides list */}
      {loading ? (
        <div className="text-xs text-gray-400 py-2">Loading...</div>
      ) : overrides.length === 0 ? (
        <div className="text-xs text-gray-400 py-1">No overrides configured.</div>
      ) : (
        <div className="space-y-1">
          {overrides.map((o) => (
            <div
              key={o.override_id}
              className={`flex items-center justify-between px-2 py-1.5 rounded border text-xs ${
                o.enabled
                  ? "border-gray-200 bg-white"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-700">{scopeLabel(o)}</span>
                {o.threshold_override !== null && (
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200">
                    threshold: {o.threshold_override}
                  </span>
                )}
                {o.sustain_override_min !== null && (
                  <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded border border-purple-200">
                    sustain: {o.sustain_override_min}min
                  </span>
                )}
                {o.severity_override && (
                  <span className={`px-1.5 py-0.5 rounded border ${
                    o.severity_override === "critical"
                      ? "bg-red-50 text-red-600 border-red-200"
                      : o.severity_override === "warning"
                      ? "bg-amber-50 text-amber-600 border-amber-200"
                      : "bg-blue-50 text-blue-600 border-blue-200"
                  }`}>
                    {o.severity_override}
                  </span>
                )}
                {!o.enabled && (
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded border border-red-300">
                    SILENCED: {o.silence_reason}
                  </span>
                )}
              </div>
              <button
                onClick={() => deleteOverride(o.override_id)}
                className="text-red-400 hover:text-red-600 ml-2"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
