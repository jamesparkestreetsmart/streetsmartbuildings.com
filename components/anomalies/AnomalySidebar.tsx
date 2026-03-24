"use client";

import Link from "next/link";
import type { AnomalySidebarItem } from "@/lib/anomalies/get-anomaly-sidebar-status";
import { useAnomalyReset } from "./AnomalyResetContext";

interface Props {
  siteId: string;
  currentAnomalyKey: string;
  items: AnomalySidebarItem[];
  currentTab?: string;
}

const DOT_COLORS: Record<string, string> = {
  active: "bg-[#E24B4A]",
  cleared: "bg-[#639922]",
  resetting: "bg-[#BA7517]",
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
  const { getResetState } = useAnomalyReset();

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
          const isSelected = item.anomalyKey === currentAnomalyKey;
          const resetState = getResetState(item.anomalyKey);
          const dir = directionIndicator(item.thresholdDirection);
          const thresholdStr = item.thresholdValue != null
            ? `${dir} ${item.thresholdValue}${item.thresholdUnit}`
            : "";

          // Determine effective visual state, with reset overrides
          let effectiveStatus = item.status;
          let line2Text = formatLastTriggered(item.lastTriggered, item.status);
          let line2Color = item.status === "active" ? "text-red-500 font-medium" : "";
          let dotColor = DOT_COLORS[item.status] || DOT_COLORS.unknown;

          if (resetState === "resetting") {
            effectiveStatus = "active"; // keep amber background
            dotColor = DOT_COLORS.resetting;
            line2Text = "Restarting...";
            line2Color = "text-amber-600 font-medium";
          } else if (resetState === "waiting") {
            effectiveStatus = "unknown"; // neutral background
            dotColor = DOT_COLORS.unknown;
            line2Text = "Waiting for next cycle";
            line2Color = "text-gray-400";
          }

          // Row background: Amber 50 for active/resetting, Green 50 for cleared, transparent for neutral
          // TODO: show "Not yet active" for dormant anomalies once detectionStatus is reliably available
          const rowBg = effectiveStatus === "active" ? "bg-[#FAEEDA]"
            : effectiveStatus === "cleared" ? "bg-[#EAF3DE]"
            : "";

          return (
            <Link
              key={item.anomalyKey}
              href={`/sites/${siteId}/anomalies/${item.anomalyKey}${tabParam}`}
              className={`block px-3 py-2 rounded-md transition-colors ${rowBg} ${
                isSelected
                  ? "border-l-2 border-l-[#639922] shadow-sm"
                  : rowBg ? "" : "hover:bg-white"
              }`}
            >
              {/* Line 1: name + dot */}
              <div className="flex items-center justify-between">
                <span className={`text-xs truncate ${isSelected ? "font-medium text-gray-900" : "text-gray-600"}`}>
                  {item.displayName}
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ml-2 ${dotColor}`} />
              </div>
              {/* Line 2: threshold + last event / reset state */}
              <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                {thresholdStr}
                {thresholdStr && " · "}
                <span className={line2Color}>{line2Text}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
