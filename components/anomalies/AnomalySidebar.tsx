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
          return (
            <Link
              key={item.anomalyKey}
              href={`/sites/${siteId}/anomalies/${item.anomalyKey}${tabParam}`}
              className={`flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors ${
                isActive
                  ? "bg-white border-l-2 border-l-[#639922] font-medium text-gray-900 shadow-sm"
                  : "text-gray-600 hover:bg-white hover:text-gray-900"
              }`}
            >
              <span className="truncate">{item.displayName}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ml-2 ${DOT_COLORS[item.status]}`} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
