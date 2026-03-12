"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getSourceLabel, getSourceBadgeClass } from "@/lib/source-labels";
import TopScrollbar from "@/components/ui/TopScrollbar";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogRow {
  id: string;
  hvac_zone_id: string;
  recorded_at: string;
  phase: string | null;
  profile_heat_f: number | null;
  profile_cool_f: number | null;
  feels_like_adj: number | null;
  smart_start_adj: number | null;
  occupancy_adj: number | null;
  manager_adj: number | null;
  active_heat_f: number | null;
  active_cool_f: number | null;
  zone_temp_f: number | null;
  zone_humidity: number | null;
  feels_like_temp_f: number | null;
  occupied_sensor_count: number | null;
  fan_mode: string | null;
  hvac_action: string | null;
  supply_temp_f: number | null;
  return_temp_f: number | null;
  delta_t: number | null;
  power_kw: number | null;
  comp_on: boolean | null;
  apparent_power_kva: number | null;
  compressor_current_a: number | null;
  energy_delta_kwh: number | null;
  efficiency_ratio: number | null;
  outdoor_air_temp_f: number | null;
}

interface DaySummary {
  avg_temp: number | null;
  runtime_heating_min: number;
  runtime_cooling_min: number;
  compressor_cycles: number;
  avg_efficiency: number | null;
  total_energy_kwh: number;
}

interface DayAggregate {
  day: string;
  avg_temp: number | null;
  avg_humidity: number | null;
  heat_hours: number;
  cool_hours: number;
  compressor_cycles: number;
  total_energy_kwh: number;
  avg_efficiency: number | null;
}

interface ZoneInfo {
  hvac_zone_id: string;
  name: string;
  zone_type: string | null;
  equipment_id: string | null;
  profile_id: string | null;
  smart_start_enabled?: boolean;
  manager_override_active?: boolean;
  manager_override_remaining_min?: number | null;
}

