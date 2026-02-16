"use client";

import { useState } from "react";

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

interface StoreHoursSchedulerProps {
  eventType?: string;
  ruleType: RuleType;
  hoursType: HoursType;
  // single_date
  singleDate: string;
  // fixed_yearly
  fixedMonth: number | "";
  fixedDay: number | "";
  // nth_weekday
  nth: NthOption;
  nthWeekday: Weekday;
  nthMonth: number | "";
  // weekly_days
  weeklyDays: Weekday[];
  // date_range_daily
  rangeStart: string;
  rangeEnd: string;
  // interval
  intervalValue: number;
  intervalUnit: IntervalUnit;
  intervalStartDate: string;
  // hours
  openTime: string;
  closeTime: string;
  // handlers
  onUpdate: (data: any) => void;
}

export default function StoreHoursScheduler(props: StoreHoursSchedulerProps) {
  const {
    eventType,
    ruleType,
    hoursType,
    singleDate,
    fixedMonth,
    fixedDay,
    nth,
    nthWeekday,
    nthMonth,
    weeklyDays,
    rangeStart,
    rangeEnd,
    intervalValue,
    intervalUnit,
    intervalStartDate,
    openTime,
    closeTime,
    onUpdate,
  } = props;

  const isMaintenance = eventType === "planned_maintenance";

  // Context-aware labels
  const labels = isMaintenance
    ? {
        hoursSection: "Maintenance Window",
        allDay: "All day",
        scheduled: "Scheduled window",
        startTime: "Start",
        endTime: "End",
      }
    : {
        hoursSection: "Hours",
        allDay: "Closed all day",
        scheduled: "Special hours",
        startTime: "Open",
        endTime: "Close",
      };

  const handleChange = (field: string, value: any) => {
    onUpdate({ ...props, [field]: value });
  };

  const toggleWeeklyDay = (day: Weekday) => {
    const newDays = weeklyDays.includes(day)
      ? weeklyDays.filter((d) => d !== day)
      : [...weeklyDays, day];
    handleChange("weeklyDays", newDays);
  };

  return (
    <div className="space-y-5">
      {/* Rule Type */}
      <div>
        <label className="font-semibold block mb-2">Schedule Type</label>
        <select
          className="border rounded px-3 py-2 w-full"
          value={ruleType}
          onChange={(e) => handleChange("ruleType", e.target.value)}
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
        <div>
          <label className="font-semibold block mb-2">Date</label>
          <input
            type="date"
            className="border rounded px-3 py-2 w-full"
            value={singleDate}
            onChange={(e) => handleChange("singleDate", e.target.value)}
          />
        </div>
      )}

      {/* Fixed Yearly */}
      {ruleType === "fixed_yearly" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-semibold block mb-2">Month</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={fixedMonth}
              onChange={(e) => handleChange("fixedMonth", Number(e.target.value))}
            >
              <option value="">Select month</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-semibold block mb-2">Day</label>
            <input
              type="number"
              min="1"
              max="31"
              className="border rounded px-3 py-2 w-full"
              placeholder="1-31"
              value={fixedDay}
              onChange={(e) => handleChange("fixedDay", Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Nth Weekday */}
      {ruleType === "nth_weekday" && (
        <div className="space-y-3">
          <div>
            <label className="font-semibold block mb-2">Month</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={nthMonth}
              onChange={(e) => handleChange("nthMonth", Number(e.target.value))}
            >
              <option value="">Select month</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-2">Which</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={nth}
                onChange={(e) => handleChange("nth", Number(e.target.value) as NthOption)}
              >
                <option value={1}>First</option>
                <option value={2}>Second</option>
                <option value={3}>Third</option>
                <option value={4}>Fourth</option>
                <option value={-1}>Last</option>
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-2">Weekday</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={nthWeekday}
                onChange={(e) => handleChange("nthWeekday", e.target.value)}
              >
                {WEEKDAYS.map((wd) => (
                  <option key={wd.value} value={wd.value}>
                    {wd.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Days */}
      {ruleType === "weekly_days" && (
        <div>
          <label className="font-semibold block mb-2">Days of the Week</label>
          <div className="grid grid-cols-2 gap-2">
            {WEEKDAYS.map((wd) => (
              <label key={wd.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={weeklyDays.includes(wd.value)}
                  onChange={() => toggleWeeklyDay(wd.value)}
                />
                {wd.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Date Range Daily */}
      {ruleType === "date_range_daily" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-semibold block mb-2">Start Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={rangeStart}
              onChange={(e) => handleChange("rangeStart", e.target.value)}
            />
          </div>
          <div>
            <label className="font-semibold block mb-2">End Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={rangeEnd}
              onChange={(e) => handleChange("rangeEnd", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Interval */}
      {ruleType === "interval" && (
        <div className="space-y-3">
          <div>
            <label className="font-semibold block mb-2">Start Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={intervalStartDate}
              onChange={(e) => handleChange("intervalStartDate", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-2">Every</label>
              <input
                type="number"
                min="1"
                className="border rounded px-3 py-2 w-full"
                value={intervalValue}
                onChange={(e) => handleChange("intervalValue", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="font-semibold block mb-2">Unit</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={intervalUnit}
                onChange={(e) => handleChange("intervalUnit", e.target.value)}
              >
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Hours / Maintenance Window */}
      <div>
        <label className="font-semibold block mb-2">{labels.hoursSection}</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={hoursType === "closed"}
              onChange={() => handleChange("hoursType", "closed")}
            />
            {labels.allDay}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={hoursType === "special"}
              onChange={() => handleChange("hoursType", "special")}
            />
            {labels.scheduled}
          </label>
        </div>

        {hoursType === "special" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">{labels.startTime}</label>
              <input
                type="time"
                className="border rounded px-3 py-2 w-full"
                value={openTime}
                onChange={(e) => handleChange("openTime", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">{labels.endTime}</label>
              <input
                type="time"
                className="border rounded px-3 py-2 w-full"
                value={closeTime}
                onChange={(e) => handleChange("closeTime", e.target.value)}
              />
            </div>
          </div>
        )}

        {isMaintenance && (
          <p className="mt-2 text-xs text-gray-500">
            Alerts will be muted during the maintenance window.
          </p>
        )}
      </div>
    </div>
  );
}
