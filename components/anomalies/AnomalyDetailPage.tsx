"use client";

import type { AnomalyDetailViewModel } from "@/lib/anomalies/get-anomaly-detail-view-model";
import AnomalyHeader from "./AnomalyHeader";
import AnomalySummaryCards from "./AnomalySummaryCards";
import AnomalyMathCard from "./AnomalyMathCard";
import AnomalyTrendSection from "./AnomalyTrendSection";
import AnomalyWhyItMatters from "./AnomalyWhyItMatters";
import AnomalyNextSteps from "./AnomalyNextSteps";
import AnomalyTechnicalLogicAccordion from "./AnomalyTechnicalLogicAccordion";

interface Props {
  viewModel: AnomalyDetailViewModel;
}

export default function AnomalyDetailPage({ viewModel }: Props) {
  const { definition, threshold, observedValue, status, lastTriggered, context, chartConfig } = viewModel;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <AnomalyHeader
        definition={definition}
        context={context}
        status={status}
        lastTriggered={lastTriggered}
      />
      <AnomalySummaryCards
        status={status}
        threshold={threshold}
        observedValue={observedValue}
        definition={definition}
      />
      <AnomalyMathCard
        definition={definition}
        observedValue={observedValue}
        threshold={threshold}
      />
      <AnomalyTrendSection
        anomalyKey={definition.key}
        chartConfig={chartConfig}
        siteId={context.siteId}
        equipmentId={context.equipmentId}
        zoneId={context.zoneId}
      />
      <AnomalyWhyItMatters whyItMatters={definition.whyItMatters} />
      <AnomalyNextSteps nextSteps={definition.nextSteps} />
      <AnomalyTechnicalLogicAccordion
        technicalNotes={definition.technicalNotes}
        definition={definition}
      />
    </div>
  );
}
