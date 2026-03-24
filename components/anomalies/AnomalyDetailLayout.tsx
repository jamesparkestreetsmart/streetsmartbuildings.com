"use client";

import type { AnomalyDetailViewModel } from "@/lib/anomalies/get-anomaly-detail-view-model";
import type { AnomalySidebarItem } from "@/lib/anomalies/get-anomaly-sidebar-status";
import { AnomalyResetProvider } from "./AnomalyResetContext";
import AnomalySidebar from "./AnomalySidebar";
import AnomalyDetailPage from "./AnomalyDetailPage";

interface Props {
  viewModel: AnomalyDetailViewModel;
  sidebarItems: AnomalySidebarItem[];
  currentTab?: string;
}

export default function AnomalyDetailLayout({ viewModel, sidebarItems, currentTab }: Props) {
  return (
    <AnomalyResetProvider siteId={viewModel.context.siteId}>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        <AnomalySidebar
          siteId={viewModel.context.siteId}
          currentAnomalyKey={viewModel.definition.key}
          items={sidebarItems}
          currentTab={currentTab}
        />
        <div className="flex-1 min-w-0 overflow-hidden">
          <AnomalyDetailPage viewModel={viewModel} />
        </div>
      </div>
    </AnomalyResetProvider>
  );
}
