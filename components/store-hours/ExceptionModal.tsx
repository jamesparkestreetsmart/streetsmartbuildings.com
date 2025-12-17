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
  const [holidayRule, setHolidayRule] = useState<string | null>(null);

  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

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
      setHolidayRule(initialData.recurrence_rule?.type ?? null);
    } else {
      setExceptionType("one-time");
      setDate(initialData.exception_date ?? "");
    }
  }, [initialData]);

  if (!open) return null;

  /* -------------------------
     SAVE HANDLER (UI-READY)
  ------------------------- */
  async function handleSave() {
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

    // -----------------------------
    // ONE-TIME EXCEPTION
    // -----------------------------
        if (exceptionType === "one-time") {
            payload.is_recurring = false;
            payload.exception_date = date;

            if (mode === "edit-one-time" && initialData?.exception_id) {
        // UPDATE existing row
                const res = await fetch(
                    `/api/store-hours/exceptions/${initialData.exception_id}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    }
                );

                if (!res.ok) throw new Error("Failed to update exception");
            } else {
        // CREATE new one-time exception
                const res = await fetch("/api/store-hours/exceptions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (!res.ok) throw new Error("Failed to create exception");
            }
        }

    // -----------------------------
    // RECURRING EXCEPTION
    // -----------------------------
        if (exceptionType === "recurring") {
            payload.is_recurring = true;
            payload.recurrence_rule = {
                type: holidayRule, // e.g. christmas_eve, thanksgiving
            };

      // 🔒 ALWAYS INSERT for recurring edits
      // (edit-forward creates a new effective row)
            const res = await fetch("/api/store-hours/exceptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error("Failed to save recurring exception");
        }

        onSaved();
    } catch (err) {
        console.error(err);
        alert("Failed to save exception");
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

        {/* 1️⃣ EXCEPTION TYPE */}
        <section className="mb-5">
          <label className="block font-semibold mb-2">
            What kind of exception is this?
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

        {/* 2️⃣ DATE / RULE */}
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
              Choose recurring rule
            </label>

            <select
              className="border rounded px-3 py-2 w-full"
              value={holidayRule ?? ""}
              onChange={(e) => setHolidayRule(e.target.value)}
            >
              <option value="">Select a rule…</option>
              {HOLIDAY_PRESETS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </section>
        )}

        {/* 3️⃣ HOURS */}
        <section className="mb-5">
          <label className="block font-semibold mb-2">
            Hours for this exception
          </label>

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

        {/* 4️⃣ EDIT SCOPE (EDIT ONLY) */}
        {mode !== "create" && exceptionType === "recurring" && (
          <section className="mb-6">
            <label className="block font-semibold mb-2">
              How should this edit apply?
            </label>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={editScope === "this-only"}
                  onChange={() => setEditScope("this-only")}
                />
                This date only
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={editScope === "this-and-forward"}
                  onChange={() => setEditScope("this-and-forward")}
                />
                This and all future occurrences
              </label>
            </div>
          </section>
        )}

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
