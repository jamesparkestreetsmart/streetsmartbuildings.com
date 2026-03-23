"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

interface Snapshot {
  snapshot_id: string;
  name: string;
  snapshot_date: string;
  notes: string | null;
  zone_count: number;
  site_count: number;
  created_at: string;
  site_zone_count: number;
  site_zone_ids: string[];
}

interface SnapshotItem {
  snapshot_item_id: string;
  zone_id: string;
  zone_name: string | null;
  source_profile_name: string | null;
  occupied_heat_f: number | null;
  occupied_cool_f: number | null;
  occupied_fan_mode: string | null;
  occupied_hvac_mode: string | null;
  unoccupied_heat_f: number | null;
  unoccupied_cool_f: number | null;
  unoccupied_fan_mode: string | null;
  unoccupied_hvac_mode: string | null;
  guardrail_min_f: number | null;
  guardrail_max_f: number | null;
  manager_offset_up_f: number | null;
  manager_offset_down_f: number | null;
  manager_override_reset_minutes: number | null;
}

interface Props {
  siteId: string;
  orgId: string;
  siteName?: string;
  onApplied?: () => void;
}

function val(v: any): string {
  if (v == null) return "\u2014";
  return String(v);
}

const DIFF_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: "occupied_heat_f", label: "Occ Heat", unit: "\u00B0F" },
  { key: "occupied_cool_f", label: "Occ Cool", unit: "\u00B0F" },
  { key: "occupied_fan_mode", label: "Occ Fan", unit: "" },
  { key: "occupied_hvac_mode", label: "HVAC Mode (Occ)", unit: "" },
  { key: "unoccupied_heat_f", label: "Unocc Heat", unit: "\u00B0F" },
  { key: "unoccupied_cool_f", label: "Unocc Cool", unit: "\u00B0F" },
  { key: "unoccupied_fan_mode", label: "Unocc Fan", unit: "" },
  { key: "unoccupied_hvac_mode", label: "HVAC Mode (Unocc)", unit: "" },
  { key: "guardrail_min_f", label: "Guardrail Min", unit: "\u00B0F" },
  { key: "guardrail_max_f", label: "Guardrail Max", unit: "\u00B0F" },
  { key: "manager_offset_up_f", label: "Mgr Offset Up", unit: "\u00B0F" },
  { key: "manager_offset_down_f", label: "Mgr Offset Down", unit: "\u00B0F" },
  { key: "manager_override_reset_minutes", label: "Override Reset", unit: " min" },
];

function fieldsDiffer(a: any, b: any): boolean {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  return Number(a) !== Number(b) && String(a) !== String(b);
}

