"use client";

import { useState } from "react";
import type { AnomalyTimelineEvent } from "@/lib/anomalies/get-anomaly-event-timeline";

interface Props {
  events: AnomalyTimelineEvent[];
  isLoading: boolean;
  anomalyDisplayName: string;
}

type DisplayRow = {
  type: "single" | "group";
  eventType: AnomalyTimelineEvent["eventType"];
  timestamp: string;
  observedValue?: number;
  unit?: string;
  actor?: string;
  note?: string;
  groupCount?: number;
};

function groupRapidCycles(events: AnomalyTimelineEvent[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  const TWO_MIN_MS = 2 * 60 * 1000;
  let i = 0;

  while (i < events.length) {
    const current = events[i];

    // Check for rapid trigger/clear cycling
    if (current.eventType === "triggered") {
      // Look ahead for tightly clustered triggered events
      const groupStart = new Date(current.timestamp).getTime();
      let triggerCount = 1;
      let j = i + 1;

      while (j < events.length) {
        const next = events[j];
        const nextTime = new Date(next.timestamp).getTime();
        // Events are DESC sorted, so groupStart >= nextTime
        if (groupStart - nextTime > TWO_MIN_MS) break;
        if (next.eventType === "triggered") triggerCount++;
        j++;
      }

      if (triggerCount >= 2) {
        // Collapse into a group row
        rows.push({
          type: "group",
          eventType: "triggered",
          timestamp: current.timestamp,
          observedValue: current.observedValue,
          unit: current.unit,
          groupCount: triggerCount,
        });
        i = j;
        continue;
      }
    }

    // Regular single row
    rows.push({
      type: "single",
      eventType: current.eventType,
      timestamp: current.timestamp,
      observedValue: current.observedValue,
      unit: current.unit,
      actor: current.actor,
      note: current.note,
    });
    i++;
  }

  return rows;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.getFullYear() !== now.getFullYear()) {
    return `${month} ${day} '${String(d.getFullYear()).slice(2)}, ${time}`;
  }
  return `${month} ${day}, ${time}`;
}

const EVENT_LABELS: Record<string, string> = {
  triggered: "Triggered",
  cleared: "Cleared",
  reset: "Measurement reset",
  other: "Event",
};

const ICON_STYLES: Record<string, string> = {
  triggered: "bg-[#E24B4A]",
  cleared: "bg-[#639922]",
  reset: "",
  other: "bg-gray-400",
};

const PAGE_SIZE = 10;

export default function AnomalyEventTimeline({ events, isLoading, anomalyDisplayName }: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-7 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-gray-400 text-center py-4">
        No events recorded for {anomalyDisplayName}
      </p>
    );
  }

  const rows = groupRapidCycles(events);
  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = rows.length > visibleCount;

  return (
    <div>
      <div className="space-y-0.5">
        {visibleRows.map((row, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5 px-1 text-xs">
            {/* Icon */}
            <div className="w-4 shrink-0 flex justify-center">
              {row.type === "group" ? (
                <span className="text-amber-500 text-sm leading-none" title="Rapid cycle group">&#9889;</span>
              ) : row.eventType === "reset" ? (
                <span className="text-gray-400 text-sm leading-none" title="Measurement reset">&#8634;</span>
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full ${ICON_STYLES[row.eventType]}`} />
              )}
            </div>
            {/* Timestamp */}
            <span className="text-gray-500 w-32 shrink-0 tabular-nums">
              {formatTimestamp(row.timestamp)}
            </span>
            {/* Label */}
            <span className={`flex-1 min-w-0 ${row.eventType === "triggered" ? "text-gray-700 font-medium" : "text-gray-500"}`}>
              {row.type === "group"
                ? `Rapid cycle (${row.groupCount}\u00D7)`
                : row.note || EVENT_LABELS[row.eventType] || "Event"
              }
            </span>
            {/* Value */}
            <span className="text-gray-600 font-mono shrink-0">
              {row.observedValue != null ? `${row.observedValue}${row.unit || ""}` : ""}
            </span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="text-xs text-green-600 hover:underline mt-2 ml-1"
        >
          Show more ({rows.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}
