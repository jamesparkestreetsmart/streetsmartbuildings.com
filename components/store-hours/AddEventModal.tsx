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

type EventType = "store_hours_schedule" | "planned_maintenance" | "hotel_occupancy";

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
  const [eventType, setEventType] = useState<EventType>("store_hours_schedule");
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

  // date_range_daily - three time slots: start day, middle days, end day
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  // Start day (check-in): open at check-in time, close at end of day
  const [startDayOpen, setStartDayOpen] = useState("15:00");
  const [startDayClose, setStartDayClose] = useState("23:59");
  // Middle days
  const [middleDaysClosed, setMiddleDaysClosed] = useState(true);
  const [middleDaysOpen, setMiddleDaysOpen] = useState("00:00");
  const [middleDaysClose, setMiddleDaysClose] = useState("23:59");
  // End day (check-out): open at start of day, close at check-out time
  const [endDayOpen, setEndDayOpen] = useState("00:00");
  const [endDayClose, setEndDayClose] = useState("11:00");

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
    setEventType("store_hours_schedule");
    setName("");
    setSingleDate("");
    setFixedMonth("");
    setFixedDay("");
    setNth(1);
    setNthWeekday("monday");
    setNthMonth("");
    setWeeklyDays([]);
    setRangeStart("");
    setRangeEnd("");
    setStartDayOpen("15:00");
    setStartDayClose("23:59");
    setMiddleDaysClosed(true);
    setMiddleDaysOpen("00:00");
    setMiddleDaysClose("23:59");
    setEndDayOpen("00:00");
    setEndDayClose("11:00");
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
        if (!rangeStart || !rangeEnd) return null;
        return {
          type: "date_range_daily",
          start_date: rangeStart,
          end_date: rangeEnd,
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
      // Determine effective dates based on rule type
      let effective_from_date: string;
      let effective_to_date: string | null;

      switch (ruleType) {
        case "single_date":
          effective_from_date = singleDate;
          effective_to_date = singleDate; // same date for single
          break;
        case "date_range_daily":
          effective_from_date = rangeStart;
          effective_to_date = rangeEnd;
          break;
        default:
          effective_from_date = todayYYYYMMDD();
          effective_to_date = null; // indefinite
      }

      // Build payload based on rule type
      console.log("Submitting with eventType:", eventType); // DEBUG
      const payload: Record<string, any> = {
        site_id: siteId,
        name: name.trim(),
        event_type: eventType,
        effective_from_date,
        effective_to_date,
        rule_type: ruleType,
      };

      // Add hours based on rule type
      if (ruleType === "date_range_daily") {
        // Three time slots for hotel-style scheduling
        payload.start_day_open = startDayOpen;
        // For hotel_occupancy, force end of day / start of day
        payload.start_day_close = eventType === "hotel_occupancy" ? "23:59" : startDayClose;
        payload.middle_days_closed = middleDaysClosed;
        payload.middle_days_open = middleDaysClosed ? null : middleDaysOpen;
        payload.middle_days_close = middleDaysClosed ? null : middleDaysClose;
        payload.end_day_open = eventType === "hotel_occupancy" ? "00:00" : endDayOpen;
        payload.end_day_close = endDayClose;
      } else {
        // Standard hours for other rule types
        payload.is_closed = hoursType === "closed";
        payload.open_time = hoursType === "special" ? openTime : null;
        payload.close_time = hoursType === "special" ? closeTime : null;
      }

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

        {/* Event Type */}
        <div className="mb-5">
          <label className="font-semibold block mb-2">Event Type</label>
          <select
            className="border rounded px-3 py-2 w-full"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
          >
            <option value="store_hours_schedule">Store Hours</option>
            <option value="planned_maintenance">Planned Maintenance</option>
            <option value="hotel_occupancy">Hotel Occupancy</option>
          </select>
        </div>

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

        {/* Single Date */}
        {ruleType === "single_date" && (
          <div className="mb-5">
            <label className="font-semibold block mb-2">Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
            />
          </div>
        )}

        {/* Date Range Daily */}
        {ruleType === "date_range_daily" && (
          <div className="mb-5 space-y-4">
            {/* Date Range */}
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
                <label className="font-semibold block mb-2">End Date</label>
                <input
                  type="date"
                  className="border rounded px-3 py-2 w-full"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Start Day (Check-in) Hours */}
            <div className="border rounded p-3 bg-blue-50">
              <label className="font-semibold block mb-2 text-blue-800">
                {eventType === "hotel_occupancy" ? "Check-in Time" : "Start Day Hours"}
              </label>
              <div className={eventType === "hotel_occupancy" ? "" : "grid grid-cols-2 gap-3"}>
                <div>
                  <label className="text-sm text-gray-600 block mb-1">
                    {eventType === "hotel_occupancy" ? "Check-in" : "Open"}
                  </label>
                  <input
                    type="time"
                    className="border rounded px-3 py-2 w-full"
                    value={startDayOpen}
                    onChange={(e) => setStartDayOpen(e.target.value)}
                  />
                </div>
                {eventType !== "hotel_occupancy" && (
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Close</label>
                    <input
                      type="time"
                      className="border rounded px-3 py-2 w-full"
                      value={startDayClose}
                      onChange={(e) => setStartDayClose(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {eventType === "hotel_occupancy" && (
                <p className="text-xs text-gray-500 mt-2">Closes at end of day (11:59 PM)</p>
              )}
            </div>

            {/* Middle Days Hours */}
            <div className="border rounded p-3 bg-gray-50">
              <label className="font-semibold block mb-2 text-gray-800">Middle Days Hours</label>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={middleDaysClosed}
                  onChange={(e) => setMiddleDaysClosed(e.target.checked)}
                />
                Closed all day
              </label>
              {!middleDaysClosed && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Open</label>
                    <input
                      type="time"
                      className="border rounded px-3 py-2 w-full"
                      value={middleDaysOpen}
                      onChange={(e) => setMiddleDaysOpen(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Close</label>
                    <input
                      type="time"
                      className="border rounded px-3 py-2 w-full"
                      value={middleDaysClose}
                      onChange={(e) => setMiddleDaysClose(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* End Day (Check-out) Hours */}
            <div className="border rounded p-3 bg-green-50">
              <label className="font-semibold block mb-2 text-green-800">
                {eventType === "hotel_occupancy" ? "Check-out Time" : "End Day Hours"}
              </label>
              {eventType === "hotel_occupancy" && (
                <p className="text-xs text-gray-500 mb-2">Opens at start of day (12:00 AM)</p>
              )}
              <div className={eventType === "hotel_occupancy" ? "" : "grid grid-cols-2 gap-3"}>
                {eventType !== "hotel_occupancy" && (
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Open</label>
                    <input
                      type="time"
                      className="border rounded px-3 py-2 w-full"
                      value={endDayOpen}
                      onChange={(e) => setEndDayOpen(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm text-gray-600 block mb-1">
                    {eventType === "hotel_occupancy" ? "Check-out" : "Close"}</label>
                  <input
                    type="time"
                    className="border rounded px-3 py-2 w-full"
                    value={endDayClose}
                    onChange={(e) => setEndDayClose(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Example: Hotel closure - check-in day (3 PM - 11 PM), middle days closed, check-out day (6 AM - 11 AM)
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
