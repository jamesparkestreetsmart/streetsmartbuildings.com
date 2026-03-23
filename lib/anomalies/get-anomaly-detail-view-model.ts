// View model builder for the anomaly detail page.
// Combines static definitions with live threshold/event data from Supabase.
//
// Data sources:
//   - anomaly-definitions.ts: static copy and config
//   - a_hvac_zones.anomaly_thresholds: threshold config (JSONB)
//   - b_anomaly_events: event history (anomaly_type, peak_value, started_at, etc.)
//   - a_sites: site name context

import { createClient } from "@supabase/supabase-js";
import { getAnomalyDefinition, resolveAnomalyDefinition, type AnomalyDefinition } from "./anomaly-definitions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type AnomalyDetailViewModel = {
  definition: AnomalyDefinition;
  threshold: {
    value: number | null;
    unit: string;
    source: "org" | "site" | "profile" | "default" | "unknown";
  };
  observedValue: {
    value: number | null;
    label: string;
    timestamp: string | null;
    isPlaceholder: boolean;
  };
  status: "active" | "cleared" | "historical" | "unknown";
  lastTriggered: string | null;
  context: {
    siteId: string;
    siteName: string | null;
    equipmentId: string | null;
    equipmentName: string | null;
    zoneId: string | null;
    zoneName: string | null;
  };
  chartConfig: {
    series: string[];
    defaultRange: "1h" | "6h" | "24h" | "7d";
  };
};

export async function getAnomalyDetailViewModel(params: {
  siteId: string;
  anomalyKey: string;
  equipmentId?: string;
  zoneId?: string;
  date?: string;
}): Promise<AnomalyDetailViewModel | null> {
  const { siteId, anomalyKey, equipmentId, zoneId } = params;

  // 1. Resolve definition
  const definition = getAnomalyDefinition(anomalyKey);
  if (!definition) return null;

  // 2. Fetch site context
  const { data: site } = await supabase
    .from("a_sites")
    .select("site_id, name")
    .eq("site_id", siteId)
    .single();

  // 3. Fetch threshold from zone config (first managed zone at this site)
  let thresholdValue: number | null = null;
  let thresholdSource: "org" | "site" | "profile" | "default" | "unknown" = "default";
  let resolvedZoneId = zoneId || null;
  let resolvedZoneName: string | null = null;

  // Try specific zone first, then first managed zone at site
  const zoneQuery = zoneId
    ? supabase.from("a_hvac_zones").select("hvac_zone_id, name, anomaly_thresholds").eq("hvac_zone_id", zoneId).single()
    : supabase.from("a_hvac_zones").select("hvac_zone_id, name, anomaly_thresholds").eq("site_id", siteId).eq("control_scope", "managed").limit(1).single();

  const { data: zone } = await zoneQuery;
  if (zone) {
    resolvedZoneId = zone.hvac_zone_id;
    resolvedZoneName = zone.name;
    const thresholds = zone.anomaly_thresholds || {};
    // Try each config key to find the threshold
    for (const ck of definition.configKeys) {
      if (thresholds[ck] !== undefined && thresholds[ck] !== null) {
        thresholdValue = Number(thresholds[ck]);
        thresholdSource = "site";
        break;
      }
    }
  }

  // 4. Fetch equipment context if provided
  let equipmentName: string | null = null;
  if (equipmentId) {
    const { data: equip } = await supabase
      .from("a_equipment")
      .select("equipment_id, name")
      .eq("equipment_id", equipmentId)
      .single();
    equipmentName = equip?.name || null;
  }

  // 5. Fetch most recent anomaly event for this type + site
  // b_anomaly_events.anomaly_type uses different keys than threshold config
  // The configKeys[] includes both formats (e.g. "coil_freeze_temp_f" and "coil_freeze")
  let observedValue: number | null = null;
  let observedTimestamp: string | null = null;
  let isPlaceholder = true;
  let status: "active" | "cleared" | "historical" | "unknown" = "unknown";
  let lastTriggered: string | null = null;

  // Try matching anomaly_type against all configKeys
  const eventTypeVariants = definition.configKeys;
  const { data: events } = await supabase
    .from("b_anomaly_events")
    .select("*")
    .eq("site_id", siteId)
    .in("anomaly_type", eventTypeVariants)
    .order("started_at", { ascending: false })
    .limit(1);

  if (events && events.length > 0) {
    const event = events[0];
    observedValue = event.peak_value != null ? Number(event.peak_value) : null;
    observedTimestamp = event.started_at;
    isPlaceholder = false;
    lastTriggered = event.started_at;
    status = event.ended_at ? "cleared" : "active";
  }

  // TODO: V1 does not distinguish "historical" status — would need alert-level data

  return {
    definition,
    threshold: {
      value: thresholdValue,
      unit: definition.unit || "",
      source: thresholdSource,
    },
    observedValue: {
      value: observedValue,
      label: definition.observedValueLabel,
      timestamp: observedTimestamp,
      isPlaceholder,
    },
    status,
    lastTriggered,
    context: {
      siteId,
      siteName: site?.name || null,
      equipmentId: equipmentId || null,
      equipmentName,
      zoneId: resolvedZoneId,
      zoneName: resolvedZoneName,
    },
    chartConfig: {
      series: definition.chartSeries,
      defaultRange: "24h",
    },
  };
}
