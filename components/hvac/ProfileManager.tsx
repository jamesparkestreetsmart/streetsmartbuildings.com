"use client";

import { useState, useEffect, useCallback } from "react";

interface Profile {
  profile_id: string;
  org_id: string;
  profile_name: string;
  occupied_heat_f: number;
  occupied_cool_f: number;
  unoccupied_heat_f: number;
  unoccupied_cool_f: number;
  occupied_fan_mode: string;
  occupied_hvac_mode: string;
  unoccupied_fan_mode: string;
  unoccupied_hvac_mode: string;
  guardrail_min_f: number;
  guardrail_max_f: number;
  manager_offset_up_f: number;
  manager_offset_down_f: number;
  manager_override_reset_minutes: number;
  smart_start_enabled: boolean;
  smart_start_max_adj_f: number;
  occupancy_enabled: boolean;
  occupancy_max_adj_f: number;
  feels_like_enabled: boolean;
  feels_like_max_adj_f: number;
  zone_count: number;
  site_count: number;
}

interface FormState {
  profile_name: string;
  occupied_heat_f: number;
  occupied_cool_f: number;
  occupied_fan_mode: string;
  occupied_hvac_mode: string;
  unoccupied_heat_f: number;
  unoccupied_cool_f: number;
  unoccupied_fan_mode: string;
  unoccupied_hvac_mode: string;
  guardrail_min_f: number;
  guardrail_max_f: number;
  manager_offset_up_f: number;
  manager_offset_down_f: number;
  manager_override_reset_minutes: number;
  smart_start_enabled: boolean;
  smart_start_max_adj_f: number;
  occupancy_enabled: boolean;
  occupancy_max_adj_f: number;
  feels_like_enabled: boolean;
  feels_like_max_adj_f: number;
}

const DEFAULT_FORM: FormState = {
  profile_name: "",
  occupied_heat_f: 68,
  occupied_cool_f: 76,
  occupied_fan_mode: "Auto low",
  occupied_hvac_mode: "heat_cool",
  unoccupied_heat_f: 55,
  unoccupied_cool_f: 85,
  unoccupied_fan_mode: "Auto low",
  unoccupied_hvac_mode: "heat_cool",
  guardrail_min_f: 45,
  guardrail_max_f: 95,
  manager_offset_up_f: 4,
  manager_offset_down_f: 4,
  manager_override_reset_minutes: 120,
  smart_start_enabled: true,
  smart_start_max_adj_f: 1,
  occupancy_enabled: true,
  occupancy_max_adj_f: 1,
  feels_like_enabled: true,
  feels_like_max_adj_f: 2,
};

const HVAC_MODE_OPTIONS = [
  { label: "Off", value: "off" },
  { label: "Heat Only", value: "heat" },
  { label: "Cool Only", value: "cool" },
  { label: "Auto", value: "heat_cool" },
];

const FAN_MODE_OPTIONS = [
  { label: "Auto", value: "Auto low" },
  { label: "On", value: "Low" },
  { label: "Circulate", value: "Circulation" },
];

function isHeatDisabled(hvacMode: string) {
  return hvacMode === "cool" || hvacMode === "off";
}

function isCoolDisabled(hvacMode: string) {
  return hvacMode === "heat" || hvacMode === "off";
}

const RESET_OPTIONS = [
  { label: "1hr", minutes: 60 },
  { label: "2hr", minutes: 120 },
  { label: "3hr", minutes: 180 },
  { label: "4hr", minutes: 240 },
  { label: "Never", minutes: 0 },
];

