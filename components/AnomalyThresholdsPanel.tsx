"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import TierBadge from "@/components/ui/TierBadge";

interface Zone {
  hvac_zone_id: string;
  name: string;
  anomaly_thresholds: Record<string, any> | null;
}

interface AnomalyConfigProfile {
  profile_id: string;
  profile_name: string;
  is_global: boolean;
  scope?: string;
  created_at: string;
  [key: string]: any;
}

interface Props {
  siteId: string;
  orgId: string;
  onUpdate?: () => void;
}

const DEFAULTS: Record<string, { label: string; unit: string; default: number; description: string }> = {
  coil_freeze_temp_f: {
    label: "Coil Freeze",
    unit: "\u00B0F",
    default: 35,
    description: "Supply air temp below this triggers coil freeze alert",
  },
  delayed_response_min: {
    label: "Delayed Response",
    unit: "min",
    default: 15,
    description: "Minutes after HVAC activation with no temp change",
  },
  idle_heat_gain_f: {
    label: "Idle Heat Gain",
    unit: "\u00B0F",
    default: 2,
    description: "Zone temp rise while idle that triggers alert",
  },
  long_cycle_min: {
    label: "Long Cycle",
    unit: "min",
    default: 120,
    description: "Continuous compressor run time before flagging",
  },
  short_cycle_count_1h: {
    label: "Short Cycling",
    unit: "cycles/hr",
    default: 4,
    description: "On/off cycles per hour before flagging",
  },
  filter_restriction_delta_t_max: {
    label: "Filter Restriction \u0394T",
    unit: "\u00B0F",
    default: 25,
    description: "Delta T above this while running = restricted filter",
  },
  refrigerant_low_delta_t_min: {
    label: "Low Refrigerant \u0394T",
    unit: "\u00B0F",
    default: 5,
    description: "Delta T below this while running = low refrigerant",
  },
  efficiency_ratio_min_pct: {
    label: "Min Efficiency",
    unit: "%",
    default: 40,
    description: "Efficiency ratio below this triggers alert",
  },
  compressor_current_threshold_a: {
    label: "Compressor Current",
    unit: "A",
    default: 1.0,
    description: "Current above this = compressor running",
  },
};

const THRESHOLD_KEYS = Object.keys(DEFAULTS);

