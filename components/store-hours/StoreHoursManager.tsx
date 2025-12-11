"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABEL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

type StoreHoursRow = {
  store_hours_id: string | null; // will be null before insert
  site_id: string;
  day_of_week: string;
  open_time: string | null; // "HH:MM:SS" from Supabase
  close_time: string | null;
  is_closed: boolean;
};

interface StoreHoursManagerProps {
  siteId: string;
}

export default function StoreHoursManager({ siteId }: StoreHoursManagerProps) {
  const [rows, setRows] = useState<StoreHoursRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // ======== INITIAL LOAD / AUTO-INITIALIZE ========
  useEffect(() => {
    if (!siteId) return;
    fetchHours();
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
      setError("Failed to load store hours." + JSON.stringify(error));
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      // Auto-create 7 default rows (closed all day)
      const defaults: Omit<StoreHoursRow, "store_hours_id">[] = DAY_ORDER.map(
        (day) => ({
          site_id: siteId,
          day_of_week: day,
          open_time: null,
          close_time: null,
          is_closed: true,
        })
      );

      const { data: inserted, error: insertError } = await supabase
        .from("b_store_hours")
        .insert(defaults)
        .select("*");

      if (insertError) {
        console.error("Error initializing store hours:", insertError);
        setError("Failed to initialize store hours.");
        setLoading(false);
        return;
      }

      const normalized = normalizeRows(inserted as any);
      setRows(normalized);
      setLoading(false);
      return;
    }

    const normalizedExisting = normalizeRows(data as any);
    setRows(normalizedExisting);
    setLoading(false);
  }

  function normalizeRows(data: any[]): StoreHoursRow[] {
    const byDay: Record<string, StoreHoursRow> = {};
    data.forEach((row) => {
      byDay[row.day_of_week] = {
        store_hours_id: row.store_hours_id ?? row.id ?? null,
        site_id: row.site_id,
        day_of_week: row.day_of_week,
        open_time: row.open_time,
        close_time: row.close_time,
        is_closed: !!row.is_closed,
      };
    });

    return DAY_ORDER.map((day) => {
      if (byDay[day]) return byDay[day];
      // fallback (shouldn't happen once initialized)
      return {
        store_hours_id: null,
        site_id: siteId,
        day_of_week: day,
        open_time: null,
        close_time: null,
        is_closed: true,
      };
    });
  }

  // ======== EDITING HELPERS ========
  function handleClosedChange(idx: number, checked: boolean) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === idx
          ? {
              ...row,
              is_closed: checked,
              // optionally clear times when closed
              open_time: checked ? null : row.open_time,
              close_time: checked ? null : row.close_time,
            }
          : row
      )
    );
  }

  function handleTimeChange(
    idx: number,
    field: "open_time" | "close_time",
    value: string | null
  ) {
    setRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  }

  // Simple validation: if not closed, must have both times and open < close
  function validateRows(): string | null {
    for (const row of rows) {
      if (!row.is_closed) {
        if (!row.open_time || !row.close_time) {
          return `Please set both open and close times for ${DAY_LABEL[row.day_of_week]}.`;
        }
        const openMins = timeToMinutes(row.open_time);
        const closeMins = timeToMinutes(row.close_time);
        if (openMins >= closeMins) {
          return `Open time must be before close time for ${DAY_LABEL[row.day_of_week]}.`;
        }
      }
    }
    return null;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const validationError = validateRows();
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }

    // Split rows into updates and inserts (should mostly be updates)
    const toUpdate = rows.filter((r) => r.store_hours_id !== null);
    const toInsert = rows.filter((r) => r.store_hours_id === null);

    if (toUpdate.length > 0) {
      const { error: updateError } = await supabase.from("b_store_hours").upsert(
        toUpdate.map((r) => ({
          store_hours_id: r.store_hours_id,
          site_id: r.site_id,
          day_of_week: r.day_of_week,
          open_time: r.open_time,
          close_time: r.close_time,
          is_closed: r.is_closed,
        }))
      );

      if (updateError) {
        console.error("Error saving store hours (update):", updateError);
        setError("Failed to save store hours.");
        setSaving(false);
        return;
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("b_store_hours")
        .insert(
          toInsert.map((r) => ({
            site_id: r.site_id,
            day_of_week: r.day_of_week,
            open_time: r.open_time,
            close_time: r.close_time,
            is_closed: r.is_closed,
          }))
        )
        .select("*");

      if (insertError) {
        console.error("Error saving store hours (insert):", insertError);
        setError("Failed to save store hours.");
        setSaving(false);
        return;
      }

      // merge inserted IDs back into state
      const insertedByDay: Record<string, any> = {};
      (inserted || []).forEach((r: any) => {
        insertedByDay[r.day_of_week] = r;
      });

      setRows((prev) =>
        prev.map((row) =>
          row.store_hours_id === null && insertedByDay[row.day_of_week]
            ? {
                ...row,
                store_hours_id:
                  insertedByDay[row.day_of_week].store_hours_id ??
                  insertedByDay[row.day_of_week].id,
              }
            : row
        )
      );
    }

    setSaving(false);
    setIsEditing(false);
  }

  function handleCancel() {
    // reload from server to discard edits
    fetchHours();
    setIsEditing(false);
  }

  // ======== TIME UTILITIES ========
  function timeToMinutes(value: string | null): number {
    if (!value) return 0;
    const [h, m] = value.split(":").map((x) => parseInt(x, 10));
    return h * 60 + m;
  }

  function formatTime(value: string | null): string {
    if (!value) return "—";
    const [hStr, mStr] = value.split(":");
    let h = parseInt(hStr, 10);
    const m = mStr ?? "00";
    const suffix = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h = h - 12;
    return `${h}:${m.padStart(2, "0")} ${suffix}`;
  }

  function buildTimeString(hour12: number, minute: number, ampm: "AM" | "PM") {
    let h = hour12 % 12;
    if (ampm === "PM") h += 12;
    const hh = h.toString().padStart(2, "0");
    const mm = minute.toString().padStart(2, "0");
    return `${hh}:${mm}:00`;
  }

  // ======== RENDER ========
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Store Hours</CardTitle>

        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Hours"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              Edit Hours
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading && <p className="text-sm text-gray-500 mb-2">Loading store hours…</p>}
        {error && !loading && (
          <p className="text-sm text-red-600 mb-2">{error}</p>
        )}

        {!loading && (
          <div className="overflow-x-auto border rounded-md">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Day</th>
                  <th className="text-left px-4 py-2 font-semibold">Open</th>
                  <th className="text-left px-4 py-2 font-semibold">Close</th>
                  <th className="text-left px-4 py-2 font-semibold">Closed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.day_of_week} className="border-t">
                    <td className="px-4 py-2">{DAY_LABEL[row.day_of_week]}</td>

                    {/* OPEN TIME */}
                    <td className="px-4 py-2">
                      {isEditing && !row.is_closed ? (
                        <TimePopover
                          value={row.open_time}
                          onChange={(val) => handleTimeChange(idx, "open_time", val)}
                        />
                      ) : (
                        <span>{row.is_closed ? "—" : formatTime(row.open_time)}</span>
                      )}
                    </td>

                    {/* CLOSE TIME */}
                    <td className="px-4 py-2">
                      {isEditing && !row.is_closed ? (
                        <TimePopover
                          value={row.close_time}
                          onChange={(val) => handleTimeChange(idx, "close_time", val)}
                        />
                      ) : (
                        <span>{row.is_closed ? "—" : formatTime(row.close_time)}</span>
                      )}
                    </td>

                    {/* CLOSED FLAG */}
                    <td className="px-4 py-2">
                      {isEditing ? (
                        <Checkbox
                          checked={row.is_closed}
                          onCheckedChange={(checked: boolean) =>
                            handleClosedChange(idx, checked)
                          }
                        />
                      ) : row.is_closed ? (
                        <span>Yes</span>
                      ) : (
                        <span>No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ======== INLINE "POPOVER" TIME PICKER (Option B Style) ========
  function TimePopover({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (val: string | null) => void;
  }) {
    const [open, setOpen] = useState(false);

    // derive h/m/ampm from value
    let initialHour = 8;
    let initialMinute = 0;
    let initialAmpm: "AM" | "PM" = "AM";

    if (value) {
      const [hStr, mStr] = value.split(":");
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr || "0", 10);
      initialAmpm = h >= 12 ? "PM" : "AM";
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      initialHour = h;
      initialMinute = m;
    }

    const [hour, setHour] = useState<number>(initialHour);
    const [minute, setMinute] = useState<number>(initialMinute);
    const [ampm, setAmpm] = useState<"AM" | "PM">(initialAmpm);

    // Whenever the selection changes, push up immediately
    useEffect(() => {
      const t = buildTimeString(hour, minute, ampm);
      onChange(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hour, minute, ampm]);

    return (
      <div className="relative inline-block">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-[110px] justify-between"
          onClick={() => setOpen((prev) => !prev)}
        >
          {formatTime(value)}
        </Button>

        {open && (
          <div className="absolute z-20 mt-2 rounded-md border bg-white shadow-lg p-3 flex gap-2 items-center">
            {/* Hour */}
            <Input
              type="number"
              min={1}
              max={12}
              value={hour}
              onChange={(e) => {
                const v = parseInt(e.target.value || "1", 10);
                if (v >= 1 && v <= 12) setHour(v);
              }}
              className="w-14 text-center"
            />

            <span>:</span>

            {/* Minute */}
            <Input
              type="number"
              min={0}
              max={59}
              value={minute.toString().padStart(2, "0")}
              onChange={(e) => {
                let v = parseInt(e.target.value || "0", 10);
                if (v < 0) v = 0;
                if (v > 59) v = 59;
                setMinute(v);
              }}
              className="w-14 text-center"
            />

            {/* AM/PM */}
            <select
              className="border rounded px-2 py-1 text-sm"
              value={ampm}
              onChange={(e) =>
                setAmpm(e.target.value === "PM" ? "PM" : "AM")
              }
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        )}
      </div>
    );
  }
}