// Extracted as a top-level component so parent re-renders don't destroy/recreate inputs
function ProfileForm({ form, setForm, onSave, onSaveAndPush, onCancel, saveLabel }: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onSaveAndPush?: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Profile Name</label>
        <input
          type="text"
          value={form.profile_name}
          onChange={(e) => setForm({ ...form, profile_name: e.target.value })}
          placeholder="e.g., Wendy's Standard"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* OCCUPIED */}
      <div className="border rounded-lg p-4 bg-green-50/50">
        <h4 className="font-semibold text-green-700 mb-3 text-sm uppercase tracking-wide">Occupied (Open Hours)</h4>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Heat Setpoint</label>
            <div className="flex items-center">
              {isHeatDisabled(form.occupied_hvac_mode) ? (
                <input type="text" value="N/A" disabled className="w-full border rounded px-2 py-1.5 text-sm bg-gray-100 text-gray-400" />
              ) : (
                <input type="number" value={form.occupied_heat_f} onChange={(e) => setForm({ ...form, occupied_heat_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
              )}
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cool Setpoint</label>
            <div className="flex items-center">
              {isCoolDisabled(form.occupied_hvac_mode) ? (
                <input type="text" value="N/A" disabled className="w-full border rounded px-2 py-1.5 text-sm bg-gray-100 text-gray-400" />
              ) : (
                <input type="number" value={form.occupied_cool_f} onChange={(e) => setForm({ ...form, occupied_cool_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
              )}
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fan Mode</label>
            <select value={form.occupied_fan_mode} onChange={(e) => setForm({ ...form, occupied_fan_mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm">
              {FAN_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">HVAC Mode</label>
            <select value={form.occupied_hvac_mode} onChange={(e) => setForm({ ...form, occupied_hvac_mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm">
              {HVAC_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* UNOCCUPIED */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <h4 className="font-semibold text-gray-600 mb-3 text-sm uppercase tracking-wide">Unoccupied (Closed Hours)</h4>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Heat Setpoint</label>
            <div className="flex items-center">
              {isHeatDisabled(form.unoccupied_hvac_mode) ? (
                <input type="text" value="N/A" disabled className="w-full border rounded px-2 py-1.5 text-sm bg-gray-100 text-gray-400" />
              ) : (
                <input type="number" value={form.unoccupied_heat_f} onChange={(e) => setForm({ ...form, unoccupied_heat_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
              )}
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cool Setpoint</label>
            <div className="flex items-center">
              {isCoolDisabled(form.unoccupied_hvac_mode) ? (
                <input type="text" value="N/A" disabled className="w-full border rounded px-2 py-1.5 text-sm bg-gray-100 text-gray-400" />
              ) : (
                <input type="number" value={form.unoccupied_cool_f} onChange={(e) => setForm({ ...form, unoccupied_cool_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
              )}
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fan Mode</label>
            <select value={form.unoccupied_fan_mode} onChange={(e) => setForm({ ...form, unoccupied_fan_mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm">
              {FAN_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">HVAC Mode</label>
            <select value={form.unoccupied_hvac_mode} onChange={(e) => setForm({ ...form, unoccupied_hvac_mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm">
              {HVAC_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Setpoints locked during unoccupied &mdash; no manager override allowed</p>
      </div>

      {/* GUARDRAILS */}
      <div className="border rounded-lg p-4 bg-red-50/30">
        <h4 className="font-semibold text-red-700 mb-3 text-sm uppercase tracking-wide">Guardrails</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hard Min</label>
            <div className="flex items-center">
              <input type="number" value={form.guardrail_min_f} onChange={(e) => setForm({ ...form, guardrail_min_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Force heat if temp drops to this (pipe protection)</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hard Max</label>
            <div className="flex items-center">
              <input type="number" value={form.guardrail_max_f} onChange={(e) => setForm({ ...form, guardrail_max_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Force cool if temp rises to this (equipment protection)</p>
          </div>
        </div>
      </div>

      {/* MANAGER OVERRIDE */}
      <div className="border rounded-lg p-4 bg-amber-50/30">
        <h4 className="font-semibold text-amber-700 mb-3 text-sm uppercase tracking-wide">Manager Override (occupied hours only)</h4>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max raise</label>
            <div className="flex items-center">
              <span className="text-sm text-gray-500 mr-1">+</span>
              <input type="number" value={form.manager_offset_up_f} onChange={(e) => setForm({ ...form, manager_offset_up_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max lower</label>
            <div className="flex items-center">
              <span className="text-sm text-gray-500 mr-1">&minus;</span>
              <input type="number" value={form.manager_offset_down_f} onChange={(e) => setForm({ ...form, manager_offset_down_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-2">Reset after</label>
          <div className="flex gap-1">
            {RESET_OPTIONS.map((opt) => (
              <button
                key={opt.minutes}
                type="button"
                onClick={() => setForm({ ...form, manager_override_reset_minutes: opt.minutes })}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  form.manager_override_reset_minutes === opt.minutes
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          A manager can temporarily adjust the setpoint within these limits. After the reset timer, Eagle Eyes pushes it back to the profile setpoint. Set both to 0 to lock setpoints completely.
        </p>
      </div>

      {/* SETPOINT ADJUSTMENTS */}
      <div className="border rounded-lg p-4 bg-indigo-50/30">
        <h4 className="font-semibold text-indigo-700 mb-3 text-sm uppercase tracking-wide">Setpoint Adjustments</h4>
        <div className="space-y-3">
          {/* Smart Start */}
          <div className="flex items-start gap-3 border-b border-indigo-100 pb-3">
            <label className="flex items-center gap-2 shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={form.smart_start_enabled}
                onChange={(e) => setForm({ ...form, smart_start_enabled: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">Smart Start</span>
            </label>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-500">Max:</span>
              <input
                type="number"
                min={0}
                max={4}
                step={1}
                value={form.smart_start_max_adj_f}
                onChange={(e) => setForm({ ...form, smart_start_max_adj_f: Number(e.target.value) })}
                disabled={!form.smart_start_enabled}
                className="w-14 border rounded px-2 py-1 text-sm text-center disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="text-xs text-gray-400">&deg;F</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Pre-conditions space before open time</p>
          </div>
          {/* Occupancy */}
          <div className="flex items-start gap-3 border-b border-indigo-100 pb-3">
            <label className="flex items-center gap-2 shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={form.occupancy_enabled}
                onChange={(e) => setForm({ ...form, occupancy_enabled: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">Occupancy Score</span>
            </label>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-500">Max:</span>
              <input
                type="number"
                min={0}
                max={4}
                step={1}
                value={form.occupancy_max_adj_f}
                onChange={(e) => setForm({ ...form, occupancy_max_adj_f: Number(e.target.value) })}
                disabled={!form.occupancy_enabled}
                className="w-14 border rounded px-2 py-1 text-sm text-center disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="text-xs text-gray-400">&deg;F</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Relaxes setpoint when no motion detected</p>
          </div>
          {/* Feels Like */}
          <div className="flex items-start gap-3">
            <label className="flex items-center gap-2 shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={form.feels_like_enabled}
                onChange={(e) => setForm({ ...form, feels_like_enabled: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">Feels Like Score</span>
            </label>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-500">Max:</span>
              <input
                type="number"
                min={0}
                max={4}
                step={1}
                value={form.feels_like_max_adj_f}
                onChange={(e) => setForm({ ...form, feels_like_max_adj_f: Number(e.target.value) })}
                disabled={!form.feels_like_enabled}
                className="w-14 border rounded px-2 py-1 text-sm text-center disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="text-xs text-gray-400">&deg;F</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Adjusts for humidity-based comfort</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={onSave} disabled={!form.profile_name} className="px-4 py-2 bg-[#12723A] text-white rounded-lg text-sm hover:bg-[#0e5c2e] disabled:bg-gray-300">{saveLabel}</button>
        {onSaveAndPush && (
          <button onClick={onSaveAndPush} disabled={!form.profile_name} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300">Save &amp; Push All</button>
        )}
      </div>
    </div>
  );
}

interface Props {
  orgId: string;
}

export default function ProfileManager({ orgId }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });

  const fetchProfiles = useCallback(async () => {
    if (!orgId) return;
    const res = await fetch(`/api/thermostat/profiles?org_id=${orgId}`);
    const data = await res.json();
    if (Array.isArray(data)) setProfiles(data);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleCreate = async () => {
    const res = await fetch("/api/thermostat/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, ...form }),
    });
    if (res.ok) {
      setShowNewModal(false);
      setForm({ ...DEFAULT_FORM });
      fetchProfiles();
    }
  };

  const handleSave = async (profileId: string) => {
    const res = await fetch("/api/thermostat/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, ...form }),
    });
    if (res.ok) {
      setEditingId(null);
      setForm({ ...DEFAULT_FORM });
      fetchProfiles();
    }
  };

  const handleSaveAndPush = async (profileId: string) => {
    await handleSave(profileId);
    await handlePush(profileId);
  };

  const handlePush = async (profileId: string) => {
    const profile = profiles.find((p) => p.profile_id === profileId);
    if (!profile) return;
    const msg = `Push "${profile.profile_name}" setpoints to ${profile.zone_count} zone(s) across ${profile.site_count} site(s)?`;
    if (!confirm(msg)) return;

    setPushingId(profileId);
    setPushResult(null);
    const res = await fetch("/api/thermostat/global-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, org_id: orgId }),
    });
    const data = await res.json();
    setPushingId(null);
    if (res.ok) {
      setPushResult(`Pushed to ${data.zones_updated} zones across ${data.sites_affected} sites. ${data.directives_generated} directives generated.`);
      setTimeout(() => setPushResult(null), 5000);
    } else {
      setPushResult(`Error: ${data.error}`);
    }
  };

  const handleDelete = async (profileId: string) => {
    if (!confirm("Delete this profile?")) return;
    const res = await fetch(`/api/thermostat/profiles?profile_id=${profileId}`, { method: "DELETE" });
    if (res.ok) {
      fetchProfiles();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  // Map legacy fan mode values to HA T6 Pro values
  const mapFanMode = (v: string | null | undefined): string => {
    if (!v) return "Auto low";
    if (v === "auto") return "Auto low";
    if (v === "on") return "Low";
    return v; // already HA value
  };

  // Map legacy HVAC mode values to HA values
  const mapHvacMode = (v: string | null | undefined): string => {
    if (!v) return "heat_cool";
    if (v === "auto") return "heat_cool";
    return v; // heat, cool, off, heat_cool already valid
  };

  const startEdit = (p: Profile) => {
    setEditingId(p.profile_id);
    setForm({
      profile_name: p.profile_name,
      occupied_heat_f: p.occupied_heat_f,
      occupied_cool_f: p.occupied_cool_f,
      occupied_fan_mode: mapFanMode(p.occupied_fan_mode),
      occupied_hvac_mode: mapHvacMode(p.occupied_hvac_mode),
      unoccupied_heat_f: p.unoccupied_heat_f,
      unoccupied_cool_f: p.unoccupied_cool_f,
      unoccupied_fan_mode: mapFanMode(p.unoccupied_fan_mode),
      unoccupied_hvac_mode: mapHvacMode(p.unoccupied_hvac_mode),
      guardrail_min_f: p.guardrail_min_f ?? 45,
      guardrail_max_f: p.guardrail_max_f ?? 95,
      manager_offset_up_f: p.manager_offset_up_f ?? 4,
      manager_offset_down_f: p.manager_offset_down_f ?? 4,
      manager_override_reset_minutes: p.manager_override_reset_minutes ?? 120,
      smart_start_enabled: p.smart_start_enabled ?? true,
      smart_start_max_adj_f: p.smart_start_max_adj_f ?? 1,
      occupancy_enabled: p.occupancy_enabled ?? true,
      occupancy_max_adj_f: p.occupancy_max_adj_f ?? 1,
      feels_like_enabled: p.feels_like_enabled ?? true,
      feels_like_max_adj_f: p.feels_like_max_adj_f ?? 2,
    });
  };

  const formatResetLabel = (minutes: number) => {
    if (minutes === 0) return "Never";
    return `${minutes / 60}hr`;
  };

  const formatHvacMode = (v: string | null | undefined): string => {
    const opt = HVAC_MODE_OPTIONS.find((o) => o.value === v);
    if (opt) return opt.label;
    if (v === "auto") return "Auto";
    return v || "Auto";
  };

  const formatFanMode = (v: string | null | undefined): string => {
    const opt = FAN_MODE_OPTIONS.find((o) => o.value === v);
    if (opt) return opt.label;
    if (v === "auto") return "Auto";
    if (v === "on") return "On";
    return v || "Auto";
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-white shadow p-4 mb-4">
        <p className="text-gray-500 text-sm">Loading profiles...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white shadow p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Thermostat Profiles</h2>
        <button
          onClick={() => { setForm({ ...DEFAULT_FORM }); setShowNewModal(true); }}
          className="px-4 py-2 bg-[#12723A] text-white rounded-lg hover:bg-[#0e5c2e] transition-colors text-sm"
        >
          + New Profile
        </button>
      </div>

      {pushResult && (
        <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {pushResult}
        </div>
      )}

      {profiles.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">
          No thermostat profiles yet. Create one to manage setpoints across zones.
        </p>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => {
            const isEditing = editingId === profile.profile_id;

            if (isEditing) {
              return (
                <div key={profile.profile_id} className="border rounded-xl p-5">
                  <h3 className="text-base font-semibold mb-3">Edit Profile: {profile.profile_name}</h3>
                  <ProfileForm
                    form={form}
                    setForm={setForm}
                    onSave={() => handleSave(profile.profile_id)}
                    onSaveAndPush={() => handleSaveAndPush(profile.profile_id)}
                    onCancel={() => { setEditingId(null); setForm({ ...DEFAULT_FORM }); }}
                    saveLabel="Save"
                  />
                </div>
              );
            }

            // Collapsed card view
            return (
              <div key={profile.profile_id} className="border rounded-xl p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-base">{profile.profile_name}</h3>
                    <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                      <p>
                        <span className="text-green-700 font-medium">Occupied:</span>{" "}
                        {(() => {
                          const m = mapHvacMode(profile.occupied_hvac_mode);
                          if (m === "off") return "Off";
                          if (m === "heat") return `${profile.occupied_heat_f}°F (${formatHvacMode(profile.occupied_hvac_mode)})`;
                          if (m === "cool") return `${profile.occupied_cool_f}°F (${formatHvacMode(profile.occupied_hvac_mode)})`;
                          return `${profile.occupied_heat_f}°–${profile.occupied_cool_f}°F`;
                        })()}
                        {" / "}{formatFanMode(profile.occupied_fan_mode)}
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="text-gray-500 font-medium">Unoccupied:</span>{" "}
                        {(() => {
                          const m = mapHvacMode(profile.unoccupied_hvac_mode);
                          if (m === "off") return "Off";
                          if (m === "heat") return `${profile.unoccupied_heat_f}°F (${formatHvacMode(profile.unoccupied_hvac_mode)})`;
                          if (m === "cool") return `${profile.unoccupied_cool_f}°F (${formatHvacMode(profile.unoccupied_hvac_mode)})`;
                          return `${profile.unoccupied_heat_f}°–${profile.unoccupied_cool_f}°F`;
                        })()}
                      </p>
                      <p className="text-xs text-gray-400">
                        Guardrails: {profile.guardrail_min_f ?? 45}&deg;&ndash;{profile.guardrail_max_f ?? 95}&deg;F
                        <span className="mx-2 text-gray-300">|</span>
                        Manager: &plusmn;{profile.manager_offset_up_f ?? 4}&deg;F / {formatResetLabel(profile.manager_override_reset_minutes ?? 120)} reset
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Used by: {profile.zone_count} zone{profile.zone_count !== 1 ? "s" : ""} across{" "}
                      {profile.site_count} site{profile.site_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-4">
                    <button onClick={() => startEdit(profile)} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1">Edit</button>
                    <button
                      onClick={() => handlePush(profile.profile_id)}
                      disabled={pushingId === profile.profile_id}
                      className="text-xs text-white bg-[#12723A] hover:bg-[#0e5c2e] px-2 py-1 rounded disabled:opacity-50"
                    >
                      {pushingId === profile.profile_id ? "Pushing..." : "Push All"}
                    </button>
                    <button onClick={() => handleDelete(profile.profile_id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Profile Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">New Thermostat Profile</h3>
            <ProfileForm
              form={form}
              setForm={setForm}
              onSave={handleCreate}
              onCancel={() => { setShowNewModal(false); setForm({ ...DEFAULT_FORM }); }}
              saveLabel="Create Profile"
            />
          </div>
        </div>
      )}
    </div>
  );
}
