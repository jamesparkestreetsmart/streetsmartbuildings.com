"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useManifest, ManifestData, SmartStartCalcData } from "./useManifest";
import { useActivityLog, ActivityLogEntry } from "./useActivityLog";
import { LUX_TIERS } from "@/lib/sun-calc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minutesToDisplay(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) return "—";
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

function currentTimeMinutes(tz: string): number {
  const now = new Date();
  const parts = now.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = parts.split(":").map(Number);
  return h * 60 + m;
}

function todayInTimezone(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt.toLocaleDateString("en-CA");
}

const LUX_OFFSETS: Record<number, number> = { 1: 30, 2: 10, 3: 0, 4: -20, 5: -45 };
function luxDuskTime(level: number, sunset: number): number {
  return sunset + (LUX_OFFSETS[level] || 0);
}
function luxDawnTime(level: number, sunrise: number): number {
  return sunrise - (LUX_OFFSETS[level] || 0);
}

// ─── HVAC Label Helpers ──────────────────────────────────────────────────────

function friendlyHvacMode(mode: string | undefined): string {
  if (!mode) return "Auto (heat/cool)";
  switch (mode) {
    case "heat_cool": return "Auto (heat/cool)";
    case "heat": return "Heat Only";
    case "cool": return "Cool Only";
    case "off": return "Off";
    case "auto": return "Auto (heat/cool)";
    default: return mode;
  }
}

function friendlyFanMode(mode: string | undefined): string {
  if (!mode) return "Auto";
  switch (mode) {
    case "Auto low": return "Auto";
    case "Low": return "On";
    case "Circulation": return "Circulate";
    case "auto": return "Auto";
    case "on": return "On";
    default: return mode;
  }
}

function formatResetLabel(minutes: number | undefined): string {
  if (!minutes || minutes === 0) return "Never";
  return `${minutes / 60}hr`;
}

// ─── Phase Detection ─────────────────────────────────────────────────────────

function getCurrentPhase(
  storeHours: ManifestData["store_hours"],
  nowMinutes: number,
  employeePreOpen: number
): { label: string; color: string; dotColor: string; pulse: boolean } {
  if (storeHours.is_closed) {
    return { label: "Closed", color: "bg-red-50 text-red-700 border-red-200", dotColor: "bg-red-500", pulse: false };
  }
  const openMins = timeToMinutes(storeHours.open);
  const closeMins = timeToMinutes(storeHours.close);
  if (openMins === null || closeMins === null) {
    return { label: "No Hours", color: "bg-gray-50 text-gray-500 border-gray-200", dotColor: "bg-gray-400", pulse: false };
  }
  const preOpenStart = openMins - employeePreOpen;
  if (nowMinutes >= openMins && nowMinutes < closeMins) {
    return { label: "Open", color: "bg-green-50 text-green-700 border-green-200", dotColor: "bg-green-500", pulse: true };
  }
  if (nowMinutes >= preOpenStart && nowMinutes < openMins) {
    return { label: "Pre-Open", color: "bg-blue-50 text-blue-700 border-blue-200", dotColor: "bg-blue-500", pulse: true };
  }
  if (nowMinutes >= closeMins) {
    return { label: "After Hours", color: "bg-gray-50 text-gray-600 border-gray-200", dotColor: "bg-gray-400", pulse: false };
  }
  return { label: "Closed", color: "bg-gray-50 text-gray-600 border-gray-200", dotColor: "bg-gray-400", pulse: false };
}

// ─── Offset Editor ──────────────────────────────────────────────────────────

function OffsetEditor({
  value,
  onChange,
  anchor,
}: {
  value: number;
  onChange: (v: number) => void;
  anchor: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(Math.abs(value || 0));
  const [dir, setDir] = useState((value || 0) <= 0 ? "before" : "after");

  const display =
    value === 0
      ? `at ${anchor}`
      : `${Math.abs(value)}m ${value < 0 ? "before" : "after"} ${anchor}`;

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(Math.abs(value || 0));
          setDir((value || 0) <= 0 ? "before" : "after");
          setEditing(true);
        }}
        className="inline-flex items-center gap-1 text-[13px] text-indigo-500 font-medium bg-indigo-50 border border-dashed border-indigo-300 rounded-md px-2.5 py-1 cursor-pointer hover:bg-indigo-100 transition-colors"
      >
        <span className="text-xs">&#9998;</span> {display}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-400 rounded-lg px-2.5 py-1">
      <input
        type="number"
        min={0}
        max={180}
        value={draft}
        onChange={(e) => setDraft(parseInt(e.target.value) || 0)}
        className="w-12 text-sm font-semibold border border-indigo-200 rounded px-1.5 py-0.5 text-center font-mono"
        autoFocus
      />
      <span className="text-xs text-gray-500">min</span>
      <select
        value={dir}
        onChange={(e) => setDir(e.target.value)}
        className="text-xs border border-indigo-200 rounded px-1 py-0.5"
      >
        <option value="before">before {anchor}</option>
        <option value="after">after {anchor}</option>
      </select>
      <button
        onClick={() => {
          onChange(dir === "before" ? -Math.abs(draft) : Math.abs(draft));
          setEditing(false);
        }}
        className="text-[11px] font-bold text-white bg-indigo-500 rounded px-2.5 py-0.5 cursor-pointer hover:bg-indigo-600"
      >
        Save
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-sm text-gray-400 bg-transparent border-none cursor-pointer hover:text-gray-600"
      >
        &#10005;
      </button>
    </div>
  );
}

// ─── Lux Level Editor ───────────────────────────────────────────────────────

