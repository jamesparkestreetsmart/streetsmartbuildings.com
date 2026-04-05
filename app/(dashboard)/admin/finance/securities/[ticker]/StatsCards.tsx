"use client";

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

export default function StatsCards({
  data,
  allData,
}: {
  data: PriceRow[];
  allData: PriceRow[];
}) {
  if (data.length === 0) return null;

  // Period stats (selected range) — all based on adj_close
  let periodHigh = -Infinity;
  let periodLow = Infinity;
  let totalVol = 0;
  for (const d of data) {
    if (d.adj_close > periodHigh) periodHigh = d.adj_close;
    if (d.adj_close < periodLow) periodLow = d.adj_close;
    totalVol += d.volume;
  }
  const avgVol = totalVol / data.length;
  const firstClose = data[0].adj_close;
  const lastClose = data[data.length - 1].adj_close;
  const periodReturn = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;

  // All-time stats — based on adj_close
  let athPrice = -Infinity, athDate = "";
  let atlPrice = Infinity, atlDate = "";
  for (const d of allData) {
    if (d.adj_close > athPrice) { athPrice = d.adj_close; athDate = d.trade_date; }
    if (d.adj_close < atlPrice) { atlPrice = d.adj_close; atlDate = d.trade_date; }
  }

  const cards = [
    { label: "Period High", value: fmtPrice(periodHigh) },
    { label: "Period Low", value: fmtPrice(periodLow) },
    {
      label: "Period Return",
      value: (periodReturn >= 0 ? "+" : "") + periodReturn.toFixed(1) + "%",
      color: periodReturn >= 0 ? "text-green-700" : "text-red-600",
    },
    { label: "Avg Daily Volume", value: fmtVol(avgVol) },
    { label: "All-Time High", value: fmtPrice(athPrice), sub: athDate },
    { label: "All-Time Low", value: fmtPrice(atlPrice), sub: atlDate },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="border rounded-lg p-3 bg-white">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">{c.label}</p>
          <p className={`text-sm font-semibold mt-1 ${c.color || "text-gray-800"}`}>{c.value}</p>
          {c.sub && <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}
