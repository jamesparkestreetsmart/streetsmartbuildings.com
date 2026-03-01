"use client";

import { useState, useEffect, useCallback } from "react";
import TierBadge from "@/components/ui/TierBadge";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnomalyConfigProfile {
  profile_id: string;
  org_id: string;
  org_name?: string;
  profile_name: string;
  is_global: boolean;
  created_at: string;
  coil_freeze_temp_f: number | null;
  delayed_response_min: number | null;
  idle_heat_gain_f: number | null;
  long_cycle_min: number | null;
  short_cycle_count_1h: number | null;
  filter_restriction_delta_t_max: number | null;
  refrigerant_low_delta_t_min: number | null;
  efficiency_ratio_min_pct: number | null;
  compressor_current_threshold_a: number | null;
}

interface StoreHoursTemplate {
  template_id: string;
  org_id: string;
  org_name?: string;
  template_name: string;
  is_global: boolean;
  created_at: string;
  [key: string]: any;
}

interface ThermostatProfile {
  profile_id: string;
  org_id: string;
  org_name?: string;
  profile_name: string;
  is_global?: boolean;
  scope?: string;
  occupied_heat_f: number;
  occupied_cool_f: number;
  unoccupied_heat_f: number;
  unoccupied_cool_f: number;
  zone_count: number;
  site_count: number;
}

type ActiveTab = "anomaly" | "storehours" | "thermostat";

const THRESHOLD_KEYS = [
  "coil_freeze_temp_f",
  "delayed_response_min",
  "idle_heat_gain_f",
  "long_cycle_min",
  "short_cycle_count_1h",
  "filter_restriction_delta_t_max",
  "refrigerant_low_delta_t_min",
  "efficiency_ratio_min_pct",
  "compressor_current_threshold_a",
] as const;

