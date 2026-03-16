export const SOP_METRICS = [
  { value: "zone_temp", label: "Zone Temperature" },
  { value: "space_temp", label: "Space Temperature" },
  { value: "setpoint_delta", label: "Setpoint Delta" },
  { value: "cooler_temp", label: "Cooler Temperature" },
  { value: "freezer_temp", label: "Freezer Temperature" },
  { value: "humidity", label: "Humidity" },
  { value: "power_kw", label: "Power (kW)" },
  { value: "pressure_differential", label: "Pressure Differential" },
] as const;

export const SOP_UNITS = [
  { value: "F", label: "\u00b0F" },
  { value: "C", label: "\u00b0C" },
  { value: "percent", label: "%" },
  { value: "kW", label: "kW" },
  { value: "kWh", label: "kWh" },
  { value: "Pa", label: "Pa" },
  { value: "inH2O", label: "inH\u2082O" },
  { value: "count", label: "count" },
] as const;

export const SOP_EVALUATION_WINDOWS = [
  { value: "all_hours", label: "All Hours" },
  { value: "occupied_hours_only", label: "Occupied Hours Only" },
] as const;

// ── Target Kind (which track) ────────────────────────────────

export const SOP_TARGET_KINDS = [
  { value: "equipment", label: "Equipment" },
  { value: "space", label: "Space" },
] as const;

// ── Scope Levels (how specific) ──────────────────────────────

export const SOP_SCOPE_LEVELS = [
  { value: "ssb",            label: "SSB",            rank: 1, track: "both",      color: "blue"   },
  { value: "org",            label: "Org",            rank: 2, track: "both",      color: "purple" },
  { value: "site",           label: "Site",           rank: 3, track: "space",     color: "indigo" },
  { value: "space_type",     label: "Space Type",     rank: 4, track: "space",     color: "teal"   },
  { value: "space",          label: "Space",          rank: 5, track: "space",     color: "green"  },
  { value: "equipment_type", label: "Equipment Type", rank: 6, track: "equipment", color: "amber"  },
  { value: "equipment",      label: "Equipment",      rank: 7, track: "equipment", color: "orange" },
] as const;

/** @deprecated Use SOP_SCOPE_LEVELS instead */
export const SOP_SCOPE_RANK = { org: 1, site: 2, equipment: 3 } as const;

// ── Metric → default unit derivation ─────────────────────────

export const METRIC_DEFAULT_UNIT: Record<string, string> = {
  zone_temp:             "F",
  space_temp:            "F",
  cooler_temp:           "F",
  freezer_temp:          "F",
  setpoint_delta:        "F",
  humidity:              "percent",
  power_kw:              "kW",
  pressure_differential: "Pa",
};

// ── Track-specific metric sets ───────────────────────────────

export const EQUIPMENT_TRACK_METRICS = [
  "zone_temp", "setpoint_delta", "cooler_temp",
  "freezer_temp", "power_kw",
] as const;

export const SPACE_TRACK_METRICS = [
  "space_temp", "humidity",
] as const;

export const BOTH_TRACK_METRICS = [
  "pressure_differential",
] as const;

// ── Helpers ──────────────────────────────────────────────────

export function scopeLevelLabel(val: string): string {
  return SOP_SCOPE_LEVELS.find((s) => s.value === val)?.label || val;
}

export function scopeLevelColor(val: string): string {
  return SOP_SCOPE_LEVELS.find((s) => s.value === val)?.color || "gray";
}

export function scopeLevelRank(val: string): number {
  return SOP_SCOPE_LEVELS.find((s) => s.value === val)?.rank || 99;
}

export function metricLabel(val: string): string {
  return SOP_METRICS.find((m) => m.value === val)?.label || val;
}

export function metricsForTrack(targetKind: string): readonly { value: string; label: string }[] {
  const equipment = EQUIPMENT_TRACK_METRICS as readonly string[];
  const space = SPACE_TRACK_METRICS as readonly string[];
  const both = BOTH_TRACK_METRICS as readonly string[];
  const allowed = targetKind === "equipment"
    ? [...equipment, ...both]
    : targetKind === "space"
    ? [...space, ...both]
    : SOP_METRICS.map((m) => m.value);
  return SOP_METRICS.filter((m) => allowed.includes(m.value));
}

export function scopeLevelsForTrack(targetKind: string, isSSB: boolean): typeof SOP_SCOPE_LEVELS[number][] {
  return SOP_SCOPE_LEVELS.filter((s) => {
    if (s.value === "ssb" && !isSSB) return false;
    return s.track === "both" || s.track === targetKind;
  });
}

/** "Applies To" plain-language labels for the modal. */
export const APPLIES_TO_LABELS: Record<string, string> = {
  ssb:            "Platform Default",
  org:            "Entire Organization",
  site:           "Specific Site",
  equipment_type: "Equipment Type",
  equipment:      "Specific Equipment",
  space_type:     "Space Type",
  space:          "Specific Space",
};

export function appliesToLabel(scopeLevel: string): string {
  return APPLIES_TO_LABELS[scopeLevel] || scopeLevel;
}

export function unitLabel(unit: string): string {
  return SOP_UNITS.find((u) => u.value === unit)?.label || unit;
}
