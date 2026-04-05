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

function fmtPrice(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVol(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

function fmtDate(dateStr: string, totalDays: number) {
  const d = new Date(dateStr + "T00:00:00");
  if (totalDays > 365 * 5) return d.getFullYear().toString();
  if (totalDays > 365) return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PriceChart({
  data,
  mode,
}: {
  data: PriceRow[];
  mode: ChartMode;
}) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      // For candlestick rendering with recharts, we use a bar with [low, high] and color by direction
      candleBody: [Math.min(d.open, d.close), Math.max(d.open, d.close)] as [number, number],
      candleWick: [d.low, d.high] as [number, number],
      bullish: d.close >= d.open,
      volColor: d.close >= d.open ? "#22c55e" : "#ef4444",
    }));
  }, [data]);

  const totalDays = data.length;

  // Compute Y domain with padding
  const [yMin, yMax] = useMemo(() => {
    if (data.length === 0) return [0, 100];
    let lo = Infinity, hi = -Infinity;
    for (const d of data) {
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
  }, [data, mode]);

  // Downsample tick labels to avoid overlap
  const tickInterval = useMemo(() => {
    if (totalDays <= 60) return 0; // show all
    return Math.floor(totalDays / 12);
  }, [totalDays]);

  if (data.length === 0) {
    return (
      <div className="h-[400px] border rounded-lg bg-white flex items-center justify-center text-sm text-gray-400">
        No price data available for this range.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Price chart */}
      <div className="border rounded-t-lg bg-white p-2">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="trade_date"
              tickFormatter={(v) => fmtDate(v, totalDays)}
              interval={tickInterval}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
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
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload as PriceRow;
                return (
                  <div className="bg-white border rounded-lg shadow-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-gray-800">{d.trade_date}</p>
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
                {/* Wick (high-low range) as thin bar */}
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
                {/* Body (open-close range) */}
                <Bar
                  dataKey="candleBody"
                  barSize={Math.max(1, Math.min(8, Math.floor(800 / totalDays)))}
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
            <XAxis dataKey="trade_date" hide />
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
              barSize={Math.max(1, Math.min(4, Math.floor(800 / totalDays)))}
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
