"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { DailyHealthRow } from "@/lib/daily-health";

interface Props {
  rows: DailyHealthRow[];
}

export default function TrustTrendChart({ rows }: Props) {
  // Aggregate scores per day (average across sites)
  const dayMap = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const existing = dayMap.get(r.date);
    if (existing) {
      existing.total += r.score;
      existing.count += 1;
    } else {
      dayMap.set(r.date, { total: r.score, count: 1 });
    }
  }

  const data = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, count }]) => ({
      date: date.slice(5), // MM-DD
      score: Math.round(total / count),
    }));

  if (data.length === 0) {
    return (
      <div className="border rounded-lg bg-white shadow-sm p-4 flex items-center justify-center h-full">
        <p className="text-sm text-gray-400">No trend data available</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">30-Day Trend</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value: number) => [`${value}`, "Score"]}
          />
          <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "90", fontSize: 10, fill: "#22c55e" }} />
          <ReferenceLine y={70} stroke="#eab308" strokeDasharray="3 3" label={{ value: "70", fontSize: 10, fill: "#eab308" }} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#00a859"
            strokeWidth={2}
            dot={{ r: 3, fill: "#00a859" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
