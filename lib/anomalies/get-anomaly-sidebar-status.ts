// Lightweight batch query for sidebar status + threshold + last event.
// Single query for all anomaly types at a site, filtered to last 7 days.

import { createClient } from "@supabase/supabase-js";
import { getAllAnomalyDefinitions, resolveAnomalyDefinition } from "./anomaly-definitions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type AnomalySidebarItem = {
  anomalyKey: string;
  displayName: string;
  status: "active" | "cleared" | "unknown";
  lastTriggered: string | null;
  thresholdValue: number | null;
  thresholdUnit: string;
  thresholdDirection: "above" | "below";
};

export async function getAnomalySidebarStatus(siteId: string): Promise<AnomalySidebarItem[]> {
  const definitions = getAllAnomalyDefinitions();
  const allEventKeys = definitions.flatMap((d) => d.configKeys);

  // Batch 1: anomaly events in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // Batch 2: zone threshold config (first managed zone at site)
  const [eventsRes, zoneRes] = await Promise.all([
    supabase
      .from("b_anomaly_events")
      .select("anomaly_type, ended_at, started_at")
      .eq("site_id", siteId)
      .in("anomaly_type", allEventKeys)
      .gte("started_at", sevenDaysAgo)
      .order("started_at", { ascending: false }),
    supabase
      .from("a_hvac_zones")
      .select("anomaly_thresholds")
      .eq("site_id", siteId)
      .eq("control_scope", "managed")
      .limit(1)
      .single(),
  ]);

  // Build status + lastTriggered map
  const statusMap = new Map<string, { status: "active" | "cleared"; lastTriggered: string }>();
  for (const event of eventsRes.data || []) {
    const def = resolveAnomalyDefinition(event.anomaly_type);
    if (!def || statusMap.has(def.key)) continue;
    statusMap.set(def.key, {
      status: event.ended_at ? "cleared" : "active",
      lastTriggered: event.started_at,
    });
  }

  // Site threshold overrides
  const siteThresholds = zoneRes.data?.anomaly_thresholds || {};

  return definitions.map((d) => {
    const eventInfo = statusMap.get(d.key);

    // Resolve threshold: site override → definition default
    let thresholdValue: number | null = null;
    for (const ck of d.configKeys) {
      if (siteThresholds[ck] != null) {
        thresholdValue = Number(siteThresholds[ck]);
        break;
      }
    }
    if (thresholdValue === null && d.defaultThreshold != null) {
      thresholdValue = d.defaultThreshold;
    }

    return {
      anomalyKey: d.key,
      displayName: d.displayName,
      status: eventInfo?.status || "unknown",
      lastTriggered: eventInfo?.lastTriggered || null,
      thresholdValue,
      thresholdUnit: d.unit || "",
      thresholdDirection: d.thresholdDirection,
    };
  });
}
