// file: components/store-hours/WeeklyStoreHours.tsx

"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import TierBadge from "@/components/ui/TierBadge";

interface StoreHoursTemplate {
  template_id: string;
  org_id: string;
  template_name: string;
  is_global: boolean;
  created_at: string;
  [key: string]: any;
}

interface StoreHoursManagerProps {
  siteId: string;
  orgId?: string;
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

const DAY_MAP: Record<string, string> = {
  monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu",
  friday: "fri", saturday: "sat", sunday: "sun",
};

export default function StoreHoursManager({ siteId, orgId }: StoreHoursManagerProps) {
  const [rows, setRows] = useState<StoreHoursRow[]>([]);
  const [editRows, setEditRows] = useState<StoreHoursRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Template state
  const [templates, setTemplates] = useState<StoreHoursTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateResult, setSaveTemplateResult] = useState<string | null>(null);
  const [copyingTemplateId, setCopyingTemplateId] = useState<string | null>(null);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);

  const orgTemplateNames = useMemo(
    () => new Set(templates.filter((t) => !t.is_global).map((t) => t.template_name)),
    [templates]
  );

  const isEditing = editRows !== null;

  useEffect(() => {
    if (!siteId) return;
    fetchHours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Fetch templates
  useEffect(() => {
    if (!orgId) return;
    const fetchTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const res = await fetch(`/api/store-hours/templates?org_id=${orgId}`);
        if (!res.ok) {
          console.error("[WeeklyStoreHours] Templates fetch failed:", res.status);
          return;
        }
        const data = await res.json();
        if (data.templates) setTemplates(data.templates);
      } catch (err) {
        console.error("[WeeklyStoreHours] Failed to fetch templates:", err);
      } finally {
        setTemplatesLoading(false);
      }
    };
    fetchTemplates();
  }, [orgId]);

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

  // Apply template to the day grid (enters edit mode)
  function handleApplyTemplate(templateId: string) {
    const template = templates.find((t) => t.template_id === templateId);
    if (!template) return;
    setSelectedTemplateId(templateId);
    setAppliedTemplate(template.template_name);

    const newRows = rows.map((row) => {
      const prefix = DAY_MAP[row.day_of_week];
      if (!prefix) return row;
      return {
        ...row,
        open_time: template[`${prefix}_open`] ?? null,
        close_time: template[`${prefix}_close`] ?? null,
        is_closed: template[`${prefix}_closed`] ?? false,
      };
    });
    setEditRows(newRows);
    setError(null);
    setSuccess(null);
  }

  // Save current hours as a template
  async function handleSaveAsTemplate() {
    if (!saveTemplateName.trim() || !orgId) return;
    setSavingTemplate(true);
    setSaveTemplateResult(null);
    try {
      const sourceRows = editRows || rows;
      const body: Record<string, any> = {
        org_id: orgId,
        template_name: saveTemplateName.trim(),
      };
      for (const row of sourceRows) {
        const prefix = DAY_MAP[row.day_of_week];
        if (!prefix) continue;
        body[`${prefix}_open`] = row.is_closed ? null : row.open_time;
        body[`${prefix}_close`] = row.is_closed ? null : row.close_time;
        body[`${prefix}_closed`] = row.is_closed ?? false;
      }
      const res = await fetch("/api/store-hours/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.template) {
        setSaveTemplateResult("Saved!");
        setSaveTemplateName("");
        setShowSaveTemplate(false);
        // Refresh templates
        const refreshRes = await fetch(`/api/store-hours/templates?org_id=${orgId}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.templates) setTemplates(refreshData.templates);
        }
        setTimeout(() => setSaveTemplateResult(null), 3000);
      } else {
        setSaveTemplateResult(data.error || "Save failed");
      }
    } catch {
      setSaveTemplateResult("Network error");
    } finally {
      setSavingTemplate(false);
    }
  }

  // Copy SSB global template to org
  async function handleCopySSBTemplate(template: StoreHoursTemplate) {
    if (!orgId) return;
    setCopyingTemplateId(template.template_id);
    try {
      const body: Record<string, any> = {
        org_id: orgId,
        template_name: template.template_name,
      };
      for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
        body[`${day}_open`] = template[`${day}_open`] ?? null;
        body[`${day}_close`] = template[`${day}_close`] ?? null;
        body[`${day}_closed`] = template[`${day}_closed`] ?? false;
      }
      const res = await fetch("/api/store-hours/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.template) {
        setCopiedTemplateId(template.template_id);
        const refreshRes = await fetch(`/api/store-hours/templates?org_id=${orgId}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.templates) setTemplates(refreshData.templates);
        }
        setTimeout(() => setCopiedTemplateId(null), 3000);
      }
    } catch {
      console.error("Failed to copy SSB template");
    } finally {
      setCopyingTemplateId(null);
    }
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
    setAppliedTemplate(null);
    setSelectedTemplateId("");
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

      // 2️⃣ Attribution (cannonical user id)

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
      setAppliedTemplate(null);
      setSelectedTemplateId("");
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

      {/* Template Selector */}
      {orgId && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          {templatesLoading ? (
            <div className="text-xs text-gray-400">Loading templates...</div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-gray-400">
              No templates yet. Create one in My Journey &rarr; Global Operations, or save current hours as a template.
            </p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleApplyTemplate(e.target.value)}
                className="flex-1 min-w-[200px] px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 bg-white"
              >
                <option value="">Apply Template...</option>
                {templates.map((t) => (
                  <option key={t.template_id} value={t.template_id}>
                    {t.is_global ? `[SSB] ${t.template_name}` : `[ORG] ${t.template_name}`}
                  </option>
                ))}
              </select>
              {appliedTemplate && (
                <span className="text-xs text-green-600 font-medium">Applied: {appliedTemplate}</span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {!showSaveTemplate ? (
              <button
                onClick={() => { setShowSaveTemplate(true); setSaveTemplateResult(null); }}
                className="px-3 py-1.5 text-xs font-medium text-green-600 border border-green-300 rounded hover:bg-green-50 transition-colors"
              >
                Save Current as Template
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  placeholder="Template name..."
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 w-40"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveAsTemplate(); if (e.key === "Escape") { setShowSaveTemplate(false); setSaveTemplateName(""); } }}
                />
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={!saveTemplateName.trim() || savingTemplate}
                  className="px-2.5 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {savingTemplate ? "..." : "Confirm"}
                </button>
                <button
                  onClick={() => { setShowSaveTemplate(false); setSaveTemplateName(""); }}
                  className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
            {saveTemplateResult && (
              <span className={`text-xs ${saveTemplateResult === "Saved!" ? "text-green-600" : "text-red-600"}`}>
                {saveTemplateResult}
              </span>
            )}
          </div>
          {/* SSB template copy buttons */}
          {templates.some((t) => t.is_global) && (
            <div className="mt-2 space-y-1">
              {templates.filter((t) => t.is_global).map((t) => (
                <div key={t.template_id} className="flex items-center gap-2 text-xs">
                  <TierBadge tier="SSB" />
                  <span className="text-gray-700">{t.template_name}</span>
                  {orgTemplateNames.has(t.template_name) ? (
                    <span className="text-[10px] text-gray-400 italic">Already in your templates</span>
                  ) : copiedTemplateId === t.template_id ? (
                    <span className="text-[10px] text-green-600 font-medium">{"\u2713"} Added</span>
                  ) : (
                    <button
                      onClick={() => handleCopySSBTemplate(t)}
                      disabled={copyingTemplateId === t.template_id}
                      className="text-xs text-green-600 hover:text-green-700 disabled:opacity-50"
                    >
                      {copyingTemplateId === t.template_id ? "..." : "+ Add to My Templates"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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