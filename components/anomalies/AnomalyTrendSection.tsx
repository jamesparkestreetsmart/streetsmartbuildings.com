"use client";

import { useState, useEffect } from "react";
import AnomalyTrendChart from "./AnomalyTrendChart";
import AnomalyEventTimeline from "./AnomalyEventTimeline";
import { getAnomalyDefinition } from "@/lib/anomalies/anomaly-definitions";
import type { AnomalyTimelineEvent } from "@/lib/anomalies/get-anomaly-event-timeline";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  anomalyKey: string;
  chartConfig: { series: string[]; defaultRange: "1h" | "6h" | "24h" | "7d" };
  siteId: string;
  equipmentId: string | null;
  zoneId: string | null;
  threshold?: { value: number | null; unit: string } | null;
}

const RANGES = ["1h", "6h", "24h", "7d"] as const;

export default function AnomalyTrendSection({ anomalyKey, chartConfig, siteId, zoneId, threshold }: Props) {
  const [range, setRange] = useState<string>(chartConfig.defaultRange);
  const [timelineEvents, setTimelineEvents] = useState<AnomalyTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  const definition = getAnomalyDefinition(anomalyKey);
  const displayName = definition?.displayName || anomalyKey;

  const thresholdLine = threshold?.value != null
    ? { value: threshold.value, label: `Threshold: ${threshold.value}${threshold.unit || ""}` }
    : null;

  // Fetch timeline events client-side (non-blocking, loads after chart)
  useEffect(() => {
    const fetchTimeline = async () => {
      setTimelineLoading(true);
      const configKeys = definition?.configKeys || [];
      if (configKeys.length === 0) { setTimelineLoading(false); return; }

      try {
        // Parallel fetch: anomaly events + reset markers
        const [eventsRes, resetsRes] = await Promise.all([
          supabase
            .from("b_anomaly_events")
            .select("id, anomaly_type, started_at, ended_at, peak_value, peak_value_unit")
            .eq("site_id", siteId)
            .in("anomaly_type", configKeys)
            .order("started_at", { ascending: false })
            .limit(50),
          supabase
            .from("b_records_log")
            .select("id, event_type, created_at, message, metadata, created_by")
            .eq("site_id", siteId)
            .eq("event_type", "anomaly_window_reset")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        const timeline: AnomalyTimelineEvent[] = [];

        for (const event of eventsRes.data || []) {
          timeline.push({
            id: `evt-${event.id}-triggered`,
            eventType: "triggered",
            timestamp: event.started_at,
            observedValue: event.peak_value != null ? Number(event.peak_value) : undefined,
            unit: event.peak_value_unit || definition?.unit || undefined,
          });
          if (event.ended_at) {
            timeline.push({
              id: `evt-${event.id}-cleared`,
              eventType: "cleared",
              timestamp: event.ended_at,
            });
          }
        }

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

        timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTimelineEvents(timeline);
      } catch (err) {
        console.error("[anomaly-timeline] Query error:", err);
        setTimelineEvents([]);
      } finally {
        setTimelineLoading(false);
      }
    };

    fetchTimeline();
  }, [anomalyKey, siteId, definition]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-600">Trend</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs rounded ${
                range === r
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <AnomalyTrendChart
        anomalyKey={anomalyKey}
        siteId={siteId}
        zoneId={zoneId}
        threshold={thresholdLine}
        range={range}
        chartSeries={chartConfig.series}
      />

      {/* Event history timeline */}
      <div className="mt-5 pt-4 border-t">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">Event history</p>
        <AnomalyEventTimeline
          events={timelineEvents}
          isLoading={timelineLoading}
          anomalyDisplayName={displayName}
        />
      </div>
    </div>
  );
}
