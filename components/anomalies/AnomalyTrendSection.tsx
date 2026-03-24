"use client";

import { useState } from "react";

interface Props {
  anomalyKey: string;
  chartConfig: { series: string[]; defaultRange: "1h" | "6h" | "24h" | "7d" };
  siteId: string;
  equipmentId: string | null;
  zoneId: string | null;
}

const RANGES = ["1h", "6h", "24h", "7d"] as const;

// TODO: Wire to real telemetry query when chart data layer is ready.
// This is a structured placeholder so upgrading is a single component swap.

export default function AnomalyTrendSection({ chartConfig }: Props) {
  const [range, setRange] = useState<string>(chartConfig.defaultRange);

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
      <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <div className="text-center">
          <p className="text-sm text-gray-400 mb-2">Chart placeholder — {range} range</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {chartConfig.series.map((s) => (
              <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
