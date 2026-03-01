"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import TierBadge from "@/components/ui/TierBadge";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HvacZone {
  hvac_zone_id: string;
  name: string;
  site_id: string;
  site_name: string;
  anomaly_thresholds: Record<string, number>;
}

interface ThresholdMeta {
  label: string;
  unit: string;
  description: string;
}

interface ThermostatProfile {
  profile_id: string;
  profile_name: string;
  occupied_heat_f: number;
  occupied_cool_f: number;
  unoccupied_heat_f: number;
  unoccupied_cool_f: number;
  zone_count: number;
  site_count: number;
}

interface AnomalyConfigProfile {
  profile_id: string;
  org_id: string;
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

type ActiveTab = "anomaly" | "thermostat" | "storehours";

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

// ─── Props ───────────────────────────────────────────────────────────────────

interface GlobalOperationsPanelProps {
  orgId: string;
}

export default function GlobalOperationsPanel({ orgId }: GlobalOperationsPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("anomaly");
  const [collapsed, setCollapsed] = useState(false);

  // ─── Shared Zone Selection ─────────────────────────────────────────────────
  const [zones, setZones] = useState<HvacZone[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);

  // ─── Anomaly Config State ──────────────────────────────────────────────────
  const [defaults, setDefaults] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<Record<string, ThresholdMeta>>({});
  const [editingThresholds, setEditingThresholds] = useState<Record<string, number>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set<string>(THRESHOLD_KEYS));

