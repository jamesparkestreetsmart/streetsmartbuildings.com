"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/* ======================================================
   Public Types
====================================================== */

export type ExceptionModalMode =
  | "create"
  | "edit-one-time"
  | "edit-recurring-forward";

/* ======================================================
   Internal Types
====================================================== */

type RuleType =
  | "single_date"
  | "fixed_yearly"
  | "nth_weekday"
  | "weekly_days"
  | "date_range_daily"
  | "interval";

type HoursType = "closed" | "special";

type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

type NthOption = -1 | 1 | 2 | 3 | 4;
type IntervalUnit = "days" | "weeks";

interface ExceptionModalProps {
  open: boolean;
  siteId: string;
  mode: ExceptionModalMode;
  initialData: any | null;
  onClose: () => void;
  onSaved: () => void;
}

/* ======================================================
   Helpers
====================================================== */

function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10);
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
];

/* ======================================================
   Component
====================================================== */

export default function ExceptionModal({
  open,
  siteId,
  mode,
  initialData,
  onClose,
  onSaved,
}: ExceptionModalProps) {

  const [ruleType, setRuleType] = useState<RuleType>("single_date");
  const [hoursType, setHoursType] = useState<HoursType>("closed");
  const [name, setName] = useState("");

  // single_date
  const [singleDate, setSingleDate] = useState("");

  // fixed_yearly
  const [fixedMonth, setFixedMonth] = useState<number | "">("");
  const [fixedDay, setFixedDay] = useState<number | "">("");

  // nth_weekday
  const [nth, setNth] = useState<NthOption>(1);
  const [nthWeekday, setNthWeekday] = useState<Weekday>("monday");
  const [nthMonth, setNthMonth] = useState<number | "">("");

  // weekly_days
  const [weeklyDays, setWeeklyDays] = useState<Weekday[]>([]);

  // date_range_daily
  const [rangeStart, setRangeStart] = useState("");
  const [rangeStartTime, setRangeStartTime] = useState("15:00"); // hotel-style default
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeEndTime, setRangeEndTime] = useState("11:00");

  // interval
  const [intervalValue, setIntervalValue] = useState<number>(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("weeks");
  const [intervalStartDate, setIntervalStartDate] = useState("");

  // hours
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* ======================================================
     Reset form
  ====================================================== */

  function resetForm() {
    setRuleType("single_date");
    setName("");
    setSingleDate("");
    setFixedMonth("");
    setFixedDay("");
    setNth(1);
    setNthWeekday("monday");
    setNthMonth("");
    setWeeklyDays([]);
    setRangeStart("");
    setRangeStartTime("15:00");
    setRangeEnd("");
    setRangeEndTime("11:00");
    setIntervalValue(1);
    setIntervalUnit("weeks");
    setIntervalStartDate("");
    setHoursType("closed");
    setOpenTime("");
    setCloseTime("");
  }

  /* ======================================================
     Load initial data
  ====================================================== */

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSaving(false);

    if (mode === "create" || !initialData) {
      resetForm();
      return;
    }

    // TODO: hydrate edit mode
    resetForm();

  }, [open, mode, initialData]);

  /* ======================================================
     Build rule
  ====================================================== */

  function buildRule(): object | null {
    switch (ruleType) {
      case "single_date":
        if (!singleDate) return null;
        return { type: "single_date", date: singleDate };

      case "fixed_yearly":
        if (!fixedMonth || !fixedDay) return null;
        return { type: "fixed_yearly", month: fixedMonth, day: fixedDay };

      case "nth_weekday":
        if (!nthMonth) return null;
        return {
          type: "nth_weekday",
          month: nthMonth,
          weekday: nthWeekday,
          nth,
        };

      case "weekly_days":
        if (weeklyDays.length === 0) return null;
        return { type: "weekly_days", days: weeklyDays };

      case "date_range_daily":
        if (!rangeStart || !rangeEnd || !rangeStartTime || !rangeEndTime) return null;
        return {
          type: "date_range_daily",
          start_date: rangeStart,
          start_time: rangeStartTime,
          end_date: rangeEnd,
          end_time: rangeEndTime,
        };

      case "interval":
        if (!intervalStartDate || intervalValue < 1) return null;
        return {
          type: "interval",
          interval: intervalValue,
          unit: intervalUnit,
          start_date: intervalStartDate,
        };

      default:
        return null;
    }
  }

  function validate(): boolean {
    if (!siteId) return false;
    if (!name.trim()) return false;

    const rule = buildRule();
    if (!rule) return false;

    if (ruleType === "date_range_daily") {
      if (rangeEnd < rangeStart) return false;
    }

    if (hoursType === "special") {
      if (!openTime || !closeTime) return false;
      if (openTime >= closeTime) return false;
    }

    return true;
  }

  /* ======================================================
     Save
  ====================================================== */

  async function handleSave() {
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    setError(null);

    try {
      const recurrence_rule = buildRule();

      const payload = {
        site_id: siteId,
        name: name.trim(),
        is_closed: hoursType === "closed",
        open_time: hoursType === "special" ? openTime : null,
        close_time: hoursType === "special" ? closeTime : null,
        effective_from_date: ruleType === "single_date" ? singleDate : todayYYYYMMDD(),
        recurrence_rule,
      };

      const res = await fetch("/api/store-hours/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await safeJson(res);
        setError(j?.error || `Failed to save (${res.status})`);
        setSaving(false);
        return;
      }

      onSaved();
    } catch (err) {
      console.error(err);
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  function toggleWeeklyDay(day: Weekday) {
    setWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  /* ======================================================
     UI
  ====================================================== */

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {mode === "create" ? "Add Event" : "Edit Event"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Event Name */}
        <div className="mb-5">
          <label className="font-semibold block mb-2">Event Name</label>
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="e.g., Renovation shutdown"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Rule Type */}
        <div className="mb-5">
          <label className="font-semibold block mb-2">Schedule Type</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as RuleType)}
          >
            <option value="single_date">Single Date</option>
            <option value="fixed_yearly">Fixed Yearly</option>
            <option value="nth_weekday">Nth Weekday</option>
            <option value="weekly_days">Weekly Days</option>
            <option value="date_range_daily">Date Range (Daily)</option>
            <option value="interval">Interval</option>
          </select>
        </div>

        {/* Date Range Daily */}
        {ruleType === "date_range_daily" && (
          <div className="mb-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold block mb-2">Start Date</label>
                <input
                  type="date"
                  className="border rounded px-3 py-2 w-full"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                />
              </div>
              <div>
                <label className="font-semibold block mb-2">Start Time</label>
                <input
                  type="time"
                  className="border rounded px-3 py-2 w-full"
                  value={rangeStartTime}
                  onChange={(e) => setRangeStartTime(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold block mb-2">End Date</label>
                <input
                  type="date"
                  className="border rounded px-3 py-2 w-full"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </div>
              <div>
                <label className="font-semibold block mb-2">End Time</label>
                <input
                  type="time"
                  className="border rounded px-3 py-2 w-full"
                  value={rangeEndTime}
                  onChange={(e) => setRangeEndTime(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Example: Hotel closure from check-in (3:00 PM) to checkout (11:00 AM)
            </p>
          </div>
        )}

        {/* Hours */}
        <div className="mb-6">
          <label className="font-semibold block mb-2">Hours</label>

          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={hoursType === "closed"}
                onChange={() => setHoursType("closed")}
              />
              Closed all day
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={hoursType === "special"}
                onChange={() => setHoursType("special")}
              />
              Special hours
            </label>
          </div>

          {hoursType === "special" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600 block mb-1">Open</label>
                <input
                  type="time"
                  className="border rounded px-3 py-2 w-full"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Close</label>
                <input
                  type="time"
                  className="border rounded px-3 py-2 w-full"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !validate()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
