"use client";

import { useState, useEffect, useCallback } from "react";
import TierBadge, { Tier } from "@/components/ui/TierBadge";
import { useOrg } from "@/context/OrgContext";
import { supabase } from "@/lib/supabaseClient";

interface Profile {
  profile_id: string;
  org_id: string;
  site_id?: string | null;
  profile_name: string;
  scope?: string;
  is_global?: boolean;
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
  target_zone_types: string[];
  zone_count: number;
  site_count: number;
}

export interface FormState {
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
  target_zone_types: string[];
}

export const DEFAULT_FORM: FormState = {
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
  target_zone_types: [],
};

const THERMOSTAT_MODE_OPTIONS = [
  { label: "Auto (Heat & Cool)", value: "heat_cool" },
  { label: "Heat Only", value: "heat" },
  { label: "Cool Only", value: "cool" },
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
export function ProfileForm({ form, setForm, onSave, onSaveAndPush, onCancel, saveLabel }: {
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

      {/* THERMOSTAT MODE */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Thermostat Mode</label>
        <select
          value={form.occupied_hvac_mode}
          onChange={(e) => setForm({ ...form, occupied_hvac_mode: e.target.value, unoccupied_hvac_mode: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          {THERMOSTAT_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* OCCUPIED */}
      <div className="border rounded-lg p-4 bg-green-50/50">
        <h4 className="font-semibold text-green-700 mb-3 text-sm uppercase tracking-wide">Occupied (Open Hours)</h4>
        <div className="grid grid-cols-3 gap-3">
          {!isHeatDisabled(form.occupied_hvac_mode) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Heat Setpoint</label>
              <div className="flex items-center">
                <input type="number" value={form.occupied_heat_f} onChange={(e) => setForm({ ...form, occupied_heat_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
                <span className="ml-1 text-xs text-gray-400">&deg;F</span>
              </div>
            </div>
          )}
          {!isCoolDisabled(form.occupied_hvac_mode) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cool Setpoint</label>
              <div className="flex items-center">
                <input type="number" value={form.occupied_cool_f} onChange={(e) => setForm({ ...form, occupied_cool_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
                <span className="ml-1 text-xs text-gray-400">&deg;F</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fan Mode</label>
            <select value={form.occupied_fan_mode} onChange={(e) => setForm({ ...form, occupied_fan_mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm">
              {FAN_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        {isCoolDisabled(form.occupied_hvac_mode) && (
          <p className="text-xs text-gray-400 mt-2 italic">Cooling disabled for this profile</p>
        )}
        {isHeatDisabled(form.occupied_hvac_mode) && (
          <p className="text-xs text-gray-400 mt-2 italic">Heating disabled for this profile</p>
        )}
      </div>

      {/* UNOCCUPIED */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <h4 className="font-semibold text-gray-600 mb-3 text-sm uppercase tracking-wide">Unoccupied (Closed Hours)</h4>
        <div className="grid grid-cols-3 gap-3">
          {!isHeatDisabled(form.unoccupied_hvac_mode) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Heat Setpoint</label>
              <div className="flex items-center">
                <input type="number" value={form.unoccupied_heat_f} onChange={(e) => setForm({ ...form, unoccupied_heat_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
                <span className="ml-1 text-xs text-gray-400">&deg;F</span>
              </div>
            </div>
          )}
          {!isCoolDisabled(form.unoccupied_hvac_mode) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cool Setpoint</label>
              <div className="flex items-center">
                <input type="number" value={form.unoccupied_cool_f} onChange={(e) => setForm({ ...form, unoccupied_cool_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" />
                <span className="ml-1 text-xs text-gray-400">&deg;F</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fan Mode</label>
            <select value={form.unoccupied_fan_mode} onChange={(e) => setForm({ ...form, unoccupied_fan_mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm">
              {FAN_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        {isCoolDisabled(form.unoccupied_hvac_mode) && (
          <p className="text-xs text-gray-400 mt-2 italic">Cooling disabled for this profile</p>
        )}
        {isHeatDisabled(form.unoccupied_hvac_mode) && (
          <p className="text-xs text-gray-400 mt-2 italic">Heating disabled for this profile</p>
        )}
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

      {/* MANAGER OVERRIDE — UNOCCUPIED / CLOSED (read-only) */}
      <div className="border rounded-lg p-4 bg-gray-50/50 opacity-75">
        <h4 className="font-semibold text-gray-500 mb-3 text-sm uppercase tracking-wide flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" /></svg>
          Manager Override (unoccupied / closed hours)
        </h4>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max raise</label>
            <div className="flex items-center opacity-50">
              <span className="text-sm text-gray-500 mr-1">+</span>
              <input type="number" value={15} readOnly tabIndex={-1} className="w-full border rounded px-2 py-1.5 text-sm bg-gray-100 cursor-not-allowed" />
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max lower</label>
            <div className="flex items-center opacity-50">
              <span className="text-sm text-gray-500 mr-1">&minus;</span>
              <input type="number" value={15} readOnly tabIndex={-1} className="w-full border rounded px-2 py-1.5 text-sm bg-gray-100 cursor-not-allowed" />
              <span className="ml-1 text-xs text-gray-400">&deg;F</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-2">Reset after</label>
          <div className="flex gap-1 opacity-50">
            <span className="px-3 py-1.5 text-sm rounded-lg border bg-gray-500 text-white border-gray-500 cursor-not-allowed">15 min</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3 italic">
          During closed hours, manager overrides are capped at 15 minutes by Eagle Eyes to prevent energy waste overnight.
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
  siteId?: string;
  siteName?: string;
  refreshKey?: number;
}

export default function ProfileManager({ orgId, siteId, siteName, refreshKey }: Props) {
  const { isServiceProvider, selectedOrg } = useOrg();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [formError, setFormError] = useState<string | null>(null);
  const [reapplyingId, setReapplyingId] = useState<string | null>(null);
  const [reapplyResult, setReapplyResult] = useState<string | null>(null);
  const [availableZoneTypes, setAvailableZoneTypes] = useState<string[]>([]);

  // Push modal state
  const [pushModal, setPushModal] = useState<{
    step: "filter" | "confirm";
    profileId: string;
    profileName: string;
  } | null>(null);
  const [zoneTypeOptions, setZoneTypeOptions] = useState<string[]>([]);
  const [selectedZoneTypes, setSelectedZoneTypes] = useState<Set<string>>(new Set());
  const [allZoneTypesChecked, setAllZoneTypesChecked] = useState(true);
  const [filteredZoneCount, setFilteredZoneCount] = useState(0);
  const [filteredSiteCount, setFilteredSiteCount] = useState(0);
  const [pushZoneData, setPushZoneData] = useState<{ zone_type: string; site_id: string }[]>([]);

  // Show SSB templates for: service providers OR client orgs (have a parent)
  const showSSBTemplates = isServiceProvider || selectedOrg?.parent_org_id !== null;

  const fetchProfiles = useCallback(async () => {
    if (!orgId) return;
    const res = await fetch(`/api/thermostat/profiles?org_id=${orgId}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      // Sort: ORG scope first, SITE scope second, alphabetical within each
      data.sort((a: Profile, b: Profile) => {
        const aScope = a.scope || "org";
        const bScope = b.scope || "org";
        if (aScope !== bScope) return aScope === "org" ? -1 : 1;
        return a.profile_name.localeCompare(b.profile_name);
      });
      setProfiles(data);
    }
    setLoading(false);
  }, [orgId]);

  // Fetch distinct zone types for the org
  const fetchAvailableZoneTypes = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("a_hvac_zones")
      .select("zone_type, a_sites!inner(org_id)")
      .eq("a_sites.org_id", orgId);
    if (data) {
      const types = [...new Set((data as any[]).map((z) => z.zone_type).filter(Boolean))].sort();
      setAvailableZoneTypes(types);
    }
  }, [orgId]);

  useEffect(() => {
    fetchProfiles();
    fetchAvailableZoneTypes();
  }, [fetchProfiles, fetchAvailableZoneTypes]);

  // Re-fetch when parent signals a refresh (e.g. after snapshot apply)
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      fetchProfiles();
    }
  }, [refreshKey, fetchProfiles]);

  const handleCreate = async () => {
    setFormError(null);
    const res = await fetch("/api/thermostat/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, scope: "site", ...form }),
    });
    if (res.ok) {
      const data = await res.json();
      setShowNewModal(false);
      setForm({ ...DEFAULT_FORM });
      fetchProfiles();
      if (data.auto_link) {
        setPushResult(`Profile saved. Auto-linked to ${data.auto_link.linked} zone(s). ${data.auto_link.skipped} skipped.`);
        setTimeout(() => setPushResult(null), 5000);
      }
    } else {
      const data = await res.json();
      if (data.error === "duplicate_settings") {
        setFormError(`An identical profile already exists: "${data.existing_profile_name}"`);
      } else {
        setFormError(data.error || "Failed to create profile.");
      }
    }
  };

  const handleSave = async (profileId: string) => {
    setFormError(null);

    // Bug 1 fix: If editing an ORG profile from site context, fork to site override
    const profile = profiles.find((p) => p.profile_id === profileId);
    if (siteId && profile?.scope === "ORG") {
      // Check if a site override already exists for this site
      const existing = profiles.find(
        (p) => p.scope === "SITE" && p.profile_name.includes(profile.profile_name) && p.profile_name.includes("Override")
      );

      if (existing) {
        // Update existing override
        const res = await fetch("/api/thermostat/profiles", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile_id: existing.profile_id, ...form, profile_name: existing.profile_name }),
        });
        if (res.ok) {
          setEditingId(null);
          setForm({ ...DEFAULT_FORM });
          fetchProfiles();
          setPushResult("Site override updated.");
          setTimeout(() => setPushResult(null), 5000);
        } else {
          const data = await res.json();
          setFormError(data.error || "Failed to update site override.");
        }
      } else {
        // Create new site override
        const overrideName = `${profile.profile_name} — ${siteName || "Site"} Override`;
        const res = await fetch("/api/thermostat/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            org_id: orgId,
            site_id: siteId,
            scope: "site",
            ...form,
            profile_name: overrideName,
          }),
        });
        if (res.ok) {
          setEditingId(null);
          setForm({ ...DEFAULT_FORM });
          fetchProfiles();
          setPushResult(`Site override created for ${siteName || "this site"}.`);
          setTimeout(() => setPushResult(null), 5000);
        } else {
          const data = await res.json();
          setFormError(data.error || "Failed to create site override.");
        }
      }
      return;
    }

    // Normal save (SITE profile or org admin context)
    const res = await fetch("/api/thermostat/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, ...form }),
    });
    if (res.ok) {
      const data = await res.json();
      setEditingId(null);
      setForm({ ...DEFAULT_FORM });
      fetchProfiles();
      if (data.auto_link) {
        setPushResult(`Profile saved. Auto-linked to ${data.auto_link.linked} zone(s). ${data.auto_link.skipped} skipped.`);
        setTimeout(() => setPushResult(null), 5000);
      }
    } else {
      const data = await res.json();
      if (data.error === "duplicate_settings") {
        setFormError(`An identical profile already exists: "${data.existing_profile_name}"`);
      } else {
        setFormError(data.error || "Failed to update profile.");
      }
    }
  };

  const handleSaveAndPush = async (profileId: string) => {
    await handleSave(profileId);
    await handlePush(profileId);
  };

  const handlePush = async (profileId: string) => {
    const profile = profiles.find((p) => p.profile_id === profileId);
    if (!profile) return;

    // Fetch eligible zones: for ORG profiles, query by org_id; for SITE, by profile_id
    let query = supabase
      .from("a_hvac_zones")
      .select("zone_type, site_id");

    if (profile.scope === "ORG" || profile.scope === "org") {
      // ORG profiles target all zones in the org
      query = query.eq("org_id", profile.org_id) as any;
    } else if (profile.site_id) {
      // SITE profiles with site_id target all zones at that site
      query = query.eq("site_id", profile.site_id) as any;
    } else {
      // Fallback: SITE profiles without site_id, query by profile_id
      query = query.eq("profile_id", profileId) as any;
    }

    const { data: zoneData } = await query;

    const zones = zoneData || [];
    setPushZoneData(zones);
    const types = [...new Set(zones.map((z) => z.zone_type))].filter(Boolean).sort();
    setZoneTypeOptions(types);
    // Pre-populate from profile's target_zone_types if non-empty
    const profileTargetTypes = profile.target_zone_types ?? [];
    if (profileTargetTypes.length > 0) {
      const preSelected = new Set(types.filter((t) => profileTargetTypes.includes(t)));
      setSelectedZoneTypes(preSelected);
      setAllZoneTypesChecked(false);
      const filtered = zones.filter((z) => preSelected.has(z.zone_type));
      setFilteredZoneCount(filtered.length);
      setFilteredSiteCount(new Set(filtered.map((z) => z.site_id)).size);
    } else {
      setSelectedZoneTypes(new Set(types));
      setAllZoneTypesChecked(true);
    }
    setFilteredZoneCount(zones.length);
    setFilteredSiteCount(new Set(zones.map((z) => z.site_id)).size);
    setPushModal({ step: "filter", profileId, profileName: profile.profile_name });
  };

  const executePush = async () => {
    if (!pushModal) return;
    const { profileId } = pushModal;

    const zoneTypesParam = allZoneTypesChecked ? undefined : [...selectedZoneTypes];

    setPushModal(null);
    setPushingId(profileId);
    setPushResult(null);
    const res = await fetch("/api/thermostat/global-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, org_id: orgId, zone_types: zoneTypesParam }),
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

  const handleReapply = async (profileId: string) => {
    setReapplyingId(profileId);
    setReapplyResult(null);
    try {
      const res = await fetch("/api/thermostat/profiles/re-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId }),
      });
      const data = await res.json();
      if (res.ok) {
        setReapplyResult(`Re-applied: ${data.linked} zone(s) linked, ${data.skipped} skipped.`);
        setTimeout(() => setReapplyResult(null), 5000);
        fetchProfiles();
      } else {
        setReapplyResult(`Error: ${data.error}`);
      }
    } catch {
      setReapplyResult("Error: Failed to re-apply.");
    } finally {
      setReapplyingId(null);
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
      target_zone_types: p.target_zone_types ?? [],
    });
  };

  const formatResetLabel = (minutes: number) => {
    if (minutes === 0) return "Never";
    return `${minutes / 60}hr`;
  };

  const formatHvacMode = (v: string | null | undefined): string => {
    const opt = THERMOSTAT_MODE_OPTIONS.find((o) => o.value === v);
    if (opt) return opt.label;
    if (v === "auto") return "Auto (Heat & Cool)";
    return v || "Auto (Heat & Cool)";
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
          onClick={() => { setForm({ ...DEFAULT_FORM }); setFormError(null); setShowNewModal(true); }}
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

      {reapplyResult && (
        <div className="mb-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
          {reapplyResult}
        </div>
      )}


      {(() => {
        const ssbTemplates = profiles.filter((p) => p.is_global);
        const orgProfiles = profiles.filter((p) => !p.is_global);

        const renderProfileCard = (profile: Profile, readOnly: boolean) => {
          const isEditing = editingId === profile.profile_id;

          if (isEditing && !readOnly) {
            return (
              <div key={profile.profile_id} className="border rounded-xl p-5">
                <h3 className="text-base font-semibold mb-3">Edit Profile: {profile.profile_name}</h3>
                {formError && (
                  <div className={`mb-3 px-3 py-2 rounded-lg text-sm ${formError.includes("identical profile") ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                    {formError}
                    {formError.includes("identical profile") && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => { setEditingId(null); setFormError(null); setForm({ ...DEFAULT_FORM }); }} className="px-3 py-1 rounded text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-100">Use Existing</button>
                        <button onClick={() => setFormError(null)} className="px-3 py-1 rounded text-xs font-medium border text-gray-600 hover:bg-gray-100">Dismiss</button>
                      </div>
                    )}
                  </div>
                )}
                <ProfileForm
                  form={form}
                  setForm={setForm}
                  onSave={() => handleSave(profile.profile_id)}
                  onSaveAndPush={profile.scope !== "site" ? () => handleSaveAndPush(profile.profile_id) : undefined}
                  onCancel={() => { setEditingId(null); setForm({ ...DEFAULT_FORM }); setFormError(null); }}
                  saveLabel="Save"

                />
              </div>
            );
          }

          return (
            <div key={profile.profile_id} className={`border rounded-xl p-4 transition-shadow ${readOnly ? "bg-gray-50/50" : "hover:shadow-md"}`}>
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {readOnly ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" /></svg>
                        SSB Template
                      </span>
                    ) : (
                      <TierBadge tier={profile.scope === "site" ? "SITE" : "ORG"} />
                    )}
                    <h3 className="font-semibold text-base">{profile.profile_name}</h3>
                  </div>
                  <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                    <p>
                      <span className="text-xs text-gray-400 mr-1">{formatHvacMode(profile.occupied_hvac_mode)}</span>
                      <span className="mx-1 text-gray-300">|</span>
                      <span className="text-green-700 font-medium">Occupied:</span>{" "}
                      {(() => {
                        const m = mapHvacMode(profile.occupied_hvac_mode);
                        if (m === "heat") return `${profile.occupied_heat_f}°F`;
                        if (m === "cool") return `${profile.occupied_cool_f}°F`;
                        return `${profile.occupied_heat_f}°–${profile.occupied_cool_f}°F`;
                      })()}
                      {" / "}{formatFanMode(profile.occupied_fan_mode)}
                      <span className="mx-2 text-gray-300">|</span>
                      <span className="text-gray-500 font-medium">Unoccupied:</span>{" "}
                      {(() => {
                        const m = mapHvacMode(profile.unoccupied_hvac_mode);
                        if (m === "heat") return `${profile.unoccupied_heat_f}°F`;
                        if (m === "cool") return `${profile.unoccupied_cool_f}°F`;
                        return `${profile.unoccupied_heat_f}°–${profile.unoccupied_cool_f}°F`;
                      })()}
                    </p>
                    <p className="text-xs text-gray-400">
                      Guardrails: {profile.guardrail_min_f ?? 45}&deg;&ndash;{profile.guardrail_max_f ?? 95}&deg;F
                      <span className="mx-2 text-gray-300">|</span>
                      Manager: &plusmn;{profile.manager_offset_up_f ?? 4}&deg;F / {formatResetLabel(profile.manager_override_reset_minutes ?? 120)} reset
                    </p>
                  </div>
                  {/* Zone type badges */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(profile.target_zone_types ?? []).length > 0 ? (
                      (profile.target_zone_types ?? []).map((zt) => (
                        <span key={zt} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-700">
                          {zt}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">Manual linking only</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Used by: {profile.zone_count} zone{profile.zone_count !== 1 ? "s" : ""} across{" "}
                    {profile.site_count} site{profile.site_count !== 1 ? "s" : ""}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex gap-1 shrink-0 ml-4">
                    <button onClick={() => startEdit(profile)} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1">Edit</button>
                    {(profile.target_zone_types ?? []).length > 0 && (
                      <button
                        onClick={() => handleReapply(profile.profile_id)}
                        disabled={reapplyingId === profile.profile_id}
                        className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 disabled:opacity-50"
                      >
                        {reapplyingId === profile.profile_id ? "..." : "Re-apply"}
                      </button>
                    )}
                    {profile.scope !== "site" && !siteId && (
                      <button
                        onClick={() => handlePush(profile.profile_id)}
                        disabled={pushingId === profile.profile_id}
                        className="text-xs text-white bg-[#12723A] hover:bg-[#0e5c2e] px-2 py-1 rounded disabled:opacity-50"
                      >
                        {pushingId === profile.profile_id ? "Pushing..." : "Push All"}
                      </button>
                    )}
                    <button onClick={() => handleDelete(profile.profile_id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1">Delete</button>
                  </div>
                )}
              </div>
            </div>
          );
        };

        if (profiles.length === 0) {
          return (
            <p className="text-gray-500 text-sm text-center py-4">
              No thermostat profiles yet. Create one to manage setpoints across zones.
            </p>
          );
        }

        return (
          <div className="space-y-4">
            {/* SSB Templates section */}
            {showSSBTemplates && ssbTemplates.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" /></svg>
                  SSB Templates
                </h3>
                <div className="space-y-3">
                  {ssbTemplates.map((p) => renderProfileCard(p, true))}
                </div>
              </div>
            )}

            {/* Org Profiles section */}
            <div>
              {showSSBTemplates && ssbTemplates.length > 0 && (
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Your Profiles</h3>
              )}
              {orgProfiles.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No org profiles yet. Create one to manage setpoints across zones.
                </p>
              ) : (
                <div className="space-y-3">
                  {orgProfiles.map((p) => renderProfileCard(p, false))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* New Profile Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">New Thermostat Profile</h3>
            {formError && (
              <div className={`mb-3 px-3 py-2 rounded-lg text-sm ${formError.includes("identical profile") ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                {formError}
                {formError.includes("identical profile") && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => { setShowNewModal(false); setFormError(null); setForm({ ...DEFAULT_FORM }); }} className="px-3 py-1 rounded text-xs font-medium border border-amber-300 text-amber-700 hover:bg-amber-100">Use Existing</button>
                    <button onClick={() => setFormError(null)} className="px-3 py-1 rounded text-xs font-medium border text-gray-600 hover:bg-gray-100">Dismiss</button>
                  </div>
                )}
              </div>
            )}
            <ProfileForm
              form={form}
              setForm={setForm}
              onSave={handleCreate}
              onCancel={() => { setShowNewModal(false); setForm({ ...DEFAULT_FORM }); setFormError(null); }}
              saveLabel="Create Profile"
            />
          </div>
        </div>
      )}

      {/* Push Zone Type Filter / Confirm Modal */}
      {pushModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            {pushModal.step === "filter" ? (
              <>
                <h3 className="text-lg font-semibold mb-1">Push &ldquo;{pushModal.profileName}&rdquo;</h3>
                <p className="text-sm text-gray-500 mb-4">Select which zone types to include:</p>
                <label className="flex items-center gap-2 mb-2 pb-2 border-b">
                  <input
                    type="checkbox"
                    checked={allZoneTypesChecked}
                    onChange={() => {
                      const next = !allZoneTypesChecked;
                      setAllZoneTypesChecked(next);
                      if (next) {
                        setSelectedZoneTypes(new Set(zoneTypeOptions));
                        setFilteredZoneCount(pushZoneData.length);
                        setFilteredSiteCount(new Set(pushZoneData.map((z) => z.site_id)).size);
                      }
                    }}
                    className="rounded border-gray-300 text-green-600"
                  />
                  <span className="text-sm font-medium">All zone types</span>
                </label>
                <div className="space-y-1 mb-4">
                  {zoneTypeOptions.map((t) => (
                    <label key={t} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedZoneTypes.has(t)}
                        disabled={allZoneTypesChecked}
                        onChange={() => {
                          const next = new Set(selectedZoneTypes);
                          if (next.has(t)) next.delete(t); else next.add(t);
                          setSelectedZoneTypes(next);
                          const filtered = pushZoneData.filter((z) => next.has(z.zone_type));
                          setFilteredZoneCount(filtered.length);
                          setFilteredSiteCount(new Set(filtered.map((z) => z.site_id)).size);
                        }}
                        className="rounded border-gray-300 text-green-600"
                      />
                      <span className={`text-sm ${allZoneTypesChecked ? "text-gray-400" : "text-gray-700"}`}>{t}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setPushModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                  <button
                    disabled={!allZoneTypesChecked && selectedZoneTypes.size === 0}
                    onClick={() => {
                      if (!allZoneTypesChecked) {
                        const filtered = pushZoneData.filter((z) => selectedZoneTypes.has(z.zone_type));
                        setFilteredZoneCount(filtered.length);
                        setFilteredSiteCount(new Set(filtered.map((z) => z.site_id)).size);
                      }
                      setPushModal({ ...pushModal, step: "confirm" });
                    }}
                    className="px-4 py-2 bg-[#12723A] text-white rounded-lg hover:bg-[#0e5c2e] disabled:bg-gray-300 text-sm"
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2">Confirm Push</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Push &ldquo;{pushModal.profileName}&rdquo; setpoints to {filteredZoneCount} zone(s)
                  {!allZoneTypesChecked && ` (${[...selectedZoneTypes].join(", ")})`} across {filteredSiteCount} site(s)?
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setPushModal(null)} className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                  <button
                    onClick={executePush}
                    className="px-4 py-2 bg-[#12723A] text-white rounded-lg hover:bg-[#0e5c2e] text-sm"
                  >
                    Push
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
