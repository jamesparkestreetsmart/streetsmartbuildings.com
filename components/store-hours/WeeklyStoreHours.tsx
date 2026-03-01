// file: components/store-hours/WeeklyStoreHours.tsx

"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
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
  if (!time) return "\u2014";
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return "\u2014";

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
  const [editRows, setEditRows] = useState<StoreHoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile-first state
  const [mode, setMode] = useState<"view" | "create">("view");
  const [templateName, setTemplateName] = useState("");

  // Template list state
  const [templates, setTemplates] = useState<StoreHoursTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Site view only shows org-approved templates (not SSB globals)
  const orgTemplates = useMemo(
    () => templates.filter((t) => !t.is_global),
    [templates]
  );

  useEffect(() => {
    if (!siteId) return;
    fetchHours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Fetch templates
  const fetchTemplates = async () => {
    if (!orgId) return;
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

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Helper: map template values onto existing rows
  function mapTemplateToRows(template: StoreHoursTemplate): StoreHoursRow[] {
    return rows.map((row) => {
      const prefix = DAY_MAP[row.day_of_week];
      if (!prefix) return row;
      return {
        ...row,
        open_time: template[`${prefix}_open`] ?? null,
        close_time: template[`${prefix}_close`] ?? null,
        is_closed: template[`${prefix}_closed`] ?? false,
      };
    });
  }

  // Helper: apply rows to site via API (shared by Save&Apply and Apply)
  async function applyRowsToSite(rowsToApply: StoreHoursRow[]): Promise<boolean> {
    // Validate
    for (const row of rowsToApply) {
      const closed = !!row.is_closed;
      const hasOpen = !!row.open_time;
      const hasClose = !!row.close_time;
      if (!closed && hasOpen !== hasClose) {
        setError(`Both open and close times are required when store is open (problem on ${row.day_of_week}).`);
        return false;
      }
    }

    // Get auth user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      setError("You must be logged in to save store hours.");
      return false;
    }

    const res = await fetch("/api/store-hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        site_id: siteId,
        changed_by: authUser.id,
        rows: rowsToApply.map((row) => ({
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
      return false;
    }

    setRows(sortByDayOrder(rowsToApply));
    return true;
  }

  // Enter create mode pre-filled with current site hours
  function startNewTemplate() {
    setEditRows([...rows]);
    setTemplateName("");
    setMode("create");
    setError(null);
    setSuccess(null);
  }

  // Enter create mode pre-filled from an existing template (name blank)
  function startFromExistingTemplate(templateId: string) {
    const template = templates.find((t) => t.template_id === templateId);
    if (!template) return;
    setEditRows(mapTemplateToRows(template));
    setTemplateName("");
    setMode("create");
    setError(null);
    setSuccess(null);
  }

  // Save template to API then apply hours to site
  async function handleSaveTemplate() {
    if (!templateName.trim() || !orgId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Save template
      const body: Record<string, any> = {
        org_id: orgId,
        template_name: templateName.trim(),
      };
      for (const row of editRows) {
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
      if (!data.template) {
        setError(data.error || "Failed to save template");
        setSaving(false);
        return;
      }

      // 2. Apply to site
      const applied = await applyRowsToSite(editRows);
      if (!applied) {
        // Template saved but apply failed — still refresh templates
        fetchTemplates();
        setSaving(false);
        return;
      }

      fetchTemplates();
      setMode("view");
      setTemplateName("");
      setSuccess("Template saved and hours applied.");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  // Apply an existing template directly to site (immediate, no edit mode)
  async function handleApplyExistingTemplate(templateId: string) {
    const template = templates.find((t) => t.template_id === templateId);
    if (!template) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const mappedRows = mapTemplateToRows(template);
      const applied = await applyRowsToSite(mappedRows);
      if (applied) {
        setSuccess(`Applied "${template.template_name}" to site hours.`);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  // Delete a template
  async function handleDeleteTemplate(templateId: string) {
    if (!orgId) return;
    setDeletingTemplateId(templateId);
    try {
      const res = await fetch(`/api/store-hours/templates?template_id=${templateId}&org_id=${orgId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchTemplates();
      }
    } catch {
      console.error("Failed to delete template");
    } finally {
      setDeletingTemplateId(null);
    }
  }

  function updateEditRow(idx: number, patch: Partial<StoreHoursRow>) {
    setEditRows((prev) => {
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

  const displayedRows = mode === "create" ? editRows : rows;

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Store Hours</h2>
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

      {/* Templates list (always visible) */}
      {orgId && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Templates {orgTemplates.length > 0 && `(${orgTemplates.length})`}
            </span>
            <button
              onClick={startNewTemplate}
              disabled={mode === "create" || loading}
              className="px-3 py-1.5 text-xs font-medium text-green-600 border border-green-300 rounded hover:bg-green-50 disabled:opacity-40 transition-colors"
            >
              + New Template
            </button>
          </div>

          {templatesLoading ? (
            <div className="text-xs text-gray-400 py-1">Loading templates...</div>
          ) : orgTemplates.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">
              No templates yet. Click &ldquo;+ New Template&rdquo; to create one from current site hours.
            </p>
          ) : (
            <div className="space-y-1.5">
              {orgTemplates.map((t) => (
                <div
                  key={t.template_id}
                  className="flex items-center justify-between px-2.5 py-2 rounded border border-gray-200 bg-white text-xs"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TierBadge tier="ORG" />
                    <span className="font-medium text-gray-700 truncate">{t.template_name}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <button
                      onClick={() => handleApplyExistingTemplate(t.template_id)}
                      disabled={saving}
                      className="px-2 py-0.5 text-[11px] font-medium text-green-600 border border-green-300 rounded hover:bg-green-50 disabled:opacity-40 transition-colors"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => startFromExistingTemplate(t.template_id)}
                      disabled={mode === "create"}
                      className="px-2 py-0.5 text-[11px] font-medium text-blue-600 border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-40 transition-colors"
                    >
                      Use as Base
                    </button>
{/* Delete org templates from My Journey > Global Operations only */}
                  </div>
                </div>
              ))}

            </div>
          )}
        </div>
      )}

      {/* Template name input (create mode only) */}
      {mode === "create" && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <label className="block text-xs font-medium text-gray-600 mb-1">New Template Name</label>
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g., Summer Hours, Holiday Schedule..."
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500"
            autoFocus
          />
        </div>
      )}

      {/* Schedule table */}
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
                  Loading store hours...
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
                      {mode === "create" ? (
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
                      {mode === "create" ? (
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
                      {mode === "create" ? (
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

      {/* Footer (create mode only) */}
      {mode === "create" && (
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <button
            onClick={() => { setMode("view"); setTemplateName(""); setError(null); }}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveTemplate}
            disabled={saving || !templateName.trim()}
            className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save & Apply"}
          </button>
        </div>
      )}
    </div>
  );
}
