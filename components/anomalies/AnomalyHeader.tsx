"use client";

import type { AnomalyDefinition } from "@/lib/anomalies/anomaly-definitions";
import { useAnomalyReset } from "./AnomalyResetContext";

interface Props {
  definition: AnomalyDefinition;
  context: {
    siteId: string;
    siteName: string | null;
    equipmentId: string | null;
    equipmentName: string | null;
    zoneId: string | null;
    zoneName: string | null;
  };
  status: "active" | "cleared" | "historical" | "unknown";
  lastTriggered: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-red-100 text-red-700",
  cleared: "bg-green-100 text-green-700",
  resetting: "bg-amber-100 text-amber-700",
  waiting: "bg-gray-100 text-gray-500",
  historical: "bg-gray-100 text-gray-600",
  unknown: "bg-gray-100 text-gray-500",
};

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function AnomalyHeader({ definition, context, status, lastTriggered }: Props) {
  const { getResetState } = useAnomalyReset();
  const resetState = getResetState(definition.key);

  // Override display status with reset state
  let displayStatus = status;
  let statusLabel = status === "unknown" ? "No Recent Events" : status.charAt(0).toUpperCase() + status.slice(1);

  if (resetState === "resetting") {
    displayStatus = "resetting" as any;
    statusLabel = "Restarting...";
  } else if (resetState === "waiting") {
    displayStatus = "waiting" as any;
    statusLabel = "Waiting for next detection cycle";
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{definition.displayName}</h1>
      <p className="text-sm text-gray-500 mb-3">{definition.shortDescription}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {context.siteName && (
          <span className="px-2 py-1 rounded bg-gray-100 text-gray-600">{context.siteName}</span>
        )}
        {context.equipmentName && (
          <span className="px-2 py-1 rounded bg-gray-100 text-gray-600">{context.equipmentName}</span>
        )}
        {context.zoneName && (
          <span className="px-2 py-1 rounded bg-gray-100 text-gray-600">{context.zoneName}</span>
        )}
        <span className={`px-2 py-1 rounded font-medium ${STATUS_STYLES[displayStatus] || STATUS_STYLES.unknown}`}>
          {statusLabel}
        </span>
        {lastTriggered && (
          <span className="px-2 py-1 rounded bg-gray-50 text-gray-500">
            Last detected: {formatTimestamp(lastTriggered)}
          </span>
        )}
      </div>
    </div>
  );
}
