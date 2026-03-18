"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useOrg } from "@/context/OrgContext";
import { getSourceLabel, getSourceBadgeClass } from "@/lib/source-labels";
import TopScrollbar from "@/components/ui/TopScrollbar";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogRow {
  id: string;
  hvac_zone_id: string;
  site_id: string;
  recorded_at: string;
  phase: string | null;
  fan_mode: string | null;
  hvac_action: string | null;
  supply_temp_f: number | null;
  return_temp_f: number | null;
  delta_t: number | null;
  power_kw: number | null;
  comp_on: boolean | null;
  active_heat_f: number | null;
  active_cool_f: number | null;
  feels_like_adj: number | null;
  zone_temp_f: number | null;
  zone_humidity: number | null;
  feels_like_temp_f: number | null;
  occupancy_adj: number | null;
  manager_adj: number | null;
  smart_start_adj: number | null;
}

interface SiteOption { site_id: string; site_name: string }
interface EquipOption { equipment_id: string; equipment_name: string; site_id: string; equipment_group: string | null }
interface ZoneOption { hvac_zone_id: string; name: string; site_id: string; equipment_id: string | null }

interface HvacStatusRow {
  log: LogRow;
  siteName: string;
  zoneName: string;
  zoneId: string;
  siteId: string;
  equipmentName: string;
  tempSource: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function friendlyFan(fan: string | null): string {
  if (!fan) return "—";
  switch (fan) {
    case "Auto low": return "Auto";
    case "Low": return "On";
    case "Circulation": return "Circ";
    default: return fan;
  }
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function DirectiveBadge({ phase, action }: { phase: string | null; action: string | null }) {
  if (phase === "closed") {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">Closed</span>;
  }
  const phaseEl = phase === "occupied"
    ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">Occupied</span>
    : <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Unoccupied</span>;
  const actionEl = !action || action === "idle"
    ? <span className="text-[10px] text-gray-400">idle</span>
    : action === "heating"
    ? <span className="text-[10px] text-orange-600 font-medium">heating</span>
    : action === "cooling"
    ? <span className="text-[10px] text-blue-600 font-medium">cooling</span>
    : <span className="text-[10px] text-gray-500">{action}</span>;
  return <div className="flex flex-col gap-0.5">{phaseEl}{actionEl}</div>;
}

function AdjBadge({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-gray-400">0</span>;
  if (value > 0) return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">+{value}</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{value}</span>;
}

const TH = "px-3 py-2 text-left text-xs font-semibold text-white whitespace-nowrap cursor-pointer select-none";
const TD = "px-3 py-2 text-xs whitespace-nowrap border-b border-gray-100";
const COL_COUNT = 19;
const HEADER_BG = "#047857"; // emerald-700

type SortKey =
  | "site" | "zone" | "equipment" | "time"
  | "directive" | "fan" | "supply" | "return" | "deltaT" | "power" | "comp"
  | "setpoint" | "feelsLikeScore" | "zoneTemp" | "zoneHumidity" | "feelsLikeTemp"
  | "source" | "occScore" | "manager" | "ssScore";

type SortDir = "asc" | "desc";

export default function HvacStatusPage() {
  const { selectedOrgId } = useOrg();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Back navigation
  const initialSiteId = searchParams.get("siteId") ?? "";
  const backHref = initialSiteId
    ? `/sites/${initialSiteId}?tab=space-hvac`
    : "/benchmark";
  const backLabel = initialSiteId ? "\u2190 Space & HVAC" : "\u2190 Benchmarking";

  // Filters
  const [filters, setFilters] = useState(() => ({
    siteId: initialSiteId,
    equipmentId: searchParams.get("equipmentId") ?? "",
    date: new Date().toISOString().slice(0, 10), // today
  }));

  const [rows, setRows] = useState<HvacStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [equipments, setEquipments] = useState<EquipOption[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(300);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // Sync filter state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.siteId) params.set("siteId", filters.siteId);
    if (filters.equipmentId) params.set("equipmentId", filters.equipmentId);
    if (filters.date) params.set("date", filters.date);
    router.replace(`/benchmark/hvac-status?${params.toString()}`, { scroll: false });
  }, [filters.siteId, filters.equipmentId, filters.date, router]);

  // Fetch lookup data
  useEffect(() => {
    if (!selectedOrgId) return;
    (async () => {
      const { data: s } = await supabase.from("a_sites").select("site_id, site_name").eq("org_id", selectedOrgId).order("site_name");
      setSites(s || []);
      const siteIds = (s || []).map(x => x.site_id);
      if (siteIds.length) {
        const { data: e } = await supabase.from("a_equipments").select("equipment_id, equipment_name, site_id, equipment_group").in("site_id", siteIds).not("status", "in", '("dummy","retired")').order("equipment_name");
        setEquipments(e || []);
      }
    })();
  }, [selectedOrgId]);

  const siteMap = useMemo(() => Object.fromEntries(sites.map(s => [s.site_id, s.site_name])), [sites]);

  // Main data fetch
  const fetchData = useCallback(async () => {
    if (!selectedOrgId || !sites.length) return;
    setLoading(true);
    try {
      const siteIds = filters.siteId ? [filters.siteId] : sites.map(s => s.site_id);

      // 1. Fetch zones
      const { data: zonesData } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id, name, site_id, equipment_id")
        .in("site_id", siteIds)
        .not("thermostat_device_id", "is", null)
        .not("equipment_id", "is", null);
      const zones = (zonesData || []) as ZoneOption[];
      const zoneMap = Object.fromEntries(zones.map(z => [z.hvac_zone_id, z]));

      // 2. Equipment name map
      const equipMap = Object.fromEntries(equipments.map(e => [e.equipment_id, e]));

      // 3. Filter zone IDs by selected equipment if set
      let activeZoneIds = zones.map(z => z.hvac_zone_id);
      if (filters.equipmentId) {
        activeZoneIds = zones.filter(z => z.equipment_id === filters.equipmentId).map(z => z.hvac_zone_id);
      } else {
        // Default HVAC-only: filter zones whose equipment is HVAC
        const hvacEquipIds = new Set(equipments.filter(e => e.equipment_group === "HVAC").map(e => e.equipment_id));
        activeZoneIds = zones.filter(z => z.equipment_id && hvacEquipIds.has(z.equipment_id)).map(z => z.hvac_zone_id);
      }

      if (!activeZoneIds.length) {
        setRows([]);
        return;
      }

      // 4. Fetch latest log rows for the selected date
      const dayStart = `${filters.date}T00:00:00`;
      const dayEnd = `${filters.date}T23:59:59`;

      const { data: logData } = await supabase
        .from("b_zone_setpoint_log")
        .select("id, hvac_zone_id, site_id, recorded_at, phase, fan_mode, hvac_action, supply_temp_f, return_temp_f, delta_t, power_kw, comp_on, active_heat_f, active_cool_f, feels_like_adj, zone_temp_f, zone_humidity, feels_like_temp_f, occupancy_adj, manager_adj, smart_start_adj")
        .in("hvac_zone_id", activeZoneIds)
        .gte("recorded_at", dayStart)
        .lte("recorded_at", dayEnd)
        .order("recorded_at", { ascending: false })
        .limit(10000);

      const allLogs = (logData || []) as LogRow[];

      // 5. Source resolution: equipment → equipment_served_spaces → space_sensors
      const equipIds = [...new Set(zones.map(z => z.equipment_id).filter(Boolean))] as string[];
      const equipToSpaceIds: Record<string, string[]> = {};
      if (equipIds.length) {
        const { data: servedData } = await supabase
          .from("a_equipment_served_spaces")
          .select("equipment_id, space_id")
          .in("equipment_id", equipIds);
        for (const row of servedData || []) {
          if (!equipToSpaceIds[row.equipment_id]) equipToSpaceIds[row.equipment_id] = [];
          equipToSpaceIds[row.equipment_id].push(row.space_id);
        }
      }

      const allSpaceIds = [...new Set(Object.values(equipToSpaceIds).flat())];
      const spacesWithSensors = new Set<string>();
      if (allSpaceIds.length) {
        const { data: sensorData } = await supabase
          .from("a_space_sensors")
          .select("space_id, entity_id, sensor_type")
          .eq("sensor_type", "temperature")
          .in("space_id", allSpaceIds);
        for (const s of sensorData || []) {
          if (s.entity_id) spacesWithSensors.add(s.space_id);
        }
      }

      // Build source per zone
      const sourceByZone: Record<string, string> = {};
      for (const z of zones) {
        if (!z.equipment_id) { sourceByZone[z.hvac_zone_id] = "Thermostat"; continue; }
        const spaceIds = equipToSpaceIds[z.equipment_id] || [];
        const hasSensors = spaceIds.some(sid => spacesWithSensors.has(sid));
        sourceByZone[z.hvac_zone_id] = hasSensors ? "Zone Avg" : "Thermostat";
      }

      // 6. Build result rows — one per log entry (full day)
      const result: HvacStatusRow[] = [];
      for (const log of allLogs) {
        const zone = zoneMap[log.hvac_zone_id];
        if (!zone) continue;
        const equip = zone.equipment_id ? equipMap[zone.equipment_id] : null;
        result.push({
          log,
          siteName: siteMap[zone.site_id] || "—",
          zoneName: zone.name,
          zoneId: zone.hvac_zone_id,
          siteId: zone.site_id,
          equipmentName: equip?.equipment_name || "—",
          tempSource: sourceByZone[log.hvac_zone_id] || "Thermostat",
        });
      }

      setRows(result);
      setLastRefresh(new Date());
      setCountdown(300);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, sites, siteMap, equipments, filters.siteId, filters.equipmentId, filters.date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 5 min
  useEffect(() => {
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const countdownMins = Math.floor(countdown / 60);
  const countdownSecs = countdown % 60;

  // Equipment filtering
  const filteredEquipments = useMemo(() => {
    const bysite = filters.siteId ? equipments.filter(e => e.site_id === filters.siteId) : equipments;
    const hvac = bysite.filter(e => e.equipment_group === "HVAC");
    const other = bysite.filter(e => e.equipment_group !== "HVAC");
    return { hvac, other };
  }, [equipments, filters.siteId]);

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

  // Sorting
  const sorted = useMemo(() => {
    const copy = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    const numCmp = (a: number | null, b: number | null) => ((a ?? -Infinity) - (b ?? -Infinity)) * dir;
    const strCmp = (a: string, b: string) => a.localeCompare(b) * dir;

    copy.sort((a, b) => {
      switch (sortKey) {
        case "site": {
          const s = strCmp(a.siteName, b.siteName);
          return s !== 0 ? s : strCmp(a.zoneName, b.zoneName);
        }
        case "zone": return strCmp(a.zoneName, b.zoneName);
        case "equipment": return strCmp(a.equipmentName, b.equipmentName);
        case "time": return strCmp(a.log.recorded_at, b.log.recorded_at) * -1; // newest first by default
        case "directive": return strCmp(a.log.phase || "", b.log.phase || "");
        case "fan": return strCmp(a.log.fan_mode || "", b.log.fan_mode || "");
        case "supply": return numCmp(a.log.supply_temp_f, b.log.supply_temp_f);
        case "return": return numCmp(a.log.return_temp_f, b.log.return_temp_f);
        case "deltaT": return numCmp(a.log.delta_t, b.log.delta_t);
        case "power": return numCmp(a.log.power_kw, b.log.power_kw);
        case "comp": return numCmp(a.log.comp_on ? 1 : 0, b.log.comp_on ? 1 : 0);
        case "setpoint": return numCmp(a.log.active_cool_f, b.log.active_cool_f);
        case "feelsLikeScore": return numCmp(a.log.feels_like_adj, b.log.feels_like_adj);
        case "zoneTemp": return numCmp(a.log.zone_temp_f, b.log.zone_temp_f);
        case "zoneHumidity": return numCmp(a.log.zone_humidity, b.log.zone_humidity);
        case "feelsLikeTemp": return numCmp(a.log.feels_like_temp_f, b.log.feels_like_temp_f);
        case "source": return strCmp(a.tempSource, b.tempSource);
        case "occScore": return numCmp(a.log.occupancy_adj, b.log.occupancy_adj);
        case "manager": return numCmp(a.log.manager_adj, b.log.manager_adj);
        case "ssScore": return numCmp(a.log.smart_start_adj, b.log.smart_start_adj);
        default: return 0;
      }
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  // Setpoint rendering with in-range / out-of-range badge
  function renderSetpoint(log: LogRow) {
    const heat = log.active_heat_f;
    const cool = log.active_cool_f;
    const action = log.hvac_action;
    const temp = log.zone_temp_f;

    if (heat == null && cool == null) return <span className="text-gray-400">—</span>;

    // Heat-only
    if (heat != null && cool == null) return (
      <span className="font-medium text-amber-700">{heat}°F <span className="text-[10px] text-gray-400">↑</span></span>
    );
    // Cool-only
    if (cool != null && heat == null) return (
      <span className="font-medium text-blue-700">{cool}°F <span className="text-[10px] text-gray-400">↓</span></span>
    );
    // Dual
    if (heat != null && cool != null) {
      const inRange = temp != null && temp >= heat && temp <= cool;
      if (action === "heating") return (
        <span className="whitespace-nowrap">
          <span className="font-medium text-amber-700">{heat}°F ↑</span>
          <span className="text-gray-300 mx-0.5">·</span>
          <span className="text-[11px] text-gray-400">{cool}°F</span>
        </span>
      );
      if (action === "cooling") return (
        <span className="whitespace-nowrap">
          <span className="text-[11px] text-gray-400">{heat}°F</span>
          <span className="text-gray-300 mx-0.5">·</span>
          <span className="font-medium text-blue-700">{cool}°F ↓</span>
        </span>
      );
      return (
        <span className="whitespace-nowrap">
          <span className="font-medium text-gray-700">{heat}–{cool}°F</span>
          {temp != null && (
            <span className={`text-[10px] ml-1 ${inRange ? "text-green-600" : "text-red-500 font-medium"}`}>
              {inRange ? "in range" : "out of range"}
            </span>
          )}
        </span>
      );
    }
    return <span className="text-gray-400">—</span>;
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700">{backLabel}</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">HVAC Live Status — Org-Wide</h1>
        <p className="text-xs text-gray-400 mt-1">All 5-minute snapshots for the selected day &bull; Updates every 5 min</p>
      </div>

      {/* Filters + Refresh */}
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
        <input
          type="date"
          value={filters.date}
          onChange={e => updateFilter("date", e.target.value)}
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5"
        />

        <div className="flex items-center gap-2 text-xs text-gray-500 ml-auto">
          <span
            className="inline-block h-2 w-2 rounded-full animate-pulse"
            style={{ backgroundColor: countdown > 30 ? "#22c55e" : "#f59e0b" }}
          />
          <span>Refresh in {countdownMins}:{countdownSecs.toString().padStart(2, "0")}</span>
          <span className="text-gray-300">|</span>
          <span>Last: {lastRefresh.toLocaleTimeString()}</span>
          <button
            onClick={() => fetchData()}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600 ml-2"
          >
            ↻ Refresh Now
          </button>
          <span className="text-gray-400 ml-2">{rows.length} snapshots</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow overflow-hidden">
        <TopScrollbar>
          <table className="w-full text-sm" style={{ minWidth: 1800 }}>
            <thead>
              <tr>
                <th className={TH} style={{ backgroundColor: HEADER_BG, borderTopLeftRadius: 8 }} onClick={() => toggleSort("site")}>Site{sortIndicator("site")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("zone")}>Zone{sortIndicator("zone")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("equipment")}>Equipment{sortIndicator("equipment")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("time")}>Time{sortIndicator("time")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("directive")}>Eagle Eye Directive{sortIndicator("directive")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("fan")}>Fan{sortIndicator("fan")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("supply")}>Supply{sortIndicator("supply")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("return")}>Return{sortIndicator("return")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("deltaT")}>ΔT{sortIndicator("deltaT")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("power")}>Power{sortIndicator("power")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("comp")}>Comp{sortIndicator("comp")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("setpoint")}>Active Setpoint{sortIndicator("setpoint")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("feelsLikeScore")}>Feels Like Score{sortIndicator("feelsLikeScore")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("zoneTemp")}>Zone Temp{sortIndicator("zoneTemp")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("zoneHumidity")}>Zone Humidity{sortIndicator("zoneHumidity")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("feelsLikeTemp")}>Feels Like Temp{sortIndicator("feelsLikeTemp")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("source")}>Source{sortIndicator("source")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("occScore")}>Occ Score{sortIndicator("occScore")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG }} onClick={() => toggleSort("manager")}>Manager{sortIndicator("manager")}</th>
                <th className={TH} style={{ backgroundColor: HEADER_BG, borderTopRightRadius: 8 }} onClick={() => toggleSort("ssScore")}>SS Score{sortIndicator("ssScore")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COL_COUNT + 1} className="py-8 text-gray-500 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading HVAC status...
                    </div>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT + 1} className="py-8 text-gray-500 text-center">
                    No HVAC zone snapshots found
                  </td>
                </tr>
              ) : sorted.map((row, idx) => {
                const log = row.log;

                // Delta T color
                let dtColor = "text-gray-600";
                if (log.delta_t !== null) {
                  dtColor = log.delta_t < 0 ? "text-blue-600" : log.delta_t > 15 ? "text-green-600" : log.delta_t >= 10 ? "text-gray-700" : "text-amber-600";
                }

                return (
                  <tr key={`${row.zoneId}-${log.id}`} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    {/* Site */}
                    <td className={TD}>
                      <Link href={`/sites/${row.siteId}?tab=space-hvac`} className="text-blue-700 hover:text-blue-900 hover:underline font-medium">
                        {row.siteName}
                      </Link>
                    </td>

                    {/* Zone */}
                    <td className={TD}>
                      <Link href={`/sites/${row.siteId}/zones/${row.zoneId}`} className="text-blue-700 hover:text-blue-900 hover:underline font-medium">
                        {row.zoneName}
                      </Link>
                    </td>

                    {/* Equipment */}
                    <td className={TD}>{row.equipmentName}</td>

                    {/* Time */}
                    <td className={TD}>
                      <span className="font-mono text-gray-800">{formatTime(log.recorded_at)}</span>
                    </td>

                    {/* Eagle Eye Directive */}
                    <td className={TD}>
                      <DirectiveBadge phase={log.phase} action={log.hvac_action} />
                    </td>

                    {/* Fan */}
                    <td className={TD}>{friendlyFan(log.fan_mode)}</td>

                    {/* Supply */}
                    <td className={TD}>
                      {log.supply_temp_f != null ? <span className="text-gray-600">{log.supply_temp_f}°F</span> : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Return */}
                    <td className={TD}>
                      {log.return_temp_f != null ? <span className="text-gray-600">{log.return_temp_f}°F</span> : <span className="text-gray-400">—</span>}
                    </td>

                    {/* ΔT */}
                    <td className={TD}>
                      {log.delta_t != null ? <span className={`font-medium ${dtColor}`}>{log.delta_t.toFixed(1)}°F</span> : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Power */}
                    <td className={TD}>
                      {log.power_kw != null ? <span className="text-gray-600">{log.power_kw} kW</span> : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Comp */}
                    <td className={TD}>
                      {log.comp_on != null ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${log.comp_on ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>
                          {log.comp_on ? "On" : "Off"}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Active Setpoint */}
                    <td className={TD}>{renderSetpoint(log)}</td>

                    {/* Feels Like Score */}
                    <td className={`${TD} text-center`}><AdjBadge value={log.feels_like_adj} /></td>

                    {/* Zone Temp */}
                    <td className={TD}>
                      {log.zone_temp_f != null ? <span className="font-medium" style={{ color: "#12723A" }}>{log.zone_temp_f}°F</span> : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Zone Humidity */}
                    <td className={TD}>
                      {log.zone_humidity != null ? <span className="font-medium" style={{ color: "#80B52C" }}>{log.zone_humidity}%</span> : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Feels Like Temp */}
                    <td className={TD}>
                      {log.feels_like_temp_f != null ? (
                        <span className={`font-medium ${log.zone_temp_f != null && Math.abs(log.feels_like_temp_f - log.zone_temp_f) >= 2 ? "text-red-600" : "text-gray-500"}`}>
                          {log.feels_like_temp_f}°F
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Source */}
                    <td className={TD}>
                      <span className={`px-2 py-0.5 rounded font-medium ${getSourceBadgeClass(row.tempSource)}`}>
                        {getSourceLabel(row.tempSource)}
                      </span>
                    </td>

                    {/* Occ Score */}
                    <td className={`${TD} text-center`}><AdjBadge value={log.occupancy_adj} /></td>

                    {/* Manager */}
                    <td className={`${TD} text-center`}>
                      {log.manager_adj === null || log.manager_adj === 0
                        ? <span className="text-gray-400">0</span>
                        : log.manager_adj > 0
                        ? <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">+{log.manager_adj}°F</span>
                        : <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{log.manager_adj}°F</span>
                      }
                    </td>

                    {/* SS Score */}
                    <td className={`${TD} text-center`}><AdjBadge value={log.smart_start_adj} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TopScrollbar>
      </div>
    </div>
  );
}
