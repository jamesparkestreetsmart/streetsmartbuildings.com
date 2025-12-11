// components/store-hours/StoreHoursManager.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface StoreHoursRow {
  store_hours_id: string;
  site_id: string;
  day_of_week: string; // 'monday'...'sunday'
  open_time: string | null; // "HH:MM:SS" or null
  close_time: string | null;
  is_closed: boolean | null;
}

interface StoreHoursManagerProps {
  siteId: string;
}

const DAY_ORDER = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

function sortByDay(rows: StoreHoursRow[]): StoreHoursRow[] {
  return [...rows].sort(
    (a, b) =>
      DAY_ORDER.findIndex((d) => d.key === a.day_of_week) -
      DAY_ORDER.findIndex((d) => d.key === b.day_of_week)
  );
}

// Convert "HH:MM:SS" from DB -> "HH:MM" for <input type="time">
function dbTimeToInput(time: string | null): string {
  if (!time) return "";
  return time.slice(0, 5); // "HH:MM"
}

// Convert "HH:MM" -> "HH:MM:SS" for DB
function inputToDbTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return `${value}:00`;
}

// Format DB time string as 12-hour (e.g., "17:30:00" -> "5:30 PM")
function formatTime12h(time: string | null): string {
  if (!time) return "--";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return "--";

  const minutes = mStr ?? "00";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;

  return `${hour12}:${minutes.padStart(2, "0")} ${suffix}`;
}

export default function StoreHoursManager({ siteId }: StoreHoursManagerProps) {
  const [rows, setRows] = useState<StoreHoursRow[]>([]);
  const [editRows, setEditRows] = useState<StoreHoursRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = editRows !== null;

  useEffect(() => {
    if (!siteId) return;
    fetchHours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function fetchHours() {
    setLoading(true);
    setError(null);

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
      // Auto-create 7 rows if none exist
      const defaults = DAY_ORDER.map((d) => ({
        site_id: siteId,
        day_of_week: d.key,
        is_closed: false,
        open_time: null,
        close_time: null,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from("b_store_hours")
        .insert(defaults)
        .select("*");

      if (insertError) {
        console.error("Error creating default store hours:", insertError);
        setError("Failed to initialize store hours.");
        setLoading(false);
        return;
      }

      setRows(sortByDay(inserted as StoreHoursRow[]));
    } else {
      setRows(sortByDay(data));
    }

    setLoading(false);
  }

  function handleStartEdit() {
    setEditRows(rows.map((r) => ({ ...r })));
  }

  function handleCancelEdit() {
    setEditRows(null);
    setError(null);
  }

  function handleTimeChange(
    idx: number,
    field: "open_time" | "close_time",
    value: string
  ) {
    if (!editRows) return;
    const updated = [...editRows];
    updated[idx] = {
      ...updated[idx],
      [field]: value ? inputToDbTime(value) : null,
    };
    setEditRows(updated);
  }

  function handleClosedChange(idx: number, checked: boolean) {
    if (!editRows) return;
    const updated = [...editRows];
    updated[idx] = {
      ...updated[idx],
      is_closed: checked,
      // Optionally clear times when marking closed
      open_time: checked ? null : updated[idx].open_time,
      close_time: checked ? null : updated[idx].close_time,
    };
    setEditRows(updated);
  }

  async function handleSave() {
    if (!editRows) return;
    setSaving(true);
    setError(null);

    // Normalize payload: ensure null times when closed
    const payload = editRows.map((r) => ({
      store_hours_id: r.store_hours_id,
      site_id: r.site_id,
      day_of_week: r.day_of_week,
      is_closed: !!r.is_closed,
      open_time: r.is_closed ? null : r.open_time,
      close_time: r.is_closed ? null : r.close_time,
    }));

    const { error } = await supabase.from("b_store_hours").upsert(payload);

    if (error) {
      console.error("Error saving store hours:", error);
      setError("Failed to save changes.");
      setSaving(false);
      return;
    }

    setRows(sortByDay(payload as StoreHoursRow[]));
    setEditRows(null);
    setSaving(false);
  }

  const displayedRows = isEditing ? (editRows as StoreHoursRow[]) : rows;

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Store Hours</h2>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={handleStartEdit} disabled={loading}>
              Edit Hours
            </Button>
          )}

          {isEditing && (
            <>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-3">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading store hours…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">Day</th>
                <th className="text-left py-2 pr-4">Open</th>
                <th className="text-left py-2 pr-4">Close</th>
                <th className="text-left py-2">Closed</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row, idx) => {
                const dayMeta = DAY_ORDER.find((d) => d.key === row.day_of_week);
                const label = dayMeta?.label ?? row.day_of_week;

                const openInputValue = dbTimeToInput(row.open_time);
                const closeInputValue = dbTimeToInput(row.close_time);

                const disabled = !!row.is_closed;

                return (
                  <tr key={row.day_of_week} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{label}</td>

                    {/* OPEN TIME */}
                    <td className="py-2 pr-4">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={openInputValue}
                            onChange={(e) =>
                              handleTimeChange(idx, "open_time", e.target.value)
                            }
                            disabled={disabled}
                            className="w-32"
                          />
                          <span className="text-xs text-muted-foreground w-16">
                            {formatTime12h(row.open_time)}
                          </span>
                        </div>
                      ) : (
                        <span>
                          {row.is_closed
                            ? "—"
                            : formatTime12h(row.open_time)}
                        </span>
                      )}
                    </td>

                    {/* CLOSE TIME */}
                    <td className="py-2 pr-4">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={closeInputValue}
                            onChange={(e) =>
                              handleTimeChange(idx, "close_time", e.target.value)
                            }
                            disabled={disabled}
                            className="w-32"
                          />
                          <span className="text-xs text-muted-foreground w-16">
                            {formatTime12h(row.close_time)}
                          </span>
                        </div>
                      ) : (
                        <span>
                          {row.is_closed
                            ? "—"
                            : formatTime12h(row.close_time)}
                        </span>
                      )}
                    </td>

                    {/* CLOSED FLAG */}
                    <td className="py-2">
                      {isEditing ? (
                        <Checkbox
                          checked={!!row.is_closed}
                          onCheckedChange={(checked) =>
                            handleClosedChange(idx, Boolean(checked))
                          }
                        />
                      ) : (
                        <span>{row.is_closed ? "Yes" : "No"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
