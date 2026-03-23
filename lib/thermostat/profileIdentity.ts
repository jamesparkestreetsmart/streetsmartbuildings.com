// CRITICAL: This list must include ALL fields that affect thermostat behavior.
// If a new functional field is added to b_thermostat_profiles and not added here,
// duplicate detection and deduplication logic will become incorrect.
// Always update this list alongside schema changes.

export const PROFILE_IDENTITY_FIELDS = [
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

export function profilesAreEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  return PROFILE_IDENTITY_FIELDS.every(field => {
    const valA = a[field];
    const valB = b[field];

    // null = null → match
    if (valA === null && valB === null) return true;
    if (valA === null || valB === null) return false;

    // Boolean fields: compare as booleans
    if (typeof valA === 'boolean' || typeof valB === 'boolean') {
      return Boolean(valA) === Boolean(valB);
    }

    // Numeric fields: normalize to number to avoid "1" vs 1 mismatch
    const numA = Number(valA);
    const numB = Number(valB);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA === numB;
    }

    // String fields: direct comparison
    return valA === valB;
  });
}
