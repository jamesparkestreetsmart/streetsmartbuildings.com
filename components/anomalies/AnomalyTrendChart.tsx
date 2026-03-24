"use client";

// Real telemetry chart using Recharts + b_zone_setpoint_log data.
// Wired for: coil-freeze, filter-restriction-dt, refrigerant-low-dt, compressor-current-threshold.
// Other anomalies use a structured placeholder.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";

interface Series {
  name: string;
  data: { t: number; v: number }[];
}

interface Props {
  anomalyKey: string;
  siteId: string;
  zoneId: string | null;
  threshold?: { value: number; label: string } | null;
  range: string;
  chartSeries: string[];
}

// Map anomaly chart series names to b_zone_setpoint_log columns
const COLUMN_MAP: Record<string, string> = {
  supply_temp: "supply_temp_f",
  zone_temp: "zone_temp_f",
  compressor_current: "compressor_current_a",
  delta_t: "delta_t",
};

// Anomalies that have real telemetry data wired
const WIRED_ANOMALIES = new Set([
  "coil-freeze",
  "filter-restriction-dt",
  "refrigerant-low-dt",
  "compressor-current-threshold",
]);

const RANGE_HOURS: Record<string, number> = {
  "1h": 1, "6h": 6, "24h": 24, "7d": 168,
};

const SERIES_COLORS = ["#639922", "#2563eb", "#e24b4a", "#d97706", "#7c3aed"];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function AnomalyTrendChart({ anomalyKey, siteId, zoneId, threshold, range, chartSeries }: Props) {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);

  const isWired = WIRED_ANOMALIES.has(anomalyKey);

  useEffect(() => {
    if (!isWired || !zoneId) return;

    const fetchData = async () => {
      setLoading(true);
      const hours = RANGE_HOURS[range] || 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      // Determine which DB columns we need
      const neededColumns = chartSeries
        .filter((s) => COLUMN_MAP[s])
        .map((s) => COLUMN_MAP[s]);

      if (neededColumns.length === 0) { setLoading(false); return; }

      const selectCols = ["logged_at", ...neededColumns].join(", ");

      const { data, error } = await supabase
        .from("b_zone_setpoint_log")
        .select(selectCols)
        .eq("hvac_zone_id", zoneId)
        .gte("logged_at", since)
        .order("logged_at", { ascending: true })
        .limit(500);

      if (error || !data) {
        console.error("Chart data fetch error:", error);
        setSeries([]);
        setLoading(false);
        return;
      }

      // Build series from fetched data
      const result: Series[] = chartSeries
        .filter((s) => COLUMN_MAP[s])
        .map((seriesName) => {
          const col = COLUMN_MAP[seriesName];
          return {
            name: seriesName,
            data: data
              .filter((row: any) => row[col] != null)
              .map((row: any) => ({
                t: new Date(row.logged_at).getTime(),
                v: Number(row[col]),
              })),
          };
        })
        .filter((s) => s.data.length > 0);

      setSeries(result);
      setLoading(false);
    };

    fetchData();
  }, [anomalyKey, siteId, zoneId, range, isWired, chartSeries]);

  // Placeholder for unwired anomalies
  if (!isWired) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <div className="text-center">
          <p className="text-sm text-gray-400 mb-2">Chart data not yet wired for this anomaly</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {chartSeries.map((s) => (
              <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">{s}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-48 bg-gray-50 rounded-lg animate-pulse flex items-center justify-center">
        <p className="text-xs text-gray-400">Loading chart data...</p>
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <p className="text-sm text-gray-400">No telemetry data found for the selected range</p>
      </div>
    );
  }

  // Merge all series into unified data points by timestamp
  const allTimestamps = new Set<number>();
  for (const s of series) for (const d of s.data) allTimestamps.add(d.t);
  const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

  const chartData = sortedTimestamps.map((t) => {
    const point: Record<string, any> = { t };
    for (const s of series) {
      const match = s.data.find((d) => d.t === t);
      if (match) point[s.name] = match.v;
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="t"
          tickFormatter={formatTime}
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={{ fontSize: 10 }}
        />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          labelFormatter={(v) => new Date(v as number).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          contentStyle={{ fontSize: 11 }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            dot={false}
            strokeWidth={1.5}
          />
        ))}
        {threshold && threshold.value != null && (
          <ReferenceLine
            y={threshold.value}
            stroke="#e24b4a"
            strokeDasharray="5 3"
            label={{ value: threshold.label, position: "right", fontSize: 10, fill: "#e24b4a" }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
