// file: components/store-hours/StoreHoursManager.tsx

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface StoreHoursManagerProps {
  siteId: string;
}

type StoreHoursRow = {
  store_hours_id: string;
  site_id: string;
  day_of_week: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean | null;
};

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function sortByDayOrder(rows: StoreHoursRow[]): StoreHoursRow[] {
  return [...rows].sort(
    (a, b) =>
      DAY_ORDER.indexOf(a.day_of_week) -
      DAY_ORDER.indexOf(b.day_of_week)
  );
}

function toTimeInputValue(time: string | null): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function fromTimeInputValue(value: string): string | null {
  if (!value) return null;
  return value;
}

function formatDisplayTime(time: string | null): string {
  if (!time) return "—";
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return "—";

  const suffix = h >= 12 ? "PM" : "AM";
  const displayH = ((h + 11) % 12) + 1;
  return `${displayH}:${m.toString().padStart(2, "0")} ${suffix}`;
}

export default function StoreHoursManager({ siteId }: StoreHoursManagerProps) {
  const [rows, setRows] = useState<StoreHoursRow[]>([]);
  const [editRows, setEditRows] = useState<StoreHoursRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEditing = editRows !== null;

  useEffect(() => {
    if (!siteId) return;
    fetchHours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function fetchHours() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { data, error } = await supabase
      .from("b_store_hours")
      .select("*")
      .eq("site_id", siteId);

    if (error) {
      console.error("Error loading store hours:", error);
      setError("Failed to load store hours.");
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      const defaults = DAY_ORDER.map((d) => ({
        site_id: siteId,
        day_of_week: d,
        is_closed: false,
        open_time: null,
        close_time: null,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from("b_store_hours")
        .insert(defaults)
        .select("*");

      if (insertError || !inserted) {
        console.error("Error initializing store hours:", insertError);
        setError("Failed to initialize store hours.");
        setLoading(false);
        return;
      }

      setRows(sortByDayOrder(inserted as StoreHoursRow[]));
      setLoading(false);
      return;
    }

    setRows(sortByDayOrder(data as StoreHoursRow[]));
    setLoading(false);
  }

  function handleStartEditing() {
    setError(null);
    setSuccess(null);
    setEditRows(rows);
  }

  function handleCancelEditing() {
    setEditRows(null);
    setError(null);
    setSuccess(null);
  }

  function updateEditRow(idx: number, patch: Partial<StoreHoursRow>) {
    setEditRows((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  }

  function handleTimeChange(
    idx: number,
    field: "open_time" | "close_time",
    value: string
  ) {
    updateEditRow(idx, {
      [field]: fromTimeInputValue(value),
    });
  }

  function handleClosedChange(idx: number, checked: boolean) {
    if (checked) {
      updateEditRow(idx, {
        is_closed: true,
        open_time: null,
        close_time: null,
      });
    } else {
      updateEditRow(idx, { is_closed: false });
    }
  }

  // -----------------------------
  // SAVE HANDLER (UPDATED)
  // -----------------------------
  async function handleSave() {
    if (!editRows) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    // Validate rows
    for (const row of editRows) {
      const closed = !!row.is_closed;
      const hasOpen = !!row.open_time;
      const hasClose = !!row.close_time;

      if (!closed && hasOpen !== hasClose) {
        setError(
          `Both open and close times are required when store is open (problem on ${row.day_of_week}).`
        );
        setSaving(false);
        return;
      }
    }

    try {
      // 1️⃣ Get Supabase auth user
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !authUser) {
        setError("You must be logged in to save store hours.");
        setSaving(false);
        return;
      }

      // 2️⃣ Resolve authentication user 

      const changed_by = authUser.id;

      // 3️⃣ Send request
      const res = await fetch("/api/store-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          site_id: siteId,
          changed_by,
          rows: editRows.map((row) => ({
            store_hours_id: row.store_hours_id,
            day_of_week: row.day_of_week,
            is_closed: row.is_closed ?? false,
            open_time: row.is_closed ? null : row.open_time,
            close_time: row.is_closed ? null : row.close_time,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save store hours.");
        return;
      }

      setRows(sortByDayOrder(editRows));
      setEditRows(null);
      setSuccess("Store hours saved.");
    } catch (err) {
      console.error("Store hours save failed:", err);
      setError("Unexpected error saving store hours.");
    } finally {
      setSaving(false);
    }
  }

  const displayedRows = isEditing ? editRows ?? [] : rows;

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Store Hours</h2>

        {isEditing ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancelEditing}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Hours"}
            </Button>
          </div>
        ) : (
          <Button onClick={handleStartEditing} disabled={loading}>
            Edit Hours
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-xs font-semibold text-gray-600">
              <th className="py-2 px-3 text-left">Day</th>
              <th className="py-2 px-3 text-left">Open</th>
              <th className="py-2 px-3 text-left">Close</th>
              <th className="py-2 px-3 text-left">Closed</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={4}
                  className="py-4 px-3 text-center text-gray-500"
                >
                  Loading store hours…
                </td>
              </tr>
            )}

            {!loading &&
              displayedRows.map((row, idx) => {
                const closed = !!row.is_closed;

                return (
                  <tr key={row.store_hours_id} className="border-t">
                    <td className="py-2 px-3 capitalize">
                      {row.day_of_week}
                    </td>
                    <td className="py-2 px-3">
                      {isEditing ? (
                        <input
                          type="time"
                          value={toTimeInputValue(row.open_time)}
                          onChange={(e) =>
                            handleTimeChange(
                              idx,
                              "open_time",
                              e.target.value
                            )
                          }
                          disabled={closed}
                          className="border rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        formatDisplayTime(row.open_time)
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {isEditing ? (
                        <input
                          type="time"
                          value={toTimeInputValue(row.close_time)}
                          onChange={(e) =>
                            handleTimeChange(
                              idx,
                              "close_time",
                              e.target.value
                            )
                          }
                          disabled={closed}
                          className="border rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        formatDisplayTime(row.close_time)
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {isEditing ? (
                        <Checkbox
                          checked={closed}
                          onCheckedChange={(c) =>
                            handleClosedChange(idx, Boolean(c))
                          }
                        />
                      ) : (
                        <span>{closed ? "Yes" : "No"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
