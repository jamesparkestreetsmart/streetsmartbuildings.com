"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useOrg } from "@/context/OrgContext";
import Link from "next/link";

const ANOMALY_LABELS: Record<string, string> = {
  coil_freeze: "Coil Freeze",
  short_cycling: "Short Cycling",
  long_cycle: "Long Cycle",
  filter_restriction: "Filter Restriction",
  refrigerant_low: "Low Refrigerant",
  idle_heat_gain: "Idle Heat Gain",
  delayed_temp_response: "Delayed Response",
  low_efficiency: "Low Efficiency",
};

const DATE_RANGES = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "all", label: "All Time" },
];

interface AnomalyRow {
  id: number;
  anomaly_type: string;
  severity: string;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  peak_value: number | null;
  peak_value_unit: string | null;
  hvac_zone_id: string | null;
  equipment_id: string | null;
  site_id: string | null;
  resolved_reason: string | null;
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

export default function BenchmarkAnomaliesPage() {
  const { selectedOrgId } = useOrg();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Back navigation: return to Space & HVAC if arrived from row click
  const returnTo = searchParams.get("returnTo");
  const backHref = returnTo && returnTo.startsWith("/") ? returnTo : "/benchmark";
  const backLabel = returnTo && returnTo.startsWith("/") ? "\u2190 Space & HVAC" : "\u2190 Benchmarking";

  // Query params → initial filter state (read once)
  const [filters, setFilters] = useState(() => ({
    siteId: searchParams.get("siteId") ?? "",
    equipmentId: searchParams.get("equipmentId") ?? "",
    anomalyType: searchParams.get("anomalyType") ?? "",
    severity: "",
    dateRange: searchParams.has("equipmentId") || searchParams.has("siteId") ? "90d" : "all",
  }));

  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [equipments, setEquipments] = useState<EquipOption[]>([]);

  // Sync filter state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.siteId) params.set("siteId", filters.siteId);
    if (filters.equipmentId) params.set("equipmentId", filters.equipmentId);
    if (filters.anomalyType) params.set("anomalyType", filters.anomalyType);
    router.replace(`/benchmark/anomalies?${params.toString()}`, { scroll: false });
  }, [filters.siteId, filters.equipmentId, filters.anomalyType, router]);

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

  // Fetch anomaly data
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
        .from("b_anomaly_events")
        .select("*")
        .in("site_id", siteIds)
        .order("started_at", { ascending: false })
        .limit(500);

      if (filters.equipmentId) {
        query = query.eq("equipment_id", filters.equipmentId);
      } else {
        // Default to HVAC equipment only
        const hvacIds = equipments.filter(e => e.equipment_group === "HVAC").map(e => e.equipment_id);
        if (hvacIds.length) query = query.in("equipment_id", hvacIds);
      }
      if (filters.anomalyType) query = query.eq("anomaly_type", filters.anomalyType);

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
  }, [selectedOrgId, sites, siteMap, equipments, filters.siteId, filters.equipmentId, filters.anomalyType, filters.dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Client-side severity filter (not in query to keep it snappy)
  const filtered = rows.filter(r => {
    if (filters.severity && r.severity !== filters.severity) return false;
    return true;
  });

  const uniqueTypes = useMemo(() => [...new Set(rows.map(r => r.anomaly_type))].sort(), [rows]);
  const uniqueSeverities = useMemo(() => [...new Set(rows.map(r => r.severity))].sort(), [rows]);

  // Equipment options filtered by selected site; HVAC equipment listed first
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
      // Clear equipment if site changes and equipment doesn't belong to new site
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
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Anomaly Events — Org-Wide</h1>
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
          {filteredEquipments.other.length > 0 && <option disabled>── Other ──</option>}
          {filteredEquipments.other.map(e => <option key={e.equipment_id} value={e.equipment_id}>{e.equipment_name}{!filters.siteId && siteMap[e.site_id] ? ` (${siteMap[e.site_id]})` : ""}</option>)}
        </select>
        <select value={filters.anomalyType} onChange={e => updateFilter("anomalyType", e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5">
          <option value="">All Types</option>
          {uniqueTypes.map(t => <option key={t} value={t}>{ANOMALY_LABELS[t] || t}</option>)}
        </select>
        <select value={filters.severity} onChange={e => updateFilter("severity", e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5">
          <option value="">All Severities</option>
          {uniqueSeverities.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1 border border-gray-200 rounded-md overflow-hidden">
          {DATE_RANGES.map(dr => (
            <button
              key={dr.key}
              onClick={() => updateFilter("dateRange", dr.key)}
              className={`text-xs px-2 py-1.5 transition-colors ${
                filters.dateRange === dr.key ? "bg-amber-100 text-amber-800 font-medium" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {dr.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} events</span>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH} style={{ backgroundColor: "#b45309", borderTopLeftRadius: 8 }}>Status</th>
                <th className={TH} style={{ backgroundColor: "#b45309" }}>Site</th>
                <th className={TH} style={{ backgroundColor: "#b45309" }}>Zone</th>
                <th className={TH} style={{ backgroundColor: "#b45309" }}>Type</th>
                <th className={TH} style={{ backgroundColor: "#b45309" }}>Severity</th>
                <th className={TH} style={{ backgroundColor: "#b45309" }}>Started</th>
                <th className={TH} style={{ backgroundColor: "#b45309" }}>Duration</th>
                <th className={TH} style={{ backgroundColor: "#b45309", borderTopRightRadius: 8 }}>Peak Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-gray-500 text-center">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-gray-500 text-center">No anomaly events found</td></tr>
              ) : filtered.map((row, idx) => {
                const isActive = row.ended_at === null;
                return (
                  <tr key={row.id} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${isActive ? "bg-red-50/30" : ""}`}>
                    <td className={TD}>
                      {isActive
                        ? <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />Active</span>
                        : <span className="text-gray-400">Resolved</span>}
                    </td>
                    <td className={TD}>{row.site_name || "—"}</td>
                    <td className={TD}>{row.zone_name || "—"}</td>
                    <td className={TD}>{ANOMALY_LABELS[row.anomaly_type] || row.anomaly_type}</td>
                    <td className={TD}>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        row.severity === "critical" ? "bg-red-100 text-red-700" :
                        row.severity === "warning" ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{row.severity}</span>
                    </td>
                    <td className={TD}>{fmtDate(row.started_at)}</td>
                    <td className={TD}>{isActive ? "Ongoing" : fmtDuration(row.duration_min)}</td>
                    <td className={TD}>
                      {row.peak_value != null ? `${row.peak_value}${row.peak_value_unit ? ` ${row.peak_value_unit}` : ""}` : "—"}
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
