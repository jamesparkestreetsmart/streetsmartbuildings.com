import Link from "next/link";
import type { AnomalyDefinition } from "@/lib/anomalies/anomaly-definitions";

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
  return (
    <div>
      <Link
        href={`/sites/${context.siteId}?tab=space-hvac`}
        className="text-xs text-green-600 hover:underline mb-2 inline-block"
      >
        &larr; Space & HVAC
      </Link>
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
        <span className={`px-2 py-1 rounded font-medium ${STATUS_STYLES[status]}`}>
          {status === "unknown" ? "No Recent Events" : status.charAt(0).toUpperCase() + status.slice(1)}
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
