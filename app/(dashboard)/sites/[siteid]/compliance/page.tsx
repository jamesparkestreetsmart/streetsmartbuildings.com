"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useOrg } from "@/context/OrgContext";
import Link from "next/link";
import { ChevronDown, ChevronRight, ArrowLeft, FileText } from "lucide-react";
import { SOP_METRICS, SOP_EVALUATION_WINDOWS } from "@/lib/sop/constants";

// ── Types ───────────────────────────────────────────────────────

interface ComplianceRow {
  log_id: string;
  sop_assignment_id: string;
  equipment_id: string | null;
  space_id: string | null;
  period_start: string;
  period_end: string;
  total_readings: number;
  compliant_readings: number;
  compliance_pct: number | null;
  config_label: string;
  metric: string;
  min_value: number | null;
  max_value: number | null;
  evaluation_window: string;
  unit: string;
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  config_org_id: string | null;
  config_site_id: string | null;
  config_equipment_id: string | null;
  equipment_name: string | null;
  equipment_group: string | null;
  space_name: string | null;
  space_type: string | null;
}

interface SiteInfo {
  site_id: string;
  site_name: string;
  timezone: string;
  org_id: string;
  org_name: string;
}

// ── Helpers ─────────────────────────────────────────────────────

const metricLabel = (value: string) =>
  SOP_METRICS.find((m) => m.value === value)?.label || value;

const windowLabel = (value: string) =>
  SOP_EVALUATION_WINDOWS.find((w) => w.value === value)?.label || value;