export default function SiteSnapshotPanel({ siteId, orgId, siteName, onApplied }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [confirmSnapshot, setConfirmSnapshot] = useState<Snapshot | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Detail modal state
  const [detailSnapshot, setDetailSnapshot] = useState<Snapshot | null>(null);
  const [detailItems, setDetailItems] = useState<SnapshotItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailConfirmApply, setDetailConfirmApply] = useState(false);
  const [currentZones, setCurrentZones] = useState<Record<string, Record<string, any>>>({});

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const { data: orgSnapshots } = await supabase
        .from("a_org_thermostat_snapshots")
        .select("snapshot_id, name, snapshot_date, notes, zone_count, site_count, created_at")
        .eq("org_id", orgId)
        .order("snapshot_date", { ascending: false });

      if (!orgSnapshots || orgSnapshots.length === 0) {
        setSnapshots([]);
        setLoading(false);
        return;
      }

      const snapshotIds = orgSnapshots.map((s) => s.snapshot_id);
      const { data: items } = await supabase
        .from("a_org_thermostat_snapshot_items")
        .select("snapshot_id, zone_id, site_id")
        .in("snapshot_id", snapshotIds)
        .eq("site_id", siteId);

      const siteItemMap: Record<string, string[]> = {};
      for (const item of items || []) {
        if (!siteItemMap[item.snapshot_id]) siteItemMap[item.snapshot_id] = [];
        siteItemMap[item.snapshot_id].push(item.zone_id);
      }

      const filtered = orgSnapshots
        .filter((s) => (siteItemMap[s.snapshot_id]?.length || 0) > 0)
        .map((s) => ({
          ...s,
          site_zone_count: siteItemMap[s.snapshot_id]?.length || 0,
          site_zone_ids: siteItemMap[s.snapshot_id] || [],
        }));

      setSnapshots(filtered);
    } catch (err) {
      console.error("Failed to fetch snapshots:", err);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, siteId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const openDetail = async (snapshot: Snapshot) => {
    setDetailSnapshot(snapshot);
    setDetailItems([]);
    setDetailError(null);
    setDetailLoading(true);
    setDetailConfirmApply(false);
    setCurrentZones({});
    try {
      const [snapshotRes, zonesRes] = await Promise.all([
        supabase
          .from("a_org_thermostat_snapshot_items")
          .select("*")
          .eq("snapshot_id", snapshot.snapshot_id)
          .eq("site_id", siteId),
        supabase
          .from("a_hvac_zones")
          .select("hvac_zone_id, occupied_heat_f, occupied_cool_f, occupied_fan_mode, occupied_hvac_mode, unoccupied_heat_f, unoccupied_cool_f, unoccupied_fan_mode, unoccupied_hvac_mode, guardrail_min_f, guardrail_max_f, manager_offset_up_f, manager_offset_down_f, manager_override_reset_minutes")
          .eq("site_id", siteId),
      ]);

      if (snapshotRes.error) throw snapshotRes.error;
      setDetailItems((snapshotRes.data || []) as SnapshotItem[]);

      // Build zone map for diff
      const zoneMap: Record<string, Record<string, any>> = {};
      for (const z of zonesRes.data || []) {
        zoneMap[z.hvac_zone_id] = z;
      }
      setCurrentZones(zoneMap);
    } catch (err: any) {
      setDetailError(err.message || "Failed to load snapshot details");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApply = async (snapshot: Snapshot) => {
    setApplyingId(snapshot.snapshot_id);
    setConfirmSnapshot(null);
    setDetailSnapshot(null);
    setDetailConfirmApply(false);
    try {
      const res = await fetch(`/api/thermostat/snapshots/${snapshot.snapshot_id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          zone_ids: snapshot.site_zone_ids,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Snapshot applied \u2014 ${data.pushed} zones updated at ${siteName || "this site"}`, "success");
        onApplied?.();
      } else {
        showToast(data.error || "Apply failed \u2014 please try again", "error");
      }
    } catch {
      showToast("Apply failed \u2014 please try again", "error");
    } finally {
      setApplyingId(null);
    }
  };

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="rounded-xl bg-white shadow p-4 mb-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      <h2 className="text-xl font-semibold mb-1">Snapshots</h2>
      <p className="text-xs text-gray-400 mb-4">Saved from the Journey page. Apply saved thermostat state to this site only.</p>

      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Loading snapshots...</div>
      ) : snapshots.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center">
          No snapshots saved. <Link href="/journey" className="text-green-600 hover:underline">Create a snapshot from the Journey page.</Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Zones (this site)</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 w-[200px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {snapshots.map((s) => (
                <tr key={s.snapshot_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-gray-600">{formatDate(s.snapshot_date)}</td>
                  <td className="px-3 py-2 text-gray-600">{s.site_zone_count} zone{s.site_zone_count !== 1 ? "s" : ""}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openDetail(s)}
                        className="px-3 py-1 rounded text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => setConfirmSnapshot(s)}
                        disabled={applyingId === s.snapshot_id}
                        className="px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {applyingId === s.snapshot_id ? "Applying..." : "Apply to Site"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Apply Confirmation Modal */}
      {confirmSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-3">Apply Snapshot to {siteName || "this site"}</h3>
            <div className="text-sm text-gray-600 space-y-2 mb-4">
              <p>Apply &ldquo;{confirmSnapshot.name}&rdquo; settings to {confirmSnapshot.site_zone_count} zone{confirmSnapshot.site_zone_count !== 1 ? "s" : ""} at this site?</p>
              <p className="text-gray-500">This will update thermostat settings for zones at this site only. Other sites are not affected.</p>
              <p className="text-gray-500 text-xs">This action creates new site-level profiles for each zone and reassigns zones to them.</p>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <button onClick={() => setConfirmSnapshot(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 w-full sm:w-auto">Cancel</button>
              <button onClick={() => handleApply(confirmSnapshot)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 w-full sm:w-auto">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="p-6 pb-3 border-b">
              <h3 className="text-lg font-semibold">{detailSnapshot.name}</h3>
              <p className="text-sm text-gray-500">
                Saved {formatDate(detailSnapshot.snapshot_date)} &mdash; {detailSnapshot.site_zone_count} zone{detailSnapshot.site_zone_count !== 1 ? "s" : ""} at this site
              </p>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="text-sm text-gray-400 py-8 text-center">Loading snapshot details...</div>
              ) : detailError ? (
                <div className="text-sm text-red-600 py-8 text-center">{detailError}</div>
              ) : detailItems.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center">No snapshot items found for this site.</div>
              ) : detailConfirmApply ? (
                /* Inline confirm step */
                <div className="text-sm text-gray-600 space-y-3 py-4">
                  <p className="font-medium text-gray-900">
                    Apply &ldquo;{detailSnapshot.name}&rdquo; to {detailItems.length} zone{detailItems.length !== 1 ? "s" : ""} at {siteName || "this site"}?
                  </p>
                  <p className="text-gray-500">This will update thermostat settings for zones at this site only. Other sites are not affected.</p>
                  <p className="text-gray-500 text-xs">This action creates new site-level profiles for each zone and reassigns zones to them.</p>
                </div>
              ) : (
                /* Zone cards with diff */
                <div className="space-y-4">
                  {/* Diff summary banner */}
                  {Object.keys(currentZones).length > 0 && (() => {
                    let totalDiffs = 0;
                    let zonesWithDiffs = 0;
                    for (const item of detailItems) {
                      const cur = currentZones[item.zone_id];
                      if (!cur) continue;
                      let zoneDiffs = 0;
                      for (const f of DIFF_FIELDS) {
                        if (fieldsDiffer((item as any)[f.key], cur[f.key])) zoneDiffs++;
                      }
                      if (zoneDiffs > 0) { totalDiffs += zoneDiffs; zonesWithDiffs++; }
                    }
                    return totalDiffs === 0 ? (
                      <div className="px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                        Current settings already match this snapshot.
                      </div>
                    ) : (
                      <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                        This snapshot will change {totalDiffs} setting{totalDiffs !== 1 ? "s" : ""} across {zonesWithDiffs} zone{zonesWithDiffs !== 1 ? "s" : ""} at this site.
                      </div>
                    );
                  })()}

                  {detailItems.map((item) => {
                    const cur = currentZones[item.zone_id];
                    return (
                      <div key={item.snapshot_item_id || item.zone_id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{item.zone_name || item.zone_id}</span>
                          {item.source_profile_name && (
                            <span className="text-xs text-gray-400">Profile: {item.source_profile_name}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                          {DIFF_FIELDS.map((f) => {
                            const snapVal = (item as any)[f.key];
                            const curVal = cur?.[f.key];
                            const differs = cur && fieldsDiffer(snapVal, curVal);
                            return (
                              <div key={f.key} className={`py-0.5 px-1 rounded ${differs ? "bg-amber-50 border-l-2 border-l-amber-400" : ""}`}>
                                <span className="text-gray-400">{f.label}:</span>{" "}
                                <span className="font-medium">{val(snapVal)}{f.unit}</span>
                                {differs && (
                                  <span className="text-amber-600 ml-1">(current: {val(curVal)}{f.unit})</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 pt-3 border-t flex flex-col sm:flex-row justify-end gap-2">
              {detailConfirmApply ? (
                <>
                  <button onClick={() => setDetailConfirmApply(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 w-full sm:w-auto">Back</button>
                  <button
                    onClick={() => handleApply(detailSnapshot)}
                    disabled={applyingId === detailSnapshot.snapshot_id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 w-full sm:w-auto"
                  >
                    {applyingId === detailSnapshot.snapshot_id ? "Applying..." : "Confirm Apply"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setDetailSnapshot(null); setDetailConfirmApply(false); }} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 w-full sm:w-auto">Close</button>
                  {detailItems.length > 0 && !detailError && (
                    <button onClick={() => setDetailConfirmApply(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 w-full sm:w-auto">Apply to Site</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