  // ─── Anomaly Config Profiles State ─────────────────────────────────────────
  const [configProfiles, setConfigProfiles] = useState<AnomalyConfigProfile[]>([]);
  const [configProfilesLoading, setConfigProfilesLoading] = useState(false);
  const [selectedConfigProfileId, setSelectedConfigProfileId] = useState("");
  const [showProfileList, setShowProfileList] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveProfileName, setSaveProfileName] = useState("");
  const [saveProfileResult, setSaveProfileResult] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [copyingProfileId, setCopyingProfileId] = useState<string | null>(null);
  const [copiedProfileId, setCopiedProfileId] = useState<string | null>(null);

  // ─── Thermostat State ──────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<ThermostatProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [profilesLoading, setProfilesLoading] = useState(false);

  // ─── Push State ────────────────────────────────────────────────────────────
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // ─── Derived: checked + dirty field count ──────────────────────────────────
  const activeFieldCount = [...checkedKeys].filter((k) => dirtyKeys.has(k)).length;

  // ─── Derived: zones grouped by site ────────────────────────────────────────
  const zonesBySite = useMemo(() => {
    const grouped: Record<string, HvacZone[]> = {};
    for (const z of zones) {
      const site = z.site_name || "Unknown Site";
      if (!grouped[site]) grouped[site] = [];
      grouped[site].push(z);
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [zones]);

  // ─── Fetch zones + anomaly config ──────────────────────────────────────────
  const fetchZones = useCallback(async () => {
    setZonesLoading(true);
    try {
      const res = await fetch(`/api/anomaly-config?org_id=${orgId}`);
      const data = await res.json();
      if (data.zones) {
        setZones(data.zones);
        setDefaults(data.defaults || {});
        setLabels(data.labels || {});
        setEditingThresholds({ ...(data.defaults || {}) });
      }
    } catch (err) {
      console.error("Failed to fetch anomaly config:", err);
    } finally {
      setZonesLoading(false);
    }
  }, [orgId]);

  // ─── Fetch anomaly config profiles ─────────────────────────────────────────
  const fetchConfigProfiles = useCallback(async () => {
    setConfigProfilesLoading(true);
    try {
      const res = await fetch(`/api/anomaly-config/profiles?org_id=${orgId}`);
      if (!res.ok) {
        console.warn("[GlobalOps] Config profiles fetch returned", res.status);
        return;
      }
      const data = await res.json();
      if (data.profiles) setConfigProfiles(data.profiles);
    } catch (err) {
      console.error("Failed to fetch config profiles:", err);
    } finally {
      setConfigProfilesLoading(false);
    }
  }, [orgId]);

  // ─── Fetch thermostat profiles ─────────────────────────────────────────────
  const fetchProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const res = await fetch(`/api/thermostat/profiles?org_id=${orgId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setProfiles(data);
      }
    } catch (err) {
      console.error("Failed to fetch profiles:", err);
    } finally {
      setProfilesLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchZones();
    fetchConfigProfiles();
  }, [fetchZones, fetchConfigProfiles]);

  useEffect(() => {
    if (activeTab === "thermostat") fetchProfiles();
  }, [activeTab, fetchProfiles]);

  // ─── Zone Selection Handlers ───────────────────────────────────────────────
  const toggleZone = (id: string) => {
    setSelectedZoneIds((prev) =>
      prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]
    );
  };

  const selectAllZones = () => setSelectedZoneIds(zones.map((z) => z.hvac_zone_id));
  const clearZoneSelection = () => setSelectedZoneIds([]);

  // ─── Checkbox Handlers ─────────────────────────────────────────────────────
  const toggleCheck = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // ─── Threshold Edit Handlers ───────────────────────────────────────────────
  const updateThreshold = (key: string, value: number) => {
    setEditingThresholds((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      if (value !== defaults[key]) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const resetThresholds = () => {
    setEditingThresholds({ ...defaults });
    setDirtyKeys(new Set());
    setCheckedKeys(new Set<string>(THRESHOLD_KEYS));
  };

  // ─── Profile Handlers ─────────────────────────────────────────────────────
  const applyConfigProfile = (profile: AnomalyConfigProfile) => {
    const newThresholds: Record<string, number> = {};
    for (const key of THRESHOLD_KEYS) {
      const val = profile[key as keyof AnomalyConfigProfile];
      newThresholds[key] = typeof val === "number" ? val : defaults[key] ?? 0;
    }
    setEditingThresholds(newThresholds);
    setCheckedKeys(new Set<string>(THRESHOLD_KEYS));
    const newDirty = new Set<string>();
    for (const key of THRESHOLD_KEYS) {
      if (newThresholds[key] !== defaults[key]) newDirty.add(key);
    }
    setDirtyKeys(newDirty);
    setSelectedConfigProfileId("");
  };

  const handleSelectConfigProfile = (profileId: string) => {
    setSelectedConfigProfileId(profileId);
    const profile = configProfiles.find((p) => p.profile_id === profileId);
    if (profile) applyConfigProfile(profile);
  };

  const saveCurrentAsProfile = async () => {
    if (!saveProfileName.trim()) return;
    setSavingProfile(true);
    setSaveProfileResult(null);
    try {
      const body: Record<string, any> = {
        org_id: orgId,
        profile_name: saveProfileName.trim(),
      };
      for (const key of THRESHOLD_KEYS) {
        body[key] = editingThresholds[key] ?? defaults[key] ?? 0;
      }
      const res = await fetch("/api/anomaly-config/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.profile) {
        setSaveProfileResult("Saved!");
        setSaveProfileName("");
        setShowSaveInput(false);
        fetchConfigProfiles();
        setTimeout(() => setSaveProfileResult(null), 3000);
      } else {
        setSaveProfileResult(data.error || "Save failed");
      }
    } catch {
      setSaveProfileResult("Network error");
    } finally {
      setSavingProfile(false);
    }
  };

  const deleteConfigProfile = async (profileId: string) => {
    try {
      const res = await fetch(
        `/api/anomaly-config/profiles?profile_id=${profileId}&org_id=${orgId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        fetchConfigProfiles();
      }
    } catch {
      console.error("Failed to delete profile");
    } finally {
      setDeletingProfileId(null);
    }
  };

  // ─── Derived: org profile names (for duplicate detection) ───────────────────
  const orgProfileNames = useMemo(
    () => new Set(configProfiles.filter((p) => !p.is_global).map((p) => p.profile_name)),
    [configProfiles]
  );

  const copySSBProfileToOrg = async (ssbProfile: AnomalyConfigProfile) => {
    setCopyingProfileId(ssbProfile.profile_id);
    try {
      const body: Record<string, any> = {
        org_id: orgId,
        profile_name: ssbProfile.profile_name,
      };
      for (const key of THRESHOLD_KEYS) {
        body[key] = ssbProfile[key as keyof AnomalyConfigProfile] ?? null;
      }
      const res = await fetch("/api/anomaly-config/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.profile) {
        setCopiedProfileId(ssbProfile.profile_id);
        fetchConfigProfiles();
        setTimeout(() => setCopiedProfileId(null), 3000);
      }
    } catch {
      console.error("Failed to copy SSB profile");
    } finally {
      setCopyingProfileId(null);
    }
  };

  // ─── Push: Anomaly Config ─────────────────────────────────────────────────
  const pushAnomalyConfig = async () => {
    if (!selectedZoneIds.length || !activeFieldCount) return;
    setPushing(true);
    setPushResult(null);

    const changedThresholds: Record<string, number> = {};
    dirtyKeys.forEach((key) => {
      if (checkedKeys.has(key)) {
        changedThresholds[key] = editingThresholds[key];
      }
    });

    if (!Object.keys(changedThresholds).length) {
      setPushing(false);
      return;
    }

    try {
      const res = await fetch("/api/anomaly-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, zone_ids: selectedZoneIds, thresholds: changedThresholds }),
      });
      const data = await res.json();
      if (data.success) {
        setPushResult({ type: "success", message: data.summary });
        setDirtyKeys(new Set());
        fetchZones();
      } else {
        setPushResult({ type: "error", message: data.summary || data.error || "Push failed" });
      }
    } catch {
      setPushResult({ type: "error", message: "Network error" });
    } finally {
      setPushing(false);
      setShowConfirm(false);
    }
  };

  // ─── Push: Thermostat Profile ──────────────────────────────────────────────
  const pushThermostatProfile = async () => {
    if (!selectedProfileId) return;
    setPushing(true);
    setPushResult(null);

    try {
      const res = await fetch("/api/thermostat/global-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: selectedProfileId, org_id: orgId }),
      });
      const data = await res.json();
      if (data.error) {
        setPushResult({ type: "error", message: data.error });
      } else {
        const msg = `${data.zones_updated || 0} zone(s) updated across ${data.sites_affected || 0} site(s)`;
        setPushResult({ type: "success", message: msg });
      }
    } catch {
      setPushResult({ type: "error", message: "Network error" });
    } finally {
      setPushing(false);
      setShowConfirm(false);
    }
  };

  // ─── Push: Store Hours ─────────────────────────────────────────────────────
  const pushStoreHours = async () => {
    const siteIds = [...new Set(zones.filter((z) => selectedZoneIds.includes(z.hvac_zone_id)).map((z) => z.site_id))];
    if (!siteIds.length) return;
    setPushing(true);
    setPushResult(null);

    try {
      let successCount = 0;
      for (const siteId of siteIds) {
        const res = await fetch(`/api/store-hours/manifest?site_id=${siteId}`);
        if (res.ok) successCount++;
      }
      setPushResult({
        type: successCount > 0 ? "success" : "error",
        message: `Refreshed store hours for ${successCount}/${siteIds.length} site(s)`,
      });
    } catch {
      setPushResult({ type: "error", message: "Network error" });
    } finally {
      setPushing(false);
      setShowConfirm(false);
    }
  };

  // ─── Tab Definitions ───────────────────────────────────────────────────────
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "anomaly", label: "Anomaly Config" },
    { key: "thermostat", label: "Thermostat Push" },
    { key: "storehours", label: "Store Hours" },
  ];

  // ─── Zone Selector (shared across all tabs) ───────────────────────────────
  const renderZoneSelector = () => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">Target Zones</label>
        <div className="flex gap-2">
          <button onClick={selectAllZones} className="text-xs text-indigo-600 hover:text-indigo-800">
            Select All
          </button>
          <span className="text-gray-300">|</span>
          <button onClick={clearZoneSelection} className="text-xs text-gray-500 hover:text-gray-700">
            Clear
          </button>
        </div>
      </div>
      {zonesLoading ? (
        <div className="text-sm text-gray-400 py-2">Loading zones...</div>
      ) : (
        <div className="space-y-3">
          {zonesBySite.map(([siteName, siteZones]) => (
            <div key={siteName}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {siteName}
              </div>
              <div className="flex flex-wrap gap-2">
                {siteZones.map((zone) => (
                  <button
                    key={zone.hvac_zone_id}
                    onClick={() => toggleZone(zone.hvac_zone_id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedZoneIds.includes(zone.hvac_zone_id)
                        ? "bg-indigo-100 text-indigo-700 border border-indigo-300"
                        : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    {siteName} &middot; {zone.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Collapsed State ──────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        className="border border-gray-200 rounded-lg bg-white shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setCollapsed(false)}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Global Operations</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {zones.length} zones
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
        style={{ backgroundColor: "#3730a3" }}
        onClick={() => setCollapsed(true)}
      >
        <div className="flex items-center gap-2 text-white">
          <h3 className="font-semibold">Global Operations</h3>
          <span className="text-xs bg-indigo-500 px-2 py-0.5 rounded-full">
            {selectedZoneIds.length}/{zones.length} zones selected
          </span>
        </div>
        <span className="text-indigo-200 text-sm">{"\u25BC"}</span>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPushResult(null); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-indigo-700 border-b-2 border-indigo-600 bg-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Zone Selector (shared across tabs) */}
        {renderZoneSelector()}

        {/* Push Result Toast */}
        {pushResult && (
          <div
            className={`mb-4 px-4 py-2 rounded-lg text-sm ${
              pushResult.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {pushResult.type === "success" ? "\u2713" : "\u2717"} {pushResult.message}
          </div>
        )}

        {/* TAB 1: Anomaly Config */}
        {activeTab === "anomaly" && (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              Edit anomaly detection thresholds and push to selected zones. Check fields to include in push.
            </p>

            {/* ── Profiles Section ────────────────────────────────────── */}
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Profiles</label>
                <select
                  value={selectedConfigProfileId}
                  onChange={(e) => handleSelectConfigProfile(e.target.value)}
                  className="flex-1 min-w-[200px] px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  <option value="">Load a profile...</option>
                  {configProfiles.map((p) => (
                    <option key={p.profile_id} value={p.profile_id}>
                      {p.is_global
                        ? `[SSB] ${p.profile_name}`
                        : `[ORG] ${p.profile_name} \u00B7 ${new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    </option>
                  ))}
                </select>
                {!showSaveInput ? (
                  <button
                    onClick={() => { setShowSaveInput(true); setSaveProfileResult(null); }}
                    className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-300 rounded hover:bg-indigo-50 transition-colors whitespace-nowrap"
                  >
                    Save Current as Profile
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={saveProfileName}
                      onChange={(e) => setSaveProfileName(e.target.value)}
                      placeholder="Profile name..."
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 w-40"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveCurrentAsProfile(); if (e.key === "Escape") { setShowSaveInput(false); setSaveProfileName(""); } }}
                    />
                    <button
                      onClick={saveCurrentAsProfile}
                      disabled={!saveProfileName.trim() || savingProfile}
                      className="px-2.5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {savingProfile ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => { setShowSaveInput(false); setSaveProfileName(""); }}
                      className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {saveProfileResult && (
                  <span className={`text-xs ${saveProfileResult === "Saved!" ? "text-green-600" : "text-red-600"}`}>
                    {saveProfileResult}
                  </span>
                )}
              </div>

              {/* Collapsible profile list */}
              {configProfiles.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowProfileList(!showProfileList)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {showProfileList ? "\u25BC" : "\u25B6"} {configProfiles.length} saved profile(s)
                  </button>
                  {showProfileList && (
                    <div className="mt-2 space-y-1">
                      {configProfiles.map((p) => (
                        <div
                          key={p.profile_id}
                          className="flex items-center justify-between px-3 py-2 bg-white border border-gray-100 rounded text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <TierBadge tier={p.is_global ? "SSB" : "ORG"} />
                            {!p.is_global && (
                              <span className="text-gray-400">{"\uD83D\uDCCB"}</span>
                            )}
                            <span className="font-medium text-gray-800">{p.profile_name}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => applyConfigProfile(p)}
                              className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            >
                              Apply
                            </button>
                            {p.is_global ? (
                              orgProfileNames.has(p.profile_name) ? (
                                <span className="text-[10px] text-gray-400 italic px-1">Already in your profiles</span>
                              ) : copiedProfileId === p.profile_id ? (
                                <span className="text-[10px] text-green-600 font-medium px-1">{"\u2713"} Added</span>
                              ) : (
                                <button
                                  onClick={() => copySSBProfileToOrg(p)}
                                  disabled={copyingProfileId === p.profile_id}
                                  className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-50"
                                >
                                  {copyingProfileId === p.profile_id ? "..." : "+ Add to My Profiles"}
                                </button>
                              )
                            ) : (
                              deletingProfileId === p.profile_id ? (
                                <span className="flex items-center gap-1 text-xs">
                                  <span className="text-red-600">Delete?</span>
                                  <button
                                    onClick={() => deleteConfigProfile(p.profile_id)}
                                    className="px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded font-medium"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    onClick={() => setDeletingProfileId(null)}
                                    className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
                                  >
                                    No
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setDeletingProfileId(p.profile_id)}
                                  className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors"
                                >
                                  Delete
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {configProfilesLoading && (
                <div className="mt-2 text-xs text-gray-400">Loading profiles...</div>
              )}
            </div>

            {/* ── Threshold Fields with Checkboxes ────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(labels).map(([key, meta]) => {
                const isChecked = checkedKeys.has(key);
                const isDirty = dirtyKeys.has(key);
                return (
                  <div
                    key={key}
                    className={`p-3 rounded-lg border transition-colors ${
                      !isChecked
                        ? "border-gray-200 bg-gray-100 opacity-60"
                        : isDirty
                        ? "border-amber-300 bg-amber-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(key)}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                        <label className={`text-sm font-medium ${isChecked ? "text-gray-700" : "text-gray-400"}`}>
                          {meta.label}
                        </label>
                      </div>
                      <span className="text-xs text-gray-400">{meta.unit}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2 ml-6">{meta.description}</p>
                    <div className="flex items-center gap-2 ml-6">
                      {isChecked ? (
                        <>
                          <input
                            type="number"
                            step={key.includes("current") || key.includes("ratio") ? "0.1" : "1"}
                            value={editingThresholds[key] ?? defaults[key] ?? 0}
                            onChange={(e) => updateThreshold(key, parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          {isDirty && (
                            <span className="text-xs text-amber-600">was {defaults[key]}</span>
                          )}
                        </>
                      ) : (
                        <input
                          type="number"
                          disabled
                          value=""
                          className="w-24 px-2 py-1 text-sm border border-gray-200 rounded bg-gray-200 text-gray-400 cursor-not-allowed"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
              <button onClick={resetThresholds} className="text-sm text-gray-500 hover:text-gray-700">
                Reset to Defaults
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!selectedZoneIds.length || !activeFieldCount || pushing}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {pushing
                  ? "Pushing..."
                  : `Push ${activeFieldCount} Field(s) to ${selectedZoneIds.length} Zone(s)`}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Thermostat Push */}
        {activeTab === "thermostat" && (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              Select a thermostat profile and push to all linked zones. This updates setpoints for every non-override zone assigned to the profile.
            </p>
            {profilesLoading ? (
              <div className="text-sm text-gray-400 py-4">Loading profiles...</div>
            ) : profiles.length === 0 ? (
              <div className="text-sm text-gray-400 py-4">No profiles found for this organization.</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {profiles.map((profile) => (
                    <button
                      key={profile.profile_id}
                      onClick={() => setSelectedProfileId(profile.profile_id)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        selectedProfileId === profile.profile_id
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TierBadge tier="ORG" />
                          <span className="font-medium text-sm text-gray-900">{profile.profile_name}</span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {profile.zone_count} zone(s)
                        </span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-gray-500">
                        <div>Occ Heat: {profile.occupied_heat_f}{"\u00B0"}F</div>
                        <div>Occ Cool: {profile.occupied_cool_f}{"\u00B0"}F</div>
                        <div>Unocc Heat: {profile.unoccupied_heat_f}{"\u00B0"}F</div>
                        <div>Unocc Cool: {profile.unoccupied_cool_f}{"\u00B0"}F</div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end pt-3 border-t border-gray-200">
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={!selectedProfileId || pushing}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {pushing ? "Pushing..." : "Push Profile to Linked Zones"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Store Hours */}
        {activeTab === "storehours" && (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              Refresh store hours manifests for sites derived from selected zones.
            </p>
            {(() => {
              const siteIds = [...new Set(zones.filter((z) => selectedZoneIds.includes(z.hvac_zone_id)).map((z) => z.site_id))];
              return (
                <div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                    <div className="text-sm text-gray-700">
                      <strong>{siteIds.length}</strong> site(s) will be refreshed
                      {siteIds.length === 0 && (
                        <span className="text-gray-400 ml-2">-- select zones above to target sites</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end pt-3 border-t border-gray-200">
                    <button
                      onClick={() => setShowConfirm(true)}
                      disabled={!siteIds.length || pushing}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {pushing ? "Refreshing..." : `Refresh Store Hours for ${siteIds.length} Site(s)`}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Confirmation Dialog */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Confirm Push</h4>
              <p className="text-sm text-gray-600 mb-4">
                {activeTab === "anomaly" && (
                  <>Push <strong>{activeFieldCount}</strong> field(s) to <strong>{selectedZoneIds.length}</strong> zone(s)?</>
                )}
                {activeTab === "thermostat" && (
                  <>Push thermostat profile to all linked zones? This will override current setpoints for non-override zones.</>
                )}
                {activeTab === "storehours" && (
                  <>Refresh store hours for <strong>{[...new Set(zones.filter((z) => selectedZoneIds.includes(z.hvac_zone_id)).map((z) => z.site_id))].length}</strong> site(s)?</>
                )}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (activeTab === "anomaly") pushAnomalyConfig();
                    else if (activeTab === "thermostat") pushThermostatProfile();
                    else pushStoreHours();
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                >
                  {pushing ? "Pushing..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