function formatRange(min: number | null, max: number | null, unit: string): string {
  const u = unit === "F" ? "°F" : unit === "C" ? "°C" : unit === "percent" ? "%" : ` ${unit}`;
  if (min != null && max != null) return `${min} – ${max}${u}`;
  if (max != null) return `≤ ${max}${u}`;
  if (min != null) return `≥ ${min}${u}`;
  return "—";
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function complianceColor(pct: number | null): string {
  if (pct == null) return "text-gray-400";
  if (pct >= 95) return "text-green-600";
  if (pct >= 80) return "text-yellow-600";
  return "text-red-600";
}

function complianceBg(pct: number | null): string {
  if (pct == null) return "bg-gray-100 text-gray-400";
  if (pct >= 95) return "bg-green-100 text-green-700";
  if (pct >= 80) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function trendArrow(current: number | null, previous: number | null): { icon: string; color: string } {
  if (current == null || previous == null) return { icon: "—", color: "text-gray-400" };
  const diff = current - previous;
  if (diff > 1) return { icon: "↑", color: "text-green-600" };
  if (diff < -1) return { icon: "↓", color: "text-red-500" };
  return { icon: "→", color: "text-gray-500" };
}

function avgPct(rows: ComplianceRow[]): number | null {
  const valid = rows.filter((r) => r.compliance_pct != null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((s, r) => s + r.compliance_pct!, 0) / valid.length) * 10) / 10;
}

// ── Date helpers ────────────────────────────────────────────────

function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Sparkbar Component ──────────────────────────────────────────

function Sparkbar({ rows, rangeStart, rangeEnd }: {
  rows: ComplianceRow[];
  rangeStart: string;
  rangeEnd: string;
}) {
  // Build daily averages
  const days: { date: string; pct: number | null }[] = [];
  let cur = rangeStart;
  while (cur < rangeEnd) {
    const dayRows = rows.filter((r) => r.period_start.slice(0, 10) === cur || r.period_start.startsWith(cur));
    const pct = avgPct(dayRows.length > 0 ? dayRows : []);
    days.push({ date: cur, pct });
    cur = addDays(cur, 1);
  }

  if (days.length === 0) return null;

  return (
    <div className="flex items-end gap-px h-6" style={{ width: Math.min(days.length * 3, 120) }}>
      {days.map((d) => {
        const height = d.pct != null ? Math.max((d.pct / 100) * 24, 2) : 2;
        const color = d.pct == null
          ? "bg-gray-200"
          : d.pct >= 95
          ? "bg-green-400"
          : d.pct >= 80
          ? "bg-yellow-400"
          : "bg-red-400";
        return (
          <div
            key={d.date}
            className={`${color} rounded-sm`}
            style={{ width: 2, height }}
            title={`${d.date}: ${d.pct != null ? d.pct + "%" : "no data"}`}
          />
        );
      })}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function CompliancePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const siteId = params.siteid as string;
  const dateParam = searchParams.get("date");
  const { isServiceProvider } = useOrg();

  // Date range state
  const [rangePreset, setRangePreset] = useState<"1d" | "7d" | "30d" | "90d" | "custom">(
    dateParam ? "1d" : "30d"
  );
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [rangeStart, setRangeStart] = useState(() => {
    if (dateParam) return dateParam;
    return addDays(todayStr(), -30);
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    if (dateParam) return addDays(dateParam, 1);
    return addDays(todayStr(), 1);
  });

  // Data state
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [showEquipment, setShowEquipment] = useState(true);
  const [showSpaces, setShowSpaces] = useState(true);

  // Expand state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSpaceTypes, setExpandedSpaceTypes] = useState<Set<string>>(new Set());
  const [configsExpanded, setConfigsExpanded] = useState(false);

  // Apply range preset
  const applyPreset = useCallback(
    (preset: string, anchor?: string) => {
      const base = anchor || dateParam || todayStr();
      switch (preset) {
        case "1d":
          setRangeStart(base);
          setRangeEnd(addDays(base, 1));
          break;
        case "7d":
          setRangeStart(addDays(base, -3));
          setRangeEnd(addDays(base, 4));
          break;
        case "30d":
          if (anchor) {
            setRangeStart(addDays(base, -15));
            setRangeEnd(addDays(base, 15));
          } else {
            setRangeStart(addDays(todayStr(), -30));
            setRangeEnd(addDays(todayStr(), 1));
          }
          break;
        case "90d":
          if (anchor) {
            setRangeStart(addDays(base, -45));
            setRangeEnd(addDays(base, 45));
          } else {
            setRangeStart(addDays(todayStr(), -90));
            setRangeEnd(addDays(todayStr(), 1));
          }
          break;
      }
    },
    [dateParam]
  );

  // Fetch data
  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    fetch(`/api/compliance?site_id=${siteId}&range_start=${rangeStart}&range_end=${rangeEnd}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          console.error("[compliance]", data.error);
          setRows([]);
        } else {
          setRows(data.rows || []);
          setSite(data.site || null);
        }
      })
      .catch((err) => console.error("[compliance]", err))
      .finally(() => setLoading(false));
  }, [siteId, rangeStart, rangeEnd]);

  // Initialize filters when data loads
  useEffect(() => {
    if (rows.length === 0) return;
    const groups = new Set(rows.filter((r) => r.equipment_group).map((r) => r.equipment_group!));
    const metrics = new Set(rows.map((r) => r.metric));
    setSelectedGroups((prev) => prev.size === 0 ? groups : prev);
    setSelectedMetrics((prev) => prev.size === 0 ? metrics : prev);
  }, [rows]);

  // ── Derived data ──────────────────────────────────────────────

  // All unique groups and metrics for filter UI
  const allGroups = useMemo(
    () => [...new Set(rows.filter((r) => r.equipment_group).map((r) => r.equipment_group!))].sort(
      (a, b) => (a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b))
    ),
    [rows]
  );
  const allMetrics = useMemo(
    () => [...new Set(rows.map((r) => r.metric))],
    [rows]
  );

  // Overall score (unfiltered, excludes zero-reading rows)
  const overallPct = useMemo(() => avgPct(rows), [rows]);
  const equipConfigCount = useMemo(
    () => new Set(rows.filter((r) => r.equipment_id).map((r) => r.sop_assignment_id)).size,
    [rows]
  );
  const spaceConfigCount = useMemo(
    () => new Set(rows.filter((r) => r.space_id).map((r) => r.sop_assignment_id)).size,
    [rows]
  );
  const dayCount = useMemo(
    () => new Set(rows.map((r) => r.period_start.slice(0, 10))).size,
    [rows]
  );

  // Filtered rows (for sections)
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (!selectedMetrics.has(r.metric)) return false;
      if (r.equipment_id && !showEquipment) return false;
      if (r.space_id && !showSpaces) return false;
      if (r.equipment_group && !selectedGroups.has(r.equipment_group)) return false;
      return true;
    });
  }, [rows, selectedMetrics, showEquipment, showSpaces, selectedGroups]);

  // Section A: Metric summary (respects metric + scope filters, NOT equipment group)
  const metricSummary = useMemo(() => {
    const scopeFiltered = rows.filter((r) => {
      if (!selectedMetrics.has(r.metric)) return false;
      if (r.equipment_id && !showEquipment) return false;
      if (r.space_id && !showSpaces) return false;
      return true;
    });

    const byMetric = new Map<string, ComplianceRow[]>();
    for (const r of scopeFiltered) {
      if (!byMetric.has(r.metric)) byMetric.set(r.metric, []);
      byMetric.get(r.metric)!.push(r);
    }

    // Trend: compute current 7d vs prior 7d relative to range end
    const endDate = rangeEnd;
    const cur7Start = addDays(endDate, -7);
    const prev7Start = addDays(endDate, -14);

    return [...byMetric.entries()]
      .map(([metric, mRows]) => {
        const pct = avgPct(mRows);
        const totalReadings = mRows.reduce((s, r) => s + r.total_readings, 0);

        const cur7 = mRows.filter(
          (r) => r.period_start >= cur7Start + "T" && r.period_start < endDate + "T"
        );
        const prev7 = mRows.filter(
          (r) => r.period_start >= prev7Start + "T" && r.period_start < cur7Start + "T"
        );

        return {
          metric,
          pct,
          totalReadings,
          trend: trendArrow(avgPct(cur7), avgPct(prev7)),
        };
      })
      .sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999));
  }, [rows, selectedMetrics, showEquipment, showSpaces, rangeEnd]);

  // Section B: Equipment compliance
  const equipmentData = useMemo(() => {
    const eqRows = filteredRows.filter((r) => r.equipment_id);
    const byGroup = new Map<string, ComplianceRow[]>();
    for (const r of eqRows) {
      const group = r.equipment_group || "Uncategorized";
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group)!.push(r);
    }

    const endDate = rangeEnd;
    const cur7Start = addDays(endDate, -7);
    const prev7Start = addDays(endDate, -14);

    return [...byGroup.entries()]
      .sort(([a], [b]) => (a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b)))
      .map(([group, gRows]) => {
        const unitIds = [...new Set(gRows.map((r) => r.equipment_id!))];
        const cur7 = gRows.filter((r) => r.period_start >= cur7Start + "T" && r.period_start < endDate + "T");
        const prev7 = gRows.filter((r) => r.period_start >= prev7Start + "T" && r.period_start < cur7Start + "T");

        // Build equipment sub-rows
        const equipmentItems = unitIds.map((eqId) => {
          const eqRows = gRows.filter((r) => r.equipment_id === eqId);
          const name = eqRows[0]?.equipment_name || eqId.slice(0, 8);
          const byMetric = new Map<string, ComplianceRow[]>();
          for (const r of eqRows) {
            if (!byMetric.has(r.metric)) byMetric.set(r.metric, []);
            byMetric.get(r.metric)!.push(r);
          }
          return {
            equipment_id: eqId,
            name,
            metrics: [...byMetric.entries()].map(([metric, mRows]) => ({
              metric,
              pct: avgPct(mRows),
              rows: mRows,
            })),
          };
        });

        return {
          group,
          pct: avgPct(gRows),
          unitCount: unitIds.length,
          trend: trendArrow(avgPct(cur7), avgPct(prev7)),
          rows: gRows,
          equipment: equipmentItems,
        };
      });
  }, [filteredRows, rangeEnd]);

  // Section C: Space compliance
  const spaceData = useMemo(() => {
    const spRows = filteredRows.filter((r) => r.space_id);
    const byType = new Map<string, ComplianceRow[]>();
    for (const r of spRows) {
      const type = r.space_type || "Uncategorized";
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(r);
    }

    const endDate = rangeEnd;
    const cur7Start = addDays(endDate, -7);
    const prev7Start = addDays(endDate, -14);

    return [...byType.entries()]
      .sort(([a], [b]) => (a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b)))
      .map(([type, tRows]) => {
        const spaceIds = [...new Set(tRows.map((r) => r.space_id!))];
        const cur7 = tRows.filter((r) => r.period_start >= cur7Start + "T" && r.period_start < endDate + "T");
        const prev7 = tRows.filter((r) => r.period_start >= prev7Start + "T" && r.period_start < cur7Start + "T");

        const spaceItems = spaceIds.map((spId) => {
          const spRows = tRows.filter((r) => r.space_id === spId);
          const name = spRows[0]?.space_name || spId.slice(0, 8);
          const byMetric = new Map<string, ComplianceRow[]>();
          for (const r of spRows) {
            if (!byMetric.has(r.metric)) byMetric.set(r.metric, []);
            byMetric.get(r.metric)!.push(r);
          }
          return {
            space_id: spId,
            name,
            metrics: [...byMetric.entries()].map(([metric, mRows]) => ({
              metric,
              pct: avgPct(mRows),
              rows: mRows,
            })),
          };
        });

        return {
          type,
          pct: avgPct(tRows),
          spaceCount: spaceIds.length,
          trend: trendArrow(avgPct(cur7), avgPct(prev7)),
          rows: tRows,
          spaces: spaceItems,
        };
      });
  }, [filteredRows, rangeEnd]);

  // Section D: Config definitions
  const configDefs = useMemo(() => {
    const seen = new Map<string, ComplianceRow>();
    for (const r of rows) {
      if (!seen.has(r.sop_assignment_id)) seen.set(r.sop_assignment_id, r);
    }
    return [...seen.values()];
  }, [rows]);

  const activeConfigs = configDefs.filter((c) => !c.effective_to || c.effective_to >= todayStr());
  const retiredConfigs = configDefs.filter((c) => c.effective_to && c.effective_to < todayStr());

  // ── Toggle helpers ────────────────────────────────────────────

  const toggleGroup = (g: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  const toggleMetric = (m: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  };

  const toggleExpandGroup = (g: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  const toggleExpandSpaceType = (t: string) => {
    setExpandedSpaceTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back link */}
      <Link href={`/sites/${siteId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to site
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {site?.site_name || "Loading..."} — SOP Compliance
        </h1>

        {/* Date range selector */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {(dateParam ? ["1d", "7d", "30d", "90d"] : ["7d", "30d", "90d"]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setRangePreset(p as typeof rangePreset);
                applyPreset(p, dateParam || undefined);
              }}
              className={`px-3 py-1 rounded text-xs font-medium border ${
                rangePreset === p
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {p === "1d" ? "Day" : p}
            </button>
          ))}
          <button
            onClick={() => setRangePreset("custom")}
            className={`px-3 py-1 rounded text-xs font-medium border ${
              rangePreset === "custom"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            Custom
          </button>
          {rangePreset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart || rangeStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border rounded px-2 py-1 text-xs"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={customEnd || addDays(rangeEnd, -1)}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border rounded px-2 py-1 text-xs"
              />
              <button
                onClick={() => {
                  if (customStart && customEnd) {
                    setRangeStart(customStart);
                    setRangeEnd(addDays(customEnd, 1));
                  }
                }}
                className="px-3 py-1 rounded text-xs font-medium bg-blue-600 text-white"
              >
                Apply
              </button>
            </div>
          )}
          {dateParam && (
            <span className="text-xs text-gray-400 ml-2">
              Anchored to {formatDate(dateParam)}
            </span>
          )}
        </div>

        {/* Overall score */}
        {!loading && rows.length > 0 && (
          <div className="mt-4 p-4 border rounded-lg bg-gray-50">
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-bold ${complianceColor(overallPct)}`}>
                {overallPct != null ? `${overallPct}%` : "—"}
              </span>
              <span className="text-lg text-gray-600">Overall Compliance</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {equipConfigCount} equipment config{equipConfigCount !== 1 ? "s" : ""}
              {" · "}
              {spaceConfigCount} space config{spaceConfigCount !== 1 ? "s" : ""}
              {" · "}
              {dayCount} day{dayCount !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-400 italic mt-1">
              Overall score reflects all compliance rows in the selected period and does not change with filters.
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-sm text-gray-400 py-12">Loading compliance data...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <h2 className="text-lg font-semibold text-gray-500">No compliance data</h2>
          <p className="text-sm text-gray-400 mt-1">
            No SOP configs have generated compliance data for this site in the selected period.
          </p>
          {isServiceProvider && (
            <Link href="/trust?tab=sop-standards" className="inline-block mt-3 text-sm text-blue-600 hover:underline">
              Manage Configs →
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* ── Filter Controls ─────────────────────────────────── */}
          <div className="mb-6 space-y-3">
            {/* Equipment group filter */}
            {allGroups.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-500 uppercase">Equipment Group</span>
                  <button
                    onClick={() => setSelectedGroups(new Set(allGroups))}
                    className="text-[10px] text-blue-500 hover:underline"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedGroups(new Set())}
                    className="text-[10px] text-blue-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {allGroups.map((g) => (
                    <button
                      key={g}
                      onClick={() => toggleGroup(g)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                        selectedGroups.has(g)
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "bg-white border-gray-200 text-gray-400"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Metric filter */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-500 uppercase">Metric</span>
                <button
                  onClick={() => setSelectedMetrics(new Set(allMetrics))}
                  className="text-[10px] text-blue-500 hover:underline"
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedMetrics(new Set())}
                  className="text-[10px] text-blue-500 hover:underline"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {allMetrics.map((m) => (
                  <button
                    key={m}
                    onClick={() => toggleMetric(m)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                      selectedMetrics.has(m)
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-400"
                    }`}
                  >
                    {metricLabel(m)}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope filter */}
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase mr-2">Scope</span>
              <button
                onClick={() => setShowEquipment(!showEquipment)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border mr-1 transition ${
                  showEquipment
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                Equipment
              </button>
              <button
                onClick={() => setShowSpaces(!showSpaces)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  showSpaces
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                Spaces
              </button>
            </div>
          </div>

          {/* ── Section A: Metric Summary ───────────────────────── */}
          <div className="mb-6">
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-sm font-semibold text-gray-800">Metric Summary</h2>
              <span className="text-[10px] text-gray-400 italic">Aggregates selected scopes (Equipment and/or Spaces)</span>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Metric</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Compliance</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Readings</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {metricSummary.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-3 text-center text-gray-400 text-xs">No data for selected filters</td></tr>
                  ) : (
                    metricSummary.map((m) => (
                      <tr key={m.metric}>
                        <td className="px-4 py-2 text-gray-800">{metricLabel(m.metric)}</td>
                        <td className="px-4 py-2">
                          <span className={`font-semibold ${complianceColor(m.pct)}`}>
                            {m.pct != null ? `${m.pct}%` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-600">{m.totalReadings.toLocaleString()}</td>
                        <td className={`px-4 py-2 text-lg ${m.trend.color}`}>{m.trend.icon}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Section B: Equipment Compliance ─────────────────── */}
          {showEquipment && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Equipment Compliance</h2>
              {equipmentData.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-sm text-gray-400">
                  No equipment compliance data for selected filters.
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Equipment Group</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Compliance</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Units</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Trend</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Sparkbar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {equipmentData.map((g) => (
                        <EquipmentGroupRows
                          key={g.group}
                          group={g}
                          expanded={expandedGroups.has(g.group)}
                          onToggle={() => toggleExpandGroup(g.group)}
                          rangeStart={rangeStart}
                          rangeEnd={rangeEnd}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Section C: Space Compliance ─────────────────────── */}
          {showSpaces && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Space Compliance</h2>
              {spaceData.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-sm text-gray-400">
                  <p>No space SOP configs are defined for this site yet.</p>
                  <p className="mt-1 text-xs">
                    Space compliance can track dining room temperature, kitchen humidity, and more.
                  </p>
                  {isServiceProvider ? (
                    <Link href="/trust?tab=sop-standards" className="inline-block mt-2 text-sm text-blue-600 hover:underline">
                      Add Config →
                    </Link>
                  ) : (
                    <p className="mt-2 text-xs text-gray-400">
                      Contact your SSB account manager to configure space compliance standards.
                    </p>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Space Type</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Compliance</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Spaces</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Trend</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Sparkbar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {spaceData.map((t) => (
                        <SpaceTypeRows
                          key={t.type}
                          group={t}
                          expanded={expandedSpaceTypes.has(t.type)}
                          onToggle={() => toggleExpandSpaceType(t.type)}
                          rangeStart={rangeStart}
                          rangeEnd={rangeEnd}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Section D: Config Definitions ───────────────────── */}
          <div className="mb-6">
            <button
              onClick={() => setConfigsExpanded(!configsExpanded)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2"
            >
              {configsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Config Definitions ({activeConfigs.length} active
              {retiredConfigs.length > 0 ? ` · ${retiredConfigs.length} retired` : ""})
              {isServiceProvider && (
                <Link
                  href="/trust?tab=sop-standards"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-blue-600 hover:underline font-normal ml-2"
                >
                  Manage Configs →
                </Link>
              )}
            </button>
            {configsExpanded && (
              <div className="grid gap-3 md:grid-cols-2">
                {configDefs.map((c) => {
                  const isRetired = c.effective_to && c.effective_to < todayStr();
                  const scope = c.config_equipment_id
                    ? `Equipment (${c.equipment_name || "—"})`
                    : c.config_site_id
                    ? `Site (${site?.site_name || "—"})`
                    : `Org (${site?.org_name || "—"})`;

                  return (
                    <div
                      key={c.sop_assignment_id}
                      className={`border rounded-lg p-3 text-sm ${isRetired ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="font-semibold text-gray-800">
                          {metricLabel(c.metric)} — {c.config_label}
                        </div>
                        {isRetired && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                            Retired {formatDate(c.effective_to)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                        <div>Scope: {scope}</div>
                        <div>Metric: {metricLabel(c.metric)}</div>
                        <div>Range: {formatRange(c.min_value, c.max_value, c.unit)}</div>
                        <div>Evaluation: {windowLabel(c.evaluation_window)}</div>
                        <div>
                          Effective: {formatDate(c.effective_from)} – {c.effective_to ? formatDate(c.effective_to) : "(no expiry)"}
                        </div>
                        {c.notes && (
                          <div className="flex items-start gap-1 mt-1 text-gray-500">
                            <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                            {c.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Equipment Group Expandable Rows ─────────────────────────────

interface EquipmentGroupRowsProps {
  group: {
    group: string;
    pct: number | null;
    unitCount: number;
    trend: { icon: string; color: string };
    rows: ComplianceRow[];
    equipment: {
      equipment_id: string;
      name: string;
      metrics: { metric: string; pct: number | null; rows: ComplianceRow[] }[];
    }[];
  };
  expanded: boolean;
  onToggle: () => void;
  rangeStart: string;
  rangeEnd: string;
}

function EquipmentGroupRows({ group: g, expanded, onToggle, rangeStart, rangeEnd }: EquipmentGroupRowsProps) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-gray-50">
        <td className="px-4 py-2 font-medium text-gray-800 flex items-center gap-1">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          {g.group}
        </td>
        <td className="px-4 py-2">
          <span className={`font-semibold ${complianceColor(g.pct)}`}>
            {g.pct != null ? `${g.pct}%` : "—"}
          </span>
        </td>
        <td className="px-4 py-2 text-gray-600">{g.unitCount}</td>
        <td className={`px-4 py-2 text-lg ${g.trend.color}`}>{g.trend.icon}</td>
        <td className="px-4 py-2">
          <Sparkbar rows={g.rows} rangeStart={rangeStart} rangeEnd={rangeEnd} />
        </td>
      </tr>
      {expanded &&
        g.equipment.map((eq) => (
          <tr key={eq.equipment_id} className="bg-gray-50/50">
            <td colSpan={5} className="px-4 py-1">
              <div className="pl-6">
                <div className="font-medium text-gray-700 text-xs mb-0.5">{eq.name}</div>
                {eq.metrics.map((m) => (
                  <div key={m.metric} className="flex items-center gap-3 pl-3 py-0.5">
                    <span className="text-xs text-gray-500">· {metricLabel(m.metric)}</span>
                    <span className={`text-xs font-semibold ${complianceColor(m.pct)}`}>
                      {m.pct != null ? `${m.pct}%` : "—"}
                    </span>
                    <Sparkbar rows={m.rows} rangeStart={rangeStart} rangeEnd={rangeEnd} />
                  </div>
                ))}
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}

// ── Space Type Expandable Rows ──────────────────────────────────

interface SpaceTypeRowsProps {
  group: {
    type: string;
    pct: number | null;
    spaceCount: number;
    trend: { icon: string; color: string };
    rows: ComplianceRow[];
    spaces: {
      space_id: string;
      name: string;
      metrics: { metric: string; pct: number | null; rows: ComplianceRow[] }[];
    }[];
  };
  expanded: boolean;
  onToggle: () => void;
  rangeStart: string;
  rangeEnd: string;
}

function SpaceTypeRows({ group: g, expanded, onToggle, rangeStart, rangeEnd }: SpaceTypeRowsProps) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-gray-50">
        <td className="px-4 py-2 font-medium text-gray-800 flex items-center gap-1">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          {g.type}
        </td>
        <td className="px-4 py-2">
          <span className={`font-semibold ${complianceColor(g.pct)}`}>
            {g.pct != null ? `${g.pct}%` : "—"}
          </span>
        </td>
        <td className="px-4 py-2 text-gray-600">{g.spaceCount}</td>
        <td className={`px-4 py-2 text-lg ${g.trend.color}`}>{g.trend.icon}</td>
        <td className="px-4 py-2">
          <Sparkbar rows={g.rows} rangeStart={rangeStart} rangeEnd={rangeEnd} />
        </td>
      </tr>
      {expanded &&
        g.spaces.map((sp) => (
          <tr key={sp.space_id} className="bg-gray-50/50">
            <td colSpan={5} className="px-4 py-1">
              <div className="pl-6">
                <div className="font-medium text-gray-700 text-xs mb-0.5">{sp.name}</div>
                {sp.metrics.map((m) => (
                  <div key={m.metric} className="flex items-center gap-3 pl-3 py-0.5">
                    <span className="text-xs text-gray-500">· {metricLabel(m.metric)}</span>
                    <span className={`text-xs font-semibold ${complianceColor(m.pct)}`}>
                      {m.pct != null ? `${m.pct}%` : "—"}
                    </span>
                    <Sparkbar rows={m.rows} rangeStart={rangeStart} rangeEnd={rangeEnd} />
                  </div>
                ))}
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}
