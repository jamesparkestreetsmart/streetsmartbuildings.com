"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type ChartMode = "line" | "candlestick" | "area";

interface PriceRow {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
}

interface ChartRow extends PriceRow {
  ts: number;
  candleBody: [number, number];
  candleWick: [number, number];
  bullish: boolean;
}

function fmtPrice(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVol(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

function downsample<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const sampled = data.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled.push(data[data.length - 1]);
  }
  return sampled;
}

export default function PriceChart({
  data,
  mode,
}: {
  data: PriceRow[];
  mode: ChartMode;
}) {
  const chartData = useMemo(() => {
    const withTs = data.map((d) => ({
      ...d,
      ts: new Date(d.trade_date + "T00:00:00").getTime(),
      candleBody: [Math.min(d.open, d.close), Math.max(d.open, d.close)] as [number, number],
      candleWick: [d.low, d.high] as [number, number],
      bullish: d.close >= d.open,
    }));
    return downsample(withTs, 2000);
  }, [data]);

  const totalPoints = chartData.length;

  // Compute span in years for tick formatting
  const spanYears = useMemo(() => {
    if (chartData.length < 2) return 0;
    return (chartData[chartData.length - 1].ts - chartData[0].ts) / (1000 * 60 * 60 * 24 * 365);
  }, [chartData]);

  // Compute Y domain with padding
  const [yMin, yMax] = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    let lo = Infinity, hi = -Infinity;
    for (const d of chartData) {
      if (mode === "candlestick") {
        if (d.low < lo) lo = d.low;
        if (d.high > hi) hi = d.high;
      } else {
        if (d.adj_close < lo) lo = d.adj_close;
        if (d.adj_close > hi) hi = d.adj_close;
      }
    }
    const pad = (hi - lo) * 0.05;
    return [Math.max(0, lo - pad), hi + pad];
  }, [chartData, mode]);

  if (chartData.length === 0) {
    return (
      <div className="h-[400px] border rounded-lg bg-white flex items-center justify-center text-sm text-gray-400">
        No price data available for this range.
      </div>
    );
  }

  const tickFormatter = (ts: number) => {
    const d = new Date(ts);
    if (spanYears > 10) return d.getFullYear().toString();
    if (spanYears > 1) return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const tooltipLabelFormatter = (ts: number) =>
    new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="space-y-0">
      {/* Price chart */}
      <div className="border rounded-t-lg bg-white p-2">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickFormatter}
              tickCount={8}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v) => fmtPrice(v)}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              labelFormatter={tooltipLabelFormatter}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload as ChartRow;
                return (
                  <div className="bg-white border rounded-lg shadow-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-gray-800">{tooltipLabelFormatter(d.ts)}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                      <span>Open:</span><span className="text-right font-mono">{fmtPrice(d.open)}</span>
                      <span>High:</span><span className="text-right font-mono">{fmtPrice(d.high)}</span>
                      <span>Low:</span><span className="text-right font-mono">{fmtPrice(d.low)}</span>
                      <span>Close:</span><span className="text-right font-mono">{fmtPrice(d.close)}</span>
                      <span>Adj Close:</span><span className="text-right font-mono">{fmtPrice(d.adj_close)}</span>
                      <span>Volume:</span><span className="text-right font-mono">{fmtVol(d.volume)}</span>
                    </div>
                  </div>
                );
              }}
            />
            {mode === "line" && (
              <Line
                type="monotone"
                dataKey="adj_close"
                stroke="#16a34a"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            )}
            {mode === "area" && (
              <Area
                type="monotone"
                dataKey="adj_close"
                stroke="#16a34a"
                fill="#dcfce7"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {mode === "candlestick" && (
              <>
                <Bar
                  dataKey="candleWick"
                  barSize={1}
                  isAnimationActive={false}
                  shape={(props: any) => {
                    const { x, y, width, height, payload } = props;
                    const color = payload.bullish ? "#16a34a" : "#ef4444";
                    return <rect x={x + width / 2 - 0.5} y={y} width={1} height={height} fill={color} />;
                  }}
                />
                <Bar
                  dataKey="candleBody"
                  barSize={Math.max(1, Math.min(8, Math.floor(800 / totalPoints)))}
                  isAnimationActive={false}
                  shape={(props: any) => {
                    const { x, y, width, height, payload } = props;
                    const color = payload.bullish ? "#16a34a" : "#ef4444";
                    return <rect x={x} y={y} width={width} height={Math.max(1, height)} fill={color} />;
                  }}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume chart */}
      <div className="border border-t-0 rounded-b-lg bg-white p-2">
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
            <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
            <YAxis
              tickFormatter={fmtVol}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Bar
              dataKey="volume"
              isAnimationActive={false}
              barSize={Math.max(1, Math.min(4, Math.floor(800 / totalPoints)))}
              shape={(props: any) => {
                const { x, y, width, height, payload } = props;
                const color = payload.bullish ? "#22c55e" : "#ef4444";
                return <rect x={x} y={y} width={width} height={height} fill={color} opacity={0.7} />;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
