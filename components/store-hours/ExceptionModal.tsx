// components/store-hours/ExceptionModal.tsx

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type ExceptionModalMode =
  | "create"
  | "edit-one-time"
  | "edit-recurring-forward";

type ExceptionType = "one-time" | "recurring";
type HoursType = "closed" | "special";
type EditScope = "this-only" | "this-and-forward";

interface ExceptionModalProps {
  open: boolean;
  siteId: string;
  mode: ExceptionModalMode;
  initialData: any | null;
  onClose: () => void;
  onSaved: () => void;
}

const HOLIDAY_PRESETS = [
  { label: "Christmas Day", value: "christmas_day" },
  { label: "Christmas Eve", value: "christmas_eve" },
  { label: "New Year’s Day", value: "new_years_day" },
  { label: "New Year’s Eve", value: "new_years_eve" },
  { label: "Thanksgiving (4th Thursday of Nov)", value: "thanksgiving" },
];

export default function ExceptionModal({
  open,
  siteId,
  mode,
  initialData,
  onClose,
  onSaved,
}: ExceptionModalProps) {
  /* -------------------------
     CORE STATE
  ------------------------- */
  const [exceptionType, setExceptionType] =
    useState<ExceptionType>("one-time");
  const [hoursType, setHoursType] =
    useState<HoursType>("closed");
  const [editScope, setEditScope] =
    useState<EditScope>("this-only");

  /* -------------------------
     FORM FIELDS
  ------------------------- */
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [holidayRule, setHolidayRule] = useState<string>("");

  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

  const [error, setError] = useState<string | null>(null);

  /* -------------------------
     INIT FROM EDIT DATA
  ------------------------- */
  useEffect(() => {
    if (!initialData) return;

    setName(initialData.name ?? "");
    setHoursType(initialData.is_closed ? "closed" : "special");
    setOpenTime(initialData.open_time ?? "");
    setCloseTime(initialData.close_time ?? "");

    if (initialData.is_recurring) {
      setExceptionType("recurring");
      setHolidayRule(initialData.recurrence_rule?.type ?? "");
    } else {
      setExceptionType("one-time");
      setDate(initialData.exception_date ?? "");
    }
  }, [initialData]);

  if (!open) return null;

  /* -------------------------
     VALIDATION
  ------------------------- */
  function validate(): boolean {
    if (!name.trim()) {
      setError("Exception name is required.");
      return false;
    }

    if (exceptionType === "one-time" && !date) {
      setError("Please select a date.");
      return false;
    }

    if (exceptionType === "recurring" && !holidayRule) {
      setError("Please select a recurring rule.");
      return false;
    }

    if (hoursType === "special") {
      if (!openTime || !closeTime) {
        setError("Both open and close times are required.");
        return false;
      }
      if (openTime >= closeTime) {
        setError("Open time must be before close time.");
        return false;
      }
    }

    setError(null);
    return true;
  }

  /* -------------------------
     SAVE HANDLER
  ------------------------- */
  async function handleSave() {
    if (!validate()) return;

    try {
      const today = new Date().toISOString().slice(0, 10);

      const payload: any = {
        site_id: siteId,
        name,
        is_closed: hoursType === "closed",
        open_time: hoursType === "special" ? openTime : null,
        close_time: hoursType === "special" ? closeTime : null,
        effective_from_date: today,
      };

      // ONE-TIME
      if (exceptionType === "one-time") {
        payload.is_recurring = false;
        payload.exception_date = date;

        if (mode === "edit-one-time" && initialData?.exception_id) {
          await fetch(
            `/api/store-hours/exceptions/${initialData.exception_id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          );
        } else {
          await fetch("/api/store-hours/exceptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
      }

      // RECURRING (ALWAYS INSERT)
      if (exceptionType === "recurring") {
        payload.is_recurring = true;
        payload.recurrence_rule = { type: holidayRule };

        await fetch("/api/store-hours/exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      onSaved();
    } catch (err) {
      console.error("Exception save failed:", err);
      setError("Failed to save exception.");
    }
  }

  /* -------------------------
     RENDER
  ------------------------- */
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg w-full max-w-lg p-6">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {mode === "create"
              ? "Add Store Hours Exception"
              : "Edit Store Hours Exception"}
          </h2>
          <button onClick={onClose}>✕</button>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-4 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* NAME */}
        <section className="mb-5">
          <label className="block font-semibold mb-2">Name</label>
          <input
            className="border rounded px-3 py-2 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Holiday / Special Event"
          />
        </section>

        {/* EXCEPTION TYPE */}
        <section className="mb-5">
          <label className="block font-semibold mb-2">
            Exception type
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={exceptionType === "one-time"}
                onChange={() => setExceptionType("one-time")}
              />
              One-time date
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={exceptionType === "recurring"}
                onChange={() => setExceptionType("recurring")}
              />
              Recurring rule
            </label>
          </div>
        </section>

        {/* DATE / RULE */}
        {exceptionType === "one-time" && (
          <section className="mb-5">
            <label className="block font-semibold mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
          </section>
        )}

        {exceptionType === "recurring" && (
          <section className="mb-5">
            <label className="block font-semibold mb-2">
              Recurring rule
            </label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={holidayRule}
              onChange={(e) => setHolidayRule(e.target.value)}
            >
              <option value="">Select rule…</option>
              {HOLIDAY_PRESETS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </section>
        )}

        {/* HOURS */}
        <section className="mb-6">
          <label className="block font-semibold mb-2">Hours</label>
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
              <input
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="border rounded px-3 py-2"
              />
              <input
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="border rounded px-3 py-2"
              />
            </div>
          )}
        </section>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}