interface ProfileInfo {
  profile_id: string;
  name: string;
  occupied_hvac_mode: string;
  occupied_heat_f: number | null;
  occupied_cool_f: number | null;
  unoccupied_heat_f: number | null;
  unoccupied_cool_f: number | null;
  guardrail_min_f: number | null;
  guardrail_max_f: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateOffset(base: string, days: number): string {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatRuntime(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function friendlyFan(fan: string | null): string {
  if (!fan) return "\u2014";
  switch (fan) {
    case "Auto low": return "Auto";
    case "Low": return "On";
    case "Circulation": return "Circ";
    default: return fan;
  }
}

function friendlyMode(mode: string): string {
  switch (mode) {
    case "heat_cool": return "Auto";
    case "heat": return "Heat Only";
    case "cool": return "Cool Only";
    default: return mode;
  }
}

function ActionBadge({ action, phase }: { action: string | null; phase?: string | null }) {
  if (phase === "closed") {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">Store closed today</span>;
  }
  if (!action || action === "idle") {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">idle</span>;
  }
  if (action === "heating") {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">heating</span>;
  }
  if (action === "cooling") {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">cooling</span>;
  }
  return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-600">{action}</span>;
}

function AdjBadge({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-gray-400">0</span>;
  if (value > 0)
    return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">+{value}</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{value}</span>;
}

function ManagerBadge({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-gray-400">0</span>;
  if (value > 0)
    return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">+{value}{"\u00B0"}F</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{value}{"\u00B0"}F</span>;
}

const Dash = () => <span className="text-gray-400">{"\u2014"}</span>;

function renderActiveSetpoint(log: LogRow) {
  const heat = log.active_heat_f;
  const cool = log.active_cool_f;
  const action = log.hvac_action;
  if (heat == null && cool == null) return <Dash />;
  if (heat != null && cool == null)
    return <span className="font-medium text-amber-700">{heat}{"\u00B0"}F <span className="text-[10px] text-gray-400">{"\u2191"}</span></span>;
  if (cool != null && heat == null)
    return <span className="font-medium text-blue-700">{cool}{"\u00B0"}F <span className="text-[10px] text-gray-400">{"\u2193"}</span></span>;
  if (heat != null && cool != null) {
    if (action === "heating")
      return (
        <span className="whitespace-nowrap">
          <span className="font-medium text-amber-700">{heat}{"\u00B0"}F {"\u2191"}</span>
          <span className="text-gray-300 mx-0.5">{"\u00B7"}</span>
          <span className="text-[11px] text-gray-400">{cool}{"\u00B0"}F</span>
        </span>
      );
    if (action === "cooling")
      return (
        <span className="whitespace-nowrap">
          <span className="text-[11px] text-gray-400">{heat}{"\u00B0"}F</span>
          <span className="text-gray-300 mx-0.5">{"\u00B7"}</span>
          <span className="font-medium text-blue-700">{cool}{"\u00B0"}F {"\u2193"}</span>
        </span>
      );
    return (
      <span className="whitespace-nowrap">
        <span className="font-medium text-gray-700">{heat}{"\u2013"}{cool}{"\u00B0"}F</span>
        <span className="text-[10px] text-green-600 ml-1">in range</span>
      </span>
    );
  }
  return <Dash />;
}

// ─── Styling ─────────────────────────────────────────────────────────────────

const TH_BASE = "py-1.5 px-2 font-semibold whitespace-nowrap text-xs";
const GH = "py-1 px-2 text-[10px] font-bold uppercase tracking-wider text-center text-white/90";
const TH_FIXED = `${TH_BASE} bg-slate-800 text-white`;
const TH_G1_P = `${TH_BASE} bg-blue-900 text-white`;
const TH_G1_S = `${TH_BASE} bg-blue-800 text-blue-100`;
const TH_G2 = `${TH_BASE} bg-emerald-900 text-white`;
const TH_G3_P = `${TH_BASE} bg-orange-900 text-white`;
const TH_G3_S = `${TH_BASE} bg-orange-800 text-orange-100`;
const TH_G4_P = `${TH_BASE} bg-purple-900 text-white`;
const TH_G4_S = `${TH_BASE} bg-purple-800 text-purple-100`;
const TH_G5_P = `${TH_BASE} bg-amber-900 text-white`;
const TH_G5_S = `${TH_BASE} bg-amber-800 text-amber-100`;
const TH_G6_P = `${TH_BASE} bg-teal-900 text-white`;
const TH_G6_S = `${TH_BASE} bg-teal-800 text-teal-100`;
const TH_G7 = `${TH_BASE} bg-slate-700 text-white`;
const TH_G8_P = `${TH_BASE} text-white`;
const TH_G8_S = `${TH_BASE} text-white/90`;
const TD = "py-1.5 px-2 whitespace-nowrap text-xs";
const COL_COUNT = 24;

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ZoneDetailPage() {
  const params = useParams();
  const siteId = params.siteid as string;
  const zoneId = params.zoneid as string;

  const [zone, setZone] = useState<ZoneInfo | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [siteName, setSiteName] = useState("");
  const [equipName, setEquipName] = useState("");
  const [tempSource, setTempSource] = useState("Thermostat");
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [tab, setTab] = useState<"timeline" | "aggregates">("timeline");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [aggregates, setAggregates] = useState<DayAggregate[]>([]);
  const [aggRange, setAggRange] = useState<"today" | "7d" | "30d">("7d");
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [loadingAgg, setLoadingAgg] = useState(false);

  // ─── Fetch Zone Info ────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      // Zone — base columns from a_hvac_zones
      const { data: z, error: zErr } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id, name, zone_type, equipment_id, profile_id")
        .eq("hvac_zone_id", zoneId)
        .eq("site_id", siteId)
        .single();
      if (zErr) console.error("[ZoneDetail] Zone fetch error:", zErr);

      // Extra fields from view (smart_start, manager override)
      if (z) {
        const zoneInfo: ZoneInfo = { ...z };
        const { data: vz } = await supabase
          .from("view_hvac_zones_with_state")
          .select("smart_start_enabled, manager_override_active, manager_override_remaining_min")
          .eq("hvac_zone_id", zoneId)
          .eq("site_id", siteId)
          .maybeSingle();
        if (vz) {
          zoneInfo.smart_start_enabled = vz.smart_start_enabled ?? false;
          zoneInfo.manager_override_active = vz.manager_override_active ?? false;
          zoneInfo.manager_override_remaining_min = vz.manager_override_remaining_min ?? null;
        }
        setZone(zoneInfo);
      }

      // Profile
      if (z?.profile_id) {
        const { data: p, error: pErr } = await supabase
          .from("b_thermostat_profiles")
          .select("profile_id, name, occupied_hvac_mode, occupied_heat_f, occupied_cool_f, unoccupied_heat_f, unoccupied_cool_f, guardrail_min_f, guardrail_max_f")
          .eq("profile_id", z.profile_id)
          .single();
        if (pErr) console.error("[ZoneDetail] Profile fetch error:", pErr);
        if (p) setProfile(p as ProfileInfo);
      }

      // Site name
      const { data: s } = await supabase
        .from("a_sites")
        .select("site_name")
        .eq("site_id", siteId)
        .single();
      if (s) setSiteName(s.site_name);

      // Equipment name
      if (z?.equipment_id) {
        const { data: e } = await supabase
          .from("a_equipments")
          .select("equipment_name")
          .eq("equipment_id", z.equipment_id)
          .single();
        if (e) setEquipName(e.equipment_name);
      }

      // Temp source — match SpaceHvacTable logic: resolve space via
      // equipment_served_spaces (primary) and a_spaces.hvac_zone_id (fallback),
      // then check a_space_sensors for temperature sensors in those spaces.
      try {
        const idsToCheck: string[] = [];

        // Primary path: zone → equipment → served spaces (same as SpaceHvacTable)
        if (z?.equipment_id) {
          const { data: served } = await supabase
            .from("a_equipment_served_spaces")
            .select("space_id")
            .eq("equipment_id", z.equipment_id);
          for (const row of served || []) idsToCheck.push(row.space_id);
        }

        // Fallback: spaces linked via hvac_zone_id
        const { data: spaces } = await supabase
          .from("a_spaces")
          .select("space_id")
          .eq("site_id", siteId)
          .eq("hvac_zone_id", zoneId);
        for (const s of spaces || []) {
          if (!idsToCheck.includes(s.space_id)) idsToCheck.push(s.space_id);
        }

        // Last resort: zone ID itself as space ID
        if (!idsToCheck.includes(zoneId)) idsToCheck.push(zoneId);

        if (idsToCheck.length > 0) {
          const { data: sensors } = await supabase
            .from("a_space_sensors")
            .select("space_id, entity_id")
            .eq("sensor_type", "temperature")
            .in("space_id", idsToCheck)
            .not("entity_id", "is", null)
            .limit(1);
          if (sensors && sensors.length > 0) setTempSource("Zone Avg");
        }
      } catch (err) {
        console.error("[ZoneDetail] Temp source check error:", err);
      }

      setLoading(false);
    };
    load();
  }, [zoneId, siteId]);

  // ─── Fetch Timeline Data ──────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoadingRows(true);
      try {
        const res = await fetch(`/api/zones/${zoneId}/history?date=${date}&include_summary=true`);
        const data = await res.json();
        setRows(data.rows || []);
        setSummary(data.summary || null);
      } catch {
        setRows([]);
        setSummary(null);
      }
      setLoadingRows(false);
    };
    load();
  }, [zoneId, date]);

  // ─── Fetch Aggregates ─────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== "aggregates") return;
    const load = async () => {
      setLoadingAgg(true);
      let start: string;
      let end: string;
      switch (aggRange) {
        case "today":
          start = date;
          end = date;
          break;
        case "7d":
          start = dateOffset(date, -6);
          end = date;
          break;
        case "30d":
          start = dateOffset(date, -29);
          end = date;
          break;
      }
      try {
        const res = await fetch(`/api/zones/${zoneId}/history?start_date=${start}&end_date=${end}`);
        const data = await res.json();
        setAggregates(data.aggregates || []);
      } catch {
        setAggregates([]);
      }
      setLoadingAgg(false);
    };
    load();
  }, [zoneId, tab, aggRange, date]);

  // ─── Date Navigation ──────────────────────────────────────────────────────

  const prevDay = () => setDate((d) => dateOffset(d, -1));
  const nextDay = () => setDate((d) => dateOffset(d, 1));

  // ─── Loading / Error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="grid grid-cols-5 gap-4 mt-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-xl mt-6" />
        </div>
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <p className="text-red-600">Zone not found.</p>
        <Link href={`/sites/${siteId}?tab=space-hvac`} className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          Back to site
        </Link>
      </div>
    );
  }

  const totalRuntimeMin = summary ? summary.runtime_heating_min + summary.runtime_cooling_min : 0;

  // Chart data for "Today" temperature view (5-min rows sorted ascending)
  const tempChartData = [...rows]
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .map((r) => ({
      time: formatTime(r.recorded_at),
      zone_temp: r.zone_temp_f,
      heat_sp: r.active_heat_f,
      cool_sp: r.active_cool_f,
      outdoor: r.outdoor_air_temp_f,
    }));

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="w-full rounded-lg bg-gradient-to-r from-green-600 to-yellow-500 p-6">
        <Link
          href={`/sites/${siteId}?tab=space-hvac`}
          className="text-white/80 hover:text-white text-sm mb-2 inline-block"
        >
          {"\u2190"} {siteName || "Back to Site"}
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-white">{zone.name}</h1>
              {zone.zone_type && (
                <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full capitalize">
                  {zone.zone_type}
                </span>
              )}
            </div>

            {profile && (
              <div className="mt-2 space-y-1">
                <p className="text-white/90 text-sm">
                  {profile.name} {"\u00B7"} {friendlyMode(profile.occupied_hvac_mode)}
                </p>
                <p className="text-white/80 text-xs">
                  Occupied: {profile.occupied_heat_f ?? "\u2014"}{"\u00B0"}{"\u2013"}{profile.occupied_cool_f ?? "\u2014"}{"\u00B0"}F
                  {" | "}Unoccupied: {profile.unoccupied_heat_f ?? "\u2014"}{"\u00B0"}{"\u2013"}{profile.unoccupied_cool_f ?? "\u2014"}{"\u00B0"}F
                  {" | "}Guardrails: {profile.guardrail_min_f ?? "\u2014"}{"\u00B0"}{"\u2013"}{profile.guardrail_max_f ?? "\u2014"}{"\u00B0"}F
                </p>
              </div>
            )}

            {equipName && zone.equipment_id && (
              <Link
                href={`/sites/${siteId}/equipment/${zone.equipment_id}/individual-equipment`}
                className="text-white/80 hover:text-white text-xs mt-1 inline-block underline"
              >
                Equipment: {equipName}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryCard label="Avg Zone Temp" value={summary?.avg_temp != null ? `${summary.avg_temp}\u00B0F` : "\u2014"} />
          <SummaryCard
            label="Total Runtime"
            value={summary ? formatRuntime(totalRuntimeMin) : "\u2014"}
            sub={summary ? `Heat ${formatRuntime(summary.runtime_heating_min)} \u00B7 Cool ${formatRuntime(summary.runtime_cooling_min)}` : undefined}
          />
          <SummaryCard label="Compressor Cycles" value={summary ? String(summary.compressor_cycles) : "\u2014"} />
          <SummaryCard label="Avg Efficiency" value={summary?.avg_efficiency != null ? `${summary.avg_efficiency}%` : "\u2014"} />
          <SummaryCard label="Total Energy" value={summary ? `${summary.total_energy_kwh} kWh` : "\u2014"} />
        </div>

        {/* Date Picker */}
        <div className="flex items-center justify-center gap-4">
          <button onClick={prevDay} className="px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-100 text-sm">
            {"\u2190"}
          </button>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm"
            />
            <span className="text-sm text-gray-600 font-medium">{formatDate(date)}</span>
          </div>
          <button onClick={nextDay} className="px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-100 text-sm">
            {"\u2192"}
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("timeline")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "timeline" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => setTab("aggregates")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "aggregates" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Aggregates
          </button>
        </div>

        {/* Tab Content */}
        {tab === "timeline" ? (
          <TimelineTable rows={rows} loading={loadingRows} tempSource={tempSource} zone={zone} />
        ) : (
          <AggregatesTab
            aggregates={aggregates}
            tempChartData={tempChartData}
            aggRange={aggRange}
            setAggRange={setAggRange}
            loading={loadingAgg}
            isToday={aggRange === "today"}
          />
        )}
      </main>
    </div>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Timeline Table ──────────────────────────────────────────────────────────

function TimelineTable({
  rows,
  loading,
  tempSource,
  zone,
}: {
  rows: LogRow[];
  loading: boolean;
  tempSource: string;
  zone: ZoneInfo | null;
}) {
  if (loading) {
    return (
      <div className="rounded-xl bg-white shadow p-4">
        <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading timeline...
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-white shadow p-4">
        <p className="text-center text-gray-500 py-8">No data for this date</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white shadow p-4">
      <p className="text-xs text-gray-400 mb-3">{rows.length} records</p>
      <TopScrollbar>
        <table className="w-full text-sm" style={{ minWidth: 2800 }}>
          <thead>
            {/* Row 1: Group labels */}
            <tr>
              <th rowSpan={2} className={`${TH_FIXED} rounded-tl-md`}>Time</th>
              <th colSpan={7} className={`${GH} bg-blue-900`}>Thermostat Commands</th>
              <th colSpan={1} className={`${GH} bg-emerald-900`}>Active</th>
              <th colSpan={5} className={`${GH} bg-orange-900`}>Feels Like</th>
              <th colSpan={2} className={`${GH} bg-purple-900`}>Occupancy</th>
              <th colSpan={2} className={`${GH} bg-amber-900`}>Manager</th>
              <th colSpan={2} className={`${GH} bg-teal-900`}>Smart Start</th>
              <th colSpan={1} className={`${GH} bg-slate-700`}>Profile</th>
              <th colSpan={3} className={`${GH} rounded-tr-md`} style={{ backgroundColor: "#1e3a5f" }}>Power Meter</th>
            </tr>
            {/* Row 2: Column names */}
            <tr>
              <th className={TH_G1_P}>Eagle Eye Directive</th>
              <th className={TH_G1_P}>Fan</th>
              <th className={TH_G1_S}>Supply</th>
              <th className={TH_G1_S}>Return</th>
              <th className={TH_G1_S}>{"\u0394"}T</th>
              <th className={TH_G1_S}>Power</th>
              <th className={TH_G1_S}>Comp</th>
              <th className={TH_G2}>Active Setpoint</th>
              <th className={TH_G3_P}>Feels Like Score</th>
              <th className={TH_G3_S}>Zone Temp</th>
              <th className={TH_G3_S}>Zone Humidity</th>
              <th className={TH_G3_S}>Feels Like Temp</th>
              <th className={TH_G3_S}>Source</th>
              <th className={TH_G4_P}>Occ Score</th>
              <th className={TH_G4_S}>Sensors</th>
              <th className={TH_G5_P}>Manager</th>
              <th className={TH_G5_S}>Remaining</th>
              <th className={TH_G6_P}>SS Score</th>
              <th className={TH_G6_S}>SS Enabled</th>
              <th className={TH_G7}>Profile Setpoint</th>
              <th className={TH_G8_P} style={{ backgroundColor: "#1e3a5f" }}>Apparent</th>
              <th className={TH_G8_P} style={{ backgroundColor: "#1e3a5f" }}>Current</th>
              <th className={TH_G8_S} style={{ backgroundColor: "#264a6f" }}>Energy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((log, idx) => {
              const rowBg =
                log.hvac_action === "heating"
                  ? "bg-amber-50/50"
                  : log.hvac_action === "cooling"
                    ? "bg-blue-50/50"
                    : "";

              let dtColor = "text-gray-600";
              if (log.delta_t != null) {
                dtColor =
                  log.delta_t < 0
                    ? "text-blue-600"
                    : log.delta_t > 15
                      ? "text-green-600"
                      : log.delta_t >= 10
                        ? "text-gray-700"
                        : "text-amber-600";
              }

              return (
                <tr key={log.id} className={`${rowBg} border-b border-gray-100 hover:bg-gray-50/50 transition-colors`}>
                  {/* Time */}
                  <td className={TD}>
                    <span className={`font-mono ${idx === 0 ? "font-medium text-gray-800" : "text-gray-500"}`}>
                      {formatTime(log.recorded_at)}
                    </span>
                  </td>
                  {/* G1: Thermostat Commands */}
                  <td className={TD}><ActionBadge action={log.hvac_action} phase={log.phase} /></td>
                  <td className={TD}><span className="text-gray-600">{friendlyFan(log.fan_mode)}</span></td>
                  <td className={TD}>
                    {log.supply_temp_f != null ? <span className="text-gray-600">{log.supply_temp_f}{"\u00B0"}F</span> : <Dash />}
                  </td>
                  <td className={TD}>
                    {log.return_temp_f != null ? <span className="text-gray-600">{log.return_temp_f}{"\u00B0"}F</span> : <Dash />}
                  </td>
                  <td className={TD}>
                    {log.delta_t != null
                      ? <span className={`font-medium ${dtColor}`}>{log.delta_t.toFixed(1)}{"\u00B0"}F</span>
                      : <Dash />}
                  </td>
                  <td className={TD}>
                    {log.power_kw != null ? <span className="text-gray-600">{log.power_kw} kW</span> : <Dash />}
                  </td>
                  <td className={TD}>
                    {log.comp_on != null ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        log.comp_on ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
                      }`}>
                        {log.comp_on ? "On" : "Off"}
                      </span>
                    ) : <Dash />}
                  </td>
                  {/* G2: Active Setpoint */}
                  <td className={TD}>{renderActiveSetpoint(log)}</td>
                  {/* G3: Feels Like */}
                  <td className={`${TD} text-center`}><AdjBadge value={log.feels_like_adj} /></td>
                  <td className={TD}>
                    {log.zone_temp_f != null
                      ? <span className="font-medium" style={{ color: "#12723A" }}>{log.zone_temp_f}{"\u00B0"}F</span>
                      : <Dash />}
                  </td>
                  <td className={TD}>
                    {log.zone_humidity != null
                      ? <span className="font-medium" style={{ color: "#80B52C" }}>{log.zone_humidity}%</span>
                      : <Dash />}
                  </td>
                  <td className={TD}>
                    {log.feels_like_temp_f != null ? (
                      <span className={`font-medium ${
                        log.zone_temp_f != null && Math.abs(log.feels_like_temp_f - log.zone_temp_f) >= 2
                          ? "text-red-600" : "text-gray-500"
                      }`}>
                        {log.feels_like_temp_f}{"\u00B0"}F
                      </span>
                    ) : <Dash />}
                  </td>
                  <td className={TD}>
                    <span className={`px-2 py-0.5 rounded font-medium ${getSourceBadgeClass(tempSource)}`}>
                      {getSourceLabel(tempSource)}
                    </span>
                  </td>
                  {/* G4: Occupancy */}
                  <td className={`${TD} text-center`}><AdjBadge value={log.occupancy_adj} /></td>
                  <td className={`${TD} text-center`}>
                    {log.occupied_sensor_count != null
                      ? <span className="text-gray-600">{log.occupied_sensor_count}</span>
                      : <Dash />}
                  </td>
                  {/* G5: Manager */}
                  <td className={`${TD} text-center`}><ManagerBadge value={log.manager_adj} /></td>
                  <td className={`${TD} text-center`}>
                    {zone?.manager_override_active && (zone.manager_override_remaining_min ?? 0) > 0 ? (
                      (() => {
                        const m = zone.manager_override_remaining_min!;
                        const hrs = Math.floor(m / 60);
                        const mins = m % 60;
                        return <span className="text-xs font-medium text-amber-700">{hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`}</span>;
                      })()
                    ) : <Dash />}
                  </td>
                  {/* G6: Smart Start */}
                  <td className={`${TD} text-center`}><AdjBadge value={log.smart_start_adj} /></td>
                  <td className={`${TD} text-center`}>
                    {zone?.smart_start_enabled
                      ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">yes</span>
                      : <span className="text-xs text-gray-400">no</span>}
                  </td>
                  {/* G7: Profile Setpoint */}
                  <td className={TD}>
                    {log.profile_heat_f != null && log.profile_cool_f != null ? (
                      <span className="text-gray-600">
                        {log.profile_heat_f}{"\u00B0"}{"\u2013"}{log.profile_cool_f}{"\u00B0"}F
                        <span className="text-gray-400 ml-1">({log.phase === "occupied" ? "occ" : log.phase === "closed" ? "closed" : "unocc"})</span>
                      </span>
                    ) : <Dash />}
                  </td>
                  {/* G8: Power Meter */}
                  <td className={TD}>
                    {log.apparent_power_kva != null
                      ? <span className="text-gray-600">{log.apparent_power_kva.toFixed(1)} kVA</span>
                      : <Dash />}
                  </td>
                  <td className={TD}>
                    {log.compressor_current_a != null
                      ? <span className="text-gray-600">{log.compressor_current_a.toFixed(2)} A</span>
                      : <Dash />}
                  </td>
                  <td className={TD}>
                    {log.energy_delta_kwh != null
                      ? <span className="text-gray-600">{log.energy_delta_kwh.toFixed(2)} kWh</span>
                      : <Dash />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TopScrollbar>
    </div>
  );
}

// ─── Aggregates Tab ──────────────────────────────────────────────────────────

function AggregatesTab({
  aggregates,
  tempChartData,
  aggRange,
  setAggRange,
  loading,
  isToday,
}: {
  aggregates: DayAggregate[];
  tempChartData: { time: string; zone_temp: number | null; heat_sp: number | null; cool_sp: number | null; outdoor: number | null }[];
  aggRange: string;
  setAggRange: (r: "today" | "7d" | "30d") => void;
  loading: boolean;
  isToday: boolean;
}) {
  // Sort ascending for charts
  const chartData = [...aggregates].sort((a, b) => a.day.localeCompare(b.day));

  return (
    <div className="space-y-6">
      {/* Range Selector */}
      <div className="flex gap-2">
        {(["today", "7d", "30d"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setAggRange(r)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              aggRange === r
                ? "bg-green-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {r === "today" ? "Today" : r === "7d" ? "7 Days" : "30 Days"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading aggregates...
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Temperature Over Time */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Temperature Over Time</h3>
              <ResponsiveContainer width="100%" height={260}>
                {isToday && tempChartData.length > 0 ? (
                  <LineChart data={tempChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} domain={["auto", "auto"]} />
                    <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="zone_temp" name="Zone Temp" stroke="#12723A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="heat_sp" name="Heat Setpoint" stroke="#d97706" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="cool_sp" name="Cool Setpoint" stroke="#2563eb" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="outdoor" name="Outdoor" stroke="#9ca3af" strokeWidth={1} dot={false} />
                  </LineChart>
                ) : (
                  <LineChart
                    data={chartData.map((a) => ({ day: a.day.slice(5), avg_temp: a.avg_temp }))}
                    margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} domain={["auto", "auto"]} />
                    <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line type="monotone" dataKey="avg_temp" name="Avg Temp" stroke="#12723A" strokeWidth={2} dot={{ r: 3, fill: "#12723A" }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Daily Runtime */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Runtime</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={chartData.map((a) => ({ day: a.day.slice(5), heat: a.heat_hours, cool: a.cool_hours }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} />
                  <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="heat" name="Heating" fill="#d97706" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cool" name="Cooling" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 3: Daily Energy */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Energy</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={chartData.map((a) => ({ day: a.day.slice(5), energy: a.total_energy_kwh }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} />
                  <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="energy" name="Energy (kWh)" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 4: Efficiency Trend */}
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Efficiency Trend</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={chartData.map((a) => ({ day: a.day.slice(5), efficiency: a.avg_efficiency }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} />
                  <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="efficiency" name="Avg Efficiency %" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3, fill: "#7c3aed" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary Stats Table */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-3 text-left text-xs font-semibold text-gray-600">Date</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600">Avg Temp</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600">Heat Runtime</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600">Cool Runtime</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600">Cycles</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600">Energy</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600">Avg Efficiency</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-gray-600">Avg Humidity</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregates.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-6 text-gray-400">
                        No data for selected range
                      </td>
                    </tr>
                  ) : (
                    aggregates.map((a) => (
                      <tr key={a.day} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-800">{a.day}</td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {a.avg_temp != null ? `${a.avg_temp}\u00B0F` : "\u2014"}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">{a.heat_hours}h</td>
                        <td className="py-2 px-3 text-right text-gray-600">{a.cool_hours}h</td>
                        <td className="py-2 px-3 text-right text-gray-600">{a.compressor_cycles}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{a.total_energy_kwh} kWh</td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {a.avg_efficiency != null ? `${a.avg_efficiency}%` : "\u2014"}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {a.avg_humidity != null ? `${a.avg_humidity}%` : "\u2014"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
