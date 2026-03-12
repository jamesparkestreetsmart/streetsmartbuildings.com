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

export const SOP_SCOPE_RANK = { org: 1, site: 2, equipment: 3 } as const;