const THRESHOLD_LABELS: Record<string, string> = {
  coil_freeze_temp_f: "Coil Freeze",
  delayed_response_min: "Delayed Response",
  idle_heat_gain_f: "Idle Heat Gain",
  long_cycle_min: "Long Cycle",
  short_cycle_count_1h: "Short Cycle",
  filter_restriction_delta_t_max: "Filter Restriction",
  refrigerant_low_delta_t_min: "Refrigerant Low",
  efficiency_ratio_min_pct: "Efficiency Ratio",
  compressor_current_threshold_a: "Compressor Current",
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface SSBGlobalProfilesPanelProps {
  orgId: string;
}

export default function SSBGlobalProfilesPanel({ orgId }: SSBGlobalProfilesPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("anomaly");
  const [collapsed, setCollapsed] = useState(false);

  // ─── Anomaly Config State ──────────────────────────────────────────────────
  const [globalAnomalyProfiles, setGlobalAnomalyProfiles] = useState<AnomalyConfigProfile[]>([]);
  const [childAnomalyProfiles, setChildAnomalyProfiles] = useState<AnomalyConfigProfile[]>([]);
  const [anomalyLoading, setAnomalyLoading] = useState(false);

  // ─── Store Hours State ─────────────────────────────────────────────────────
  const [globalHoursTemplates, setGlobalHoursTemplates] = useState<StoreHoursTemplate[]>([]);
  const [childHoursTemplates, setChildHoursTemplates] = useState<StoreHoursTemplate[]>([]);
  const [hoursLoading, setHoursLoading] = useState(false);

  // ─── Thermostat State ──────────────────────────────────────────────────────
  const [globalThermostatProfiles, setGlobalThermostatProfiles] = useState<ThermostatProfile[]>([]);
  const [childThermostatProfiles, setChildThermostatProfiles] = useState<ThermostatProfile[]>([]);
  const [thermostatLoading, setThermostatLoading] = useState(false);

  // ─── Create / Edit State ───────────────────────────────────────────────────
  const [showCreateAnomaly, setShowCreateAnomaly] = useState(false);
  const [newAnomalyName, setNewAnomalyName] = useState("");
  const [newAnomalyValues, setNewAnomalyValues] = useState<Record<string, number | null>>({});
  const [savingAnomaly, setSavingAnomaly] = useState(false);

  const [showCreateHours, setShowCreateHours] = useState(false);
  const [newHoursName, setNewHoursName] = useState("");
  const [newHoursForm, setNewHoursForm] = useState<Record<string, { open: string; close: string; closed: boolean }>>(() => {
    const init: Record<string, { open: string; close: string; closed: boolean }> = {};
    for (const d of DAYS) init[d] = { open: "", close: "", closed: false };
    return init;
  });
  const [savingHours, setSavingHours] = useState(false);

  const [showCreateThermostat, setShowCreateThermostat] = useState(false);
  const [newThermostatName, setNewThermostatName] = useState("");
  const [newThermostatValues, setNewThermostatValues] = useState({
    occupied_heat_f: 68, occupied_cool_f: 76,
    unoccupied_heat_f: 55, unoccupied_cool_f: 85,
  });
  const [savingThermostat, setSavingThermostat] = useState(false);

  // ─── Delete / Promote State ────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promotedId, setPromotedId] = useState<string | null>(null);

  // ─── Fetch Anomaly Profiles ────────────────────────────────────────────────
  const fetchAnomalyProfiles = useCallback(async () => {
    setAnomalyLoading(true);
    try {
      // Fetch globals (own org profiles includes globals)
      const resOwn = await fetch(`/api/anomaly-config/profiles?org_id=${orgId}`);
      const dataOwn = await resOwn.json();
      const globals = (dataOwn.profiles || []).filter((p: AnomalyConfigProfile) => p.is_global);
      setGlobalAnomalyProfiles(globals);

      // Fetch all child org profiles
      const resAll = await fetch(`/api/anomaly-config/profiles?org_id=${orgId}&scope=all`);
      const dataAll = await resAll.json();
      const children = (dataAll.profiles || []).filter((p: AnomalyConfigProfile) => !p.is_global);
      setChildAnomalyProfiles(children);
    } catch (err) {
      console.error("Failed to fetch anomaly profiles:", err);
    } finally {
      setAnomalyLoading(false);
    }
  }, [orgId]);

  // ─── Fetch Store Hours Templates ───────────────────────────────────────────
  const fetchHoursTemplates = useCallback(async () => {
    setHoursLoading(true);
    try {
      const resOwn = await fetch(`/api/store-hours/templates?org_id=${orgId}`);
      const dataOwn = await resOwn.json();
      const globals = (dataOwn.templates || []).filter((t: StoreHoursTemplate) => t.is_global);
      setGlobalHoursTemplates(globals);

      const resAll = await fetch(`/api/store-hours/templates?org_id=${orgId}&scope=all`);
      const dataAll = await resAll.json();
      const children = (dataAll.templates || []).filter((t: StoreHoursTemplate) => !t.is_global);
      setChildHoursTemplates(children);
    } catch (err) {
      console.error("Failed to fetch hours templates:", err);
    } finally {
      setHoursLoading(false);
    }
  }, [orgId]);

  // ─── Fetch Thermostat Profiles ─────────────────────────────────────────────
  const fetchThermostatProfiles = useCallback(async () => {
    setThermostatLoading(true);
    try {
      const resOwn = await fetch(`/api/thermostat/profiles?org_id=${orgId}`);
      const dataOwn = await resOwn.json();
      const globals = (Array.isArray(dataOwn) ? dataOwn : []).filter((p: ThermostatProfile) => p.is_global);
      setGlobalThermostatProfiles(globals);

      const resAll = await fetch(`/api/thermostat/profiles?org_id=${orgId}&scope=all`);
      const dataAll = await resAll.json();
      const children = (Array.isArray(dataAll) ? dataAll : []).filter((p: ThermostatProfile) => !p.is_global);
      setChildThermostatProfiles(children);
    } catch (err) {
      console.error("Failed to fetch thermostat profiles:", err);
    } finally {
      setThermostatLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchAnomalyProfiles();
    fetchHoursTemplates();
    fetchThermostatProfiles();
  }, [fetchAnomalyProfiles, fetchHoursTemplates, fetchThermostatProfiles]);

  // ─── Create Handlers ──────────────────────────────────────────────────────

  const createAnomalyProfile = async () => {
    if (!newAnomalyName.trim()) return;
    setSavingAnomaly(true);
    try {
      const body: Record<string, any> = {
        org_id: orgId,
        profile_name: newAnomalyName.trim(),
        is_global: true,
      };
      for (const key of THRESHOLD_KEYS) {
        body[key] = newAnomalyValues[key] ?? null;
      }
      const res = await fetch("/api/anomaly-config/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.profile) {
        setNewAnomalyName("");
        setNewAnomalyValues({});
        setShowCreateAnomaly(false);
        fetchAnomalyProfiles();
      }
    } catch (err) {
      console.error("Failed to create anomaly profile:", err);
    } finally {
      setSavingAnomaly(false);
    }
  };

  const createHoursTemplate = async () => {
    if (!newHoursName.trim()) return;
    setSavingHours(true);
    try {
      const body: Record<string, any> = {
        org_id: orgId,
        template_name: newHoursName.trim(),
        is_global: true,
      };
      for (const d of DAYS) {
        body[`${d}_open`] = newHoursForm[d].closed ? null : (newHoursForm[d].open || null);
        body[`${d}_close`] = newHoursForm[d].closed ? null : (newHoursForm[d].close || null);
        body[`${d}_closed`] = newHoursForm[d].closed;
      }
      const res = await fetch("/api/store-hours/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.template) {
        setNewHoursName("");
        const init: Record<string, { open: string; close: string; closed: boolean }> = {};
        for (const d of DAYS) init[d] = { open: "", close: "", closed: false };
        setNewHoursForm(init);
        setShowCreateHours(false);
        fetchHoursTemplates();
      }
    } catch (err) {
      console.error("Failed to create hours template:", err);
    } finally {
      setSavingHours(false);
    }
  };

  const createThermostatProfile = async () => {
    if (!newThermostatName.trim()) return;
    setSavingThermostat(true);
    try {
      const res = await fetch("/api/thermostat/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          profile_name: newThermostatName.trim(),
          is_global: true,
          ...newThermostatValues,
        }),
      });
      const data = await res.json();
      if (data.profile_id || data.profile_name) {
        setNewThermostatName("");
        setNewThermostatValues({ occupied_heat_f: 68, occupied_cool_f: 76, unoccupied_heat_f: 55, unoccupied_cool_f: 85 });
        setShowCreateThermostat(false);
        fetchThermostatProfiles();
      }
    } catch (err) {
      console.error("Failed to create thermostat profile:", err);
    } finally {
      setSavingThermostat(false);
    }
  };

  // ─── Delete Handler ────────────────────────────────────────────────────────

  const deleteAnomalyProfile = async (profileId: string) => {
    try {
      await fetch(`/api/anomaly-config/profiles?profile_id=${profileId}&org_id=${orgId}`, { method: "DELETE" });
      fetchAnomalyProfiles();
    } catch { /* handled */ } finally {
      setDeletingId(null);
    }
  };

  const deleteHoursTemplate = async (templateId: string) => {
    try {
      await fetch(`/api/store-hours/templates?template_id=${templateId}&org_id=${orgId}`, { method: "DELETE" });
      fetchHoursTemplates();
    } catch { /* handled */ } finally {
      setDeletingId(null);
    }
  };

  const deleteThermostatProfile = async (profileId: string) => {
    try {
      await fetch(`/api/thermostat/profiles?profile_id=${profileId}`, { method: "DELETE" });
      fetchThermostatProfiles();
    } catch { /* handled */ } finally {
      setDeletingId(null);
    }
  };

  // ─── Promote Handler (copy child profile as new global) ────────────────────

  const promoteAnomalyProfile = async (p: AnomalyConfigProfile) => {
    setPromotingId(p.profile_id);
    try {
      const body: Record<string, any> = {
        org_id: orgId,
        profile_name: p.profile_name,
        is_global: true,
      };
      for (const key of THRESHOLD_KEYS) {
        body[key] = p[key as keyof AnomalyConfigProfile] ?? null;
      }
      const res = await fetch("/api/anomaly-config/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.profile) {
        setPromotedId(p.profile_id);
        fetchAnomalyProfiles();
        setTimeout(() => setPromotedId(null), 3000);
      }
    } catch {
      console.error("Failed to promote profile");
    } finally {
      setPromotingId(null);
    }
  };

  const promoteHoursTemplate = async (t: StoreHoursTemplate) => {
    setPromotingId(t.template_id);
    try {
      const body: Record<string, any> = {
        org_id: orgId,
        template_name: t.template_name,
        is_global: true,
      };
      for (const d of DAYS) {
        body[`${d}_open`] = t[`${d}_open`] ?? null;
        body[`${d}_close`] = t[`${d}_close`] ?? null;
        body[`${d}_closed`] = t[`${d}_closed`] ?? false;
      }
      const res = await fetch("/api/store-hours/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.template) {
        setPromotedId(t.template_id);
        fetchHoursTemplates();
        setTimeout(() => setPromotedId(null), 3000);
      }
    } catch {
      console.error("Failed to promote template");
    } finally {
      setPromotingId(null);
    }
  };

  const promoteThermostatProfile = async (p: ThermostatProfile) => {
    setPromotingId(p.profile_id);
    try {
      const res = await fetch("/api/thermostat/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          profile_name: p.profile_name,
          is_global: true,
          occupied_heat_f: p.occupied_heat_f,
          occupied_cool_f: p.occupied_cool_f,
          unoccupied_heat_f: p.unoccupied_heat_f,
          unoccupied_cool_f: p.unoccupied_cool_f,
        }),
      });
      const data = await res.json();
      if (data.profile_id || data.profile_name) {
        setPromotedId(p.profile_id);
        fetchThermostatProfiles();
        setTimeout(() => setPromotedId(null), 3000);
      }
    } catch {
      console.error("Failed to promote thermostat profile");
    } finally {
      setPromotingId(null);
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const anomalyValuesSummary = (p: AnomalyConfigProfile) => {
    const parts: string[] = [];
    for (const key of THRESHOLD_KEYS) {
      const val = p[key as keyof AnomalyConfigProfile];
      if (typeof val === "number") {
        parts.push(`${THRESHOLD_LABELS[key]}: ${val}`);
      }
    }
    return parts.length > 0 ? parts.join(", ") : "No thresholds set";
  };

  const hoursValuesSummary = (t: StoreHoursTemplate) => {
    const parts: string[] = [];
    for (const d of DAYS) {
      if (t[`${d}_closed`]) {
        parts.push(`${DAY_LABELS[d]}: Closed`);
      } else if (t[`${d}_open`] && t[`${d}_close`]) {
        parts.push(`${DAY_LABELS[d]}: ${t[`${d}_open`]}-${t[`${d}_close`]}`);
      }
    }
    return parts.length > 0 ? parts.join(", ") : "No hours set";
  };

  const thermostatValuesSummary = (p: ThermostatProfile) =>
    `Occ: ${p.occupied_heat_f}\u00B0-${p.occupied_cool_f}\u00B0F, Unocc: ${p.unoccupied_heat_f}\u00B0-${p.unoccupied_cool_f}\u00B0F`;

  // Group child profiles by org_name
  const groupByOrg = <T extends { org_name?: string }>(items: T[]): [string, T[]][] => {
    const grouped: Record<string, T[]> = {};
    for (const item of items) {
      const name = item.org_name || "Unknown Org";
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(item);
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  };

  // ─── Tab Definitions ──────────────────────────────────────────────────────

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "anomaly", label: "Anomaly Config" },
    { key: "storehours", label: "Store Hours" },
    { key: "thermostat", label: "Thermostat Profiles" },
  ];

  // ─── Collapsed State ──────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div
        className="border border-gray-200 rounded-lg bg-white shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setCollapsed(false)}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">SSB Global Profiles</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {globalAnomalyProfiles.length + globalHoursTemplates.length + globalThermostatProfiles.length} global
            </span>
          </div>
          <span className="text-gray-400 text-sm">{"\u25B6"}</span>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer"
        style={{ backgroundColor: "#6d28d9" }}
        onClick={() => setCollapsed(true)}
      >
        <div className="flex items-center gap-2 text-white">
          <h3 className="font-semibold">SSB Global Profiles</h3>
          <span className="text-xs bg-purple-500 px-2 py-0.5 rounded-full">
            Manage global profiles across all systems
          </span>
        </div>
        <span className="text-purple-200 text-sm">{"\u25BC"}</span>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-purple-700 border-b-2 border-purple-600 bg-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ═══ TAB: Anomaly Config ═══ */}
        {activeTab === "anomaly" && (
          <div>
            {/* Section A: SSB Global Profiles */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">SSB Global Profiles</h4>
                <button
                  onClick={() => setShowCreateAnomaly(!showCreateAnomaly)}
                  className="px-3 py-1.5 text-xs font-medium text-purple-600 border border-purple-300 rounded hover:bg-purple-50 transition-colors"
                >
                  + New Global Profile
                </button>
              </div>

              {/* Create form */}
              {showCreateAnomaly && (
                <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <input
                    type="text"
                    value={newAnomalyName}
                    onChange={(e) => setNewAnomalyName(e.target.value)}
                    placeholder="Profile name..."
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 mb-2"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                    {THRESHOLD_KEYS.map((key) => (
                      <div key={key} className="flex items-center gap-1">
                        <label className="text-xs text-gray-600 truncate">{THRESHOLD_LABELS[key]}:</label>
                        <input
                          type="number"
                          value={newAnomalyValues[key] ?? ""}
                          onChange={(e) => setNewAnomalyValues((prev) => ({ ...prev, [key]: e.target.value ? parseFloat(e.target.value) : null }))}
                          className="w-20 px-1.5 py-1 text-xs border border-gray-300 rounded"
                          step={key.includes("current") || key.includes("ratio") ? "0.1" : "1"}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={createAnomalyProfile}
                      disabled={!newAnomalyName.trim() || savingAnomaly}
                      className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      {savingAnomaly ? "Creating..." : "Create Global Profile"}
                    </button>
                    <button
                      onClick={() => { setShowCreateAnomaly(false); setNewAnomalyName(""); setNewAnomalyValues({}); }}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {anomalyLoading ? (
                <div className="text-sm text-gray-400 py-2">Loading...</div>
              ) : globalAnomalyProfiles.length === 0 ? (
                <div className="text-sm text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded">
                  No global anomaly profiles yet. Create one above.
                </div>
              ) : (
                <div className="space-y-1">
                  {globalAnomalyProfiles.map((p) => (
                    <div key={p.profile_id} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-100 rounded text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <TierBadge tier="SSB" />
                        <span className="font-medium text-gray-800">{p.profile_name}</span>
                        <span className="text-xs text-gray-400 truncate hidden md:inline">{anomalyValuesSummary(p)}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {deletingId === p.profile_id ? (
                          <span className="flex items-center gap-1 text-xs">
                            <span className="text-red-600">Delete?</span>
                            <button onClick={() => deleteAnomalyProfile(p.profile_id)} className="px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded font-medium">Yes</button>
                            <button onClick={() => setDeletingId(null)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setDeletingId(p.profile_id)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors">Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section B: Child Org Profiles */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Child Org Profiles</h4>
              {anomalyLoading ? (
                <div className="text-sm text-gray-400 py-2">Loading...</div>
              ) : childAnomalyProfiles.length === 0 ? (
                <div className="text-sm text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded">
                  No child org profiles found.
                </div>
              ) : (
                <div className="space-y-4">
                  {groupByOrg(childAnomalyProfiles).map(([orgName, profiles]) => (
                    <div key={orgName}>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{orgName}</div>
                      <div className="space-y-1">
                        {profiles.map((p) => (
                          <div key={p.profile_id} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-100 rounded text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <TierBadge tier="ORG" />
                              <span className="font-medium text-gray-800">{p.profile_name}</span>
                              <span className="text-xs text-gray-400 truncate hidden md:inline">{anomalyValuesSummary(p)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {promotedId === p.profile_id ? (
                                <span className="text-[10px] text-green-600 font-medium px-1">{"\u2713"} Promoted</span>
                              ) : (
                                <button
                                  onClick={() => promoteAnomalyProfile(p)}
                                  disabled={promotingId === p.profile_id}
                                  className="px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                                >
                                  {promotingId === p.profile_id ? "..." : "Promote to Global"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: Store Hours ═══ */}
        {activeTab === "storehours" && (
          <div>
            {/* Section A: SSB Global Templates */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">SSB Global Templates</h4>
                <button
                  onClick={() => setShowCreateHours(!showCreateHours)}
                  className="px-3 py-1.5 text-xs font-medium text-purple-600 border border-purple-300 rounded hover:bg-purple-50 transition-colors"
                >
                  + New Global Template
                </button>
              </div>

              {/* Create form */}
              {showCreateHours && (
                <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <input
                    type="text"
                    value={newHoursName}
                    onChange={(e) => setNewHoursName(e.target.value)}
                    placeholder="Template name..."
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 mb-2"
                    autoFocus
                  />
                  <table className="w-full text-sm mb-2">
                    <thead>
                      <tr className="border-b text-xs font-semibold text-gray-600">
                        <th className="py-1 px-2 text-left">Day</th>
                        <th className="py-1 px-2 text-left">Open</th>
                        <th className="py-1 px-2 text-left">Close</th>
                        <th className="py-1 px-2 text-left">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((d) => (
                        <tr key={d} className="border-t">
                          <td className="py-1 px-2 text-gray-700">{DAY_LABELS[d]}</td>
                          <td className="py-1 px-2">
                            <input
                              type="time"
                              value={newHoursForm[d]?.open || ""}
                              onChange={(e) => setNewHoursForm((prev) => ({ ...prev, [d]: { ...prev[d], open: e.target.value } }))}
                              disabled={newHoursForm[d]?.closed}
                              className="border rounded px-2 py-0.5 text-xs disabled:bg-gray-100"
                            />
                          </td>
                          <td className="py-1 px-2">
                            <input
                              type="time"
                              value={newHoursForm[d]?.close || ""}
                              onChange={(e) => setNewHoursForm((prev) => ({ ...prev, [d]: { ...prev[d], close: e.target.value } }))}
                              disabled={newHoursForm[d]?.closed}
                              className="border rounded px-2 py-0.5 text-xs disabled:bg-gray-100"
                            />
                          </td>
                          <td className="py-1 px-2">
                            <input
                              type="checkbox"
                              checked={newHoursForm[d]?.closed || false}
                              onChange={(e) => setNewHoursForm((prev) => ({
                                ...prev,
                                [d]: { open: e.target.checked ? "" : prev[d].open, close: e.target.checked ? "" : prev[d].close, closed: e.target.checked },
                              }))}
                              className="w-4 h-4 text-purple-600 border-gray-300 rounded"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex gap-2">
                    <button
                      onClick={createHoursTemplate}
                      disabled={!newHoursName.trim() || savingHours}
                      className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      {savingHours ? "Creating..." : "Create Global Template"}
                    </button>
                    <button
                      onClick={() => { setShowCreateHours(false); setNewHoursName(""); }}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {hoursLoading ? (
                <div className="text-sm text-gray-400 py-2">Loading...</div>
              ) : globalHoursTemplates.length === 0 ? (
                <div className="text-sm text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded">
                  No global store hours templates yet. Create one above.
                </div>
              ) : (
                <div className="space-y-1">
                  {globalHoursTemplates.map((t) => (
                    <div key={t.template_id} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-100 rounded text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <TierBadge tier="SSB" />
                        <span className="font-medium text-gray-800">{t.template_name}</span>
                        <span className="text-xs text-gray-400 truncate hidden md:inline">{hoursValuesSummary(t)}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {deletingId === t.template_id ? (
                          <span className="flex items-center gap-1 text-xs">
                            <span className="text-red-600">Delete?</span>
                            <button onClick={() => deleteHoursTemplate(t.template_id)} className="px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded font-medium">Yes</button>
                            <button onClick={() => setDeletingId(null)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setDeletingId(t.template_id)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors">Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section B: Child Org Templates */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Child Org Templates</h4>
              {hoursLoading ? (
                <div className="text-sm text-gray-400 py-2">Loading...</div>
              ) : childHoursTemplates.length === 0 ? (
                <div className="text-sm text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded">
                  No child org templates found.
                </div>
              ) : (
                <div className="space-y-4">
                  {groupByOrg(childHoursTemplates).map(([orgName, templates]) => (
                    <div key={orgName}>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{orgName}</div>
                      <div className="space-y-1">
                        {templates.map((t) => (
                          <div key={t.template_id} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-100 rounded text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <TierBadge tier="ORG" />
                              <span className="font-medium text-gray-800">{t.template_name}</span>
                              <span className="text-xs text-gray-400 truncate hidden md:inline">{hoursValuesSummary(t)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {promotedId === t.template_id ? (
                                <span className="text-[10px] text-green-600 font-medium px-1">{"\u2713"} Promoted</span>
                              ) : (
                                <button
                                  onClick={() => promoteHoursTemplate(t)}
                                  disabled={promotingId === t.template_id}
                                  className="px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                                >
                                  {promotingId === t.template_id ? "..." : "Promote to Global"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: Thermostat Profiles ═══ */}
        {activeTab === "thermostat" && (
          <div>
            {/* Section A: SSB Global Profiles */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">SSB Global Profiles</h4>
                <button
                  onClick={() => setShowCreateThermostat(!showCreateThermostat)}
                  className="px-3 py-1.5 text-xs font-medium text-purple-600 border border-purple-300 rounded hover:bg-purple-50 transition-colors"
                >
                  + New Global Profile
                </button>
              </div>

              {/* Create form */}
              {showCreateThermostat && (
                <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <input
                    type="text"
                    value={newThermostatName}
                    onChange={(e) => setNewThermostatName(e.target.value)}
                    placeholder="Profile name..."
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 mb-2"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {(["occupied_heat_f", "occupied_cool_f", "unoccupied_heat_f", "unoccupied_cool_f"] as const).map((key) => (
                      <div key={key} className="flex items-center gap-1">
                        <label className="text-xs text-gray-600">{key.replace(/_/g, " ").replace(/\bf\b/, "\u00B0F")}:</label>
                        <input
                          type="number"
                          value={newThermostatValues[key]}
                          onChange={(e) => setNewThermostatValues((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                          className="w-20 px-1.5 py-1 text-xs border border-gray-300 rounded"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={createThermostatProfile}
                      disabled={!newThermostatName.trim() || savingThermostat}
                      className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      {savingThermostat ? "Creating..." : "Create Global Profile"}
                    </button>
                    <button
                      onClick={() => { setShowCreateThermostat(false); setNewThermostatName(""); }}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {thermostatLoading ? (
                <div className="text-sm text-gray-400 py-2">Loading...</div>
              ) : globalThermostatProfiles.length === 0 ? (
                <div className="text-sm text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded">
                  No global thermostat profiles yet. Create one above.
                </div>
              ) : (
                <div className="space-y-1">
                  {globalThermostatProfiles.map((p) => (
                    <div key={p.profile_id} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-100 rounded text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <TierBadge tier="SSB" />
                        <span className="font-medium text-gray-800">{p.profile_name}</span>
                        <span className="text-xs text-gray-400">{thermostatValuesSummary(p)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {deletingId === p.profile_id ? (
                          <span className="flex items-center gap-1 text-xs">
                            <span className="text-red-600">Delete?</span>
                            <button onClick={() => deleteThermostatProfile(p.profile_id)} className="px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded font-medium">Yes</button>
                            <button onClick={() => setDeletingId(null)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setDeletingId(p.profile_id)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors">Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section B: Child Org Profiles */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Child Org Profiles</h4>
              {thermostatLoading ? (
                <div className="text-sm text-gray-400 py-2">Loading...</div>
              ) : childThermostatProfiles.length === 0 ? (
                <div className="text-sm text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded">
                  No child org thermostat profiles found.
                </div>
              ) : (
                <div className="space-y-4">
                  {groupByOrg(childThermostatProfiles).map(([orgName, profiles]) => (
                    <div key={orgName}>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{orgName}</div>
                      <div className="space-y-1">
                        {profiles.map((p) => (
                          <div key={p.profile_id} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-100 rounded text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <TierBadge tier="ORG" />
                              <span className="font-medium text-gray-800">{p.profile_name}</span>
                              <span className="text-xs text-gray-400">{thermostatValuesSummary(p)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {promotedId === p.profile_id ? (
                                <span className="text-[10px] text-green-600 font-medium px-1">{"\u2713"} Promoted</span>
                              ) : (
                                <button
                                  onClick={() => promoteThermostatProfile(p)}
                                  disabled={promotingId === p.profile_id}
                                  className="px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                                >
                                  {promotingId === p.profile_id ? "..." : "Promote to Global"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
