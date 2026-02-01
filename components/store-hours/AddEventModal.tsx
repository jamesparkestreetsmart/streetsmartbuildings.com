"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import HotelOccupancyScheduler from "./HotelOccupancyScheduler";
import StoreHoursScheduler from "./StoreHoursScheduler";

/* ======================================================
   Public Types
====================================================== */

export type AddEventModalMode =
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

interface AddEventModalProps {
  open: boolean;
  siteId: string;
  mode: AddEventModalMode;
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

/* ======================================================
   Component
====================================================== */

export default function AddEventModal({
  open,
  siteId,
  mode,
  initialData,
  onClose,
  onSaved,
}: AddEventModalProps) {

  const [eventType, setEventType] = useState<EventType>("store_hours_schedule");
  const [name, setName] = useState("");

  // Hotel Occupancy specific state - simplified to user-facing fields only
  const [hotelStartDate, setHotelStartDate] = useState("");
  const [hotelEndDate, setHotelEndDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("15:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");

  // Store Hours specific state
  const [ruleType, setRuleType] = useState<RuleType>("single_date");
  const [hoursType, setHoursType] = useState<HoursType>("closed");
  const [singleDate, setSingleDate] = useState("");
  const [fixedMonth, setFixedMonth] = useState<number | "">("");
  const [fixedDay, setFixedDay] = useState<number | "">("");
  const [nth, setNth] = useState<NthOption>(1);
  const [nthWeekday, setNthWeekday] = useState<Weekday>("monday");
  const [nthMonth, setNthMonth] = useState<number | "">("");
  const [weeklyDays, setWeeklyDays] = useState<Weekday[]>([]);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [intervalValue, setIntervalValue] = useState<number>(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("weeks");
  const [intervalStartDate, setIntervalStartDate] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* ======================================================
     Reset form
  ====================================================== */

  function resetForm() {
    setEventType("store_hours_schedule");
    setName("");
    
    // Hotel occupancy - simplified
    setHotelStartDate("");
    setHotelEndDate("");
    setCheckInTime("15:00");
    setCheckOutTime("11:00");
    
    // Store hours
    setRuleType("single_date");
    setHoursType("closed");
    setSingleDate("");
    setFixedMonth("");
    setFixedDay("");
    setNth(1);
    setNthWeekday("monday");
    setNthMonth("");
    setWeeklyDays([]);
    setRangeStart("");
    setRangeEnd("");
    setIntervalValue(1);
    setIntervalUnit("weeks");
    setIntervalStartDate("");
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
     Build rule for store hours
  ====================================================== */

  function buildStoreHoursRule(): object | null {
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

  function validateStoreHours(): boolean {
    const rule = buildStoreHoursRule();
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

  function validateHotelOccupancy(): boolean {
    if (!hotelStartDate || !hotelEndDate) return false;
    if (hotelEndDate < hotelStartDate) return false;
    if (!checkInTime || !checkOutTime) return false;
    return true;
  }

  function validate(): boolean {
    if (!siteId) return false;
    if (!name.trim()) return false;

    if (eventType === "hotel_occupancy") {
      return validateHotelOccupancy();
    } else {
      return validateStoreHours();
    }
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
      let payload: Record<string, any>;

      if (eventType === "hotel_occupancy") {
        // Hotel occupancy payload
        // User only edits: startDate, endDate, checkInTime, checkOutTime
        // We automatically derive the internal day-slice fields
        payload = {
          site_id: siteId,
          name: name.trim(),
          event_type: eventType,
          rule_type: "date_range_daily",
          effective_from_date: hotelStartDate,
          effective_to_date: hotelEndDate,
          // Derived: Check-in day occupies from checkInTime until end of day
          start_day_open: checkInTime,
          start_day_close: "23:59",
          // Derived: Middle days are always fully occupied
          middle_days_closed: false,
          middle_days_open: "00:00",
          middle_days_close: "23:59",
          // Derived: Check-out day occupies from start of day until checkOutTime
          end_day_open: "00:00",
          end_day_close: checkOutTime,
        };
      } else {
        // Store hours payload
        let effective_from_date: string;
        let effective_to_date: string | null;

        switch (ruleType) {
          case "single_date":
            effective_from_date = singleDate;
            effective_to_date = singleDate;
            break;
          case "date_range_daily":
            effective_from_date = rangeStart;
            effective_to_date = rangeEnd;
            break;
          default:
            effective_from_date = todayYYYYMMDD();
            effective_to_date = null;
        }

        payload = {
          site_id: siteId,
          name: name.trim(),
          event_type: eventType,
          effective_from_date,
          effective_to_date,
          rule_type: ruleType,
          is_closed: hoursType === "closed",
          open_time: hoursType === "special" ? openTime : null,
          close_time: hoursType === "special" ? closeTime : null,
        };

        // Add rule-specific parameters
        switch (ruleType) {
          case "single_date":
            payload.date = singleDate;
            break;
          case "fixed_yearly":
            payload.month = fixedMonth;
            payload.day = fixedDay;
            break;
          case "nth_weekday":
            payload.month = nthMonth;
            payload.weekday = nthWeekday;
            payload.nth = nth;
            break;
          case "weekly_days":
            payload.days = weeklyDays;
            break;
          case "date_range_daily":
            payload.start_date = rangeStart;
            payload.end_date = rangeEnd;
            break;
          case "interval":
            payload.interval = intervalValue;
            payload.unit = intervalUnit;
            payload.start_date = intervalStartDate;
            break;
        }
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

  /* ======================================================
     Scheduler update handlers
  ====================================================== */

  const handleHotelUpdate = (data: any) => {
    setHotelStartDate(data.startDate);
    setHotelEndDate(data.endDate);
    setCheckInTime(data.checkInTime);
    setCheckOutTime(data.checkOutTime);
  };

  const handleStoreHoursUpdate = (data: any) => {
    setRuleType(data.ruleType);
    setHoursType(data.hoursType);
    setSingleDate(data.singleDate);
    setFixedMonth(data.fixedMonth);
    setFixedDay(data.fixedDay);
    setNth(data.nth);
    setNthWeekday(data.nthWeekday);
    setNthMonth(data.nthMonth);
    setWeeklyDays(data.weeklyDays);
    setRangeStart(data.rangeStart);
    setRangeEnd(data.rangeEnd);
    setIntervalValue(data.intervalValue);
    setIntervalUnit(data.intervalUnit);
    setIntervalStartDate(data.intervalStartDate);
    setOpenTime(data.openTime);
    setCloseTime(data.closeTime);
  };

  if (!open) return null;

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
            placeholder={
              eventType === "hotel_occupancy"
                ? "e.g., Room 201 - Smith Reservation"
                : "e.g., Holiday Closure"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Conditional Scheduler */}
        {eventType === "hotel_occupancy" ? (
          <HotelOccupancyScheduler
            startDate={hotelStartDate}
            endDate={hotelEndDate}
            checkInTime={checkInTime}
            checkOutTime={checkOutTime}
            onUpdate={handleHotelUpdate}
          />
        ) : (
          <StoreHoursScheduler
            ruleType={ruleType}
            hoursType={hoursType}
            singleDate={singleDate}
            fixedMonth={fixedMonth}
            fixedDay={fixedDay}
            nth={nth}
            nthWeekday={nthWeekday}
            nthMonth={nthMonth}
            weeklyDays={weeklyDays}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            intervalValue={intervalValue}
            intervalUnit={intervalUnit}
            intervalStartDate={intervalStartDate}
            openTime={openTime}
            closeTime={closeTime}
            onUpdate={handleStoreHoursUpdate}
          />
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
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
