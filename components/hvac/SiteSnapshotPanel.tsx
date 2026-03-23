"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

interface Snapshot {
  snapshot_id: string;
  name: string;
  snapshot_date: string;
  site_zone_count: number;
}

interface SnapshotDetail {
  snapshot_id: string;
  name: string;
  snapshot_date: string;
  site_zone_count: number;
  // Aggregated from first item (representative settings)
  occupied_heat_f: number | null;
  occupied_cool_f: number | null;
  occupied_fan_mode: string | null;
  unoccupied_heat_f: number | null;
  unoccupied_cool_f: number | null;
  guardrail_min_f: number | null;
  guardrail_max_f: number | null;
  manager_offset_up_f: number | null;
  manager_override_reset_minutes: number | null;
  smart_start_enabled: boolean | null;
  smart_start_max_adj_f: number | null;
  occupancy_enabled: boolean | null;
  occupancy_max_adj_f: number | null;
  feels_like_enabled: boolean | null;
  feels_like_max_adj_f: number | null;
}

interface Props {
  siteId: string;
  orgId: string;
}

function v(val: any, unit: string = ""): string {
  if (val == null) return "\u2014";
  return `${val}${unit}`;
}

function formatResetLabel(minutes: number | null): string {
  if (minutes == null) return "\u2014";
  if (minutes === 0) return "Never";
  return `${minutes / 60}hr`;
}

