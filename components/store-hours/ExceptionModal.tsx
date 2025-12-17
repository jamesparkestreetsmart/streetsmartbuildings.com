// components/store-hours/ExceptionModal.tsx

"use client";

import { useEffect, useState } from "react";

export type ExceptionModalMode =
  | "create"
  | "edit-one-time"
  | "edit-recurring-forward";

/* ------------------------------
   Types
-------------------------------- */

export type UIExceptionRow = {
  exception_id?: string;
  name?: string;
  is_closed?: boolean;
  open_time?: string | null;
  close_time?: string | null;

  // recurrence
  is_recurring?: boolean;
  recurrence_rule?: any | null;
  exception_date?: string | null;
  effective_from_date?: string | null;
};

export type ExceptionModalProps = {
  open: boolean;
  siteId: string;
  mode: ExceptionModalMode;
  initialData: UIExceptionRow | null;
  onClose: () => void;
  onSaved: () => void;
};

/* ------------------------------
   Holiday presets (UI helpers)
-------------------------------- */

type HolidayPreset = {
  label: string;
  rule: any;
};

const HOLIDAY_PRESETS: HolidayPreset[] = [
  {
    label: "Thanksgiving (4th Thursday of November)",
    rule: { type: "nth_weekday", month: 11, weekday: "thursday", nth: 4 },
  },
  {
    label: "Christmas Day (Dec 25)",
    rule: { type: "fixed_date", month: 12, day: 25 },
  },
  {
    label: "Christmas Eve (Dec 24)",
    rule: { type: "fixed_date", month: 12, day: 24 },
  },
  {
    label: "New Year’s Day (Jan 1)",
    rule: { type: "fixed_date", month: 1, day: 1 },
  },
  {
    label: "New Year’s Eve (Dec 31)",
    rule: { type: "fixed_date", month: 12, day: 31 },
  },
  {
    label: "Independence Day (July 4)",
    rule: { type: "fixed_date", month: 7, day: 4 },
  },
  {
    label: "Memorial Day (Last Monday of May)",
    rule: { type: "last_weekday", month: 5, weekday: "monday" },
  },
  {
    label: "Labor Day (First Monday of September)",
    rule: { type: "nth_weekday", month: 9, weekday: "monday", nth: 1 },
  },
];


/* ------------------------------
   Component
-------------------------------- */

export default function ExceptionModal({
  open,
  siteId,
  mode,
  initialData,
  onClose,
  onSaved,
}: ExceptionModalProps) {
  /* ------------------------------
     Local state
  -------------------------------- */

  const [exceptionType, setExceptionType] = useState<
    "one-time" | "recurring"
  >("one-time");

  const [name, setName] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [openTime, setOpenTime] = useState<string | null>(null);
  const [closeTime, setCloseTime] = useState<string | null>(null);

  const [recurrenceRule, setRecurrenceRule] = useState<any | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const isEditing = mode !== "create";

  /* ------------------------------
     Init from existing data
  -------------------------------- */

  useEffect(() => {
    if (!initialData) return;

    setName(initialData.name ?? "");
    setIsClosed(initialData.is_closed ?? true);
    setOpenTime(initialData.open_time ?? null);
    setCloseTime(initialData.close_time ?? null);

    if (initialData.is_recurring) {
      setExceptionType("recurring");
      setRecurrenceRule(initialData.recurrence_rule ?? null);
    } else {
      setExceptionType("one-time");
      setExceptionDate(initialData.exception_date ?? "");
    }
  }, [initialData]);

  if (!open) return null;

  /* ------------------------------
     Save handler
  -------------------------------- */

  async function handleSave() {
    setSaving(true);

    const payload: any = {
      site_id: siteId,
      name,
      is_closed: isClosed,
      open_time: isClosed ? null : openTime,
      close_time: isClosed ? null : closeTime,
    };

    if (exceptionType === "one-time") {
      payload.is_recurring = false;
      payload.exception_date = exceptionDate;
    } else {
      payload.is_recurring = true;
      payload.recurrence_rule = recurrenceRule;
      payload.effective_from_date = new Date().toISOString().slice(0, 10);
    }

    await fetch("/api/store-hours/exceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    onSaved();
  }

  /* ------------------------------
     Render
  -------------------------------- */

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">
          {exceptionType === "one-time"
            ? "Add One-Time Exception"
            : "Add Recurring Exception"}
        </h2>

        {/* NAME */}
        <div className="mb-4">
          <label className="text-sm font-medium">Name</label>
          <input
            className="w-full border rounded px-3 py-2 mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Thanksgiving"
          />
        </div>

        {/* TYPE */}
        {!isEditing && (
          <div className="mb-6">
            <label className="text-sm font-medium block mb-2">
              Exception type
            </label>
            <div className="flex gap-4">
              <label>
                <input
                  type="radio"
                  checked={exceptionType === "one-time"}
                  onChange={() => setExceptionType("one-time")}
                />{" "}
                One-time date
              </label>
              <label>
                <input
                  type="radio"
                  checked={exceptionType === "recurring"}
                  onChange={() => setExceptionType("recurring")}
                />{" "}
                Recurring rule
              </label>
            </div>
          </div>
        )}

        {/* ONE-TIME */}
        {exceptionType === "one-time" && (
          <div className="mb-6">
            <label className="text-sm font-medium">Date</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2 mt-1"
              value={exceptionDate}
              onChange={(e) => setExceptionDate(e.target.value)}
            />
          </div>
        )}

        {/* RECURRING */}
        {exceptionType === "recurring" && (
          <div className="mb-6 space-y-4">
            <div>
              <label className="text-sm font-medium">
                Holiday preset (optional)
              </label>
              <select
                className="w-full border rounded px-3 py-2 mt-1"
                value={selectedPreset}
                onChange={(e) => {
                  const preset = HOLIDAY_PRESETS.find(
                    (p) => p.label === e.target.value
                  );
                  setSelectedPreset(e.target.value);
                  setRecurrenceRule(preset?.rule ?? null);
                }}
              >
                <option value="">— Custom rule —</option>
                {HOLIDAY_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-gray-500">
              This rule applies going forward only. Past dates are preserved.
            </div>
          </div>
        )}

        {/* HOURS */}
        <div className="mb-6">
          <label className="text-sm font-medium block mb-2">
            Store hours
          </label>

          <div className="flex gap-4 mb-2">
            <label>
              <input
                type="radio"
                checked={isClosed}
                onChange={() => setIsClosed(true)}
              />{" "}
              Closed all day
            </label>
            <label>
              <input
                type="radio"
                checked={!isClosed}
                onChange={() => setIsClosed(false)}
              />{" "}
              Special hours
            </label>
          </div>

          {!isClosed && (
            <div className="flex gap-3">
              <input
                type="time"
                className="border rounded px-2 py-1"
                value={openTime ?? ""}
                onChange={(e) => setOpenTime(e.target.value)}
              />
              <input
                type="time"
                className="border rounded px-2 py-1"
                value={closeTime ?? ""}
                onChange={(e) => setCloseTime(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3">
          <button
            className="px-3 py-1.5 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-semibold"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
