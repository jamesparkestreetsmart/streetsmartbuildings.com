"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ======================================================
   Types
====================================================== */

export type ExceptionModalMode =
  | "create"
  | "edit-one-time"
  | "edit-recurring-forward";

// DB-shaped row (what your API writes)
type DbExceptionRow = {
  exception_id: string;
  name: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  is_recurring: boolean;
  recurrence_rule: any | null;
  exception_date: string; // YYYY-MM-DD
  effective_from_date: string; // YYYY-MM-DD
};

// UI-shaped row (what ExceptionTable renders)
type UiExceptionRow = {
  exception_id: string;
  name: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;

  resolved_date: string; // YYYY-MM-DD
  day_of_week?: string;

  source_rule?: {
    is_recurring: boolean;
  };

  ui_state?: {
    is_past: boolean;
  };

  // these may or may not be present depending on your hook
  recurrence_rule?: any | null;
  is_recurring?: boolean;
  exception_date?: string;
  effective_from_date?: string;
};

export type ExceptionModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;

  siteId: string;
  mode: ExceptionModalMode;

  // ✅ allow either shape, plus null/undefined for create mode
  initialData?: DbExceptionRow | UiExceptionRow | null;
};

/* ======================================================
   Component
====================================================== */

export default function ExceptionModal({
  open,
  onClose,
  onSaved,
  siteId,
  mode,
  initialData,
}: ExceptionModalProps) {
  /* ----------------------------------
     State
  ---------------------------------- */

  const [name, setName] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [openTime, setOpenTime] = useState<string | null>(null);
  const [closeTime, setCloseTime] = useState<string | null>(null);

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<any | null>(null);

  const [exceptionDate, setExceptionDate] = useState("");
  const [effectiveFromDate, setEffectiveFromDate] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode =
    mode === "edit-one-time" ||
    mode === "edit-recurring-forward";

  // Safety guard — avoid weird UI if something calls edit without data
  if (isEditMode && !initialData) return null;

  /* ----------------------------------
     Normalize initialData → form state
  ---------------------------------- */

  useEffect(() => {
    if (!open) return;

    if (initialData) {
      // shared fields
      setName(initialData.name);
      setIsClosed(initialData.is_closed);
      setOpenTime(initialData.open_time);
      setCloseTime(initialData.close_time);

      // recurrence flag can come from either shape
      const recurring =
        (initialData as any).is_recurring ??
        (initialData as any).source_rule?.is_recurring ??
        false;

      setIsRecurring(Boolean(recurring));

      // recurrence rule may exist on either shape
      setRecurrenceRule((initialData as any).recurrence_rule ?? null);

      // For one-time exceptions:
      // - DB shape uses exception_date
      // - UI shape uses resolved_date
      const date =
        (initialData as any).exception_date ??
        (initialData as any).resolved_date ??
        "";

      setExceptionDate(date);

      // effective_from_date may be missing on UI rows; default to today
      const eff =
        (initialData as any).effective_from_date ??
        new Date().toISOString().slice(0, 10);

      setEffectiveFromDate(eff);
    } else {
      // create mode defaults
      setName("");
      setIsClosed(true);
      setOpenTime(null);
      setCloseTime(null);
      setIsRecurring(false);
      setRecurrenceRule(null);
      setExceptionDate("");
      setEffectiveFromDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, initialData]);

  /* ----------------------------------
     Payload builder
  ---------------------------------- */

  function buildPayload() {
    return {
      site_id: siteId,
      name,
      is_closed: isClosed,
      open_time: isClosed ? null : openTime,
      close_time: isClosed ? null : closeTime,
      is_recurring: isRecurring,
      recurrence_rule: isRecurring ? recurrenceRule : null,

      // For recurring: you may store a representative date; we keep it stable.
      exception_date: isRecurring
        ? exceptionDate || effectiveFromDate
        : exceptionDate,

      // Forward edit: user picks effectiveFromDate
      effective_from_date: effectiveFromDate,
    };
  }

  /* ----------------------------------
     Save handler
  ---------------------------------- */

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const payload = buildPayload();

      let res: Response;

      if (mode === "edit-one-time" && initialData) {
        res = await fetch(
          `/api/store-hours/exceptions/${(initialData as any).exception_id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
      } else {
        res = await fetch("/api/store-hours/exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Failed to save exception");
    } finally {
      setSaving(false);
    }
  }

  /* ----------------------------------
     Render
  ---------------------------------- */

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" && "Add Store Hours Exception"}
            {mode === "edit-one-time" && "Edit Exception"}
            {mode === "edit-recurring-forward" &&
              "Edit Recurring Exception (Forward Only)"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Closed vs special */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={isClosed}
                onChange={() => setIsClosed(true)}
              />
              Closed all day
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!isClosed}
                onChange={() => setIsClosed(false)}
              />
              Special hours
            </label>
          </div>

          {!isClosed && (
            <div className="flex gap-2">
              <Input
                type="time"
                value={openTime ?? ""}
                onChange={(e) => setOpenTime(e.target.value)}
              />
              <Input
                type="time"
                value={closeTime ?? ""}
                onChange={(e) => setCloseTime(e.target.value)}
              />
            </div>
          )}

          {/* Recurrence */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            Repeats
          </label>

          {!isRecurring && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={exceptionDate}
                onChange={(e) => setExceptionDate(e.target.value)}
              />
            </div>
          )}

          {mode === "edit-recurring-forward" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Effective starting</label>
              <Input
                type="date"
                value={effectiveFromDate}
                onChange={(e) => setEffectiveFromDate(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {mode === "edit-recurring-forward" ? "Apply to Future Dates" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
