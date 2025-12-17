"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/* ======================================================
   Public Types (required elsewhere)
====================================================== */

export type ExceptionModalMode =
  | "create"
  | "edit-one-time"
  | "edit-recurring-forward";

/* ======================================================
   Internal Types
====================================================== */

type Scope = "one-time" | "recurring";
type HoursType = "closed" | "special";
type RecurrenceKind = "fixed_date" | "nth_weekday";

type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

type NthOption = -1 | 1 | 2 | 3 | 4;

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
  /* -------------------------
     Core State
  ------------------------- */
  const [scope, setScope] = useState<Scope>("one-time");
  const [hoursType, setHoursType] = useState<HoursType>("closed");
  const [name, setName] = useState("");

  /* One-time */
  const [date, setDate] = useState("");

  /* Recurring */
  const [recurrenceKind, setRecurrenceKind] =
    useState<RecurrenceKind>("fixed_date");

  const [fixedMonth, setFixedMonth] = useState<number | "">("");
  const [fixedDay, setFixedDay] = useState<number | "">("");

  const [nth, setNth] = useState<NthOption>(-1);
  const [weekday, setWeekday] = useState<Weekday>("thursday");
  const [nthMonth, setNthMonth] = useState<number | "">("");

  /* Hours */
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

  /* UI */
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* ======================================================
     Init
  ====================================================== */
  useEffect(() => {
    if (!open) return;

    setError(null);
    setSaving(false);

    if (!initialData) {
      setScope("one-time");
      setName("");
      setDate("");
      setRecurrenceKind("fixed_date");
      setFixedMonth("");
      setFixedDay("");
      setNth(-1);
      setWeekday("thursday");
      setNthMonth("");
      setHoursType("closed");
      setOpenTime("");
      setCloseTime("");
    }
  }, [open, initialData]);

  /* ======================================================
     Recurrence Builder
  ====================================================== */
  function buildRecurrenceRule() {
    if (scope !== "recurring") return null;

    if (recurrenceKind === "fixed_date") {
      if (!fixedMonth || !fixedDay) return null;
      return {
        type: "fixed_date",
        month: fixedMonth,
        day: fixedDay,
      };
    }

    if (recurrenceKind === "nth_weekday") {
      if (!nthMonth) return null;
      return {
        type: "nth_weekday_of_month",
        month: nthMonth,
        weekday,
        occurrence: nth,
      };
    }

    return null;
  }

  /* ======================================================
     Validation
  ====================================================== */
  function validate(): boolean {
    if (!siteId) {
      setError("Missing site id.");
      return false;
    }

    if (!name.trim()) {
      setError("Exception name is required.");
      return false;
    }

    if (scope === "one-time" && !date) {
      setError("Please select a date.");
      return false;
    }

    if (scope === "recurring" && !buildRecurrenceRule()) {
      setError("Please complete the recurrence pattern.");
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

  /* ======================================================
     Save
  ====================================================== */
  async function handleSave() {
    if (saving) return;
    if (!validate()) return;

    setSaving(true);

    const payload = {
      site_id: siteId,
      name: name.trim(),
      is_closed: hoursType === "closed",
      open_time: hoursType === "special" ? openTime : null,
      close_time: hoursType === "special" ? closeTime : null,
      is_recurring: scope === "recurring",
      exception_date: scope === "one-time" ? date : null,
      recurrence_rule: buildRecurrenceRule(),
      effective_from_date: todayYYYYMMDD(),
    };

    try {
      const res = await fetch("/api/store-hours/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await safeJson(res);
        setError(j?.error || `Failed to save exception (${res.status})`);
        setSaving(false);
        return;
      }

      onSaved();
    } catch (e) {
      setError("Failed to save exception.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  /* ======================================================
     Render
  ====================================================== */
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-lg p-6">
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {mode === "create"
              ? "Add Store Hours Exception"
              : "Edit Store Hours Exception"}
          </h2>
          <button onClick={onClose}>✕</button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Scope */}
        <div className="mb-5">
          <label className="font-semibold block mb-2">Exception scope</label>
          <label className="block">
            <input
              type="radio"
              checked={scope === "one-time"}
              onChange={() => setScope("one-time")}
            />{" "}
            One-time
          </label>
          <label className="block">
            <input
              type="radio"
              checked={scope === "recurring"}
              onChange={() => setScope("recurring")}
            />{" "}
            Recurring
          </label>
        </div>

        {/* One-time */}
        {scope === "one-time" && (
          <div>
            <div className="mb-5">
              <label className="font-semibold block mb-2">Date</label>
              <input
                type="date"
                className="border rounded px-3 py-2 w-full"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="mb-5">
              <label className="font-semibold block mb-2">Title</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Recurring */}
        {scope === "recurring" && (
          <div>
            <div className="mb-5">
              <label className="font-semibold block mb-2">
                Recurrence pattern
              </label>
              <label className="block">
                <input
                  type="radio"
                  checked={recurrenceKind === "fixed_date"}
                  onChange={() => setRecurrenceKind("fixed_date")}
                />{" "}
                Fixed date
              </label>
              <label className="block">
                <input
                  type="radio"
                  checked={recurrenceKind === "nth_weekday"}
                  onChange={() => setRecurrenceKind("nth_weekday")}
                />{" "}
                Nth weekday
              </label>
            </div>

            {recurrenceKind === "fixed_date" && (
              <div className="mb-5 grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min={1}
                  max={12}
                  placeholder="Month"
                  className="border rounded px-3 py-2"
                  value={fixedMonth}
                  onChange={(e) =>
                    setFixedMonth(e.target.value ? +e.target.value : "")
                  }
                />
                <input
                  type="number"
                  min={1}
                  max={31}
                  placeholder="Day"
                  className="border rounded px-3 py-2"
                  value={fixedDay}
                  onChange={(e) =>
                    setFixedDay(e.target.value ? +e.target.value : "")
                  }
                />
              </div>
            )}

            {recurrenceKind === "nth_weekday" && (
              <div className="mb-5 grid grid-cols-3 gap-3">
                <select
                  className="border rounded px-3 py-2"
                  value={nth}
                  onChange={(e) => setNth(+e.target.value as NthOption)}
                >
                  <option value={-1}>Last</option>
                  <option value={1}>First</option>
                  <option value={2}>Second</option>
                  <option value={3}>Third</option>
                  <option value={4}>Fourth</option>
                </select>
                <select
                  className="border rounded px-3 py-2"
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value as Weekday)}
                >
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={12}
                  placeholder="Month"
                  className="border rounded px-3 py-2"
                  value={nthMonth}
                  onChange={(e) =>
                    setNthMonth(e.target.value ? +e.target.value : "")
                  }
                />
              </div>
            )}

            <div className="mb-5">
              <label className="font-semibold block mb-2">Title</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Hours */}
        <div className="mb-6">
          <label className="font-semibold block mb-2">Hours</label>
          <label className="block">
            <input
              type="radio"
              checked={hoursType === "closed"}
              onChange={() => setHoursType("closed")}
            />{" "}
            Closed all day
          </label>
          <label className="block">
            <input
              type="radio"
              checked={hoursType === "special"}
              onChange={() => setHoursType("special")}
            />{" "}
            Special hours
          </label>

          {hoursType === "special" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <input
                type="time"
                className="border rounded px-3 py-2"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
              />
              <input
                type="time"
                className="border rounded px-3 py-2"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