function LuxBadge({
  level,
  trigger,
  onClick,
}: {
  level: number;
  trigger?: "on" | "off";
  onClick?: () => void;
}) {
  const tier = LUX_TIERS.find((t) => t.level === level);
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 ${
        onClick ? "cursor-pointer hover:bg-amber-100" : ""
      }`}
    >
      <span className="flex gap-px">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`inline-block w-1 h-2.5 rounded-sm ${
              i <= level ? "bg-amber-500" : "bg-gray-200"
            }`}
          />
        ))}
      </span>
      L{level}
      {trigger && tier && (
        <span>
          {" "}
          · {trigger === "on" ? `≤${tier.onBelowLux}` : `≥${tier.offAboveLux}`} lux
        </span>
      )}
    </span>
  );
}

function LuxEditor({
  level,
  onChange,
  sunTimes,
}: {
  level: number;
  onChange: (v: number) => void;
  sunTimes: { sunrise: number | null; sunset: number | null } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(level);
  const draftTier = LUX_TIERS.find((t) => t.level === draft);

  if (!editing) {
    return (
      <LuxBadge level={level} onClick={() => { setDraft(level); setEditing(true); }} />
    );
  }

  const currentDusk = sunTimes?.sunset != null ? luxDuskTime(level, sunTimes.sunset) : null;
  const currentDawn = sunTimes?.sunrise != null ? luxDawnTime(level, sunTimes.sunrise) : null;
  const newDusk = sunTimes?.sunset != null ? luxDuskTime(draft, sunTimes.sunset) : null;
  const newDawn = sunTimes?.sunrise != null ? luxDawnTime(draft, sunTimes.sunrise) : null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-1.5 w-full max-w-lg">
      <div className="text-sm font-bold text-amber-800 mb-2.5">Lux Sensitivity</div>

      {/* Level selector */}
      <div className="flex gap-1.5 mb-3">
        {LUX_TIERS.map((t) => (
          <button
            key={t.level}
            onClick={() => setDraft(t.level)}
            className={`flex-1 py-2 px-1 rounded-lg cursor-pointer transition-all ${
              draft === t.level
                ? "border-2 border-amber-500 bg-amber-100"
                : "border border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className="flex justify-center gap-px mb-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className={`inline-block w-1 h-3 rounded-sm ${
                    i <= t.level ? "bg-amber-500" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
            <div className={`text-[11px] font-bold ${draft === t.level ? "text-amber-800" : "text-gray-500"}`}>
              L{t.level}
            </div>
            <div className="text-[9px] text-gray-400">{t.name}</div>
          </button>
        ))}
      </div>

      {/* Threshold detail */}
      {draftTier && (
        <div className="flex gap-3 text-xs text-gray-600 p-2 bg-white rounded-md border border-amber-100 mb-2.5">
          <div className="flex-1">
            <div className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">Lights ON When</div>
            <div className="font-bold text-amber-800">≤ {draftTier.onBelowLux} lux</div>
          </div>
          <div className="w-px bg-amber-100" />
          <div className="flex-1">
            <div className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">Lights OFF When</div>
            <div className="font-bold text-amber-800">≥ {draftTier.offAboveLux} lux</div>
          </div>
        </div>
      )}

      {/* Time preview */}
      {draft !== level && currentDusk !== null && newDusk !== null && currentDawn !== null && newDawn !== null && (
        <div className="p-2 bg-white rounded-md border border-gray-200 mb-2.5">
          <div className="text-[10px] text-gray-400 font-semibold uppercase mb-1.5">
            Time Impact Preview
          </div>
          <div className="flex gap-4 text-xs">
            <div className="flex-1">
              <div className="text-gray-500 mb-0.5">Evening ON (dusk)</div>
              <div>
                <span className="text-gray-400 line-through">{minutesToDisplay(currentDusk)}</span>
                <span className="mx-1 text-gray-400">&rarr;</span>
                <strong className="text-green-600">{minutesToDisplay(newDusk)}</strong>
                <span className="text-[10px] text-gray-500 ml-1">
                  ({newDusk < currentDusk
                    ? `${currentDusk - newDusk}m earlier`
                    : newDusk > currentDusk
                    ? `${newDusk - currentDusk}m later`
                    : "same"})
                </span>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-gray-500 mb-0.5">Morning OFF (dawn)</div>
              <div>
                <span className="text-gray-400 line-through">{minutesToDisplay(currentDawn)}</span>
                <span className="mx-1 text-gray-400">&rarr;</span>
                <strong className="text-green-600">{minutesToDisplay(newDawn)}</strong>
                <span className="text-[10px] text-gray-500 ml-1">
                  ({newDawn < currentDawn
                    ? `${currentDawn - newDawn}m earlier`
                    : newDawn > currentDawn
                    ? `${newDawn - currentDawn}m later`
                    : "same"})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setEditing(false)}
          className="text-xs text-gray-500 bg-transparent border border-gray-200 rounded-md px-3.5 py-1 cursor-pointer hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => { onChange(draft); setEditing(false); }}
          disabled={draft === level}
          className={`text-xs font-bold text-white rounded-md px-3.5 py-1 cursor-pointer ${
            draft !== level ? "bg-amber-500 hover:bg-amber-600" : "bg-gray-300 cursor-default"
          }`}
        >
          {draft !== level ? "Save & Regenerate" : "No Change"}
        </button>
      </div>
    </div>
  );
}

// ─── Smart Start Panel ──────────────────────────────────────────────────────

function ConfidenceDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    high: "bg-green-500",
    medium: "bg-yellow-500",
    low: "bg-red-400",
  };
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
      <span className={`w-2 h-2 rounded-full ${colors[level] || "bg-gray-400"}`} />
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

function SmartStartSettings({
  zoneId,
  onSave,
}: {
  zoneId: string | null;
  onSave: () => void;
}) {
  const [buffer, setBuffer] = useState(1);
  const [humidMult, setHumidMult] = useState(1.0);
  const [minLead, setMinLead] = useState(10);
  const [maxLead, setMaxLead] = useState(90);
  const [rateOverride, setRateOverride] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!zoneId) return;
    setSaving(true);
    try {
      await fetch("/api/hvac-zone/smart-start", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hvac_zone_id: zoneId,
          buffer_degrees: buffer,
          humidity_multiplier: humidMult,
          min_lead_minutes: minLead,
          max_lead_minutes: maxLead,
          rate_override: rateOverride ? parseFloat(rateOverride) : null,
        }),
      });
      onSave();
    } catch {
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 p-3 bg-white rounded-lg border border-purple-200">
      <div className="text-xs font-bold text-purple-700 mb-2 uppercase tracking-wider">
        Smart Start Settings
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-gray-500 block mb-0.5">Buffer (&deg;F)</label>
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={buffer}
            onChange={(e) => setBuffer(parseFloat(e.target.value) || 1)}
            className="w-full border rounded px-2 py-1 font-mono"
          />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">Humidity Mult</label>
          <input
            type="number"
            min={0}
            max={3}
            step={0.1}
            value={humidMult}
            onChange={(e) => setHumidMult(parseFloat(e.target.value) || 1)}
            className="w-full border rounded px-2 py-1 font-mono"
          />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">Min Lead (min)</label>
          <input
            type="number"
            min={5}
            max={60}
            value={minLead}
            onChange={(e) => setMinLead(parseInt(e.target.value) || 10)}
            className="w-full border rounded px-2 py-1 font-mono"
          />
        </div>
        <div>
          <label className="text-gray-500 block mb-0.5">Max Lead (min)</label>
          <input
            type="number"
            min={30}
            max={180}
            value={maxLead}
            onChange={(e) => setMaxLead(parseInt(e.target.value) || 90)}
            className="w-full border rounded px-2 py-1 font-mono"
          />
        </div>
        <div className="col-span-2">
          <label className="text-gray-500 block mb-0.5">
            Rate Override (&deg;F/min, blank = auto)
          </label>
          <input
            type="text"
            placeholder="auto"
            value={rateOverride}
            onChange={(e) => setRateOverride(e.target.value)}
            className="w-full border rounded px-2 py-1 font-mono"
          />
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSave}
          disabled={saving || !zoneId}
          className="text-xs font-bold text-white bg-purple-500 hover:bg-purple-600 rounded px-3 py-1 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function SmartStartDetail({
  offset,
  openMins,
  setpoints,
  calc,
  zoneId,
  onSettingsSave,
}: {
  offset: number;
  openMins: number;
  setpoints: { heat: number; cool: number };
  calc?: SmartStartCalcData;
  zoneId?: string | null;
  onSettingsSave?: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);

  // Fallback to simple display if no calc data
  if (!calc) {
    return (
      <div className="mt-2 p-2.5 rounded-lg bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">&#9889;</span>
          <span className="text-sm font-bold text-purple-700">Smart Start Logic</span>
          <span className="ml-auto"><ConfidenceDot level="low" /></span>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <span className="text-gray-400 font-semibold">Window:</span>
          <span>
            <strong className="font-mono">{minutesToDisplay(openMins - offset)}</strong>
            {" "}&rarr;{" "}
            <strong className="font-mono">{minutesToDisplay(openMins)}</strong>
            {" "}({offset} min)
          </span>
          <span className="text-gray-400 font-semibold">Target:</span>
          <span>
            Reach <strong className="text-red-500">{setpoints.heat}&deg;</strong>&ndash;
            <strong className="text-blue-500">{setpoints.cool}&deg;F</strong> by store open
          </span>
          <span className="text-gray-400 font-semibold">Method:</span>
          <span className="text-gray-500 italic">
            No calculation data &mdash; regenerate manifest to compute
          </span>
        </div>
      </div>
    );
  }

  const rateSourceLabel: Record<string, string> = {
    historical: "7-day avg",
    current: "current trend",
    default: "default estimate",
  };

  return (
    <div className="mt-2 p-2.5 rounded-lg bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-sm">&#9889;</span>
        <span className="text-sm font-bold text-purple-700">Smart Start Logic</span>
        <span className="ml-auto flex items-center gap-2">
          <ConfidenceDot level={calc.confidence} />
          {zoneId && onSettingsSave && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-[11px] text-purple-500 hover:text-purple-700 font-medium"
              title="Smart Start Settings"
            >
              &#9881;
            </button>
          )}
        </span>
      </div>

      {/* TEMPERATURE section */}
      <div className="mb-2">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
          Temperature
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs pl-2">
          <span className="text-gray-400">Indoor now:</span>
          <span className="font-semibold">{calc.indoor_temp}&deg;F</span>

          <span className="text-gray-400">Outdoor:</span>
          <span className={calc.outdoor_temp !== null ? "font-semibold" : "text-gray-300 italic"}>
            {calc.outdoor_temp !== null ? `${calc.outdoor_temp}°F` : "—"}
          </span>

          <span className="text-gray-400">Occupied range:</span>
          <span>
            <span className="text-red-500 font-semibold">{calc.occupied_heat_setpoint}&deg;</span>
            &ndash;
            <span className="text-blue-500 font-semibold">{calc.occupied_cool_setpoint}&deg;F</span>
          </span>

          <span className="text-gray-400">Target:</span>
          <span>
            <strong>{calc.target_temp}&deg;F</strong>
            <span className="text-gray-400 ml-1">
              ({calc.target_mode} setpoint {calc.target_mode === "heat" ? calc.occupied_heat_setpoint : calc.occupied_cool_setpoint}&deg;
              {calc.target_temp !== (calc.target_mode === "heat" ? calc.occupied_heat_setpoint : calc.occupied_cool_setpoint)
                ? ` + ${Math.abs(calc.target_temp - (calc.target_mode === "heat" ? calc.occupied_heat_setpoint : calc.occupied_cool_setpoint))}° buffer`
                : ""}
              )
            </span>
          </span>

          <span className="text-gray-400">Delta:</span>
          <span>
            {calc.indoor_temp}&deg; &rarr; {calc.target_temp}&deg; ={" "}
            <strong>{calc.delta_needed}&deg;F</strong>
          </span>
        </div>
      </div>

      {/* RATE section */}
      <div className="mb-2">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
          Rate
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs pl-2">
          <span className="text-gray-400">Historical avg:</span>
          <span className={calc.avg_ramp_rate !== null ? "font-semibold" : "text-gray-300 italic"}>
            {calc.avg_ramp_rate !== null
              ? `${calc.avg_ramp_rate.toFixed(3)} °F/min`
              : "— (needs 24hr history)"}
          </span>

          <span className="text-gray-400">Current trend:</span>
          <span className={calc.current_trend !== null ? "font-semibold" : "text-gray-300 italic"}>
            {calc.current_trend !== null
              ? `${calc.current_trend > 0 ? "+" : ""}${calc.current_trend.toFixed(3)} °F/min`
              : "— (needs temp history)"}
          </span>

          <span className="text-gray-400">Using:</span>
          <span className="font-semibold">
            {calc.rate_used.toFixed(3)} °F/min
            <span className="text-gray-400 font-normal ml-1">({rateSourceLabel[calc.rate_source]})</span>
          </span>

          <span className="text-gray-400">Base lead:</span>
          <span>
            {calc.delta_needed}&deg; &divide; {calc.rate_used.toFixed(3)} ={" "}
            <strong>{calc.base_lead_minutes} min</strong>
          </span>
        </div>
      </div>

      {/* HUMIDITY section */}
      <div className="mb-2">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
          Humidity
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs pl-2">
          <span className="text-gray-400">Indoor:</span>
          <span className={calc.indoor_humidity !== null ? "font-semibold" : "text-gray-300 italic"}>
            {calc.indoor_humidity !== null ? `${calc.indoor_humidity}% RH` : "—"}
          </span>

          {calc.indoor_humidity !== null && (
            <>
              <span className="text-gray-400">Impact:</span>
              <span className="text-gray-600">
                {calc.humidity_time_adjustment > 0
                  ? `High humidity → ${calc.target_mode === "heat" ? "heating" : "cooling"} takes longer`
                  : calc.humidity_time_adjustment < 0
                  ? "Low humidity → dry air heats faster"
                  : "Normal range — no adjustment"}
              </span>

              <span className="text-gray-400">Adjustment:</span>
              <span className={`font-semibold ${
                calc.humidity_time_adjustment > 0 ? "text-red-500" :
                calc.humidity_time_adjustment < 0 ? "text-green-500" :
                "text-gray-500"
              }`}>
                {calc.humidity_time_adjustment > 0 ? "+" : ""}{calc.humidity_time_adjustment} min
              </span>
            </>
          )}
        </div>
      </div>

      {/* OCCUPANCY section */}
      <div className="mb-2">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
          Occupancy
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs pl-2">
          <span className="text-gray-400">Status:</span>
          <span className={calc.zone_occupancy_status ? "font-semibold" : "text-gray-300 italic"}>
            {calc.zone_occupancy_status
              ? calc.zone_occupancy_status.charAt(0).toUpperCase() + calc.zone_occupancy_status.slice(1)
              : "—"}
          </span>

          <span className="text-gray-400">Last motion:</span>
          <span className={calc.zone_no_motion_minutes !== null ? "font-semibold" : "text-gray-300 italic"}>
            {calc.zone_no_motion_minutes !== null
              ? `${calc.zone_no_motion_minutes} min ago`
              : "— (no motion sensor)"}
          </span>

          {calc.occupancy_override && (
            <>
              <span className="text-gray-400">Override:</span>
              <span className="text-amber-600 font-semibold">
                Early occupancy detected — immediate start
              </span>
            </>
          )}
        </div>
      </div>

      {/* RESULT section */}
      <div className="border-t border-purple-200 pt-2 mt-1">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs pl-2">
          <span className="text-gray-400 font-semibold">Base lead:</span>
          <span className="font-semibold">{calc.base_lead_minutes} min</span>

          {calc.humidity_time_adjustment !== 0 && (
            <>
              <span className="text-gray-400 font-semibold">Humidity adj:</span>
              <span className={`font-semibold ${calc.humidity_time_adjustment > 0 ? "text-red-500" : "text-green-500"}`}>
                {calc.humidity_time_adjustment > 0 ? "+" : ""}{calc.humidity_time_adjustment} min
              </span>
            </>
          )}

          <span className="text-gray-400 font-semibold">Final offset:</span>
          <span className="font-bold text-purple-700">{calc.final_offset_minutes} min</span>

          <span className="text-gray-400 font-semibold">Start at:</span>
          <span className="font-bold text-purple-700">
            {minutesToDisplay(calc.start_time_minutes)} &rarr;{" "}
            target {calc.target_temp}&deg;F by {minutesToDisplay(openMins)}
          </span>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && zoneId && onSettingsSave && (
        <SmartStartSettings zoneId={zoneId} onSave={onSettingsSave} />
      )}
    </div>
  );
}

// ─── Dusk/Dawn Bar ──────────────────────────────────────────────────────────

function DuskDawnBar({
  sunTimes,
  defaultLux,
  nowMinutes,
}: {
  sunTimes: NonNullable<ManifestData["sun_times"]>;
  defaultLux: number;
  nowMinutes: number;
}) {
  const tier = LUX_TIERS.find((t) => t.level === defaultLux);
  const isDaytime =
    sunTimes.sunrise !== null &&
    sunTimes.sunset !== null &&
    nowMinutes >= sunTimes.sunrise &&
    nowMinutes < sunTimes.sunset;

  return (
    <div className="flex rounded-xl bg-slate-900 text-white overflow-hidden my-1">
      <div className="flex-1 px-4 py-2.5 border-r border-slate-700">
        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
          Dawn · Lights OFF {!isDaytime && " · NEXT"}
        </div>
        <div className="text-lg font-bold text-amber-400 font-mono">
          {minutesToDisplay(sunTimes.sunrise)}
        </div>
        {sunTimes.civil_dawn !== null && tier && (
          <div className="text-[10px] text-gray-500">
            Civil dawn {minutesToDisplay(sunTimes.civil_dawn)} · ≥{tier.offAboveLux} lux
          </div>
        )}
      </div>
      <div className="flex-1 px-4 py-2.5">
        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
          Dusk · Lights ON {isDaytime && " · NEXT"}
        </div>
        <div className="text-lg font-bold text-indigo-400 font-mono">
          {minutesToDisplay(sunTimes.sunset)}
        </div>
        {sunTimes.civil_dusk !== null && tier && (
          <div className="text-[10px] text-gray-500">
            Civil dusk {minutesToDisplay(sunTimes.civil_dusk)} · ≤{tier.onBelowLux} lux
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Log Annotations ────────────────────────────────────────────────

function activityIcon(eventType: string, metadata?: any): string {
  if (eventType === "store_hours_event_comment" || eventType === "logic_map_comment") return "💬";
  if (eventType === "store_hours_rule_created" || eventType === "store_hours_rule_updated") return "📋";
  if (eventType === "store_hours_rule_deleted") return "🗑️";
  if (eventType === "equipment_alarm") return "🚨";
  if (eventType === "equipment_maintenance") return "🔧";
  if (eventType === "hotel_occupancy" || metadata?.event_type === "hotel_occupancy") return "🏨";
  if (eventType.startsWith("manifest")) return "⚙️";
  return "📝";
}

function formatCreatedBy(email: string): string {
  if (!email) return "";
  const atIdx = email.indexOf("@");
  return atIdx > 0 ? email.substring(0, atIdx) : email;
}

// Parse minutes-from-midnight from an ISO timestamp using site timezone
function getEntryMinutes(entry: ActivityLogEntry, tz: string): number {
  // Prioritize event_time (backdated) over created_at
  if (entry.event_time) {
    const parts = entry.event_time.split(":").map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  const d = new Date(entry.created_at);
  const timeStr = d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// Detect if an activity log entry represents a time range
interface TimeRangeInfo {
  startMins: number;
  endMins: number;
}

function detectTimeRange(entry: ActivityLogEntry): TimeRangeInfo | null {
  const meta = entry.metadata || {};

  // Check metadata for explicit time fields
  if (meta.open_time && meta.close_time) {
    const s = timeToMinutes(meta.open_time);
    const e = timeToMinutes(meta.close_time);
    if (s !== null && e !== null) return { startMins: s, endMins: e };
  }
  if (meta.start_time && meta.end_time) {
    const s = timeToMinutes(meta.start_time);
    const e = timeToMinutes(meta.end_time);
    if (s !== null && e !== null) return { startMins: s, endMins: e };
  }

  // Parse message for time range pattern like "(15:00–19:00)" or "(10:46-12:46)"
  const rangeMatch = (entry.message || "").match(/\((\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})\)/);
  if (rangeMatch) {
    const s = timeToMinutes(rangeMatch[1]);
    const e = timeToMinutes(rangeMatch[2]);
    if (s !== null && e !== null) return { startMins: s, endMins: e };
  }

  return null;
}

// Range event color theming
function rangeColors(eventType: string, metadata?: any): { bg: string; border: string; text: string } {
  if (eventType === "hotel_occupancy" || metadata?.event_type === "hotel_occupancy" || metadata?.rule_type === "date_range_daily") {
    return { bg: "bg-blue-50", border: "border-l-blue-400", text: "text-blue-700" };
  }
  if (eventType.includes("maintenance")) {
    return { bg: "bg-orange-50", border: "border-l-orange-400", text: "text-orange-700" };
  }
  if (eventType.includes("rule") || eventType.includes("override")) {
    return { bg: "bg-purple-50", border: "border-l-purple-400", text: "text-purple-700" };
  }
  if (eventType.includes("clos")) {
    return { bg: "bg-red-50", border: "border-l-red-400", text: "text-red-700" };
  }
  return { bg: "bg-slate-50", border: "border-l-gray-400", text: "text-gray-700" };
}

// Resolve entity label for an annotation: device > equipment > site
function entityTag(entry: ActivityLogEntry): { icon: string; label: string } | null {
  if (entry.device_name) return { icon: "🔧", label: entry.device_name };
  if (entry.equipment_name) return { icon: "🔧", label: entry.equipment_name };
  if (entry.site_name && !entry.device_id && !entry.equipment_id) {
    return { icon: "🏪", label: entry.site_name };
  }
  return null;
}

// Point-in-time annotation card
function AnnotationCard({ entry }: { entry: ActivityLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const message = entry.metadata?.note || entry.message || "";
  const truncated = message.length > 80 && !expanded;
  const tag = entityTag(entry);
  const author = formatCreatedBy(entry.created_by);

  // Display time: prefer event_time if set
  let displayTime: string;
  let loggedAt: string | null = null;
  if (entry.event_time) {
    const [hh, mm] = entry.event_time.split(":").map(Number);
    const d = new Date(2000, 0, 1, hh, mm);
    displayTime = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    // Check if backdated (event_time differs from created_at by > 5 min)
    const createdDate = new Date(entry.created_at);
    const createdMins = createdDate.getHours() * 60 + createdDate.getMinutes();
    const eventMins = hh * 60 + mm;
    if (Math.abs(createdMins - eventMins) > 5) {
      loggedAt = createdDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
  } else {
    displayTime = new Date(entry.created_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div
      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 max-w-[210px] cursor-pointer hover:bg-slate-100 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[13px] font-bold text-gray-600 font-mono">{displayTime}</span>
        <span className="text-[13px]">{activityIcon(entry.event_type, entry.metadata)}</span>
        {author && <span className="text-xs text-gray-500 ml-auto flex-shrink-0">{author}</span>}
      </div>
      {tag && (
        <div className="mb-0.5">
          <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 font-medium truncate max-w-[170px] inline-block">
            {tag.icon} {tag.label}
          </span>
        </div>
      )}
      <div className={`text-xs text-gray-700 leading-tight ${truncated ? "line-clamp-2" : ""}`}>
        {message}
      </div>
      {loggedAt && (
        <div className="text-[11px] text-gray-400 mt-0.5">
          logged at {loggedAt}
        </div>
      )}
    </div>
  );
}

// Time-range annotation card (maintenance windows, occupancy periods, etc.)
function RangeAnnotationCard({
  entry,
  range,
}: {
  entry: ActivityLogEntry;
  range: TimeRangeInfo;
}) {
  const [expanded, setExpanded] = useState(false);
  const message = entry.metadata?.note || entry.message || "";
  const truncated = message.length > 80 && !expanded;
  const colors = rangeColors(entry.event_type, entry.metadata);
  const tag = entityTag(entry);

  return (
    <div
      className={`${colors.bg} border border-slate-200 border-l-[3px] ${colors.border} rounded-lg px-2.5 py-1.5 max-w-[210px] cursor-pointer hover:opacity-90 transition-opacity`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[13px]">{activityIcon(entry.event_type, entry.metadata)}</span>
        <span className={`text-xs font-bold font-mono ${colors.text}`}>
          {minutesToDisplay(range.startMins)} – {minutesToDisplay(range.endMins)}
        </span>
      </div>
      {tag && (
        <div className="mb-0.5">
          <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 font-medium truncate max-w-[150px] inline-block">
            {tag.icon} {tag.label}
          </span>
        </div>
      )}
      <div className={`text-xs text-gray-700 leading-tight ${truncated ? "line-clamp-2" : ""}`}>
        {message}
      </div>
      <div className="text-[11px] text-gray-400 mt-0.5">{formatCreatedBy(entry.created_by)}</div>
    </div>
  );
}

// Header-level add-note widget with 12-hour AM/PM time picker for backdating
function AddNoteHeader({ onSubmit }: { onSubmit: (msg: string, eventTime?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<"AM" | "PM">("AM");

  const openForm = () => {
    // Default to current time in 12hr format
    const now = new Date();
    const h24 = now.getHours();
    const mm = now.getMinutes();
    setAmpm(h24 >= 12 ? "PM" : "AM");
    setHour(h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24);
    setMinute(mm);
    setOpen(true);
  };

  const submit = () => {
    if (!text.trim()) return;
    // Convert 12hr to 24hr for the API
    let h24 = hour;
    if (ampm === "AM" && h24 === 12) h24 = 0;
    else if (ampm === "PM" && h24 !== 12) h24 += 12;
    const eventTime = `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    onSubmit(text.trim(), eventTime);
    setText("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="text-[11px] px-2.5 py-1 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium"
      >
        + Note
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        <input
          type="number"
          min={1}
          max={12}
          value={hour}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (v >= 1 && v <= 12) setHour(v);
          }}
          className="text-sm border border-gray-300 rounded px-1 py-1 w-[36px] font-mono text-center"
        />
        <span className="text-sm text-gray-400 font-bold">:</span>
        <input
          type="number"
          min={0}
          max={59}
          value={String(minute).padStart(2, "0")}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (v >= 0 && v <= 59) setMinute(v);
          }}
          className="text-sm border border-gray-300 rounded px-1 py-1 w-[36px] font-mono text-center"
        />
        <select
          value={ampm}
          onChange={(e) => setAmpm(e.target.value as "AM" | "PM")}
          className="text-sm border border-gray-300 rounded px-1 py-1 font-mono"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") { setOpen(false); setText(""); }
        }}
        placeholder="Add a note..."
        className="text-sm border border-gray-300 rounded px-2 py-1 w-[220px]"
        autoFocus
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        className="text-sm font-bold text-white bg-blue-500 rounded px-3 py-1 disabled:opacity-50 hover:bg-blue-600"
      >
        Add
      </button>
      <button
        onClick={() => { setOpen(false); setText(""); }}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Unified Timeline Rows ───────────────────────────────────────────────────

