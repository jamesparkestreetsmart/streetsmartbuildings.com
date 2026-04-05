"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import PriceChart, { type ChartMode } from "./PriceChart";
import StatsCards from "./StatsCards";
import DataTable from "./DataTable";
import Link from "next/link";

interface Security {
  id: string;
  ticker: string;
  company_name: string | null;
  exchange: string | null;
  index_membership: string[] | null;
  gics_sector: string | null;
  gics_sub_industry: string | null;
}

interface PriceRow {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
}

const INDEX_BADGES: Record<string, { label: string; color: string }> = {
  sp500: { label: "S&P", color: "bg-blue-100 text-blue-700" },
  dow: { label: "Dow", color: "bg-green-100 text-green-700" },
  nasdaq100: { label: "NDQ", color: "bg-purple-100 text-purple-700" },
};

const RANGES = ["YTD", "1Y", "5Y", "10Y", "25Y", "ALL"] as const;
type Range = (typeof RANGES)[number];

function getRangeStartDate(range: Range): string | null {
  if (range === "ALL") return null;
  const now = new Date();
  if (range === "YTD") {
    return `${now.getFullYear()}-01-01`;
  }
  const years = parseInt(range);
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - years);
  return start.toISOString().slice(0, 10);
}

function fmtPrice(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TickerDetailPanel({ security }: { security: Security }) {
  const [allData, setAllData] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("ALL");
  const [chartMode, setChartMode] = useState<ChartMode>("line");

  // Fetch all price history once, filter client-side for range
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);

      // Supabase caps select at 1000 rows by default. We need all rows.
      // Fetch in pages of 5000.
      let allRows: PriceRow[] = [];
      let offset = 0;
      const pageSize = 5000;
      let done = false;

      while (!done) {
        const { data, error } = await supabase
          .from("zzz_price_history")
          .select("trade_date, open, high, low, close, adj_close, volume")
          .eq("ticker", security.ticker)
          .order("trade_date", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) {
          console.error("Failed to load price history:", error);
          break;
        }

        if (data && data.length > 0) {
          allRows = allRows.concat(data);
          offset += pageSize;
          if (data.length < pageSize) done = true;
        } else {
          done = true;
        }
      }

      setAllData(allRows);
      setLoading(false);
    };
    fetch();
  }, [security.ticker]);

  // Filter by range
  const rangeData = useMemo(() => {
    const startDate = getRangeStartDate(range);
    if (!startDate) return allData;
    return allData.filter((d) => d.trade_date >= startDate);
  }, [allData, range]);

  // Last close + prior day change
  const lastClose = allData.length > 0 ? allData[allData.length - 1] : null;
  const priorClose = allData.length > 1 ? allData[allData.length - 2] : null;
  const dollarChange = lastClose && priorClose ? lastClose.close - priorClose.close : 0;
  const pctChange = priorClose && priorClose.close > 0 ? (dollarChange / priorClose.close) * 100 : 0;
  const changePositive = dollarChange >= 0;

  return (
    <>
      {/* Header */}
      <div>
        <Link
          href="/admin/finance/securities"
          className="text-sm text-green-600 hover:underline inline-flex items-center gap-1"
        >
          ← Back to Securities
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{security.ticker}</h1>
            <span className="text-lg text-gray-500">{security.company_name}</span>
            <div className="flex gap-1">
              {(security.index_membership || []).map((idx) => {
                const badge = INDEX_BADGES[idx];
                return badge ? (
                  <span
                    key={idx}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                ) : null;
              })}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {security.gics_sector}
            {security.gics_sub_industry && ` · ${security.gics_sub_industry}`}
            {security.exchange && ` · ${security.exchange}`}
          </p>
        </div>

        {/* Last close price */}
        {lastClose && !loading && (
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{fmtPrice(lastClose.close)}</p>
            <p className={`text-sm font-medium ${changePositive ? "text-green-600" : "text-red-600"}`}>
              {changePositive ? "+" : ""}
              {dollarChange.toFixed(2)} ({changePositive ? "+" : ""}
              {pctChange.toFixed(2)}%)
            </p>
            <p className="text-[10px] text-gray-400">Close {lastClose.trade_date}</p>
          </div>
        )}
      </div>

      {/* Range selector + chart mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium border ${
                range === r
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["line", "candlestick", "area"] as ChartMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setChartMode(m)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium border capitalize ${
                chartMode === m
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="space-y-0">
          <div className="h-[400px] border rounded-t-lg bg-white animate-pulse" />
          <div className="h-[100px] border border-t-0 rounded-b-lg bg-white animate-pulse" />
        </div>
      ) : (
        <PriceChart data={rangeData} mode={chartMode} />
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-3 bg-white h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <StatsCards data={rangeData} allData={allData} />
      )}

      {/* Data table */}
      {!loading && <DataTable data={rangeData} ticker={security.ticker} />}
    </>
  );
}
