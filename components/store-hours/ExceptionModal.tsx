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
  const [scope, setScope] = useState<Scope>("one-time");
  const [hoursType, setHoursType] = useState<HoursType>("closed");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  const [recurrenceKind, setRecurrenceKind] =
    useState<RecurrenceKind>("fixed_date");

  const [fixedMonth, setFixedMonth] = useState<number | "">("");
  const [fixedDay, setFixedDay] = useState<number | "">("");

  const [nth, setNth] = useState<NthOption>(-1);
  const [weekday, setWeekday] = useState<Weekday>("thursday");
  const [nthMonth, setNthMonth] = useState<number | "">("");

  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSaving(false);

    if (mode === "create" || !initialData) {
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
      return;
    }

    const isRecurring = initialData.is_recurring === true;

    setScope(isRecurring ? "recurring" : "one-time");
    setName(initialData.name ?? "");

    if (!isRecurring) {
      setDate(initialData.exception_date ?? initialData.date ?? "");
    }

    if (initialData.is_closed) {
      setHoursType("closed");
      setOpenTime("");
      setCloseTime("");
    } else {
      setHoursType("special");
      setOpenTime(initialData.open_time ?? "");
      setCloseTime(initialData.close_time ?? "");
    }

    const rule =
      initialData.recurrence_rule ??
      initialData.source_rule?.recurrence_rule ??
      null;

    setRecurrenceKind("fixed_date");
    setFixedMonth("");
    setFixedDay("");
    setNth(-1);
    setWeekday("thursday");
    setNthMonth("");

    if (isRecurring && rule?.type === "fixed_date") {
      setRecurrenceKind("fixed_date");
      setFixedMonth(rule.month ?? "");
      setFixedDay(rule.day ?? "");
    }

    if (isRecurring && rule?.type === "nth_weekday") {
      setRecurrenceKind("nth_weekday");
      setNth((rule.occurrence ?? -1) as NthOption);
      setWeekday((rule.weekday ?? "thursday") as Weekday);
      setNthMonth(rule.month ?? "");
    }
  }, [open, mode, initialData]);

  function buildRecurrenceRule() {
    if (scope !== "recurring") return null;

    if (recurrenceKind === "fixed_date") {
      if (!fixedMonth || !fixedDay) return null;
      return { type: "fixed_date", month: fixedMonth, day: fixedDay };
    }

    if (recurrenceKind === "nth_weekday") {
      if (!nthMonth) return null;
      return { type: "nth_weekday", month: nthMonth, weekday, occurrence: nth };
    }

    return null;
  }

  function validate(): boolean {
    if (!siteId) return false;
    if (!name.trim()) return false;
    if (scope === "one-time" && !date) return false;
    if (scope === "recurring" && !buildRecurrenceRule()) return false;

    if (hoursType === "special") {
      if (!openTime || !closeTime) return false;
      if (openTime >= closeTime) return false;
    }

    return true;
  }

  /* ======================================================
     Save (UPDATED)
  ====================================================== */

  async function handleSave() {
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    setError(null);

    try {
      // ONE-TIME EDIT → PATCH OCCURRENCE
      if (scope === "one-time" && mode === "edit-one-time") {
        const res = await fetch("/api/store-hours/occurrences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            occurrence_id: initialData?.occurrence_id,
            occurrence_date: date,
            open_time: hoursType === "special" ? openTime : null,
            close_time: hoursType === "special" ? closeTime : null,
            is_closed: hoursType === "closed",
            name: name.trim(),
          }),
        });

        if (!res.ok) {
          const j = await safeJson(res);
          setError(j?.error || `Failed to save exception (${res.status})`);
          setSaving(false);
          return;
        }

        onSaved();
        return;
      }

      // CREATE or RECURRING EDIT → RULE TABLE
      const payload = {
        exception_id: initialData?.exception_id ?? undefined,
        site_id: siteId,
        name: name.trim(),
        is_closed: hoursType === "closed",
        open_time: hoursType === "special" ? openTime : null,
        close_time: hoursType === "special" ? closeTime : null,
        is_recurring: scope === "recurring",
        exception_date: scope === "one-time" ? date : null,
        recurrence_rule:
          scope === "one-time" ? { type: "single", date } : buildRecurrenceRule(),
        effective_from_date:
          mode === "edit-recurring-forward" && initialData?.effective_from_date
            ? initialData.effective_from_date
            : todayYYYYMMDD(),
      };

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
    } catch {
      setError("Failed to save exception.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const scopeLocked =
    mode === "edit-one-time" || mode === "edit-recurring-forward";

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
              disabled={scopeLocked}
              onChange={() => setScope("one-time")}
            />{" "}
            One-time
          </label>
          <label className="block">
            <input
              type="radio"
              checked={scope === "recurring"}
              disabled={scopeLocked}
              onChange={() => setScope("recurring")}
            />{" "}
            Recurring
          </label>
        </div>

        {scope === "one-time" && (
          <>
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
          </>
        )}

        {scope === "recurring" && (
          <>
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
                  <option value="sunday">Sunday</option>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
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
          </>
        )}

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
          <Button
            onClick={handleSave}
            disabled={saving || (scope === "recurring" && !buildRecurrenceRule())}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
