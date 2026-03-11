"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useOrg } from "@/context/OrgContext";
import Link from "next/link";

const DATE_RANGES = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "all", label: "All Time" },
];

interface CycleRow {
  id: number;
  hvac_zone_id: string | null;
  equipment_id: string | null;
  site_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  hvac_mode: string | null;
  avg_power_kw: number | null;
  peak_power_kw: number | null;
  total_energy_kwh: number | null;
  peak_current_a: number | null;
  temp_delta_f: number | null;
  efficiency_ratio: number | null;
  zone_name?: string;
  site_name?: string;
}

interface SiteOption { site_id: string; site_name: string }
interface EquipOption { equipment_id: string; equipment_name: string; site_id: string; equipment_group: string | null }

const TH = "px-3 py-2 text-left text-xs font-semibold text-white whitespace-nowrap";
const TD = "px-3 py-2 text-xs whitespace-nowrap border-b border-gray-100";

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const modeLabel = (m: string | null) => {
  if (m === "cooling") return "Cool";
  if (m === "heating") return "Heat";
  if (m === "fan_only") return "Fan";
  return m || "—";
};

export default function BenchmarkCompressorCyclesPage() {
  const { selectedOrgId } = useOrg();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Back navigation
  const returnTo = searchParams.get("returnTo");
  const backHref = returnTo && returnTo.startsWith("/") ? returnTo : "/benchmark";
  const backLabel = returnTo && returnTo.startsWith("/") ? "\u2190 Space & HVAC" : "\u2190 Benchmarking";

  const [filters, setFilters] = useState(() => ({
    siteId: searchParams.get("siteId") ?? "",
    equipmentId: searchParams.get("equipmentId") ?? "",
    mode: searchParams.get("mode") ?? "",
    dateRange: searchParams.has("equipmentId") || searchParams.has("siteId") ? "90d" : "all",
  }));

  const [rows, setRows] = useState<CycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [equipments, setEquipments] = useState<EquipOption[]>([]);

  // Sync filter state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.siteId) params.set("siteId", filters.siteId);
    if (filters.equipmentId) params.set("equipmentId", filters.equipmentId);
    if (filters.mode) params.set("mode", filters.mode);
    router.replace(`/benchmark/compressor-cycles?${params.toString()}`, { scroll: false });
  }, [filters.siteId, filters.equipmentId, filters.mode, router]);

  // Fetch lookup data
  useEffect(() => {
    if (!selectedOrgId) return;
    (async () => {
      const { data: s } = await supabase.from("a_sites").select("site_id, site_name").eq("org_id", selectedOrgId).order("site_name");
      setSites(s || []);
      const siteIds = (s || []).map(x => x.site_id);
      if (siteIds.length) {
        const { data: e } = await supabase.from("a_equipments").select("equipment_id, equipment_name, site_id, equipment_group").in("site_id", siteIds).order("equipment_name");
        setEquipments(e || []);
      }
    })();
  }, [selectedOrgId]);

  const siteMap = useMemo(() => Object.fromEntries(sites.map(s => [s.site_id, s.site_name])), [sites]);

  const fetchData = useCallback(async () => {
    if (!selectedOrgId || !sites.length) return;
    setLoading(true);
    try {
      const siteIds = filters.siteId ? [filters.siteId] : sites.map(s => s.site_id);

      const { data: zones } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id, name, site_id")
        .in("site_id", siteIds);
      const zoneMap = Object.fromEntries((zones || []).map(z => [z.hvac_zone_id, { name: z.name, site_id: z.site_id }]));

      let query = supabase
        .from("b_compressor_cycles")
        .select("*")
        .in("site_id", siteIds)
        .order("started_at", { ascending: false })
        .limit(500);

      if (filters.equipmentId) {
        query = query.eq("equipment_id", filters.equipmentId);
      } else {
        const hvacIds = equipments.filter(e => e.equipment_group === "HVAC").map(e => e.equipment_id);
        if (hvacIds.length) query = query.in("equipment_id", hvacIds);
      }
      if (filters.mode) query = query.eq("hvac_mode", filters.mode);

      if (filters.dateRange !== "all") {
        const days = filters.dateRange === "7d" ? 7 : filters.dateRange === "30d" ? 30 : 90;
        query = query.gte("started_at", daysAgo(days));
      }

      const { data } = await query;

      setRows((data || []).map((r: any) => ({
        ...r,
        zone_name: r.hvac_zone_id && zoneMap[r.hvac_zone_id] ? zoneMap[r.hvac_zone_id].name : null,
        site_name: r.site_id ? siteMap[r.site_id] || null : null,
      })));
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, sites, siteMap, equipments, filters.siteId, filters.equipmentId, filters.mode, filters.dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const uniqueModes = useMemo(() => [...new Set(rows.map(r => r.hvac_mode).filter(Boolean))].sort(), [rows]);

  const filteredEquipments = useMemo(() => {
    const bysite = filters.siteId ? equipments.filter(e => e.site_id === filters.siteId) : equipments;
    const hvac = bysite.filter(e => e.equipment_group === "HVAC");
    const other = bysite.filter(e => e.equipment_group !== "HVAC");
    return { hvac, other };
  }, [equipments, filters.siteId]);

  const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtDuration = (min: number | null) => {
    if (min == null) return "—";
    if (min < 60) return `${Math.round(min)}m`;
    return `${(min / 60).toFixed(1)}h`;
  };

  const updateFilter = (key: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === "siteId" && prev.equipmentId) {
        const eq = equipments.find(e => e.equipment_id === prev.equipmentId);
        if (eq && value && eq.site_id !== value) next.equipmentId = "";
      }
      return next;
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700">{backLabel}</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Compressor Cycles — Org-Wide</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filters.siteId} onChange={e => updateFilter("siteId", e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5">
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.site_id} value={s.site_id}>{s.site_name}</option>)}
        </select>
        <select value={filters.equipmentId} onChange={e => updateFilter("equipmentId", e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5">
          <option value="">All HVAC Equipment</option>
          {filteredEquipments.hvac.map(e => <option key={e.equipment_id} value={e.equipment_id}>{e.equipment_name}{!filters.siteId && siteMap[e.site_id] ? ` (${siteMap[e.site_id]})` : ""}</option>)}
        </select>
        <select value={filters.mode} onChange={e => updateFilter("mode", e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5">
          <option value="">All Modes</option>
          {uniqueModes.map(m => <option key={m!} value={m!}>{modeLabel(m!)}</option>)}
        </select>
        <div className="flex items-center gap-1 border border-gray-200 rounded-md overflow-hidden">
          {DATE_RANGES.map(dr => (
            <button
              key={dr.key}
              onClick={() => updateFilter("dateRange", dr.key)}
              className={`text-xs px-2 py-1.5 transition-colors ${
                filters.dateRange === dr.key ? "bg-indigo-100 text-indigo-800 font-medium" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {dr.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{rows.length} cycles</span>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH} style={{ backgroundColor: "#3730a3", borderTopLeftRadius: 8 }}>Status</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>Site</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>Zone</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>Mode</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>Start</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>Duration</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>Avg kW</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>Peak kW</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>Energy</th>
                <th className={TH} style={{ backgroundColor: "#3730a3" }}>{"\u0394"} Temp</th>
                <th className={TH} style={{ backgroundColor: "#3730a3", borderTopRightRadius: 8 }}>Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="py-8 text-gray-500 text-center">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="py-8 text-gray-500 text-center">No compressor cycles found</td></tr>
              ) : rows.map((row, idx) => {
                const isRunning = row.ended_at === null;

                let effColor = "text-gray-600";
                if (row.efficiency_ratio != null) {
                  if (row.efficiency_ratio >= 3) effColor = "text-green-700";
                  else if (row.efficiency_ratio >= 1) effColor = "text-yellow-700";
                  else effColor = "text-red-600";
                }

                let dtColor = "text-gray-600";
                if (row.temp_delta_f != null) {
                  dtColor = row.temp_delta_f < 0 ? "text-blue-600" : row.temp_delta_f > 0 ? "text-orange-600" : "text-gray-600";
                }

                const modeBadge = row.hvac_mode === "cooling"
                  ? "bg-blue-100 text-blue-700"
                  : row.hvac_mode === "heating"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-600";

                return (
                  <tr key={row.id} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${isRunning ? "bg-green-50/30" : ""}`}>
                    <td className={TD}>
                      {isRunning
                        ? <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Running</span>
                        : <span className="text-gray-400">Complete</span>}
                    </td>
                    <td className={TD}>{row.site_name || "—"}</td>
                    <td className={TD}>{row.zone_name || "—"}</td>
                    <td className={TD}>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${modeBadge}`}>
                        {modeLabel(row.hvac_mode)}
                      </span>
                    </td>
                    <td className={TD}>{fmtDate(row.started_at)}</td>
                    <td className={TD}>{isRunning ? "Running..." : fmtDuration(row.duration_min)}</td>
                    <td className={TD}>{row.avg_power_kw?.toFixed(2) ?? "—"}</td>
                    <td className={TD}>{row.peak_power_kw?.toFixed(2) ?? "—"}</td>
                    <td className={TD}>{row.total_energy_kwh?.toFixed(3) ?? "—"}</td>
                    <td className={`${TD} ${dtColor}`}>
                      {row.temp_delta_f != null ? `${row.temp_delta_f > 0 ? "+" : ""}${row.temp_delta_f.toFixed(1)}°F` : "—"}
                    </td>
                    <td className={`${TD} font-medium ${effColor}`}>
                      {row.efficiency_ratio?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
