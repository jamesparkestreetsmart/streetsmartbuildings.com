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
        type: "nth_weekday", // ✅ FIX #1
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
      if (op
