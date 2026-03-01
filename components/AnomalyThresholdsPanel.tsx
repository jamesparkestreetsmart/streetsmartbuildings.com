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
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profile selector state
  const [orgProfiles, setOrgProfiles] = useState<AnomalyConfigProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [appliedProfile, setAppliedProfile] = useState<{ name: string; date: string } | null>(null);

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

  // Fetch org profiles (non-global only)
  useEffect(() => {
    if (!orgId) return;
    const fetchProfiles = async () => {
      setProfilesLoading(true);
      try {
        const res = await fetch(`/api/anomaly-config/profiles?org_id=${orgId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.profiles) {
          setOrgProfiles(data.profiles.filter((p: AnomalyConfigProfile) => !p.is_global));
        }
      } catch (err) {
        console.error("Failed to fetch config profiles:", err);
      } finally {
        setProfilesLoading(false);
      }
    };
    fetchProfiles();
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
    setEditing(false);
    setAppliedProfile(null);
    setSelectedProfileId("");
  }, [selectedZoneId, JSON.stringify(thresholds)]);

  // Apply profile to form
  const handleApplyProfile = (profileId: string) => {
    const profile = orgProfiles.find((p) => p.profile_id === profileId);
    if (!profile) return;

    setSelectedProfileId(profileId);
    const vals: Record<string, string> = {};
    for (const key of THRESHOLD_KEYS) {
      const val = profile[key];
      vals[key] = val != null ? String(val) : "";
    }
    setValues(vals);
    setEditing(true);
    setAppliedProfile({
      name: profile.profile_name,
      date: new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
  };

  const handleSave = async () => {
    if (!selectedZoneId) return;
    setSaving(true);

    const newThresholds: Record<string, number> = {};
    for (const [key, config] of Object.entries(DEFAULTS)) {
      const val = values[key]?.trim();
      if (val !== "" && val !== undefined) {
        const num = parseFloat(val);
        if (!isNaN(num) && num !== config.default) {
          newThresholds[key] = num;
        }
      }
    }

    const { error } = await supabase
      .from("a_hvac_zones")
      .update({ anomaly_thresholds: newThresholds })
      .eq("hvac_zone_id", selectedZoneId);

    if (error) {
      alert("Failed to save: " + error.message);
    } else {
      // Update local state
      setZones((prev) =>
        prev.map((z) =>
          z.hvac_zone_id === selectedZoneId
            ? { ...z, anomaly_thresholds: newThresholds }
            : z
        )
      );
      setSaved(true);
      setEditing(false);
      setAppliedProfile(null);
      setSelectedProfileId("");
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
      setEditing(false);
      setAppliedProfile(null);
      setSelectedProfileId("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate?.();
    }
    setSaving(false);
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

      {/* Profile selector */}
      <div className="px-4 py-2.5 border-b bg-gray-50/50">
        {profilesLoading ? (
          <div className="text-[11px] text-gray-400">Loading profiles...</div>
        ) : orgProfiles.length === 0 ? (
          <p className="text-[11px] text-gray-400 leading-snug">
            No org profiles yet. Create one in My Journey &rarr; Global Operations.
          </p>
        ) : (
          <>
            <select
              value={selectedProfileId}
              onChange={(e) => handleApplyProfile(e.target.value)}
              className="w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
            >
              <option value="">Apply Org Profile...</option>
              {orgProfiles.map((p) => (
                <option key={p.profile_id} value={p.profile_id}>
                  {p.profile_name}
                </option>
              ))}
            </select>
            {appliedProfile && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <TierBadge tier="ORG" />
                <span className="text-[11px] text-gray-600 font-medium">{appliedProfile.name}</span>
                <span className="text-[10px] text-gray-400">{appliedProfile.date}</span>
              </div>
            )}
          </>
        )}
      </div>

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
                  {isOverridden && (
                    <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1 rounded">CUSTOM</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{config.description}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {editing ? (
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

      {/* Actions */}
      <div className="px-4 py-3 border-t bg-gray-50 rounded-b-lg flex items-center justify-between gap-2">
        {editing ? (
          <>
            <button
              onClick={() => { setEditing(false); setAppliedProfile(null); setSelectedProfileId(""); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={saving || !hasOverrides}
                className="text-xs text-red-600 hover:text-red-700 disabled:opacity-40"
              >
                Reset to Defaults
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[10px] text-gray-400">
              {hasOverrides
                ? `${Object.keys(thresholds).length} custom override${Object.keys(thresholds).length !== 1 ? "s" : ""}`
                : "All system defaults"}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1 rounded text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              Edit Thresholds
            </button>
          </>
        )}
      </div>
    </div>
  );
}
