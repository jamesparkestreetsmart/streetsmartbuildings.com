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

interface Props {
  siteId: string;
  orgId: string;
  siteName?: string;
  onApplied?: () => void;
}

export default function SiteSnapshotPanel({ siteId, orgId, siteName, onApplied }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [confirmSnapshot, setConfirmSnapshot] = useState<Snapshot | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all org snapshots
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

      // 2. For each snapshot, check how many items belong to this site
      const snapshotIds = orgSnapshots.map((s) => s.snapshot_id);
      const { data: items } = await supabase
        .from("a_org_thermostat_snapshot_items")
        .select("snapshot_id, zone_id, site_id")
        .in("snapshot_id", snapshotIds)
        .eq("site_id", siteId);

      // Group by snapshot_id
      const siteItemMap: Record<string, string[]> = {};
      for (const item of items || []) {
        if (!siteItemMap[item.snapshot_id]) siteItemMap[item.snapshot_id] = [];
        siteItemMap[item.snapshot_id].push(item.zone_id);
      }

      // 3. Only include snapshots with zones at this site
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

  const handleApply = async () => {
    if (!confirmSnapshot) return;
    setApplyingId(confirmSnapshot.snapshot_id);
    setConfirmSnapshot(null);
    try {
      const res = await fetch(`/api/thermostat/snapshots/${confirmSnapshot.snapshot_id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          zone_ids: confirmSnapshot.site_zone_ids,
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
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-[120px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {snapshots.map((s) => (
                <tr key={s.snapshot_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-gray-600">{formatDate(s.snapshot_date)}</td>
                  <td className="px-3 py-2 text-gray-600">{s.site_zone_count} zone{s.site_zone_count !== 1 ? "s" : ""}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setConfirmSnapshot(s)}
                      disabled={applyingId === s.snapshot_id}
                      className="px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {applyingId === s.snapshot_id ? "Applying..." : "Apply to Site"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-3">Apply Snapshot to {siteName || "this site"}</h3>
            <div className="text-sm text-gray-600 space-y-2 mb-4">
              <p>
                Apply &ldquo;{confirmSnapshot.name}&rdquo; settings to {confirmSnapshot.site_zone_count} zone{confirmSnapshot.site_zone_count !== 1 ? "s" : ""} at this site?
              </p>
              <p className="text-gray-500">
                This will update thermostat settings for zones at this site only. Other sites are not affected.
              </p>
              <p className="text-gray-500 text-xs">
                This action creates new site-level profiles for each zone and reassigns zones to them.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmSnapshot(null)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