interface MergedRow {
  time: number;
  leftEvent?: TimelineItem;
  rightAnnotations: ActivityLogEntry[];
}

function buildMergedRows(
  events: TimelineItem[],
  annotations: ActivityLogEntry[],
  tz: string
): MergedRow[] {
  const rows: MergedRow[] = [];

  // Add left events as rows
  for (const event of events) {
    rows.push({ time: event.sortTime, leftEvent: event, rightAnnotations: [] });
  }

  // Add right annotations — merge with nearby rows (within 2 min) or create new rows
  for (const ann of annotations) {
    const annTime = getEntryMinutes(ann, tz);
    // Find closest existing row within 2 minutes
    let bestRow: MergedRow | null = null;
    let bestDiff = Infinity;
    for (const row of rows) {
      const diff = Math.abs(row.time - annTime);
      if (diff <= 2 && diff < bestDiff) {
        bestDiff = diff;
        bestRow = row;
      }
    }
    if (bestRow) {
      bestRow.rightAnnotations.push(ann);
    } else {
      rows.push({ time: annTime, rightAnnotations: [ann] });
    }
  }

  rows.sort((a, b) => a.time - b.time);
  return rows;
}

// ─── Section Divider ────────────────────────────────────────────────────────

function Section({
  icon,
  label,
  sub,
}: {
  icon: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-5 pb-2.5">
      <span className="text-base">{icon}</span>
      <span className="text-base font-extrabold text-gray-900 uppercase tracking-wider">
        {label}
      </span>
      {sub && <span className="text-[13px] text-gray-400">{sub}</span>}
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

// ─── Timeline Event ─────────────────────────────────────────────────────────

const DOT_COLORS: Record<string, string> = {
  store: "bg-green-500",
  hvac: "bg-purple-500",
  lighting: "bg-yellow-400",
  exterior: "bg-indigo-400",
  lux: "bg-amber-500",
};

interface TimelineEventProps {
  time: number | null;
  icon: string;
  label: string;
  sub?: string;
  type: string;
  equip?: { name: string; action: "on" | "off" }[];
  detail?: React.ReactNode;
  offset?: number | null;
  onOffset?: (v: number) => void;
  anchor?: string;
  luxLevel?: number | null;
  luxTrigger?: "on" | "off";
  onLuxChange?: (v: number) => void;
  luxEditor?: React.ReactNode;
  condition?: string;
  isLast?: boolean;
  isPast?: boolean;
}

function TimelineEvent({
  time,
  icon,
  label,
  sub,
  type,
  equip,
  detail,
  offset,
  onOffset,
  anchor,
  luxLevel,
  luxTrigger,
  onLuxChange,
  luxEditor,
  condition,
  isLast,
  isPast,
}: TimelineEventProps) {
  return (
    <div
      className={`flex gap-0 min-h-[44px] transition-opacity ${isPast ? "opacity-50" : ""}`}
    >
      {/* Time */}
      <div className="w-[95px] flex-shrink-0 flex flex-col items-end pr-4 pt-[3px]">
        <span className="text-[15px] font-bold text-gray-800 font-mono">
          {time !== null ? minutesToDisplay(time) : "~"}
        </span>
      </div>

      {/* Dot + line */}
      <div className="w-7 flex-shrink-0 flex flex-col items-center">
        <div
          className={`w-2.5 h-2.5 rounded-full ${DOT_COLORS[type] || "bg-gray-400"} border-2 border-white shadow mt-[7px] z-[2]`}
        />
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pl-2 ${isLast ? "" : "pb-3.5"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">{icon}</span>
          <span
            className={`text-[15px] font-bold ${
              type === "store" ? "text-green-600" : "text-gray-800"
            }`}
          >
            {label}
          </span>
          {sub && <span className="text-[13px] text-gray-500">{sub}</span>}
          {luxLevel !== null && luxLevel !== undefined && luxTrigger && !luxEditor && (
            <LuxBadge level={luxLevel} trigger={luxTrigger} onClick={onLuxChange ? () => {} : undefined} />
          )}
        </div>

        {condition && (
          <div className="text-[13px] text-gray-500 mt-0.5 italic">{condition}</div>
        )}

        {equip && equip.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {equip.map((eq, i) => (
              <span
                key={i}
                className="text-[13px] text-gray-600 font-medium bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1 inline-flex items-center gap-1.5"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    eq.action === "on" ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                {eq.name}
              </span>
            ))}
          </div>
        )}

        {onOffset && anchor && offset !== null && offset !== undefined && (
          <div className="mt-1.5">
            <OffsetEditor value={offset} onChange={onOffset} anchor={anchor} />
          </div>
        )}

        {luxEditor}

        {detail}
      </div>
    </div>
  );
}

// ─── Timeline Event Builder ─────────────────────────────────────────────────

interface TimelineItem {
  time: number | null;
  sortTime: number;
  icon: string;
  label: string;
  sub?: string;
  type: string;
  equip?: { name: string; action: "on" | "off" }[];
  detail?: React.ReactNode;
  offsetKey?: string;
  offset?: number | null;
  anchor?: string;
  luxLevel?: number | null;
  luxTrigger?: "on" | "off";
  luxEquipId?: string;
  condition?: string;
  // Smart Start calc data
  thermoCalc?: SmartStartCalcData;
  thermoOffset?: number;
  thermoOpenMins?: number;
  thermoSetpoints?: { heat: number; cool: number };
  thermoZoneId?: string | null;
}

function buildTimeline(
  data: ManifestData,
  siteConfig: NonNullable<ManifestData["site_config"]>
) {
  const morning: TimelineItem[] = [];
  const evening: TimelineItem[] = [];

  // Closed days use a special layout — no timeline events
  if (data.store_hours.is_closed) {
    return { morning: [], evening: [] };
  }

  const openMins = timeToMinutes(data.store_hours.open);
  const closeMins = timeToMinutes(data.store_hours.close);
  const thermostats = data.thermostats || [];
  const interior = data.interior_lighting || [];
  const exterior = data.exterior_lighting || [];

  // ─── Smart Start events ───
  for (const thermo of thermostats) {
    if (thermo.smart_start_enabled && thermo.smart_start_offset_minutes > 0 && openMins !== null) {
      const startMins = openMins - thermo.smart_start_offset_minutes;
      morning.push({
        time: startMins,
        sortTime: startMins,
        icon: "⚡",
        type: "hvac",
        label: `${thermo.zone_name || thermo.device_name} — Smart Start`,
        sub: `Pre-conditioning begins${thermo.smart_start_calc?.confidence ? ` (${thermo.smart_start_calc.confidence} confidence)` : ""}`,
        equip: [{ name: thermo.device_name, action: "on" }],
        thermoCalc: thermo.smart_start_calc,
        thermoOffset: thermo.smart_start_offset_minutes,
        thermoOpenMins: openMins,
        thermoSetpoints: {
          heat: thermo.occupied.heat_setpoint,
          cool: thermo.occupied.cool_setpoint,
        },
        thermoZoneId: thermo.hvac_zone_id || null,
      });
    }
  }

  // ─── Exterior lighting — Morning Window ───
  for (const eq of exterior) {
    const morningOnMins = timeToMinutes(eq.morning_on_time) ?? timeToMinutes(eq.on_time);
    const morningOffMins = timeToMinutes(eq.morning_off_time) ?? timeToMinutes(eq.off_time);
    const luxLevel = eq.lux_sensitivity ?? siteConfig.default_lux_sensitivity;
    const tier = LUX_TIERS.find((t) => t.level === luxLevel);

    // Morning ON (offset from open, conditional on dark)
    if (morningOnMins !== null) {
      morning.push({
        time: morningOnMins,
        sortTime: morningOnMins,
        icon: "🌙",
        type: "exterior",
        label: `${eq.name} — ON`,
        equip: [{ name: eq.name, action: "on" }],
        condition: tier
          ? `Activates only if lux ≤ ${tier.onBelowLux} (still dark)`
          : undefined,
        luxLevel,
        luxTrigger: "on",
        luxEquipId: eq.equipment_id,
        offsetKey: `${eq.equipment_id}-on`,
        offset: eq.on_offset_minutes ?? null,
        anchor: "open",
      });
    }

    // Morning OFF (dawn)
    if (morningOffMins !== null) {
      morning.push({
        time: morningOffMins,
        sortTime: morningOffMins,
        icon: "🌅",
        type: "lux",
        label: `${eq.name} — OFF`,
        sub: "Dawn — ambient light sufficient",
        equip: [{ name: eq.name, action: "off" }],
        luxLevel,
        luxTrigger: "off",
        luxEquipId: eq.equipment_id,
      });
    }
  }

  // ─── Interior lighting ON ───
  for (const eq of interior) {
    const onMins = timeToMinutes(eq.on_time);
    if (onMins !== null) {
      morning.push({
        time: onMins,
        sortTime: onMins,
        icon: "💡",
        type: "lighting",
        label: `${eq.name} — ON`,
        equip: [{ name: eq.name, action: "on" }],
        offsetKey: `${eq.equipment_id}-on`,
        offset: eq.on_offset_minutes ?? null,
        anchor: "open",
      });
    }
  }

  // ─── STORE OPENS ───
  if (openMins !== null && !data.store_hours.is_closed) {
    morning.push({
      time: openMins,
      sortTime: openMins,
      icon: "🏪",
      type: "store",
      label: "STORE OPENS",
      sub: minutesToDisplay(openMins),
      detail: thermostats.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {thermostats.map((t) => {
            const mode = t.occupied.mode;
            const showHeat = mode === "heat" || mode === "heat_cool" || mode === "auto";
            const showCool = mode === "cool" || mode === "heat_cool" || mode === "auto";
            const isOff = mode === "off";
            return (
              <div key={t.device_name} className="text-[13px] text-gray-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                <div className="font-semibold text-green-700">
                  {t.zone_name || t.device_name} &rarr; Occupied
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  Mode: {friendlyHvacMode(mode)}
                  {isOff ? " — System Off" : (
                    <>
                      {showHeat && <>&ensp;Heat: {t.occupied.heat_setpoint}&deg;F</>}
                      {showCool && <>&ensp;Cool: {t.occupied.cool_setpoint}&deg;F</>}
                    </>
                  )}
                </div>
                {!isOff && (
                  <div className="text-xs text-gray-500">
                    Fan: {friendlyFanMode(t.occupied.fan)}
                    &ensp;Offset: &plusmn;{t.manager_override?.offset_up_f ?? 4}&deg;F / {formatResetLabel(t.manager_override?.reset_minutes)} reset
                    &ensp;Guardrails: {t.guardrails?.min_f ?? 45}&deg;&ndash;{t.guardrails?.max_f ?? 95}&deg;F
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : undefined,
    });
  }

  // ─── Exterior lighting — Evening Window ───
  for (const eq of exterior) {
    const eveningOnMins = timeToMinutes(eq.evening_on_time);
    const eveningOffMins = timeToMinutes(eq.evening_off_time);
    const luxLevel = eq.lux_sensitivity ?? siteConfig.default_lux_sensitivity;

    // Evening ON (dusk)
    if (eveningOnMins !== null) {
      evening.push({
        time: eveningOnMins,
        sortTime: eveningOnMins,
        icon: "🌙",
        type: "exterior",
        label: `${eq.name} — ON`,
        sub: "Dusk — lux threshold reached",
        equip: [{ name: eq.name, action: "on" }],
        luxLevel,
        luxTrigger: "on",
        luxEquipId: eq.equipment_id,
      });
    }

    // Evening OFF (offset from close)
    if (eveningOffMins !== null) {
      evening.push({
        time: eveningOffMins,
        sortTime: eveningOffMins,
        icon: "🌙",
        type: "exterior",
        label: `${eq.name} — OFF`,
        equip: [{ name: eq.name, action: "off" }],
        offsetKey: `${eq.equipment_id}-off`,
        offset: eq.off_offset_minutes ?? null,
        anchor: "close",
      });
    }
  }

  // ─── STORE CLOSES ───
  if (closeMins !== null && !data.store_hours.is_closed) {
    evening.push({
      time: closeMins,
      sortTime: closeMins,
      icon: "🏪",
      type: "store",
      label: "STORE CLOSES",
      sub: minutesToDisplay(closeMins),
      detail: thermostats.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {thermostats.map((t) => {
            const mode = t.unoccupied.mode;
            const showHeat = mode === "heat" || mode === "heat_cool" || mode === "auto";
            const showCool = mode === "cool" || mode === "heat_cool" || mode === "auto";
            const isOff = mode === "off";
            return (
              <div key={t.device_name} className="text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                <div className="font-semibold text-gray-600">
                  {t.zone_name || t.device_name} &rarr; Unoccupied (locked)
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  Mode: {friendlyHvacMode(mode)}
                  {isOff ? " — System Off" : (
                    <>
                      {showHeat && <>&ensp;Heat: {t.unoccupied.heat_setpoint}&deg;F</>}
                      {showCool && <>&ensp;Cool: {t.unoccupied.cool_setpoint}&deg;F</>}
                    </>
                  )}
                </div>
                {!isOff && (
                  <div className="text-xs text-gray-500">
                    Fan: {friendlyFanMode(t.unoccupied.fan)}
                    &ensp;Guardrails: {t.guardrails?.min_f ?? 45}&deg;&ndash;{t.guardrails?.max_f ?? 95}&deg;F
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : undefined,
    });
  }

  // ─── Interior lighting OFF ───
  for (const eq of interior) {
    const offMins = timeToMinutes(eq.off_time);
    if (offMins !== null) {
      evening.push({
        time: offMins,
        sortTime: offMins,
        icon: "💡",
        type: "lighting",
        label: `${eq.name} — OFF`,
        equip: [{ name: eq.name, action: "off" }],
        offsetKey: `${eq.equipment_id}-off`,
        offset: eq.off_offset_minutes ?? null,
        anchor: "close",
      });
    }
  }

  // Sort each section by time
  morning.sort((a, b) => a.sortTime - b.sortTime);
  evening.sort((a, b) => a.sortTime - b.sortTime);

  return { morning, evening };
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface LogicMapProps {
  siteId: string;
  timezone: string;
}

export default function LogicMap({ siteId, timezone }: LogicMapProps) {
  const today = todayInTimezone(timezone);
  const [selectedDate, setSelectedDate] = useState(today);
  const { data, loading, error, refetch } = useManifest(siteId, selectedDate);
  const { entries: activityEntries, addComment } = useActivityLog(siteId, selectedDate);
  const [nowMinutes, setNowMinutes] = useState(currentTimeMinutes(timezone));
  const [generating, setGenerating] = useState(false);

  const isToday = selectedDate === today;

  useEffect(() => {
    const timer = setInterval(
      () => setNowMinutes(currentTimeMinutes(timezone)),
      60000
    );
    return () => clearInterval(timer);
  }, [timezone]);

  // Site config with defaults
  const siteConfig = data?.site_config || {
    default_lux_sensitivity: 3,
    employee_pre_open_minutes: 30,
    customer_pre_open_minutes: 0,
    post_close_minutes: 0,
    lat: 0,
    lng: 0,
  };

  const phase =
    data && isToday
      ? getCurrentPhase(data.store_hours, nowMinutes, siteConfig.employee_pre_open_minutes)
      : null;

  // Build timeline events
  const timeline = useMemo(() => {
    if (!data) return null;
    return buildTimeline(data, siteConfig);
  }, [data, siteConfig]);

  // Offset save handler
  const saveOffset = useCallback(
    async (equipmentId: string, field: "on_offset_minutes" | "off_offset_minutes", value: number) => {
      try {
        await fetch("/api/equipment/offset", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ equipment_id: equipmentId, [field]: value }),
        });
        // Regenerate manifest and refresh
        await fetch("/api/manifest/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, date: selectedDate }),
        });
        await refetch();
      } catch {
        alert("Failed to save offset");
      }
    },
    [siteId, selectedDate, refetch]
  );

  // Lux level save handler
  const saveLux = useCallback(
    async (equipmentId: string, luxLevel: number) => {
      try {
        await fetch("/api/equipment/offset", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ equipment_id: equipmentId, lux_sensitivity: luxLevel }),
        });
        await fetch("/api/manifest/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, date: selectedDate }),
        });
        await refetch();
      } catch {
        alert("Failed to save lux level");
      }
    },
    [siteId, selectedDate, refetch]
  );

  // Generate manifest handler
  const generateManifest = useCallback(async () => {
    setGenerating(true);
    try {
      await fetch("/api/manifest/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, date: selectedDate }),
      });
      await refetch();
    } catch {
      alert("Failed to generate manifest");
    } finally {
      setGenerating(false);
    }
  }, [siteId, selectedDate, refetch]);

  // Split activity entries into morning (before noon) and evening (noon onward)
  const morningAnnotations = useMemo(() => {
    return activityEntries.filter((e) => {
      const h = new Date(e.created_at).getHours();
      return h < 12;
    });
  }, [activityEntries]);

  const eveningAnnotations = useMemo(() => {
    return activityEntries.filter((e) => {
      const h = new Date(e.created_at).getHours();
      return h >= 12;
    });
  }, [activityEntries]);

  // Render a unified section: left timeline events + right annotations in shared rows
  const renderSection = (
    events: TimelineItem[],
    annotations: ActivityLogEntry[],
    sectionIsLast: boolean
  ) => {
    const merged = buildMergedRows(events, annotations, timezone);
    const hasAnnotations = annotations.length > 0;

    // Helper: render right-side annotation cards for a row
    const renderAnnotations = (anns: ActivityLogEntry[]) =>
      anns.map((ann) => {
        const range = detectTimeRange(ann);
        if (range) {
          return <RangeAnnotationCard key={ann.id} entry={ann} range={range} />;
        }
        return <AnnotationCard key={ann.id} entry={ann} />;
      });

    return merged.map((row, i) => {
      const isLast = sectionIsLast && i === merged.length - 1;

      if (row.leftEvent) {
        const item = row.leftEvent;
        const isPast = isToday && item.time !== null && item.time < nowMinutes;

        // Build offset handler
        let onOffset: ((v: number) => void) | undefined;
        let offsetField: "on_offset_minutes" | "off_offset_minutes" | undefined;
        if (item.offsetKey) {
          const [eqId, direction] = item.offsetKey.split(/-(?=on$|off$)/);
          offsetField = direction === "on" ? "on_offset_minutes" : "off_offset_minutes";
          onOffset = (v: number) => saveOffset(eqId, offsetField!, v);
        }

        // Build lux editor
        let luxEditor: React.ReactNode = undefined;
        if (item.luxEquipId && item.luxTrigger) {
          luxEditor = (
            <LuxEditor
              level={item.luxLevel || siteConfig.default_lux_sensitivity}
              onChange={(v) => saveLux(item.luxEquipId!, v)}
              sunTimes={data?.sun_times ?? null}
            />
          );
        }

        // Build Smart Start detail
        let detail = item.detail;
        if (item.thermoOffset !== undefined && item.thermoOpenMins !== undefined && item.thermoSetpoints) {
          detail = (
            <SmartStartDetail
              offset={item.thermoOffset}
              openMins={item.thermoOpenMins}
              setpoints={item.thermoSetpoints}
              calc={item.thermoCalc}
              zoneId={item.thermoZoneId}
              onSettingsSave={async () => {
                await fetch("/api/manifest/push", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ site_id: siteId, date: selectedDate }),
                });
                await refetch();
              }}
            />
          );
        }

        return (
          <div key={`row-${row.time}-${i}`} className="flex">
            <div className="flex-1 min-w-0">
              <TimelineEvent
                time={item.time}
                icon={item.icon}
                label={item.label}
                sub={item.sub}
                type={item.type}
                equip={item.equip}
                detail={detail}
                offset={item.offset}
                onOffset={onOffset}
                anchor={item.anchor}
                luxLevel={item.luxLevel}
                luxTrigger={item.luxTrigger}
                luxEditor={luxEditor}
                condition={item.condition}
                isLast={isLast}
                isPast={isPast}
              />
            </div>
            {hasAnnotations && (
              <div className="w-[230px] flex-shrink-0 pl-2 flex flex-col gap-1 pt-[3px]">
                {renderAnnotations(row.rightAnnotations)}
              </div>
            )}
          </div>
        );
      } else {
        // Annotation-only row — time + small dot + connecting line on the left, cards on the right
        return (
          <div key={`row-${row.time}-${i}`} className="flex">
            <div className="flex-1 min-w-0">
              <div className="flex gap-0 min-h-[44px]">
                {/* Time */}
                <div className="w-[95px] flex-shrink-0 flex flex-col items-end pr-4 pt-[3px]">
                  <span className="text-sm font-bold text-gray-400 font-mono">
                    {minutesToDisplay(row.time)}
                  </span>
                </div>
                {/* Small dot + connecting line */}
                <div className="w-7 flex-shrink-0 flex flex-col items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 border border-white mt-[8px] z-[2]" />
                  {!isLast && <div className="w-0.5 flex-1 bg-gray-200" />}
                </div>
                {/* Dashed horizontal connector to right column */}
                <div className="flex-1 pl-2 pb-3.5 flex items-start">
                  <div className="border-t border-dashed border-gray-300 flex-1 mt-[10px]" />
                </div>
              </div>
            </div>
            <div className="w-[230px] flex-shrink-0 pl-2 flex flex-col gap-1 pt-[3px]">
              {renderAnnotations(row.rightAnnotations)}
            </div>
          </div>
        );
      }
    });
  };

  return (
    <div className="rounded-xl bg-white shadow p-5 mt-6 max-w-[1060px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 m-0">Logic Map</h2>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Date navigation */}
            <button
              className="px-2 py-1 text-sm rounded hover:bg-gray-100 text-gray-500"
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
            >
              &larr;
            </button>
            <span className="text-sm text-gray-400 min-w-[200px] text-center">
              {formatDateLabel(selectedDate)}
            </span>
            <button
              className="px-2 py-1 text-sm rounded hover:bg-gray-100 text-gray-500"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            >
              &rarr;
            </button>
            {!isToday && (
              <button
                className="ml-1 text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium border border-blue-200"
                onClick={() => setSelectedDate(today)}
              >
                Today
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Note button */}
          {data && (
            <AddNoteHeader onSubmit={(msg, eventTime) => addComment(msg, "ui", eventTime)} />
          )}

          {/* Regenerate button */}
          {data && (
            <button
              className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 font-medium"
              onClick={generateManifest}
              disabled={generating}
            >
              {generating ? "..." : "Regenerate"}
            </button>
          )}

          {/* Phase badge */}
          {phase && (
            <div
              className={`text-xs font-semibold px-3.5 py-1 rounded-full flex items-center gap-1.5 border ${phase.color}`}
            >
              {phase.pulse && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${phase.dotColor}`} />
                </span>
              )}
              {phase.label}
            </div>
          )}
        </div>
      </div>

      {/* Push status */}
      {data && (
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-[11px] px-2 py-0.5 rounded font-medium ${
              data.push_status === "pushed"
                ? "bg-green-50 text-green-700 border border-green-200"
                : data.push_status === "failed"
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-gray-50 text-gray-500 border border-gray-200"
            }`}
          >
            {data.push_status === "pushed"
              ? `Pushed ${
                  data.pushed_at
                    ? new Date(data.pushed_at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: timezone,
                      })
                    : ""
                }`
              : data.push_status === "failed"
              ? "Push failed"
              : data.push_status || "Not pushed"}
          </span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-gray-500 text-center flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading manifest...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-8 text-center">
          <p className="text-red-600 text-sm">Failed to load manifest: {error}</p>
          <button
            className="mt-2 text-xs text-blue-600 hover:underline"
            onClick={refetch}
          >
            Retry
          </button>
        </div>
      )}

      {/* No manifest */}
      {!loading && !error && !data && (
        <div className="py-12 text-center">
          <p className="text-gray-500">
            No manifest found for {formatDateLabel(selectedDate)}.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Has the daily schedule been pushed? Manifests are generated automatically at midnight.
          </p>
          <button
            className="mt-3 px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 font-medium disabled:opacity-50"
            onClick={generateManifest}
            disabled={generating}
          >
            {generating ? "Generating..." : "Generate Now"}
          </button>
        </div>
      )}

      {/* Main timeline */}
      {!loading && !error && data && timeline && (
        <div>
          {/* Store Hours bar */}
          <div className="flex justify-between items-center px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl mb-1">
            <div className="flex items-center gap-2.5">
              <span className="text-base">🏪</span>
              <span className="text-[15px] font-bold">Store Hours</span>
            </div>
            <span className="text-[15px] font-bold text-green-600 font-mono">
              {data.store_hours.is_closed
                ? "CLOSED"
                : `${minutesToDisplay(timeToMinutes(data.store_hours.open))} — ${minutesToDisplay(
                    timeToMinutes(data.store_hours.close)
                  )}`}
            </span>
          </div>

          {/* Dusk/Dawn bar */}
          {data.sun_times && (
            <DuskDawnBar
              sunTimes={data.sun_times}
              defaultLux={siteConfig.default_lux_sensitivity}
              nowMinutes={nowMinutes}
            />
          )}

          {/* Weather snapshot */}
          {data.weather && (
            <div className="flex items-center gap-3 px-4 py-2 bg-sky-50 border border-sky-200 rounded-xl my-1 text-[13px]">
              <span className="text-base">
                {data.weather.condition === "clear" ? "☀️" :
                 data.weather.condition === "partly_cloudy" ? "⛅" :
                 data.weather.condition === "rain" || data.weather.condition === "drizzle" ? "🌧️" :
                 data.weather.condition === "rain_heavy" ? "⛈️" :
                 data.weather.condition === "snow" || data.weather.condition === "snow_heavy" ? "🌨️" :
                 data.weather.condition === "foggy" ? "🌫️" :
                 data.weather.condition === "thunderstorm" ? "⛈️" : "🌤️"}
              </span>
              <span className="font-bold text-gray-800">{Math.round(data.weather.temperature)}&deg;F</span>
              <span className="text-gray-400">feels {Math.round(data.weather.feels_like)}&deg;</span>
              <span className="text-gray-400">{data.weather.humidity}% RH</span>
              <span className="text-gray-400">{data.weather.cloud_cover}% cloud</span>
              {data.weather.wind_speed > 0 && (
                <span className="text-gray-400">{Math.round(data.weather.wind_speed)} mph</span>
              )}
              <span className="text-amber-600 font-semibold">
                {data.weather.lux_estimate.toLocaleString()} lux
              </span>
              <span className="text-gray-400">
                sun {data.weather.sun_elevation > 0 ? "+" : ""}{data.weather.sun_elevation}&deg;
              </span>
            </div>
          )}

          {/* ─── Closed Day Layout ─── */}
          {data.store_hours.is_closed ? (
            <div className="mt-2">
              {/* HVAC Status Card */}
              {(data.thermostats || []).length > 0 && (() => {
                const t = data.thermostats[0];
                return (
                  <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">❄️</span>
                      <div>
                        <span className="text-[15px] font-bold text-gray-800">
                          House HVAC — Unoccupied 24hr
                        </span>
                        <div className="text-[13px] text-gray-500 mt-0.5">
                          Maintaining {t.unoccupied.heat_setpoint}°–{t.unoccupied.cool_setpoint}°F (building protection)
                        </div>
                        {data.weather && (
                          <div className="text-[13px] text-gray-400 mt-0.5">
                            Indoor: {Math.round(data.weather.temperature)}°F · Humidity: {data.weather.humidity}% RH
                          </div>
                        )}
                      </div>
                    </div>
                    {data.thermostats.length > 1 && (
                      <div className="mt-2 pt-2 border-t border-blue-200 flex flex-wrap gap-1.5">
                        {data.thermostats.map((th) => (
                          <span key={th.device_name} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                            {th.zone_name || th.device_name} → {th.unoccupied.heat_setpoint}°–{th.unoccupied.cool_setpoint}°F
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Equipment Status */}
              <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl mb-2">
                <div className="text-sm text-gray-500">
                  All other equipment is off for this closed day.
                </div>
              </div>

              {/* Annotations */}
              {activityEntries.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {activityEntries.map((ann) => {
                    const mins = getEntryMinutes(ann, timezone);
                    const range = detectTimeRange(ann);
                    return (
                      <div key={ann.id} className="flex mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-0 min-h-[44px]">
                            <div className="w-[95px] flex-shrink-0 flex flex-col items-end pr-4 pt-[3px]">
                              <span className="text-sm font-bold text-gray-400 font-mono">
                                {minutesToDisplay(mins)}
                              </span>
                            </div>
                            <div className="w-7 flex-shrink-0 flex flex-col items-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 border border-white mt-[8px] z-[2]" />
                            </div>
                            <div className="flex-1 pl-2 pb-1 flex items-start">
                              <div className="border-t border-dashed border-gray-300 flex-1 mt-[10px]" />
                            </div>
                          </div>
                        </div>
                        <div className="w-[230px] flex-shrink-0 pl-2 flex flex-col gap-1 pt-[3px]">
                          {range ? (
                            <RangeAnnotationCard entry={ann} range={range} />
                          ) : (
                            <AnnotationCard entry={ann} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Morning Sequence */}
              {(timeline.morning.length > 0 || morningAnnotations.length > 0) && (
                <>
                  <Section
                    icon="🌅"
                    label="Morning Sequence"
                    sub="Pre-open → Daylight"
                  />
                  {renderSection(timeline.morning, morningAnnotations, timeline.evening.length === 0 && eveningAnnotations.length === 0)}
                </>
              )}

              {/* Evening Sequence */}
              {(timeline.evening.length > 0 || eveningAnnotations.length > 0) && (
                <>
                  <Section
                    icon="🌇"
                    label="Evening Sequence"
                    sub="Dusk → Post-close"
                  />
                  {renderSection(timeline.evening, eveningAnnotations, true)}
                </>
              )}
            </>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-4 text-sm text-gray-400 flex-wrap">
            <span>
              <strong className="text-gray-600">{data.thermostats.length}</strong> HVAC
              {data.thermostats.filter((t) => t.smart_start_enabled).length > 0 && (
                <span className="text-purple-500 ml-1">
                  ({data.thermostats.filter((t) => t.smart_start_enabled).length} Smart Start)
                </span>
              )}
            </span>
            <span>
              <strong className="text-gray-600">
                {(data.interior_lighting || []).length}
              </strong>{" "}
              interior
            </span>
            <span>
              <strong className="text-amber-600">
                {(data.exterior_lighting || []).length}
              </strong>{" "}
              exterior lux
            </span>
            {siteConfig.lat !== 0 && siteConfig.lng !== 0 && (
              <span>
                📍 {siteConfig.lat.toFixed(2)}&deg;N, {Math.abs(siteConfig.lng).toFixed(2)}&deg;
                {siteConfig.lng < 0 ? "W" : "E"}
              </span>
            )}
            {data.generated_at && (
              <span className="ml-auto">
                Generated{" "}
                {new Date(data.generated_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: timezone,
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
