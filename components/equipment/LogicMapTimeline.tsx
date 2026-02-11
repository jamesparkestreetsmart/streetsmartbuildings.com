"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScheduleEntry {
  equipment_id: string;
  equipment_name: string;
  equipment_group: string;
  site_id: string;
  zone_type: string | null;
  space_type: string | null;
  manifest_date: string;
  open_time: string | null;       // "HH:MM:SS"
  close_time: string | null;
  is_closed: boolean;
  start_offset_minutes: number;
  end_offset_minutes: number;
  scheduled_on_time: string | null;   // "HH:MM:SS"
  scheduled_off_time: string | null;
  action_on: string | null;
  action_off: string | null;
  rule_name: string | null;
  schedule_source: string;
}

interface SmartStartEntry {
  device_id: string;
  device_name: string;
  label: string | null;
  smart_start_enabled: boolean;
  equipment_id: string | null;
  ha_device_id: string;
}

interface SmartStartLog {
  device_id: string;
  offset_used_minutes: number | null;
  next_recommended_offset: number | null;
  hit_guardrail: boolean;
}

interface Props {
  siteId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert "HH:MM:SS" to minutes from midnight */
function timeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Convert minutes from midnight to "h:mm AM/PM" */
function minutesToDisplay(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** Get percentage position on 24-hour timeline */
function minutesToPercent(mins: number): number {
  return Math.max(0, Math.min(100, (mins / 1440) * 100));
}

/** Get current time as minutes from midnight */
function currentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// ─── Color system ────────────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { bg: string; border: string; text: string; light: string }> = {
  HVAC: { bg: "#3b82f6", border: "#2563eb", text: "#1e40af", light: "#dbeafe" },
  Lighting: { bg: "#f59e0b", border: "#d97706", text: "#92400e", light: "#fef3c7" },
  Refrigeration: { bg: "#06b6d4", border: "#0891b2", text: "#155e75", light: "#cffafe" },
  Plumbing: { bg: "#8b5cf6", border: "#7c3aed", text: "#5b21b6", light: "#ede9fe" },
  default: { bg: "#6b7280", border: "#4b5563", text: "#374151", light: "#f3f4f6" },
};

function getGroupColor(group: string) {
  return GROUP_COLORS[group] || GROUP_COLORS.default;
}

const ZONE_BADGES: Record<string, { bg: string; text: string }> = {
  customer: { bg: "#dcfce7", text: "#166534" },
  employee: { bg: "#fef9c3", text: "#854d0e" },
  storage: { bg: "#f3f4f6", text: "#374151" },
};

// ─── Timeline Bar Component ─────────────────────────────────────────────────

function TimelineBar({
  entry,
  smartStartOffset,
  smartStartHitGuardrail,
  nowMinutes,
}: {
  entry: ScheduleEntry;
  smartStartOffset: number | null;
  smartStartHitGuardrail: boolean;
  nowMinutes: number;
}) {
  const openMins = timeToMinutes(entry.open_time);
  const closeMins = timeToMinutes(entry.close_time);
  const onMins = timeToMinutes(entry.scheduled_on_time);
  const offMins = timeToMinutes(entry.scheduled_off_time);
  const colors = getGroupColor(entry.equipment_group);

  if (entry.is_closed || onMins === null || offMins === null) {
    return (
      <div className="relative h-8 bg-gray-50 rounded border border-gray-200 flex items-center justify-center">
        <span className="text-xs text-gray-400 italic">
          {entry.is_closed ? "Closed today" : "No schedule"}
        </span>
      </div>
    );
  }

  // Smart Start pre-conditioning window
  const smartStartMins = smartStartOffset !== null && openMins !== null
    ? Math.max(0, onMins - smartStartOffset)
    : null;

  return (
    <div className="relative h-8 bg-gray-50 rounded border border-gray-200 overflow-hidden">
      {/* Store hours background band */}
      {openMins !== null && closeMins !== null && (
        <div
          className="absolute top-0 bottom-0 opacity-10"
          style={{
            left: `${minutesToPercent(openMins)}%`,
            width: `${minutesToPercent(closeMins) - minutesToPercent(openMins)}%`,
            backgroundColor: "#22c55e",
          }}
        />
      )}

      {/* Smart Start pre-conditioning window */}
      {smartStartMins !== null && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="absolute top-0 bottom-0 opacity-30"
                style={{
                  left: `${minutesToPercent(smartStartMins)}%`,
                  width: `${minutesToPercent(onMins) - minutesToPercent(smartStartMins)}%`,
                  backgroundColor: smartStartHitGuardrail ? "#ef4444" : "#a855f7",
                  backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 6px)",
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
              <p className="text-xs font-medium">
                Smart Start {smartStartHitGuardrail ? "⚠ Hit guardrail" : ""}
              </p>
              <p className="text-xs opacity-75">
                Pre-condition: {minutesToDisplay(smartStartMins)} → {minutesToDisplay(onMins)}
              </p>
              <p className="text-xs opacity-75">Offset: {smartStartOffset} min</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Active equipment window */}
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute top-1 bottom-1 rounded-sm cursor-help"
              style={{
                left: `${minutesToPercent(onMins)}%`,
                width: `${Math.max(minutesToPercent(offMins) - minutesToPercent(onMins), 0.5)}%`,
                backgroundColor: colors.bg,
                opacity: 0.85,
              }}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
            <p className="text-xs font-medium">{entry.equipment_name}</p>
            <p className="text-xs opacity-75">
              ON: {minutesToDisplay(onMins)} ({entry.action_on || "turn_on"})
            </p>
            <p className="text-xs opacity-75">
              OFF: {minutesToDisplay(offMins)} ({entry.action_off || "turn_off"})
            </p>
            <p className="text-xs opacity-60 mt-1">
              Offset: {entry.start_offset_minutes}min / +{entry.end_offset_minutes}min
            </p>
            <p className="text-xs opacity-60">Source: {entry.schedule_source}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Open/Close markers */}
      {openMins !== null && (
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: `${minutesToPercent(openMins)}%`,
            backgroundColor: "#22c55e",
          }}
        />
      )}
      {closeMins !== null && (
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: `${minutesToPercent(closeMins)}%`,
            backgroundColor: "#ef4444",
          }}
        />
      )}

      {/* Current time marker */}
      <div
        className="absolute top-0 bottom-0 w-0.5 z-10"
        style={{
          left: `${minutesToPercent(nowMinutes)}%`,
          backgroundColor: "#000",
        }}
      >
        <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-black" />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function LogicMapTimeline({ siteId }: Props) {
  const [scheduleData, setScheduleData] = useState<ScheduleEntry[]>([]);
  const [smartStartDevices, setSmartStartDevices] = useState<SmartStartEntry[]>([]);
  const [smartStartLogs, setSmartStartLogs] = useState<SmartStartLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMinutes, setNowMinutes] = useState(currentTimeMinutes());

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setNowMinutes(currentTimeMinutes()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Equipment schedule from the view
      const { data: schedData, error: schedError } = await supabase
        .from("view_daily_equipment_schedule")
        .select("*")
        .eq("site_id", siteId);

      if (schedError) {
        console.error("Error fetching schedule:", schedError);
      }
      setScheduleData((schedData || []) as ScheduleEntry[]);

      // 2. Smart Start enabled thermostats
      const { data: ssDevices } = await supabase
        .from("a_devices")
        .select("device_id, device_name, label, smart_start_enabled, equipment_id, ha_device_id")
        .eq("site_id", siteId)
        .eq("device_role", "thermostat")
        .eq("smart_start_enabled", true);

      setSmartStartDevices((ssDevices || []) as SmartStartEntry[]);

      // 3. Latest smart start logs for today
      const today = new Date().toISOString().split("T")[0];
      const deviceIds = (ssDevices || []).map((d: any) => d.device_id);
      if (deviceIds.length > 0) {
        const { data: ssLogs } = await supabase
          .from("b_smart_start_log")
          .select("device_id, offset_used_minutes, next_recommended_offset, hit_guardrail")
          .in("device_id", deviceIds)
          .eq("date", today);

        setSmartStartLogs((ssLogs || []) as SmartStartLog[]);
      }

      setLoading(false);
    };

    fetchData();
  }, [siteId]);

  // Build smart start lookup: equipment_id → { offset, guardrail }
  const smartStartByEquipment = useMemo(() => {
    const map: Record<string, { offset: number; guardrail: boolean }> = {};
    for (const device of smartStartDevices) {
      if (!device.equipment_id) continue;
      const log = smartStartLogs.find((l) => l.device_id === device.device_id);
      map[device.equipment_id] = {
        offset: log?.offset_used_minutes ?? log?.next_recommended_offset ?? 30,
        guardrail: log?.hit_guardrail ?? false,
      };
    }
    return map;
  }, [smartStartDevices, smartStartLogs]);

  // Group schedule entries by equipment_group
  const groupedSchedule = useMemo(() => {
    const groups: Record<string, ScheduleEntry[]> = {};
    for (const entry of scheduleData) {
      const group = entry.equipment_group || "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(entry);
    }
    // Sort within groups by scheduled_on_time
    for (const group of Object.keys(groups)) {
      groups[group].sort((a, b) => {
        const aTime = timeToMinutes(a.scheduled_on_time) ?? 9999;
        const bTime = timeToMinutes(b.scheduled_on_time) ?? 9999;
        return aTime - bTime;
      });
    }
    return groups;
  }, [scheduleData]);

  // Get store hours for header
  const storeOpen = scheduleData.length > 0 ? scheduleData[0].open_time : null;
  const storeClose = scheduleData.length > 0 ? scheduleData[0].close_time : null;
  const isClosed = scheduleData.length > 0 && scheduleData[0].is_closed;

  // Time axis labels
  const timeLabels = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => ({
    hour: h,
    label: h === 0 ? "12a" : h === 12 ? "12p" : h === 24 ? "12a" : h > 12 ? `${h - 12}p` : `${h}a`,
    percent: (h / 24) * 100,
  }));

  return (
    <div className="rounded-xl bg-white shadow p-4 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Logic Map</h2>
          <span className="text-xs text-gray-500">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-500 opacity-30" />
              Store hours
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#a855f7", opacity: 0.5 }} />
              Smart Start
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-4 bg-black rounded-full" />
              Now
            </span>
          </div>
          {/* Store hours display */}
          {storeOpen && storeClose && !isClosed && (
            <span className="text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 font-medium">
              Open {minutesToDisplay(timeToMinutes(storeOpen)!)} – {minutesToDisplay(timeToMinutes(storeClose)!)}
            </span>
          )}
          {isClosed && (
            <span className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 font-medium">
              Closed Today
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-gray-500 text-center flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading schedule...
        </div>
      ) : scheduleData.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-500">No equipment schedules found for today.</p>
          <p className="text-xs text-gray-400 mt-1">
            Add schedule rules in the org settings, or check that today&apos;s manifest has been generated.
          </p>
        </div>
      ) : (
        <div>
          {/* Time axis */}
          <div className="relative h-6 mb-1 ml-[220px]">
            {timeLabels.map((t) => (
              <span
                key={t.hour}
                className="absolute text-[10px] text-gray-400 -translate-x-1/2"
                style={{ left: `${t.percent}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>

          {/* Grid lines + equipment rows */}
          {Object.entries(groupedSchedule).map(([group, entries]) => {
            const colors = getGroupColor(group);

            return (
              <div key={group} className="mb-4">
                {/* Group header */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{ backgroundColor: colors.light, color: colors.text }}
                  >
                    {group}
                  </span>
                  <span className="text-xs text-gray-400">{entries.length} equipment</span>
                </div>

                {/* Rows */}
                {entries.map((entry) => {
                  const ssData = smartStartByEquipment[entry.equipment_id];
                  const zoneBadge = entry.zone_type ? ZONE_BADGES[entry.zone_type] : null;

                  return (
                    <div key={entry.equipment_id} className="flex items-center gap-0 mb-1.5">
                      {/* Equipment label */}
                      <div className="w-[220px] flex-shrink-0 flex items-center gap-2 pr-3">
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[140px]" title={entry.equipment_name}>
                          {entry.equipment_name}
                        </span>
                        {zoneBadge && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                            style={{ backgroundColor: zoneBadge.bg, color: zoneBadge.text }}
                          >
                            {entry.zone_type}
                          </span>
                        )}
                        {entry.schedule_source === "equipment_override" && (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-orange-500 flex-shrink-0 cursor-help">✎</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                                <p className="text-xs">Equipment-level schedule override</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {ssData && (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`text-[10px] flex-shrink-0 cursor-help ${
                                    ssData.guardrail ? "text-red-500" : "text-purple-500"
                                  }`}
                                >
                                  ⚡
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="rounded-md bg-gray-900 text-white px-3 py-2 shadow-xl">
                                <p className="text-xs font-medium">Smart Start active</p>
                                <p className="text-xs opacity-75">Offset: {ssData.offset} min</p>
                                {ssData.guardrail && (
                                  <p className="text-xs text-red-300">⚠ Hit 60-min guardrail</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      {/* Timeline bar */}
                      <div className="flex-1 relative">
                        {/* Vertical grid lines */}
                        {timeLabels.map((t) => (
                          <div
                            key={t.hour}
                            className="absolute top-0 bottom-0 w-px bg-gray-100"
                            style={{ left: `${t.percent}%` }}
                          />
                        ))}
                        <TimelineBar
                          entry={entry}
                          smartStartOffset={ssData?.offset ?? null}
                          smartStartHitGuardrail={ssData?.guardrail ?? false}
                          nowMinutes={nowMinutes}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Summary footer */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-6 text-xs text-gray-500">
            <span>
              <strong className="text-gray-700">{scheduleData.length}</strong> scheduled equipment
            </span>
            <span>
              <strong className="text-gray-700">{smartStartDevices.length}</strong> Smart Start active
            </span>
            {smartStartLogs.some((l) => l.hit_guardrail) && (
              <span className="text-red-600 font-medium">
                ⚠ {smartStartLogs.filter((l) => l.hit_guardrail).length} guardrail hit(s)
              </span>
            )}
            <span className="ml-auto text-gray-400">
              Based on midnight manifest • Schedule rules applied at {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
