/**
 * Canonical source label helper.
 * Use everywhere a "Source" column value is displayed so the label is consistent
 * across the Space & HVAC table, Zone detail timeline, comfort-feedback, etc.
 */
export function getSourceLabel(source: string): string {
  if (source === "zone_avg" || source === "Zone Avg") return "Zone Avg";
  if (source === "thermostat" || source === "Thermostat") return "Thermostat";
  if (source === "fallback" || source === "Fallback") return "Fallback";
  // future: 'manager' -> 'Manager Override'
  return source; // passthrough for unknown values
}

export function getSourceBadgeClass(source: string): string {
  const label = getSourceLabel(source);
  if (label === "Zone Avg") return "bg-blue-50 text-blue-700";
  return "bg-gray-100 text-gray-600";
}
