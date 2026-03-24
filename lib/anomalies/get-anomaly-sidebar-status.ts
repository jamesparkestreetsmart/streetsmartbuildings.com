// Lightweight batch query for sidebar status dots.
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
};

export async function getAnomalySidebarStatus(siteId: string): Promise<AnomalySidebarItem[]> {
  const definitions = getAllAnomalyDefinitions();

  // Collect all event type keys we care about
  const allEventKeys = definitions.flatMap((d) => d.configKeys);

  // Single batch query: most recent event per anomaly_type in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from("b_anomaly_events")
    .select("anomaly_type, ended_at, started_at")
    .eq("site_id", siteId)
    .in("anomaly_type", allEventKeys)
    .gte("started_at", sevenDaysAgo)
    .order("started_at", { ascending: false });

  // Build status map: for each anomaly type, find the most recent event
  const statusMap = new Map<string, "active" | "cleared">();
  for (const event of events || []) {
    const def = resolveAnomalyDefinition(event.anomaly_type);
    if (!def) continue;
    if (statusMap.has(def.key)) continue; // already have more recent
    statusMap.set(def.key, event.ended_at ? "cleared" : "active");
  }

  return definitions.map((d) => ({
    anomalyKey: d.key,
    displayName: d.displayName,
    status: statusMap.get(d.key) || "unknown",
  }));
}