export default function SiteSnapshotPanel({ siteId, orgId }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const { data: orgSnapshots } = await supabase
        .from("a_org_thermostat_snapshots")
        .select("snapshot_id, name, snapshot_date")
        .eq("org_id", orgId)
        .order("snapshot_date", { ascending: false });

      if (!orgSnapshots || orgSnapshots.length === 0) {
        setSnapshots([]);
        setLoading(false);
        return;
      }

      const snapshotIds = orgSnapshots.map((s) => s.snapshot_id);

      // Fetch all snapshot items for this site with settings
      const { data: items } = await supabase
        .from("a_org_thermostat_snapshot_items")
        .select("snapshot_id, zone_id, occupied_heat_f, occupied_cool_f, occupied_fan_mode, unoccupied_heat_f, unoccupied_cool_f, guardrail_min_f, guardrail_max_f, manager_offset_up_f, manager_override_reset_minutes, smart_start_enabled, smart_start_max_adj_f, occupancy_enabled, occupancy_max_adj_f, feels_like_enabled, feels_like_max_adj_f")
        .in("snapshot_id", snapshotIds)
        .eq("site_id", siteId);

      // Group items by snapshot_id
      const itemMap: Record<string, any[]> = {};
      for (const item of items || []) {
        if (!itemMap[item.snapshot_id]) itemMap[item.snapshot_id] = [];
        itemMap[item.snapshot_id].push(item);
      }

      const details: SnapshotDetail[] = orgSnapshots
        .filter((s) => (itemMap[s.snapshot_id]?.length || 0) > 0)
        .map((s) => {
          const siteItems = itemMap[s.snapshot_id] || [];
          const first = siteItems[0] || {};
          return {
            snapshot_id: s.snapshot_id,
            name: s.name,
            snapshot_date: s.snapshot_date,
            site_zone_count: siteItems.length,
            occupied_heat_f: first.occupied_heat_f,
            occupied_cool_f: first.occupied_cool_f,
            occupied_fan_mode: first.occupied_fan_mode,
            unoccupied_heat_f: first.unoccupied_heat_f,
            unoccupied_cool_f: first.unoccupied_cool_f,
            guardrail_min_f: first.guardrail_min_f,
            guardrail_max_f: first.guardrail_max_f,
            manager_offset_up_f: first.manager_offset_up_f,
            manager_override_reset_minutes: first.manager_override_reset_minutes,
            smart_start_enabled: first.smart_start_enabled,
            smart_start_max_adj_f: first.smart_start_max_adj_f,
            occupancy_enabled: first.occupancy_enabled,
            occupancy_max_adj_f: first.occupancy_max_adj_f,
            feels_like_enabled: first.feels_like_enabled,
            feels_like_max_adj_f: first.feels_like_max_adj_f,
          };
        });

      setSnapshots(details);
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

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="rounded-xl bg-white shadow p-4 mb-4">
      <h2 className="text-xl font-semibold mb-1">Snapshots</h2>
      <p className="text-xs text-gray-400 mb-4">
        Saved from the Journey page. To apply a snapshot to a zone, use the zone profile selector in the HVAC Zone Setpoints table below.
      </p>

      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Loading snapshots...</div>
      ) : snapshots.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center">
          No snapshots saved. <Link href="/journey" className="text-green-600 hover:underline">Create a snapshot from the Journey page.</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshots.map((s) => (
            <div key={s.snapshot_id} className="border rounded-xl p-4">
              <h3 className="font-semibold text-base mb-1">{s.name}</h3>
              <div className="text-sm text-gray-600 space-y-0.5">
                <div className="flex flex-col md:flex-row md:gap-8">
                  {/* Left column — mode, setpoints, guardrails, zone count */}
                  <div className="space-y-0.5 min-w-0">
                    <p>
                      <span className="text-green-700 font-medium">Occupied:</span>{" "}
                      {v(s.occupied_heat_f, "\u00B0")}/{v(s.occupied_cool_f, "\u00B0F")}
                      {s.occupied_fan_mode != null && <> / {s.occupied_fan_mode}</>}
                      <span className="mx-2 text-gray-300">|</span>
                      <span className="text-gray-500 font-medium">Unoccupied:</span>{" "}
                      {v(s.unoccupied_heat_f, "\u00B0")}&ndash;{v(s.unoccupied_cool_f, "\u00B0F")}
                    </p>
                    <p className="text-xs text-gray-400">
                      Guardrails: {v(s.guardrail_min_f)}&ndash;{v(s.guardrail_max_f, "\u00B0F")}
                    </p>
                    <p className="text-xs text-gray-400">
                      {s.site_zone_count} zone{s.site_zone_count !== 1 ? "s" : ""} at this site
                    </p>
                  </div>
                  {/* Right column — manager offset, saving sources (desktop) */}
                  <div className="hidden md:flex flex-col text-xs text-gray-400 space-y-0.5 shrink-0">
                    <p>Manager: &plusmn;{v(s.manager_offset_up_f, "\u00B0F")} / {formatResetLabel(s.manager_override_reset_minutes)} reset</p>
                    <p>
                      Smart Start:{" "}
                      {s.smart_start_enabled == null ? "\u2014" : s.smart_start_enabled ? <span className="font-medium text-gray-600">+{v(s.smart_start_max_adj_f, "\u00B0F")}</span> : <span className="text-gray-300">off</span>}
                    </p>
                    <p>
                      Occupancy:{" "}
                      {s.occupancy_enabled == null ? "\u2014" : s.occupancy_enabled ? <span className="font-medium text-gray-600">+{v(s.occupancy_max_adj_f, "\u00B0F")}</span> : <span className="text-gray-300">off</span>}
                    </p>
                    <p>
                      Feels Like:{" "}
                      {s.feels_like_enabled == null ? "\u2014" : s.feels_like_enabled ? <span className="font-medium text-gray-600">+{v(s.feels_like_max_adj_f, "\u00B0F")}</span> : <span className="text-gray-300">off</span>}
                    </p>
                  </div>
                </div>
                {/* Narrow screen fallback — compact single line */}
                <p className="md:hidden text-xs text-gray-400">
                  Manager: &plusmn;{v(s.manager_offset_up_f, "\u00B0F")} / {formatResetLabel(s.manager_override_reset_minutes)} reset
                  {" \u00B7 "}
                  Smart Start {s.smart_start_enabled == null ? "\u2014" : s.smart_start_enabled ? <span className="font-medium text-gray-600">+{v(s.smart_start_max_adj_f, "\u00B0F")}</span> : <span className="text-gray-300">off</span>}
                  {" \u00B7 "}
                  Occupancy {s.occupancy_enabled == null ? "\u2014" : s.occupancy_enabled ? <span className="font-medium text-gray-600">+{v(s.occupancy_max_adj_f, "\u00B0F")}</span> : <span className="text-gray-300">off</span>}
                  {" \u00B7 "}
                  Feels Like {s.feels_like_enabled == null ? "\u2014" : s.feels_like_enabled ? <span className="font-medium text-gray-600">+{v(s.feels_like_max_adj_f, "\u00B0F")}</span> : <span className="text-gray-300">off</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
