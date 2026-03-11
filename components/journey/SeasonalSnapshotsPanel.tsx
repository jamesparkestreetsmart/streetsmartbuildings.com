"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Snapshot {
  snapshot_id: string;
  name: string;
  snapshot_date: string;
  notes: string | null;
  zone_count: number;
  site_count: number;
  created_by_user_id: string | null;
  created_at: string;
}

interface SnapshotItem {
  snapshot_item_id: string;
  snapshot_id: string;
  site_id: string;
  zone_id: string;
  zone_name: string;
  site_name: string;
  source_profile_name: string | null;
  occupied_heat_f: number | null;
  occupied_cool_f: number | null;
  unoccupied_heat_f: number | null;
  unoccupied_cool_f: number | null;
}

interface SiteGroup {
  site_id: string;
  site_name: string;
  items: SnapshotItem[];
}

interface SnapshotDetail extends Snapshot {
  items: SnapshotItem[];
  site_groups: SiteGroup[];
}

interface Props {
  orgId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SeasonalSnapshotsPanel({ orgId }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  // Save modal
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDate, setSaveDate] = useState(new Date().toISOString().split("T")[0]);
  const [saveNotes, setSaveNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // View modal
  const [viewSnapshot, setViewSnapshot] = useState<SnapshotDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Push modal
  const [pushSnapshot, setPushSnapshot] = useState<SnapshotDetail | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStep, setPushStep] = useState<1 | 2 | 3>(1);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [pushResult, setPushResult] = useState<any>(null);
  const [pushing, setPushing] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/thermostat/snapshots?org_id=${orgId}`);
      if (res.ok) setSnapshots(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  async function fetchSnapshotDetail(snapshotId: string): Promise<SnapshotDetail | null> {
    const res = await fetch(`/api/thermostat/snapshots/${snapshotId}`);
    if (!res.ok) return null;
    return await res.json();
  }

  // ---------------------------------------------------------------------------
  // Save snapshot
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/thermostat/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          name: saveName.trim(),
          snapshot_date: saveDate,
          notes: saveNotes.trim() || null,
        }),
      });
      if (res.ok) {
        setSaveOpen(false);
        setSaveName("");
        setSaveNotes("");
        fetchSnapshots();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to save snapshot");
      }
    } catch {
      alert("Failed to save snapshot");
    }
    setSaving(false);
  }

  // ---------------------------------------------------------------------------
  // View snapshot
  // ---------------------------------------------------------------------------

  async function handleView(snap: Snapshot) {
    setViewLoading(true);
    const detail = await fetchSnapshotDetail(snap.snapshot_id);
    setViewSnapshot(detail);
    setViewLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Push snapshot
  // ---------------------------------------------------------------------------

  async function handleStartPush(snap: Snapshot) {
    setPushLoading(true);
    const detail = await fetchSnapshotDetail(snap.snapshot_id);
    if (detail) {
      setPushSnapshot(detail);
      setSelectedZones(new Set(detail.items.map((i) => i.zone_id)));
      setPushStep(1);
      setPushResult(null);
    }
    setPushLoading(false);
  }

  async function handleConfirmPush() {
    if (!pushSnapshot) return;
    setPushing(true);
    try {
      const res = await fetch(`/api/thermostat/snapshots/${pushSnapshot.snapshot_id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          zone_ids: Array.from(selectedZones),
        }),
      });
      const data = await res.json();
      setPushResult(data);
      setPushStep(3);
    } catch {
      setPushResult({ error: "Push failed" });
      setPushStep(3);
    }
    setPushing(false);
  }

  function closePush() {
    setPushSnapshot(null);
    setPushResult(null);
    setPushStep(1);
  }

  // ---------------------------------------------------------------------------
  // Zone selection helpers
  // ---------------------------------------------------------------------------

  function toggleZone(zoneId: string) {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId); else next.add(zoneId);
      return next;
    });
  }

  function toggleSite(siteGroup: SiteGroup) {
    const allSelected = siteGroup.items.every((i) => selectedZones.has(i.zone_id));
    setSelectedZones((prev) => {
      const next = new Set(prev);
      for (const item of siteGroup.items) {
        if (allSelected) next.delete(item.zone_id); else next.add(item.zone_id);
      }
      return next;
    });
  }

  const selectedSiteCount = pushSnapshot
    ? new Set(pushSnapshot.items.filter((i) => selectedZones.has(i.zone_id)).map((i) => i.site_id)).size
    : 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Seasonal Snapshots</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Capture and restore org-wide thermostat configurations
          </p>
        </div>
        <button
          onClick={() => setSaveOpen(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Save Current State
        </button>
      </div>

      {/* Snapshot list */}
      <div className="p-6">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Loading...</p>
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4 border rounded">
            No snapshots yet. Save a snapshot before the next season change.
          </p>
        ) : (
          <div className="border rounded overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Sites</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Zones</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Notes</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Created</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {snapshots.map((snap) => (
                  <tr key={snap.snapshot_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{snap.name}</td>
                    <td className="px-4 py-2 text-gray-600">{formatDate(snap.snapshot_date)}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{snap.site_count}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{snap.zone_count}</td>
                    <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate">{snap.notes || "-"}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{formatTimestamp(snap.created_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleView(snap)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleStartPush(snap)}
                          disabled={pushLoading}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          Push
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========== SAVE MODAL ========== */}
      {saveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Save Current State</h3>
              <button onClick={() => setSaveOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Snapshot Name *</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Summer 2026 Configuration"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Snapshot Date</label>
                <input
                  type="date"
                  value={saveDate}
                  onChange={(e) => setSaveDate(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={saveNotes}
                  onChange={(e) => setSaveNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional notes about this snapshot..."
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setSaveOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-white border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !saveName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Snapshot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== VIEW MODAL ========== */}
      {(viewSnapshot || viewLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            {viewLoading ? (
              <div className="p-8 text-center text-gray-400">Loading snapshot...</div>
            ) : viewSnapshot ? (
              <>
                <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{viewSnapshot.name}</h3>
                    <p className="text-sm text-gray-500">
                      {formatDate(viewSnapshot.snapshot_date)} — {viewSnapshot.zone_count} zones across {viewSnapshot.site_count} sites
                    </p>
                    {viewSnapshot.notes && (
                      <p className="text-sm text-gray-500 mt-1">{viewSnapshot.notes}</p>
                    )}
                  </div>
                  <button onClick={() => setViewSnapshot(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <div className="px-6 py-4 space-y-6">
                  {viewSnapshot.site_groups.map((group) => (
                    <div key={group.site_id}>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">{group.site_name}</h4>
                      <table className="w-full text-xs border rounded">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-600">Zone</th>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-600">Profile</th>
                            <th className="text-center px-3 py-1.5 font-medium text-gray-600">Occ Heat/Cool</th>
                            <th className="text-center px-3 py-1.5 font-medium text-gray-600">Unocc Heat/Cool</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {group.items.map((item) => (
                            <tr key={item.snapshot_item_id}>
                              <td className="px-3 py-1.5 text-gray-900">{item.zone_name}</td>
                              <td className="px-3 py-1.5 text-gray-600">{item.source_profile_name || "-"}</td>
                              <td className="px-3 py-1.5 text-center text-gray-600">
                                {item.occupied_heat_f ?? "-"} / {item.occupied_cool_f ?? "-"}
                              </td>
                              <td className="px-3 py-1.5 text-center text-gray-600">
                                {item.unoccupied_heat_f ?? "-"} / {item.unoccupied_cool_f ?? "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ========== PUSH MODAL (3 steps) ========== */}
      {pushSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            {/* Step 1: Zone selection */}
            {pushStep === 1 && (
              <>
                <div className="px-6 py-4 border-b sticky top-0 bg-white">
                  <h3 className="text-lg font-semibold text-gray-900">Restore Snapshot: {pushSnapshot.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Select zones to restore. Deselect any you want to skip.
                  </p>
                </div>
                <div className="px-6 py-4 space-y-4">
                  {pushSnapshot.site_groups.map((group) => {
                    const allSelected = group.items.every((i) => selectedZones.has(i.zone_id));
                    return (
                      <div key={group.site_id}>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => toggleSite(group)}
                            className="rounded"
                          />
                          {group.site_name}
                        </label>
                        <div className="ml-6 space-y-1">
                          {group.items.map((item) => (
                            <label key={item.zone_id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedZones.has(item.zone_id)}
                                onChange={() => toggleZone(item.zone_id)}
                                className="rounded"
                              />
                              {item.zone_name}
                              <span className="text-xs text-gray-400 ml-1">
                                ({item.source_profile_name || "no profile"})
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-sm font-medium text-gray-700 pt-2">
                    {selectedZones.size} zones selected across {selectedSiteCount} sites
                  </p>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
                  <button onClick={closePush} className="px-4 py-2 text-sm text-gray-700 bg-white border rounded-md hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={() => setPushStep(2)}
                    disabled={selectedZones.size === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Confirm */}
            {pushStep === 2 && (
              <>
                <div className="px-6 py-4 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">Confirm Restore</h3>
                </div>
                <div className="px-6 py-6">
                  <p className="text-sm text-gray-700">
                    You are about to restore saved thermostat settings to <strong>{selectedZones.size} zones</strong>.
                    Each zone will be assigned a new profile created from the snapshot data.
                    This will overwrite their current profile assignments.
                  </p>
                  <p className="text-sm text-gray-500 mt-3">
                    The thermostat enforce cron will apply the restored settings on its next cycle.
                  </p>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
                  <button onClick={() => setPushStep(1)} className="px-4 py-2 text-sm text-gray-700 bg-white border rounded-md hover:bg-gray-50">
                    Back
                  </button>
                  <button
                    onClick={handleConfirmPush}
                    disabled={pushing}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {pushing ? "Restoring..." : "Confirm Restore"}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Result */}
            {pushStep === 3 && pushResult && (
              <>
                <div className="px-6 py-4 border-b">
                  <h3 className="text-lg font-semibold text-gray-900">Restore Complete</h3>
                </div>
                <div className="px-6 py-6 space-y-2">
                  {pushResult.error ? (
                    <p className="text-sm text-red-600">{pushResult.error}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-700">Zones restored: <strong>{pushResult.pushed}</strong></p>
                      <p className="text-sm text-gray-700">Profiles created: <strong>{pushResult.profiles_created}</strong></p>
                      <p className="text-sm text-gray-700">Sites affected: <strong>{pushResult.sites_affected}</strong></p>
                      {pushResult.skipped > 0 && (
                        <p className="text-sm text-amber-600">Skipped: {pushResult.skipped}</p>
                      )}
                      {pushResult.errors?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm font-medium text-red-600">Errors:</p>
                          {pushResult.errors.map((e: string, i: number) => (
                            <p key={i} className="text-xs text-red-500">{e}</p>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-3">
                        Settings will be enforced by the thermostat cron on its next cycle.
                      </p>
                    </>
                  )}
                </div>
                <div className="flex justify-end px-6 py-4 border-t bg-gray-50">
                  <button onClick={closePush} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
