"use client";

import { useState, useMemo } from "react";

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
  return n.toLocaleString("en-US");
}

const PAGE_SIZE = 50;

export default function DataTable({
  data,
  ticker,
}: {
  data: PriceRow[];
  ticker: string;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Newest first
  const sorted = useMemo(() => [...data].reverse(), [data]);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function exportCSV() {
    const header = "Date,Open,High,Low,Close,Adj Close,Volume";
    const rows = sorted.map(
      (d) => `${d.trade_date},${d.open},${d.high},${d.low},${d.close},${d.adj_close},${d.volume}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticker}_price_history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
        <button
          onClick={() => { setOpen(!open); setPage(0); }}
          className="text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-2"
        >
          <span className="text-xs">{open ? "▼" : "▶"}</span>
          {open ? "Hide" : "Show"} data table
          <span className="text-xs text-gray-400 font-normal">({sorted.length.toLocaleString()} rows)</span>
        </button>
        {open && (
          <button
            onClick={exportCSV}
            className="text-xs px-3 py-1.5 border rounded-md hover:bg-gray-100 text-gray-600"
          >
            Export CSV
          </button>
        )}
      </div>

      {open && (
        <>
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-600">Date</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Open</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">High</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Low</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Close</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Adj Close</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-gray-600">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageData.map((d) => (
                <tr key={d.trade_date} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-xs text-gray-700 font-mono">{d.trade_date}</td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-600">{fmtPrice(d.open)}</td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-600">{fmtPrice(d.high)}</td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-600">{fmtPrice(d.low)}</td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-800 font-medium">{fmtPrice(d.close)}</td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-600">{fmtPrice(d.adj_close)}</td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-500">{fmtVol(d.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t bg-gray-50">
              <span className="text-xs text-gray-500">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="text-xs px-3 py-1 border rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-xs px-3 py-1 border rounded hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
