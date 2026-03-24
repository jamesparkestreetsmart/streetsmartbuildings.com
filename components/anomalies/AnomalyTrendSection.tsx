"use client";

import { useState } from "react";
import AnomalyTrendChart from "./AnomalyTrendChart";

interface Props {
  anomalyKey: string;
  chartConfig: { series: string[]; defaultRange: "1h" | "6h" | "24h" | "7d" };
  siteId: string;
  equipmentId: string | null;
  zoneId: string | null;
  threshold?: { value: number | null; unit: string } | null;
}

const RANGES = ["1h", "6h", "24h", "7d"] as const;

export default function AnomalyTrendSection({ anomalyKey, chartConfig, siteId, zoneId, threshold }: Props) {
  const [range, setRange] = useState<string>(chartConfig.defaultRange);

  const thresholdLine = threshold?.value != null
    ? { value: threshold.value, label: `Threshold: ${threshold.value}${threshold.unit || ""}` }
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-600">Trend</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs rounded ${
                range === r
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <AnomalyTrendChart
        anomalyKey={anomalyKey}
        siteId={siteId}
        zoneId={zoneId}
        threshold={thresholdLine}
        range={range}
        chartSeries={chartConfig.series}
      />
    </div>
  );
}
