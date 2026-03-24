import Link from "next/link";
import type { AnomalySidebarItem } from "@/lib/anomalies/get-anomaly-sidebar-status";

interface Props {
  siteId: string;
  currentAnomalyKey: string;
  items: AnomalySidebarItem[];
  currentTab?: string;
}

const DOT_COLORS: Record<string, string> = {
  active: "bg-[#E24B4A]",
  cleared: "bg-[#639922]",
  unknown: "bg-gray-300",
};

function formatLastTriggered(ts: string | null, status: string): string {
  if (status === "active") return "Active now";
  if (!ts) return "No recent event";
  const d = new Date(ts);
  const now = new Date();
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() !== now.getFullYear()) {
    return `Last: ${month} ${day} '${String(d.getFullYear()).slice(2)}`;
  }
  return `Last: ${month} ${day}`;
}

function directionIndicator(direction: "above" | "below"): string {
  return direction === "below" ? "<" : ">";
}

export default function AnomalySidebar({ siteId, currentAnomalyKey, items, currentTab }: Props) {
  const tabParam = currentTab && currentTab !== "how-flagged" ? `?tab=${currentTab}` : "";

  return (
    <div className="w-48 shrink-0 border-r bg-gray-50/50 flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-4 pb-2">
        <Link
          href={`/sites/${siteId}?tab=space-hvac`}
          className="text-xs text-green-600 hover:underline"
        >
          &larr; Space & HVAC
        </Link>
        <p className="text-xs font-semibold text-gray-500 mt-3 mb-1 uppercase tracking-wide">Anomalies</p>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-1 pb-4">
        {items.map((item) => {
          const isActive = item.anomalyKey === currentAnomalyKey;
          const dir = directionIndicator(item.thresholdDirection);
          const thresholdStr = item.thresholdValue != null
            ? `${dir} ${item.thresholdValue}${item.thresholdUnit}`
            : "";
          const lastStr = formatLastTriggered(item.lastTriggered, item.status);

          return (
            <Link
              key={item.anomalyKey}
              href={`/sites/${siteId}/anomalies/${item.anomalyKey}${tabParam}`}
              className={`block px-3 py-2 rounded-md transition-colors ${
                isActive
                  ? "bg-white border-l-2 border-l-[#639922] shadow-sm"
                  : "hover:bg-white"
              }`}
            >
              {/* Line 1: name + dot */}
              <div className="flex items-center justify-between">
                <span className={`text-xs truncate ${isActive ? "font-medium text-gray-900" : "text-gray-600"}`}>
                  {item.displayName}
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ml-2 ${DOT_COLORS[item.status]}`} />
              </div>
              {/* Line 2: threshold + last event */}
              <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                {thresholdStr}
                {thresholdStr && " · "}
                <span className={item.status === "active" ? "text-red-500 font-medium" : ""}>
                  {lastStr}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
