import { getAnomalyDetailViewModel } from "@/lib/anomalies/get-anomaly-detail-view-model";
import { getAnomalySidebarStatus } from "@/lib/anomalies/get-anomaly-sidebar-status";
import AnomalyDetailLayout from "@/components/anomalies/AnomalyDetailLayout";
import Link from "next/link";

export default async function AnomalyDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ siteid: string; anomalyKey: string }>;
  searchParams: Promise<{ equipmentId?: string; zoneId?: string; date?: string; alertId?: string; tab?: string }>;
}) {
  const { siteid, anomalyKey } = await params;
  const query = await searchParams;

  const [viewModel, sidebarItems] = await Promise.all([
    getAnomalyDetailViewModel({
      siteId: siteid,
      anomalyKey,
      equipmentId: query.equipmentId,
      zoneId: query.zoneId,
      date: query.date,
    }),
    getAnomalySidebarStatus(siteid),
  ]);

  if (!viewModel) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-bold mb-2">Anomaly Not Found</h1>
        <p className="text-gray-500 mb-6">
          No anomaly definition exists for key &ldquo;{anomalyKey}&rdquo;.
        </p>
        <Link
          href={`/sites/${siteid}?tab=space-hvac`}
          className="text-green-600 hover:underline text-sm"
        >
          Back to Space & HVAC
        </Link>
      </div>
    );
  }

  return (
    <AnomalyDetailLayout
      viewModel={viewModel}
      sidebarItems={sidebarItems}
      currentTab={query.tab}
    />
  );
}
