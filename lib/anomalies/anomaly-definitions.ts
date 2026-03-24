// Anomaly definition layer — static content/copy source of truth.
// No data fetching or Supabase calls — pure config only.
//
// Storage key formats found during recon:
//   Threshold config (a_hvac_zones.anomaly_thresholds): snake_case with unit suffix
//     e.g. coil_freeze_temp_f, delayed_response_min, short_cycle_count_1h
//   Anomaly events (b_anomaly_events.anomaly_type): snake_case without unit suffix
//     e.g. coil_freeze, short_cycling, long_cycle, filter_restriction

export type NapkinMathRow = {
  label: string;
  value: string;
  note?: string;
};

export type AnomalyDefinition = {
  key: string;
  configKeys: string[];
  displayName: string;
  shortDescription: string;
  unit?: string;
  thresholdLabel: string;
  observedValueLabel: string;
  thresholdDirection: "above" | "below";
  defaultThreshold?: number;
  napkinMath: NapkinMathRow[];
  requiredInputs: string[];
  whyItMatters: {
    operationalRisk: string;
    businessImpact: string;
    recommendedAction: string;
  };
  nextSteps: {
    inspectNow: string[];
    monitor: string[];
    escalate: string[];
  };
  technicalNotes: string[];
  chartSeries: string[];
};

