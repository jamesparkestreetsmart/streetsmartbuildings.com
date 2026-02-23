// lib/setpoint-resolver.ts
// Resolves thermostat setpoints from profile or zone-level overrides

import { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedSetpoints {
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
  source: "profile" | "zone_override" | "default";
  profile_name?: string;
}

interface ZoneRow {
  profile_id?: string | null;
  is_override?: boolean;
  occupied_heat_f?: number | null;
  occupied_cool_f?: number | null;
  unoccupied_heat_f?: number | null;
  unoccupied_cool_f?: number | null;
  occupied_fan_mode?: string | null;
  occupied_hvac_mode?: string | null;
  unoccupied_fan_mode?: string | null;
  unoccupied_hvac_mode?: string | null;
  guardrail_min_f?: number | null;
  guardrail_max_f?: number | null;
  manager_offset_up_f?: number | null;
  manager_offset_down_f?: number | null;
  manager_override_reset_minutes?: number | null;
  // Legacy fields (ignored in new code)
  fan_mode?: string | null;
  hvac_mode?: string | null;
}

interface ProfileRow {
  profile_id: string;
  name?: string;           // DB column
  profile_name?: string;   // mapped by API
  occupied_heat_f: number | null;
  occupied_cool_f: number | null;
  unoccupied_heat_f: number | null;
  unoccupied_cool_f: number | null;
  occupied_fan_mode?: string | null;
  occupied_hvac_mode?: string | null;
  unoccupied_fan_mode?: string | null;
  unoccupied_hvac_mode?: string | null;
  guardrail_min_f?: number | null;
  guardrail_max_f?: number | null;
  manager_offset_up_f?: number | null;
  manager_offset_down_f?: number | null;
  manager_override_reset_minutes?: number | null;
  // Legacy
  fan_mode?: string | null;
  hvac_mode?: string | null;
}

const DEFAULTS: ResolvedSetpoints = {
  occupied_heat_f: 68,
  occupied_cool_f: 76,
  unoccupied_heat_f: 55,
  unoccupied_cool_f: 85,
  occupied_fan_mode: "auto",
  occupied_hvac_mode: "auto",
  unoccupied_fan_mode: "auto",
  unoccupied_hvac_mode: "auto",
  guardrail_min_f: 45,
  guardrail_max_f: 95,
  manager_offset_up_f: 4,
  manager_offset_down_f: 4,
  manager_override_reset_minutes: 120,
  source: "default",
};

function hasZoneValues(zone: ZoneRow): boolean {
  return (
    zone.occupied_heat_f != null ||
    zone.occupied_cool_f != null ||
    zone.unoccupied_heat_f != null ||
    zone.unoccupied_cool_f != null
  );
}

function resolveFromRow(row: ZoneRow | ProfileRow, source: "zone_override" | "profile", profileName?: string): ResolvedSetpoints {
  return {
    occupied_heat_f: row.occupied_heat_f ?? DEFAULTS.occupied_heat_f,
    occupied_cool_f: row.occupied_cool_f ?? DEFAULTS.occupied_cool_f,
    unoccupied_heat_f: row.unoccupied_heat_f ?? DEFAULTS.unoccupied_heat_f,
    unoccupied_cool_f: row.unoccupied_cool_f ?? DEFAULTS.unoccupied_cool_f,
    occupied_fan_mode: row.occupied_fan_mode ?? row.fan_mode ?? DEFAULTS.occupied_fan_mode,
    occupied_hvac_mode: row.occupied_hvac_mode ?? row.hvac_mode ?? DEFAULTS.occupied_hvac_mode,
    unoccupied_fan_mode: row.unoccupied_fan_mode ?? row.fan_mode ?? DEFAULTS.unoccupied_fan_mode,
    unoccupied_hvac_mode: row.unoccupied_hvac_mode ?? row.hvac_mode ?? DEFAULTS.unoccupied_hvac_mode,
    guardrail_min_f: row.guardrail_min_f ?? DEFAULTS.guardrail_min_f,
    guardrail_max_f: row.guardrail_max_f ?? DEFAULTS.guardrail_max_f,
    manager_offset_up_f: row.manager_offset_up_f ?? DEFAULTS.manager_offset_up_f,
    manager_offset_down_f: row.manager_offset_down_f ?? DEFAULTS.manager_offset_down_f,
    manager_override_reset_minutes: row.manager_override_reset_minutes ?? DEFAULTS.manager_override_reset_minutes,
    source,
    ...(profileName ? { profile_name: profileName } : {}),
  };
}

/**
 * Synchronous variant — use when profile data is already fetched.
 * Avoids N+1 queries in batch operations.
 */
export function resolveZoneSetpointsSync(
  zone: ZoneRow,
  profile?: ProfileRow | null
): ResolvedSetpoints {
  // If zone is explicitly overriding, or has no profile, use zone columns
  if (zone.is_override || !zone.profile_id) {
    if (hasZoneValues(zone)) {
      return resolveFromRow(zone, "zone_override");
    }
    return { ...DEFAULTS };
  }

  // Profile-linked zone
  if (profile) {
    return resolveFromRow(profile, "profile", profile.profile_name || profile.name);
  }

  // Profile referenced but not found — fall back to zone values or defaults
  if (hasZoneValues(zone)) {
    return resolveFromRow(zone, "zone_override");
  }

  return { ...DEFAULTS };
}

/**
 * Async variant — fetches profile from DB if needed.
 */
export async function resolveZoneSetpoints(
  supabaseClient: SupabaseClient,
  zone: ZoneRow
): Promise<ResolvedSetpoints> {
  if (zone.is_override || !zone.profile_id) {
    return resolveZoneSetpointsSync(zone);
  }

  const { data: profile } = await supabaseClient
    .from("b_thermostat_profiles")
    .select("*")
    .eq("profile_id", zone.profile_id)
    .single();

  return resolveZoneSetpointsSync(zone, profile);
}
