"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Security {
  id: string;
  ticker: string;
  company_name: string | null;
  exchange: string | null;
  index_membership: string[] | null;
  gics_sector: string | null;
  gics_sub_industry: string | null;
  gics_sector_code: string | null;
  is_active: boolean;
  notes: string | null;
}

type SortField = "ticker" | "company_name" | "gics_sector";
type SortDir = "asc" | "desc";

const INDEX_BADGES: Record<string, { label: string; color: string }> = {
  sp500: { label: "S&P", color: "bg-blue-100 text-blue-700" },
  dow: { label: "Dow", color: "bg-green-100 text-green-700" },
  nasdaq100: { label: "NDQ", color: "bg-purple-100 text-purple-700" },
};

const INDEX_OPTIONS = [
  { value: "", label: "All Indexes" },
  { value: "sp500", label: "S&P 500" },
  { value: "dow", label: "Dow 30" },
  { value: "nasdaq100", label: "Nasdaq 100" },
];

export default function SecuritiesListPanel() {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [indexFilter, setIndexFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("zzz_securities")
        .select("id, ticker, company_name, exchange, index_membership, gics_sector, gics_sub_industry, gics_sector_code, is_active, notes")
        .eq("is_active", true)
        .order("ticker", { ascending: true });

      if (err) {
        setError(err.message);
      } else {
        setSecurities(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  // Distinct sectors from loaded data
  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of securities) {
      if (s.gics_sector) set.add(s.gics_sector);
    }
    return [...set].sort();
  }, [securities]);

  // Stats
  const stats = useMemo(() => {
    let sp500 = 0, dow = 0, ndq = 0;
    for (const s of securities) {
      const idx = s.index_membership || [];
      if (idx.includes("sp500")) sp500++;
      if (idx.includes("dow")) dow++;
      if (idx.includes("nasdaq100")) ndq++;
    }
    return { total: securities.length, sp500, dow, ndq };
  }, [securities]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = securities;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          (s.company_name && s.company_name.toLowerCase().includes(q))
      );
    }

    if (indexFilter) {
      result = result.filter(
        (s) => s.index_membership && s.index_membership.includes(indexFilter)
      );
    }

    if (sectorFilter) {
      if (sectorFilter === "__null__") {
        result = result.filter((s) => !s.gics_sector);
      } else {
        result = result.filter((s) => s.gics_sector === sectorFilter);
      }
    }

    // Sort
    result = [...result].sort((a, b) => {
      const aVal = (a[sortField] || "") as string;
      const bVal = (b[sortField] || "") as string;
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [securities, search, indexFilter, sectorFilter, sortField, sortDir]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }, [sortField]);

  const clearFilters = () => {
    setSearch("");
    setIndexFilter("");
    setSectorFilter("");
  };

  if (loading) {
    return (
      <div className="border rounded-lg bg-white p-8 text-center text-sm text-gray-400">
        Loading securities...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-lg bg-white p-8 text-center text-sm text-red-500">
        Failed to load securities: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span>Total Securities: <span className="font-semibold text-gray-700">{stats.total}</span></span>
        <span>S&P 500: <span className="font-semibold text-gray-700">{stats.sp500}</span></span>
        <span>Dow 30: <span className="font-semibold text-gray-700">{stats.dow}</span></span>
        <span>Nasdaq 100: <span className="font-semibold text-gray-700">{stats.ndq}</span></span>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search ticker or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <select
          value={indexFilter}
          onChange={(e) => setIndexFilter(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          {INDEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value="__null__">— Unknown</option>
        </select>
        <span className="text-xs text-gray-400">
          Showing {filtered.length} of {securities.length} securities
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="border rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-gray-400 mb-3">No securities match your filters.</p>
          <button
            onClick={clearFilters}
            className="text-sm text-green-600 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="border rounded-lg bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortableHeader field="ticker" label="Ticker" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="company_name" label="Company" current={sortField} dir={sortDir} onSort={handleSort} />
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Index</th>
                <SortableHeader field="gics_sector" label="Sector" current={sortField} dir={sortDir} onSort={handleSort} />
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Sub-Industry</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Exchange</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono font-bold text-gray-900">{s.ticker}</td>
                  <td className="px-3 py-2 text-gray-700">{s.company_name || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {(s.index_membership || []).map((idx) => {
                        const badge = INDEX_BADGES[idx];
                        return badge ? (
                          <span key={idx} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                        ) : (
                          <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                            {idx}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{s.gics_sector || "—"}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{s.gics_sub_industry || "—"}</td>
                  <td className="px-3 py-2 text-gray-500">{s.exchange || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  field, label, current, dir, onSort,
}: {
  field: SortField; label: string; current: SortField; dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th
      className="text-left px-3 py-2 font-medium text-gray-600 text-xs cursor-pointer select-none hover:text-gray-900"
      onClick={() => onSort(field)}
    >
      {label}
      {isActive && (dir === "asc" ? " ↑" : " ↓")}
    </th>
  );
}
