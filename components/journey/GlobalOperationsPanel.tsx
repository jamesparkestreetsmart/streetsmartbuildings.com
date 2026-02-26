"use client";

import { useState, useEffect, useCallback } from "react";

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

type ActiveTab = "anomaly" | "thermostat" | "storehours";

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

  // ─── Thermostat State ──────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<ThermostatProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [profilesLoading, setProfilesLoading] = useState(false);

  // ─── Push State ────────────────────────────────────────────────────────────
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

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
  }, [fetchZones]);

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
  };

  // ─── Push: Anomaly Config ─────────────────────────────────────────────────
  const pushAnomalyConfig = async () => {
    if (!selectedZoneIds.length || !dirtyKeys.size) return;
    setPushing(true);
    setPushResult(null);

    const changedThresholds: Record<string, number> = {};
    dirtyKeys.forEach((key) => { changedThresholds[key] = editingThresholds[key]; });

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
    // Derive unique site_ids from selected zones
    const siteIds = [...new Set(zones.filter((z) => selectedZoneIds.includes(z.hvac_zone_id)).map((z) => z.site_id))];
    if (!siteIds.length) return;
    setPushing(true);
    setPushResult(null);

    try {
      // Push store hours to each site by triggering the enforce endpoint
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
            <div className="flex flex-wrap gap-2">
              {zones.map((zone) => (
                <button
                  key={zone.hvac_zone_id}
                  onClick={() => toggleZone(zone.hvac_zone_id)}
                  title={zone.site_name}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedZoneIds.includes(zone.hvac_zone_id)
                      ? "bg-indigo-100 text-indigo-700 border border-indigo-300"
                      : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  {zone.name}
                </button>
              ))}
            </div>
          )}
        </div>

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
              Edit anomaly detection thresholds and push to selected zones. Changed values are highlighted.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(labels).map(([key, meta]) => (
                <div
                  key={key}
                  className={`p-3 rounded-lg border transition-colors ${
                    dirtyKeys.has(key)
                      ? "border-amber-300 bg-amber-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">{meta.label}</label>
                    <span className="text-xs text-gray-400">{meta.unit}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{meta.description}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step={key.includes("current") || key.includes("ratio") ? "0.1" : "1"}
                      value={editingThresholds[key] ?? defaults[key] ?? 0}
                      onChange={(e) => updateThreshold(key, parseFloat(e.target.value) || 0)}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {dirtyKeys.has(key) && (
                      <span className="text-xs text-amber-600">was {defaults[key]}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
              <button onClick={resetThresholds} className="text-sm text-gray-500 hover:text-gray-700">
                Reset to Defaults
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!selectedZoneIds.length || !dirtyKeys.size || pushing}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {pushing ? "Pushing..." : `Push to ${selectedZoneIds.length} Zone(s)`}
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
                        <div className="font-medium text-sm text-gray-900">{profile.profile_name}</div>
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
                  <>Push <strong>{dirtyKeys.size}</strong> threshold change(s) to <strong>{selectedZoneIds.length}</strong> zone(s)?</>
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
