// components/store-hours/ExceptionModal.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export type ExceptionModalMode =
  | "create"
  | "edit-one-time"
  | "edit-recurring-forward";

type ExceptionType = "one-time" | "recurring";
type HoursType = "closed" | "special";

type HolidayPreset = {
  label: string;
  value: string;
  recurrence_rule: any; // jsonb payload we store
  default_is_closed?: boolean;
};

interface ExceptionModalProps {
  open: boolean;
  siteId: string;
  mode: ExceptionModalMode;
  initialData: any | null;
  onClose: () => void;
  onSaved: () => void;
}

const HOLIDAY_PRESETS: HolidayPreset[] = [
  {
    label: "Christmas Eve",
    value: "christmas_eve",
    recurrence_rule: { type: "fixed_date", month: 12, day: 24 },
    default_is_closed: false,
  },
  {
    label: "Christmas Day",
    value: "christmas_day",
    recurrence_rule: { type: "fixed_date", month: 12, day: 25 },
    default_is_closed: true,
  },
  {
    label: "New Year’s Eve",
    value: "new_years_eve",
    recurrence_rule: { type: "fixed_date", month: 12, day: 31 },
    default_is_closed: false,
  },
  {
    label: "New Year’s Day",
    value: "new_years_day",
    recurrence_rule: { type: "fixed_date", month: 1, day: 1 },
    default_is_closed: true,
  },
  {
    label: "Thanksgiving (4th Thursday of Nov)",
    value: "thanksgiving",
    recurrence_rule: { type: "nth_weekday_of_month", month: 11, weekday: "thursday", nth: 4 },
    default_is_closed: true,
  },
];

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

