// CRITICAL: This list defines ALL functional fields that affect
// thermostat zone behavior. Both profile identity/dedup AND snapshot
// capture/restore/display depend on this list.
//
// When adding a new functional field to b_thermostat_profiles:
//   1. Add the column to b_thermostat_profiles (migration)
//   2. Add the column to a_org_thermostat_snapshot_items as NULLABLE,
//      no default, no backfill (null = "captured before this field existed")
//   3. Add the column to a_hvac_zones as NULLABLE
//   4. Add the field name here
//   Everything else (dedup, capture, restore, UI) updates automatically.
//
// Never hardcode field lists anywhere else. Always import from here.

export const THERMOSTAT_FUNCTIONAL_FIELDS = [
  // Core setpoints
  'occupied_heat_f',
  'occupied_cool_f',
  'unoccupied_heat_f',
  'unoccupied_cool_f',
  // Fan and HVAC modes
  'occupied_fan_mode',
  'occupied_hvac_mode',
  'unoccupied_fan_mode',
  'unoccupied_hvac_mode',
  // Guardrails
  'guardrail_min_f',
  'guardrail_max_f',
  // Manager override
  'manager_offset_up_f',
  'manager_offset_down_f',
  'manager_override_reset_minutes',
  // Setpoint adjustments
  'smart_start_enabled',
  'smart_start_max_adj_f',
  'occupancy_enabled',
  'occupancy_max_adj_f',
  'feels_like_enabled',
  'feels_like_max_adj_f',
] as const;

/** Compare two value using normalization rules (null=null, boolean, numeric, string). */
function valuesMatch(valA: unknown, valB: unknown): boolean {
  if (valA === null && valB === null) return true;
  if (valA === null || valB === null) return false;
  if (typeof valA === 'boolean' || typeof valB === 'boolean') {
    return Boolean(valA) === Boolean(valB);
  }
  const numA = Number(valA);
  const numB = Number(valB);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA === numB;
  }
  return valA === valB;
}

/** Full equality: all THERMOSTAT_FUNCTIONAL_FIELDS must match. */
export function profilesAreEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  return THERMOSTAT_FUNCTIONAL_FIELDS.every(field => valuesMatch(a[field], b[field]));
}

/**
 * Partial match for legacy snapshots: only compare fields that are
 * NON-NULL in the snapshot item. Null fields are unknown, not a mismatch.
 */
export function snapshotMatchesProfile(
  snapshotItem: Record<string, unknown>,
  profile: Record<string, unknown>
): boolean {
  return THERMOSTAT_FUNCTIONAL_FIELDS.every(field => {
    const snapVal = snapshotItem[field];
    // Null in snapshot = unknown (captured before field existed) → skip
    if (snapVal === null || snapVal === undefined) return true;
    return valuesMatch(snapVal, profile[field]);
  });
}