const DEFINITIONS: Record<string, AnomalyDefinition> = {
  "coil-freeze": {
    key: "coil-freeze",
    configKeys: ["coil_freeze_temp_f", "coil_freeze"],
    displayName: "Coil Freeze",
    shortDescription: "Supply air dropped below a threshold that may indicate coil freezing risk.",
    unit: "°F",
    thresholdLabel: "Min safe supply temperature",
    observedValueLabel: "Measured supply temperature",
    thresholdDirection: "below",
    defaultThreshold: 35,
    napkinMath: [
      { label: "Measured supply air temp", value: "33°F", note: "from supply temp sensor" },
      { label: "Threshold", value: "35°F", note: "configured limit" },
      { label: "Result", value: "33°F < 35°F → flagged" },
    ],
    requiredInputs: ["Supply temperature", "Compressor running state", "Compressor current"],
    whyItMatters: {
      operationalRisk: "Risk of icing, airflow loss, and possible equipment stress.",
      businessImpact: "Icing can shut down cooling and require manual defrost or service.",
      recommendedAction: "Inspect refrigerant charge, airflow, and filter condition.",
    },
    nextSteps: {
      inspectNow: [
        "Verify supply temp sensor reading",
        "Check for visible ice on coil",
        "Confirm airflow is unobstructed",
      ],
      monitor: [
        "Watch supply temp trend over next few hours",
        "Does it recover when unit cycles off?",
      ],
      escalate: [
        "If freezing recurs after restart, dispatch technician for refrigerant/airflow diagnosis",
      ],
    },
    technicalNotes: [
      "Coil freeze detection requires a supply temperature sensor and compressor current sensor.",
      "The threshold should be set below normal operating supply temps but above freezing risk.",
    ],
    chartSeries: ["supply_temp", "threshold", "compressor_current"],
  },

  "delayed-response": {
    key: "delayed-response",
    configKeys: ["delayed_response_min", "delayed_temp_response"],
    displayName: "Delayed Response",
    shortDescription: "The system started but the zone temperature did not move as expected within the configured response window.",
    unit: "min",
    thresholdLabel: "Response window (minutes)",
    observedValueLabel: "Temperature change during window",
    thresholdDirection: "above",
    defaultThreshold: 15,
    napkinMath: [
      { label: "HVAC start time", value: "1:00 PM" },
      { label: "Zone temp at start", value: "76°F" },
      { label: "Zone temp at 1:15 PM", value: "76°F" },
      { label: "Movement in 15 min", value: "0°F" },
      { label: "Result", value: "15 min window, no movement → flagged" },
    ],
    requiredInputs: ["Zone temperature", "HVAC active state", "Setpoint", "Timestamp"],
    whyItMatters: {
      operationalRisk: "Zone may not be reaching setpoint — space comfort or food safety may be affected.",
      businessImpact: "Undetected HVAC failure can lead to prolonged temperature excursion.",
      recommendedAction: "Verify unit is running, confirm no airflow obstruction, check controls.",
    },
    nextSteps: {
      inspectNow: [
        "Confirm the unit is actually running (check current draw)",
        "Check for airflow obstructions at supply vents",
        "Verify thermostat is calling for heat or cool",
      ],
      monitor: [
        "Watch zone temp over the next 30–60 minutes",
        "Compare with outdoor temp trend",
      ],
      escalate: [
        "If no response after multiple cycles, dispatch technician to inspect controls and refrigerant",
      ],
    },
    technicalNotes: [
      "Detection requires correlating HVAC start events with zone temperature movement.",
      "False positives can occur during rapid outdoor temp changes or door-open events.",
    ],
    chartSeries: ["zone_temp", "setpoint", "hvac_active"],
  },

  "idle-heat-gain": {
    key: "idle-heat-gain",
    configKeys: ["idle_heat_gain_f", "idle_heat_gain"],
    displayName: "Idle Heat Gain",
    shortDescription: "Zone temperature drifted upward while the space was idle, beyond the acceptable limit.",
    unit: "°F",
    thresholdLabel: "Max allowable idle drift (°F)",
    observedValueLabel: "Measured temp drift from baseline",
    thresholdDirection: "above",
    defaultThreshold: 2,
    napkinMath: [
      { label: "Idle baseline/setpoint", value: "72°F" },
      { label: "Current zone temp", value: "74°F" },
      { label: "Drift", value: "+2°F" },
      { label: "Threshold", value: "2°F" },
      { label: "Result", value: "2°F ≥ 2°F → flagged" },
    ],
    requiredInputs: ["Zone temperature", "Setpoint", "Occupancy phase"],
    whyItMatters: {
      operationalRisk: "Excessive heat gain during idle periods may indicate poor envelope or HVAC underperformance.",
      businessImpact: "Higher precool loads and increased morning runtime.",
      recommendedAction: "Review building envelope, after-hours thermostat schedule, and door/window sealing.",
    },
    nextSteps: {
      inspectNow: [
        "Check for open doors or windows",
        "Verify after-hours HVAC schedule",
        "Inspect building envelope for leaks",
      ],
      monitor: [
        "Track overnight temperature drift pattern",
        "Compare idle drift across similar zones",
      ],
      escalate: [
        "If drift consistently exceeds threshold, investigate insulation, rooftop penetrations, or equipment sizing",
      ],
    },
    technicalNotes: [
      "Idle heat gain is measured during unoccupied or idle phases only.",
      "Outdoor temperature and solar load significantly influence drift rates.",
    ],
    chartSeries: ["zone_temp", "setpoint", "occupancy_phase"],
  },

  "long-cycle-duration": {
    key: "long-cycle-duration",
    configKeys: ["long_cycle_min", "long_cycle"],
    displayName: "Long Cycle Duration",
    shortDescription: "The compressor ran continuously longer than the configured acceptable runtime.",
    unit: "min",
    thresholdLabel: "Max continuous runtime (minutes)",
    observedValueLabel: "Measured continuous runtime (minutes)",
    thresholdDirection: "above",
    defaultThreshold: 120,
    napkinMath: [
      { label: "Continuous runtime", value: "137 min" },
      { label: "Threshold", value: "120 min" },
      { label: "Result", value: "137 > 120 → flagged" },
    ],
    requiredInputs: ["Compressor running state", "Compressor current", "Event duration"],
    whyItMatters: {
      operationalRisk: "Extended runtimes may indicate undersizing, high load, or degraded performance.",
      businessImpact: "Increased energy use and elevated wear if the unit cannot satisfy the setpoint.",
      recommendedAction: "Verify setpoint vs. ambient conditions, check refrigerant, inspect filters.",
    },
    nextSteps: {
      inspectNow: [
        "Check setpoint vs. current zone temperature",
        "Verify outdoor temperature conditions",
        "Inspect filter condition",
      ],
      monitor: [
        "Track runtime duration over the next 24 hours",
        "Compare with similar units on the same site",
      ],
      escalate: [
        "If long cycles persist across moderate weather, dispatch technician to inspect refrigerant and capacity",
      ],
    },
    technicalNotes: [
      "Long cycle detection uses compressor current to determine run state.",
      "Hot outdoor conditions can cause legitimately long runtimes — consider weather context.",
    ],
    chartSeries: ["compressor_runtime", "threshold"],
  },

  "short-cycle-count": {
    key: "short-cycle-count",
    configKeys: ["short_cycle_count_1h", "short_cycling"],
    displayName: "Short Cycle Count",
    shortDescription: "The compressor started and stopped too frequently in a rolling hour.",
    unit: "cycles/hr",
    thresholdLabel: "Max starts per rolling hour",
    observedValueLabel: "Measured starts in rolling hour",
    thresholdDirection: "above",
    defaultThreshold: 4,
    napkinMath: [
      { label: "Compressor starts in rolling 1hr", value: "6" },
      { label: "Threshold", value: "4 cycles/hr" },
      { label: "Result", value: "6 > 4 → flagged" },
    ],
    requiredInputs: ["Compressor running state", "Compressor current", "Rolling event count", "Timestamp window"],
    whyItMatters: {
      operationalRisk: "Rapid cycling stresses the compressor and destabilizes system performance.",
      businessImpact: "Increased mechanical wear can shorten compressor life and increase service frequency.",
      recommendedAction: "Check controls, staging behavior, refrigerant charge, and sizing.",
    },
    nextSteps: {
      inspectNow: [
        "Check thermostat deadband settings",
        "Verify staging and anti-short-cycle delays",
        "Inspect refrigerant charge",
      ],
      monitor: [
        "Track cycle frequency over 24–48 hours",
        "Note correlation with outdoor temp or occupancy changes",
      ],
      escalate: [
        "If short cycling persists, dispatch technician to evaluate controls, sizing, and refrigerant",
      ],
    },
    technicalNotes: [
      "Short cycling is measured as compressor start events in a rolling 60-minute window.",
      "Anti-short-cycle delays in the thermostat should prevent most normal short cycling.",
    ],
    chartSeries: ["rolling_starts_per_hour", "threshold"],
  },

  "filter-restriction-dt": {
    key: "filter-restriction-dt",
    configKeys: ["filter_restriction_delta_t_max", "filter_restriction"],
    displayName: "Filter Restriction ΔT",
    shortDescription: "A large zone-to-supply temperature split while running may indicate poor airflow or a restricted filter.",
    unit: "°F",
    thresholdLabel: "Max allowable ΔT (°F)",
    observedValueLabel: "Measured ΔT (zone − supply)",
    thresholdDirection: "above",
    defaultThreshold: 25,
    napkinMath: [
      { label: "Zone temp", value: "76°F" },
      { label: "Supply temp", value: "48°F" },
      { label: "ΔT = 76 − 48", value: "28°F" },
      { label: "Threshold", value: "25°F" },
      { label: "Result", value: "28 > 25 → flagged" },
    ],
    requiredInputs: ["Zone temperature", "Supply temperature", "Compressor running state"],
    whyItMatters: {
      operationalRisk: "Restricted airflow reduces HVAC performance and increases runtime.",
      businessImpact: "Longer runtimes increase energy use and stress components.",
      recommendedAction: "Inspect filter condition, airflow path, and blower performance.",
    },
    nextSteps: {
      inspectNow: [
        "Check filter for dirt/debris accumulation",
        "Verify all supply vents are open and unblocked",
        "Inspect blower motor operation",
      ],
      monitor: [
        "Track ΔT trend — does it improve after filter change?",
        "Compare ΔT across units to find outliers",
      ],
      escalate: [
        "If ΔT remains high after filter replacement, inspect ductwork and blower",
      ],
    },
    technicalNotes: [
      "ΔT is calculated as zone_temp minus supply_temp while compressor is confirmed running.",
      "A dirty filter increases ΔT by restricting airflow across the evaporator coil.",
    ],
    chartSeries: ["zone_temp", "supply_temp", "delta_t", "threshold"],
  },

  "refrigerant-low-dt": {
    key: "refrigerant-low-dt",
    configKeys: ["refrigerant_low_delta_t_min", "refrigerant_low"],
    displayName: "Refrigerant Low ΔT",
    shortDescription: "A small zone-to-supply temperature split while running may indicate weak cooling performance.",
    unit: "°F",
    thresholdLabel: "Min expected ΔT (°F)",
    observedValueLabel: "Measured ΔT (zone − supply)",
    thresholdDirection: "below",
    defaultThreshold: 5,
    napkinMath: [
      { label: "Zone temp", value: "72°F" },
      { label: "Supply temp", value: "68°F" },
      { label: "ΔT = 72 − 68", value: "4°F" },
      { label: "Threshold", value: "5°F" },
      { label: "Result", value: "4 < 5 → flagged" },
    ],
    requiredInputs: ["Zone temperature", "Supply temperature", "Compressor running state"],
    whyItMatters: {
      operationalRisk: "Low ΔT suggests the unit is not producing adequate cooling.",
      businessImpact: "Spaces may not reach setpoint; food safety risk in QSR environments.",
      recommendedAction: "Check refrigerant charge and inspect for airflow or coil issues.",
    },
    nextSteps: {
      inspectNow: [
        "Verify supply temp sensor accuracy",
        "Check refrigerant sight glass (if accessible)",
        "Inspect coil for frost or dirt buildup",
      ],
      monitor: [
        "Track ΔT trend over 24 hours — consistent low ΔT confirms issue",
        "Compare with similar units",
      ],
      escalate: [
        "If ΔT remains low, dispatch technician for refrigerant charge check",
      ],
    },
    technicalNotes: [
      "Low ΔT while the compressor is running indicates reduced cooling capacity.",
      "Common causes: low refrigerant charge, restricted liquid line, or failing compressor valve.",
    ],
    chartSeries: ["zone_temp", "supply_temp", "delta_t", "threshold"],
  },

  "min-efficiency-ratio": {
    key: "min-efficiency-ratio",
    configKeys: ["efficiency_ratio_min_pct", "low_efficiency"],
    displayName: "Min Efficiency Ratio",
    shortDescription: "Cooling effect relative to electrical input fell below the configured minimum efficiency target.",
    unit: "%",
    thresholdLabel: "Min efficiency ratio",
    observedValueLabel: "Measured efficiency ratio",
    thresholdDirection: "below",
    defaultThreshold: 40,
    // TODO: Formula pending finalization in the backend. Placeholder napkin math.
    napkinMath: [
      { label: "Measured efficiency ratio", value: "TBD", note: "formula pending finalization" },
      { label: "Threshold", value: "40%" },
      { label: "Result", value: "Pending formula → placeholder" },
    ],
    requiredInputs: ["Power draw", "Cooling output (computed)", "Runtime"],
    whyItMatters: {
      operationalRisk: "Low efficiency means more energy consumed per unit of cooling delivered.",
      businessImpact: "Higher utility costs and potential equipment degradation.",
      recommendedAction: "Review power draw, cooling performance, and maintenance history.",
    },
    nextSteps: {
      inspectNow: [
        "Check power draw against expected range",
        "Verify cooling output matches load conditions",
      ],
      monitor: [
        "Track efficiency ratio over multiple days",
        "Compare before and after maintenance",
      ],
      escalate: [
        "If efficiency remains low, schedule comprehensive HVAC assessment",
      ],
    },
    technicalNotes: [
      "Formula pending finalization. Placeholder in V1.",
      "Will incorporate power draw and computed cooling output.",
    ],
    chartSeries: ["efficiency_ratio", "threshold", "power_input"],
  },

  "compressor-current-threshold": {
    key: "compressor-current-threshold",
    configKeys: ["compressor_current_threshold_a", "compressor_current"],
    displayName: "Compressor Current Threshold",
    shortDescription: "This threshold determines when the compressor is considered \"on\" for use in other anomaly calculations. It is a detection gate, not necessarily a standalone fault condition.",
    unit: "A",
    thresholdLabel: "Compressor detection threshold (A)",
    observedValueLabel: "Measured current (A)",
    thresholdDirection: "above",
    defaultThreshold: 1.0,
    napkinMath: [
      { label: "Measured current", value: "1.4 A", note: "from current sensor" },
      { label: "Threshold", value: "1.0 A" },
      { label: "Result", value: "1.4 > 1.0 → compressor considered running" },
    ],
    requiredInputs: ["Compressor current"],
    whyItMatters: {
      operationalRisk: "If threshold is miscalibrated, other anomaly detections may be affected.",
      businessImpact: "Incorrect detection can produce false positives or missed detections across the platform.",
      recommendedAction: "Verify actual compressor current draw with a clamp meter and adjust threshold accordingly.",
    },
    nextSteps: {
      inspectNow: [
        "Measure actual compressor current with a clamp meter",
        "Compare against the configured threshold",
      ],
      monitor: [
        "Review compressor detection accuracy in recent anomaly events",
        "Check if false positives or missed detections correlate with threshold setting",
      ],
      escalate: [
        "If compressor detection is unreliable, adjust threshold and revalidate across all anomaly types",
      ],
    },
    technicalNotes: [
      "This is a detection gate, not a fault condition. It determines when the compressor is considered 'on.'",
      "Other anomalies (coil freeze, filter restriction, refrigerant low ΔT) depend on accurate compressor detection.",
      "Threshold should be set above idle/standby draw but below minimum running draw.",
    ],
    chartSeries: ["compressor_current", "threshold"],
  },
};

/**
 * Resolves a raw storage/config key to a canonical AnomalyDefinition.
 * Checks both the canonical key and all configKeys[] variants.
 * Returns undefined if no match found.
 */
export function resolveAnomalyDefinition(
  rawKey: string
): AnomalyDefinition | undefined {
  const normalized = rawKey.toLowerCase();
  for (const def of Object.values(DEFINITIONS)) {
    if (def.key === normalized) return def;
    if (def.configKeys.some((ck) => ck.toLowerCase() === normalized)) return def;
  }
  return undefined;
}

/** Get a definition by its canonical route key. */
export function getAnomalyDefinition(key: string): AnomalyDefinition | undefined {
  return DEFINITIONS[key];
}

/** Get all definitions as an array. */
export function getAllAnomalyDefinitions(): AnomalyDefinition[] {
  return Object.values(DEFINITIONS);
}