export default function ExceptionModal({
  open,
  siteId,
  mode,
  initialData,
  onClose,
  onSaved,
}: ExceptionModalProps) {
  // -------------------------
  // STATE
  // -------------------------
  const [exceptionType, setExceptionType] = useState<ExceptionType>("one-time");
  const [hoursType, setHoursType] = useState<HoursType>("closed");

  const [presetValue, setPresetValue] = useState<string>("");

  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  const [date, setDate] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState<any | null>(null);

  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedPreset = useMemo(
    () => HOLIDAY_PRESETS.find((p) => p.value === presetValue) ?? null,
    [presetValue]
  );

  // -------------------------
  // INIT / EDIT PREFILL
  // -------------------------
  useEffect(() => {
    if (!open) return;

    // reset transient errors on open
    setError(null);

    // If editing, prefill from initialData
    if (initialData) {
      setName(initialData.name ?? "");
      setNameTouched(true); // editing implies user-controlled title

      const closed = !!initialData.is_closed;
      setHoursType(closed ? "closed" : "special");
      setOpenTime(initialData.open_time ?? "");
      setCloseTime(initialData.close_time ?? "");

      if (initialData.is_recurring) {
        setExceptionType("recurring");
        setDate("");
        setRecurrenceRule(initialData.recurrence_rule ?? null);
        setPresetValue(""); // optional: we don't try to reverse-map into preset
      } else {
        setExceptionType("one-time");
        setDate(initialData.exception_date ?? "");
        setRecurrenceRule(null);
        setPresetValue("");
      }

      return;
    }

    // Create mode defaults
    setExceptionType("one-time");
    setHoursType("closed");
    setPresetValue("");
    setName("");
    setNameTouched(false);
    setDate("");
    setRecurrenceRule(null);
    setOpenTime("");
    setCloseTime("");
  }, [open, initialData]);

  // -------------------------
  // PRESET CHANGE → SET RULE + AUTO TITLE (until user edits)
  // -------------------------
  useEffect(() => {
    if (!selectedPreset) return;

    // selecting a preset implies recurring
    setExceptionType("recurring");
    setRecurrenceRule(selectedPreset.recurrence_rule ?? null);

    // optionally set default hours behavior
    const presetClosed = !!selectedPreset.default_is_closed;
    setHoursType(presetClosed ? "closed" : hoursType);

    // ✅ Auto-title should keep updating as long as user hasn't manually edited title
    if (!nameTouched) {
      setName(selectedPreset.label);
    }
  }, [selectedPreset]); // intentionally omit nameTouched/hoursType to avoid loops

  // If user switches exceptionType manually, let presets disengage
  useEffect(() => {
    if (exceptionType === "one-time") {
      setPresetValue("");
      setRecurrenceRule(null);
    }
  }, [exceptionType]);

  // -------------------------
  // VALIDATION
  // -------------------------
  function validate(): boolean {
    if (!siteId || typeof siteId !== "string") {
      setError("Missing site id (siteId prop not provided).");
      return false;
    }

    if (!name.trim()) {
      setError("Exception name is required.");
      return false;
    }

    if (exceptionType === "one-time" && !date) {
      setError("Please select a date.");
      return false;
    }

    if (exceptionType === "recurring" && !recurrenceRule) {
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

  // -------------------------
  // SAVE
  // -------------------------
  async function handleSave() {
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    setError(null);

    const payload: any = {
      site_id: siteId, // ✅ ALWAYS from prop, never from form state
      name: name.trim(),
      is_closed: hoursType === "closed",
      open_time: hoursType === "special" ? openTime : null,
      close_time: hoursType === "special" ? closeTime : null,
      is_recurring: exceptionType === "recurring",
      effective_from_date: todayYYYYMMDD(),
      recurrence_rule: exceptionType === "recurring" ? recurrenceRule : null,
      exception_date: exceptionType === "one-time" ? date : null,
    };

    // Decide endpoint/method
    // (If you have PATCH routes per id, wire them here. For now, POST create is safest.)
    const url = "/api/store-hours/exceptions";
    const method = "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await safeJson(res);
        const msg =
          (j && (j.error || j.message)) ||
          `Failed to save exception (HTTP ${res.status})`;
        setError(msg);
        setSaving(false);
        return;
      }

      onSaved();
    } catch (e: any) {
      console.error("Save exception error:", e);
      setError(e?.message ?? "Failed to save exception.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-lg p-6">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {mode === "create" ? "Add Store Hours Exception" : "Edit Store Hours Exception"}
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-black">
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* PRESET (create only, recurring convenience) */}
        {mode === "create" && (
          <div className="mb-5">
            <label className="block font-semibold mb-2">
              Preset (optional)
            </label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={presetValue}
              onChange={(e) => {
                const v = e.target.value;
                setPresetValue(v);

                // If user changes preset, we want title to “jump” to the new preset unless they manually edited it.
                // If they previously followed presets and then changed presets, that is not a manual title edit.
                // So: when preset changes, we DO NOT mark nameTouched = true.
                // Also: if they had manually edited title and want to reattach to presets, they can clear the title.
                if (!v) {
                  // preset cleared: allow next preset to control title again (unless user types)
                  setNameTouched(false);
                }
              }}
            >
              <option value="">Select preset…</option>
              {HOLIDAY_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* NAME */}
        <div className="mb-5">
          <label className="block font-semibold mb-2">Name</label>
          <input
            className="border rounded px-3 py-2 w-full"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true); // ✅ user took control
            }}
            placeholder="Holiday / Special Event"
          />
          {!nameTouched && presetValue && (
            <p className="text-xs text-gray-500 mt-1">
              Title is linked to the preset. If you edit the title, it won’t auto-change.
            </p>
          )}
        </div>

        {/* TYPE */}
        <div className="mb-5">
          <label className="block font-semibold mb-2">Exception type</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={exceptionType === "one-time"}
                onChange={() => {
                  setExceptionType("one-time");
                  setPresetValue("");
                  setRecurrenceRule(null);
                }}
              />
              One-time date
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={exceptionType === "recurring"}
                onChange={() => {
                  setExceptionType("recurring");
                  // if no preset selected, user will pick a rule next
                }}
              />
              Recurring rule
            </label>
          </div>
        </div>

        {/* ONE-TIME DATE */}
        {exceptionType === "one-time" && (
          <div className="mb-5">
            <label className="block font-semibold mb-2">Date</label>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        )}

        {/* RECURRING RULE (non-preset manual selection) */}
        {exceptionType === "recurring" && mode === "create" && (
          <div className="mb-5">
            <label className="block font-semibold mb-2">Recurring rule</label>
            <div className="text-sm text-gray-600">
              {recurrenceRule
                ? "Rule selected (stored in recurrence_rule)."
                : "Select a preset above, or wire a custom rule builder next."}
            </div>
          </div>
        )}

        {/* HOURS */}
        <div className="mb-6">
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