export default function AnomalyThresholdsPanel({ siteId, orgId, onUpdate }: Props) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profile-first state
  const [mode, setMode] = useState<"view" | "create">("view");
  const [profileName, setProfileName] = useState("");

  // Profile list state
  const [orgProfiles, setOrgProfiles] = useState<AnomalyConfigProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);

  // Fetch zones for this site
  useEffect(() => {
    const fetchZones = async () => {
      const { data } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id, name, anomaly_thresholds")
        .eq("site_id", siteId)
        .eq("control_scope", "managed")
        .not("thermostat_device_id", "is", null)
        .not("equipment_id", "is", null)
        .order("name");

      if (data) {
        setZones(data);
        if (data.length > 0 && !selectedZoneId) {
          setSelectedZoneId(data[0].hvac_zone_id);
        }
      }
      setLoading(false);
    };
    fetchZones();
  }, [siteId]);

  // Fetch profiles (non-global: org + site scoped)
  const fetchProfiles = async () => {
    if (!orgId) {
      console.warn("[AnomalyThresholds] orgId is empty, skipping profile fetch");
      return;
    }
    setProfilesLoading(true);
    try {
      const url = `/api/anomaly-config/profiles?org_id=${orgId}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error("[AnomalyThresholds] Profile fetch failed:", res.status, res.statusText);
        return;
      }
      const data = await res.json();
      if (data.profiles) {
        const nonGlobal = data.profiles.filter((p: AnomalyConfigProfile) => !p.is_global);
        nonGlobal.sort((a: AnomalyConfigProfile, b: AnomalyConfigProfile) => {
          const aScope = a.scope || "org";
          const bScope = b.scope || "org";
          if (aScope !== bScope) return aScope === "org" ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setOrgProfiles(nonGlobal);
      }
    } catch (err) {
      console.error("[AnomalyThresholds] Failed to fetch config profiles:", err);
    } finally {
      setProfilesLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const selectedZone = zones.find((z) => z.hvac_zone_id === selectedZoneId);
  const thresholds = selectedZone?.anomaly_thresholds || {};

  // Initialize form values when zone changes
  useEffect(() => {
    const vals: Record<string, string> = {};
    for (const key of Object.keys(DEFAULTS)) {
      vals[key] = String(thresholds[key] ?? "");
    }
    setValues(vals);
    setMode("view");
    setProfileName("");
  }, [selectedZoneId, JSON.stringify(thresholds)]);

  // Enter create mode pre-filled with current zone values
  const startNewProfile = () => {
    const vals: Record<string, string> = {};
    for (const key of THRESHOLD_KEYS) {
      vals[key] = String(thresholds[key] ?? "");
    }
    setValues(vals);
    setProfileName("");
    setMode("create");
  };

  // Enter create mode pre-filled from an existing profile (name blank)
  const startFromProfile = (profileId: string) => {
    const profile = orgProfiles.find((p) => p.profile_id === profileId);
    if (!profile) return;
    const vals: Record<string, string> = {};
    for (const key of THRESHOLD_KEYS) {
      const val = profile[key];
      vals[key] = val != null ? String(val) : "";
    }
    setValues(vals);
    setProfileName("");
    setMode("create");
  };

  // Save profile to API then apply values to zone
  const handleSaveProfile = async () => {
    if (!profileName.trim() || !orgId || !selectedZoneId) return;
    setSaving(true);

    try {
      const thresholdValues: Record<string, number> = {};
      const body: Record<string, any> = {
        org_id: orgId,
        profile_name: profileName.trim(),
        scope: "site",
      };

      for (const key of THRESHOLD_KEYS) {
        const val = values[key]?.trim();
        if (val !== "" && val !== undefined) {
          const num = parseFloat(val);
          body[key] = !isNaN(num) ? num : DEFAULTS[key].default;
          if (!isNaN(num) && num !== DEFAULTS[key].default) {
            thresholdValues[key] = num;
          }
        } else {
          body[key] = DEFAULTS[key].default;
        }
      }

      // 1. Save profile
      const res = await fetch("/api/anomaly-config/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.profile) {
        alert(data.error || "Failed to save profile");
        setSaving(false);
        return;
      }

      // 2. Apply to zone
      const { error } = await supabase
        .from("a_hvac_zones")
        .update({ anomaly_thresholds: thresholdValues })
        .eq("hvac_zone_id", selectedZoneId);

      if (error) {
        alert("Profile saved but failed to apply to zone: " + error.message);
      } else {
        setZones((prev) =>
          prev.map((z) =>
            z.hvac_zone_id === selectedZoneId
              ? { ...z, anomaly_thresholds: thresholdValues }
              : z
          )
        );
        onUpdate?.();
      }

      fetchProfiles();
      setMode("view");
      setProfileName("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  };

  // Apply an existing profile's values directly to zone (immediate, no form)
  const handleApplyExistingProfile = async (profileId: string) => {
    const profile = orgProfiles.find((p) => p.profile_id === profileId);
    if (!profile || !selectedZoneId) return;
    setSaving(true);

    const thresholdValues: Record<string, number> = {};
    for (const key of THRESHOLD_KEYS) {
      const val = profile[key];
      if (val != null) {
        const num = typeof val === "number" ? val : parseFloat(val);
        if (!isNaN(num) && num !== DEFAULTS[key].default) {
          thresholdValues[key] = num;
        }
      }
    }

    const { error } = await supabase
      .from("a_hvac_zones")
      .update({ anomaly_thresholds: thresholdValues })
      .eq("hvac_zone_id", selectedZoneId);

    if (error) {
      alert("Failed to apply: " + error.message);
    } else {
      setZones((prev) =>
        prev.map((z) =>
          z.hvac_zone_id === selectedZoneId
            ? { ...z, anomaly_thresholds: thresholdValues }
            : z
        )
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate?.();
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!selectedZoneId) return;
    if (!confirm("Reset all thresholds to system defaults?")) return;
    setSaving(true);

    const { error } = await supabase
      .from("a_hvac_zones")
      .update({ anomaly_thresholds: {} })
      .eq("hvac_zone_id", selectedZoneId);

    if (error) {
      alert("Failed to reset: " + error.message);
    } else {
      setZones((prev) =>
        prev.map((z) =>
          z.hvac_zone_id === selectedZoneId
            ? { ...z, anomaly_thresholds: {} }
            : z
        )
      );
      const vals: Record<string, string> = {};
      for (const key of Object.keys(DEFAULTS)) vals[key] = "";
      setValues(vals);
      setMode("view");
      setProfileName("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate?.();
    }
    setSaving(false);
  };

  const handleDeleteProfile = async (profileId: string) => {
    setDeletingProfileId(profileId);
    try {
      const res = await fetch(`/api/anomaly-config/profiles?profile_id=${profileId}&org_id=${orgId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchProfiles();
      }
    } catch {
      // silent
    } finally {
      setDeletingProfileId(null);
    }
  };

  const hasOverrides = Object.keys(thresholds).length > 0;

  if (loading) {
    return (
      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
          <h3 className="text-sm font-semibold text-gray-800">Anomaly Thresholds</h3>
        </div>
        <div className="px-4 py-6 text-center text-xs text-gray-400">Loading zones...</div>
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
          <h3 className="text-sm font-semibold text-gray-800">Anomaly Thresholds</h3>
        </div>
        <div className="px-4 py-6 text-center text-xs text-gray-400">No managed zones</div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Anomaly Thresholds</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Per-zone detection settings</p>
          </div>
          {saved && (
            <span className="text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">Saved</span>
          )}
        </div>

        {zones.length > 1 && (
          <select
            value={selectedZoneId}
            onChange={(e) => setSelectedZoneId(e.target.value)}
            className="mt-2 w-full text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {zones.map((z) => (
              <option key={z.hvac_zone_id} value={z.hvac_zone_id}>{z.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Profiles list (always visible) */}
      <div className="px-3 py-2.5 border-b">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">
            Profiles {orgProfiles.length > 0 && `(${orgProfiles.length})`}
          </span>
          <button
            onClick={startNewProfile}
            disabled={mode === "create"}
            className="text-[11px] font-medium text-green-600 hover:text-green-700 disabled:opacity-40 transition-colors"
          >
            + New Profile
          </button>
        </div>

        {profilesLoading ? (
          <div className="text-[11px] text-gray-400 py-1">Loading profiles...</div>
        ) : orgProfiles.length === 0 ? (
          <p className="text-[11px] text-gray-400 leading-snug py-1">
            No profiles yet. Click &ldquo;+ New Profile&rdquo; to create one from current zone values.
          </p>
        ) : (
          <div className="space-y-1.5">
            {orgProfiles.map((p) => (
              <div
                key={p.profile_id}
                className="flex items-center justify-between px-2.5 py-2 rounded border border-gray-200 bg-white text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <TierBadge tier={(p.scope || "org") === "site" ? "SITE" : "ORG"} />
                  <span className="font-medium text-gray-700 truncate">{p.profile_name}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <button
                    onClick={() => handleApplyExistingProfile(p.profile_id)}
                    disabled={saving}
                    className="px-2 py-0.5 text-[11px] font-medium text-green-600 border border-green-300 rounded hover:bg-green-50 disabled:opacity-40 transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => startFromProfile(p.profile_id)}
                    disabled={mode === "create"}
                    className="px-2 py-0.5 text-[11px] font-medium text-blue-600 border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-40 transition-colors"
                  >
                    Use as Base
                  </button>
                  {!p.is_global && (p.scope || "org") === "site" && (
                    <button
                      onClick={() => handleDeleteProfile(p.profile_id)}
                      disabled={deletingProfileId === p.profile_id}
                      className="px-1.5 py-0.5 text-[11px] text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
                    >
                      {deletingProfileId === p.profile_id ? "..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile name input (create mode only) */}
      {mode === "create" && (
        <div className="px-4 py-3 border-b bg-green-50/50">
          <label className="block text-[11px] font-medium text-gray-600 mb-1">New Profile Name</label>
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="e.g., Winter Settings, Conservative..."
            className="w-full px-2.5 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-green-500"
            autoFocus
          />
        </div>
      )}

      {/* Thresholds list */}
      <div className="divide-y max-h-[400px] overflow-y-auto">
        {Object.entries(DEFAULTS).map(([key, config]) => {
          const currentValue = thresholds[key];
          const isOverridden = currentValue !== undefined && currentValue !== null;
          const displayValue = isOverridden ? currentValue : config.default;

          return (
            <div key={key} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-700">{config.label}</span>
                  {mode === "view" && isOverridden && (
                    <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1 rounded">CUSTOM</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{config.description}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {mode === "create" ? (
                  <input
                    type="number"
                    step="any"
                    value={values[key] || ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={String(config.default)}
                    className="w-16 text-xs text-right border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                ) : (
                  <span className={`text-xs font-mono font-semibold ${isOverridden ? "text-purple-700" : "text-gray-600"}`}>
                    {displayValue}
                  </span>
                )}
                <span className="text-[10px] text-gray-400 w-10">{config.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t bg-gray-50 rounded-b-lg flex items-center justify-between gap-2">
        {mode === "create" ? (
          <>
            <button
              onClick={() => { setMode("view"); setProfileName(""); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={saving || !profileName.trim()}
              className="px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save & Apply"}
            </button>
          </>
        ) : (
          <>
            <span className="text-[10px] text-gray-400">
              {hasOverrides
                ? `${Object.keys(thresholds).length} custom override${Object.keys(thresholds).length !== 1 ? "s" : ""}`
                : "All system defaults"}
            </span>
            <button
              onClick={handleReset}
              disabled={saving || !hasOverrides}
              className="text-xs text-red-600 hover:text-red-700 disabled:opacity-40"
            >
              Reset to Defaults
            </button>
          </>
        )}
      </div>
    </div>
  );
}
