import type { AnomalyDefinition } from "@/lib/anomalies/anomaly-definitions";

interface Props {
  status: "active" | "cleared" | "historical" | "unknown";
  threshold: { value: number | null; unit: string; source: string };
  observedValue: { value: number | null; label: string; timestamp: string | null; isPlaceholder: boolean };
  definition: AnomalyDefinition;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function AnomalySummaryCards({ status, threshold, observedValue, definition }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Status */}
      <div className="border rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-1">Current Status</p>
        <p className="text-lg font-semibold capitalize">{status === "unknown" ? "No Recent Events" : status}</p>
        <p className="text-xs text-gray-400 mt-1">
          {observedValue.timestamp ? `Last: ${formatTimestamp(observedValue.timestamp)}` : "No recent events"}
        </p>
      </div>

      {/* Threshold */}
      <div className="border rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-1">{definition.thresholdLabel}</p>
        <p className="text-lg font-semibold font-mono">
          {threshold.value != null ? `${threshold.value}${threshold.unit}` : "Using default"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Source: <span className="font-medium text-gray-500">{threshold.source}</span>
        </p>
      </div>

      {/* Observed Value */}
      <div className="border rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-1">{definition.observedValueLabel}</p>
        <p className="text-lg font-semibold font-mono">
          {observedValue.value != null ? `${observedValue.value}${definition.unit || ""}` : "—"}
        </p>
        {observedValue.isPlaceholder && (
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">
            No recent event
          </span>
        )}
        {!observedValue.isPlaceholder && observedValue.timestamp && (
          <p className="text-xs text-gray-400 mt-1">{formatTimestamp(observedValue.timestamp)}</p>
        )}
      </div>

      {/* Recommended Action */}
      <div className="border rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-1">Recommended Action</p>
        <p className="text-sm text-gray-700 leading-snug">{definition.whyItMatters.recommendedAction}</p>
      </div>
    </div>
  );
}
