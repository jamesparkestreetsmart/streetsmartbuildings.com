"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { AnomalyDetailViewModel } from "@/lib/anomalies/get-anomaly-detail-view-model";
import AnomalyHeader from "./AnomalyHeader";
import AnomalySummaryCards from "./AnomalySummaryCards";
import AnomalyMathCard from "./AnomalyMathCard";
import AnomalyTrendSection from "./AnomalyTrendSection";
import AnomalyWhyItMatters from "./AnomalyWhyItMatters";
import AnomalyNextStepsPanel from "./AnomalyNextStepsPanel";
import AnomalyTechnicalDetails from "./AnomalyTechnicalDetails";

// Layout: two-zone compact layout with tabs.
// Height-constrained to viewport — no page-level scrollbar.
// Left panel: tab-switched content. Right panel: always-visible Next Steps.

const TABS = [
  { key: "how-flagged", label: "How We Flagged This" },
  { key: "trend", label: "Trend" },
  { key: "why-it-matters", label: "Why It Matters" },
  { key: "technical", label: "Technical Details" },
] as const;

type TabKey = typeof TABS[number]["key"];

const VALID_TABS = new Set<string>(TABS.map((t) => t.key));

interface Props {
  viewModel: AnomalyDetailViewModel;
}

export default function AnomalyDetailPage({ viewModel }: Props) {
  const { definition, threshold, observedValue, status, lastTriggered, context, chartConfig } = viewModel;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = VALID_TABS.has(searchParams.get("tab") || "") ? (searchParams.get("tab") as TabKey) : "how-flagged";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Sync tab from URL on mount
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && VALID_TABS.has(urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab as TabKey);
    }
  }, [searchParams]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header zone — fixed height */}
      <div className="shrink-0 px-4 pt-4 pb-2 max-w-5xl mx-auto w-full">
        <AnomalyHeader
          definition={definition}
          context={context}
          status={status}
          lastTriggered={lastTriggered}
        />
      </div>

      {/* Summary band — fixed height */}
      <div className="shrink-0 px-4 pb-3 max-w-5xl mx-auto w-full">
        <AnomalySummaryCards
          status={status}
          threshold={threshold}
          observedValue={observedValue}
          definition={definition}
        />
      </div>

      {/* Two-column zone — fills remaining height */}
      <div className="flex-1 min-h-0 px-4 pb-4 max-w-5xl mx-auto w-full">
        <div className="flex gap-4 h-full">
          {/* Left panel — tabs */}
          <div className="flex-1 min-w-0 flex flex-col h-full border rounded-xl overflow-hidden">
            {/* Tab bar */}
            <div className="shrink-0 flex border-b bg-gray-50/50">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                    activeTab === tab.key
                      ? "text-green-700 border-b-2 border-green-600 bg-white"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Tab body — scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              {activeTab === "how-flagged" && (
                <AnomalyMathCard
                  definition={definition}
                  observedValue={observedValue}
                  threshold={threshold}
                />
              )}
              {activeTab === "trend" && (
                <AnomalyTrendSection
                  anomalyKey={definition.key}
                  chartConfig={chartConfig}
                  siteId={context.siteId}
                  equipmentId={context.equipmentId}
                  zoneId={context.zoneId}
                  threshold={threshold}
                />
              )}
              {activeTab === "why-it-matters" && (
                <AnomalyWhyItMatters whyItMatters={definition.whyItMatters} />
              )}
              {activeTab === "technical" && (
                <AnomalyTechnicalDetails
                  technicalNotes={definition.technicalNotes}
                  definition={definition}
                />
              )}
            </div>
          </div>

          {/* Right panel — always visible, fixed width */}
          <div className="w-[300px] shrink-0 h-full">
            <AnomalyNextStepsPanel nextSteps={definition.nextSteps} />
          </div>
        </div>
      </div>
    </div>
  );
}
