// Timeline query: merges b_anomaly_events (triggered/cleared) with
// b_records_log reset markers into a unified chronological timeline.

import { createClient } from "@supabase/supabase-js";
import { resolveAnomalyDefinition } from "./anomaly-definitions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type AnomalyTimelineEvent = {
  id: string;
  eventType: "triggered" | "cleared" | "reset" | "other";
  timestamp: string;
  observedValue?: number;
  unit?: string;
  actor?: string;
  note?: string;
};

export async function getAnomalyEventTimeline(params: {
  siteId: string;
  anomalyKey: string;
  equipmentId?: string;
  zoneId?: string;
  limit?: number;
}): Promise<AnomalyTimelineEvent[]> {
  const { siteId, anomalyKey, equipmentId, zoneId, limit = 50 } = params;

  const definition = resolveAnomalyDefinition(anomalyKey);
  if (!definition) return [];

  const configKeys = definition.configKeys;

  try {
    // Parallel fetch: anomaly events + reset markers
    const [eventsRes, resetsRes] = await Promise.all([
      // 1. b_anomaly_events — triggered/cleared events
      supabase
        .from("b_anomaly_events")
        .select("id, anomaly_type, started_at, ended_at, peak_value, peak_value_unit, severity, equipment_id, hvac_zone_id")
        .eq("site_id", siteId)
        .in("anomaly_type", configKeys)
        .order("started_at", { ascending: false })
        .limit(limit),
      // 2. b_records_log — window reset markers
      supabase
        .from("b_records_log")
        .select("id, event_type, created_at, message, metadata, created_by")
        .eq("site_id", siteId)
        .eq("event_type", "anomaly_window_reset")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const timeline: AnomalyTimelineEvent[] = [];

    // Process anomaly events — each event produces 1 "triggered" + optional "cleared"
    for (const event of eventsRes.data || []) {
      timeline.push({
        id: `evt-${event.id}-triggered`,
        eventType: "triggered",
        timestamp: event.started_at,
        observedValue: event.peak_value != null ? Number(event.peak_value) : undefined,
        unit: event.peak_value_unit || definition.unit || undefined,
      });

      if (event.ended_at) {
        timeline.push({
          id: `evt-${event.id}-cleared`,
          eventType: "cleared",
          timestamp: event.ended_at,
        });
      }
    }

    // Process reset markers — filter to matching anomaly key
    for (const reset of resetsRes.data || []) {
      const meta = reset.metadata || {};
      if (meta.anomaly_key && !configKeys.includes(meta.anomaly_key)) continue;
      timeline.push({
        id: `reset-${reset.id}`,
        eventType: "reset",
        timestamp: meta.t_reset || reset.created_at,
        actor: reset.created_by || undefined,
        note: "Measurement reset",
      });
    }

    // Sort descending by timestamp
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return timeline.slice(0, limit);
  } catch (err) {
    console.error("[anomaly-timeline] Query error:", err);
    return [];
  }
}
