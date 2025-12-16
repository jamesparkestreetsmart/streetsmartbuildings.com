"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectItem } from "@/components/ui/select";

import type { ExceptionModalProps } from "./ExceptionModal";

export default function ExceptionModal({
  open,
  onClose,
  onSaved,
  siteId,
  mode,
  initialData,
}: ExceptionModalProps) {
  /* ----------------------------------
     Base state
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

  /* ----------------------------------
     Initialize from edit data
  ---------------------------------- */

  useEffect(() => {
    if (!open) return;

    if (initialData) {
      setName(initialData.name);
      setIsClosed(initialData.is_closed);
      setOpenTime(initialData.open_time);
      setCloseTime(initialData.close_time);
      setIsRecurring(initialData.is_recurring);
      setRecurrenceRule(initialData.recurrence_rule);
      setExceptionDate(initialData.exception_date);
      setEffectiveFromDate(initialData.effective_from_date);
    } else {
      // create defaults
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
     Save handler (wire later)
  ---------------------------------- */

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      // API wiring happens in 5C-4B
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
            {mode === "edit-recurring-forward" && "Edit Recurring Exception (Forward Only)"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Closed vs special hours */}
          <div className="flex gap-4">
            <label>
              <input
                type="radio"
                checked={isClosed}
                onChange={() => setIsClosed(true)}
              />
              Closed all day
            </label>

            <label>
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

          {/* Recurrence toggle */}
          <label>
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            Repeats
          </label>

          {/* One-time date */}
          {!isRecurring && (
            <Input
              type="date"
              value={exceptionDate}
              onChange={(e) => setExceptionDate(e.target.value)}
            />
          )}

          {/* Forward-only effective date */}
          {mode === "edit-recurring-forward" && (
            <Input
              label="Effective starting"
              type="date"
              value={effectiveFromDate}
              onChange={(e) => setEffectiveFromDate(e.target.value)}
            />
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
            {mode === "edit-recurring-forward"
              ? "Apply to Future Dates"
              : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
