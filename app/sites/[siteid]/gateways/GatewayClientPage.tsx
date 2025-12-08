"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface SyncEntityRow {
  org_id: string;
  site_id: string;
  equipment_id: string;
  equipment_name: string | null;

  entity_id: string;
  domain: string | null;
  device_class: string | null;
  unit_of_measurement: string | null;
  last_state: string | null;
  area_id: string | null;
  last_updated: string | null;

  // extra columns from the view if you ever need them
  ha_device_id?: string | null;
  device_name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  sw_version?: string | null;
  hw_version?: string | null;
}

interface Props {
  siteid: string;
}

export default function GatewayClientPage({ siteid }: Props) {
  const router = useRouter();

  const [registry, setRegistry] = useState<SyncEntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  // ---------------------
  // FETCH ENTITY SYNC DATA (from view_entity_sync)
  // ---------------------
  const fetchRegistry = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("view_entity_sync")
      .select("*")
      .eq("site_id", siteid);

    if (error) {
      console.error("Registry fetch error:", error);
      setRegistry([]);
    } else {
      setRegistry((data ?? []) as SyncEntityRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchRegistry();
  }, [siteid]);

  // ---------------------
  // SORT by entity name AFTER the dot
  // ---------------------
  const sorted = useMemo(() => {
    const getEntitySortKey = (row: SyncEntityRow) => {
      if (!row.entity_id) return "";
      const parts = row.entity_id.split(".");
      // sensor.test_power_1 -> test_power_1
      const name = parts.length > 1 ? parts.slice(1).join(".") : row.entity_id;
      return name.toLowerCase();
    };

    return [...registry].sort((a, b) =>
      getEntitySortKey(a).localeCompare(getEntitySortKey(b))
    );
  }, [registry]);

  // ---------------------
  // SYNC HANDLING (button calls the same endpoint HA uses)
  // ---------------------
  const webhookUrl = `/api/ha/entity-sync`;

  const handleRunSync = async () => {
    setSyncStatus("loading");

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteid,
        }),
      });

      if (!res.ok) throw new Error("Sync failed");

      // give HA a moment to push + DB to commit
      await new Promise((r) => setTimeout(r, 1200));
      await fetchRegistry();

      setSyncStatus("success");
    } catch (e) {
      console.error(e);
      setSyncStatus("error");
    }

    setTimeout(() => setSyncStatus("idle"), 2500);
  };

  const lastSync =
    sorted[0]?.last_updated
      ? new Date(sorted[0].last_updated).toLocaleString()
      : "—";

  const formatValue = (row: SyncEntityRow) => {
    if (!row.last_state || row.last_state === "unknown") return "—";
    if (row.unit_of_measurement) {
      return `${row.last_state} ${row.unit_of_measurement}`;
    }
    return row.last_state;
  };

  // ---------------------
  // UI
  // ---------------------
  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gateway Entity Registry</h1>
        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          ← Back to Site
        </Button>
      </div>

      {/* SYNC CARD */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Endpoint (Home Assistant → Supabase)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-2">
            Home Assistant POSTs all entities to this endpoint.
          </p>

          <div className="flex gap-2 mb-3">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(webhookUrl)}
            >
              Copy
            </Button>
          </div>

          <Button onClick={handleRunSync} disabled={syncStatus === "loading"}>
            {syncStatus === "loading"
              ? "Syncing…"
              : syncStatus === "success"
              ? "Sync Complete ✓"
              : syncStatus === "error"
              ? "Sync Failed – Retry"
              : "Run Sync Now"}
          </Button>

          <p className="mt-3 text-xs text-gray-500">
            Last sync: <span className="font-mono">{lastSync}</span>
          </p>
        </CardContent>
      </Card>

      {/* ENTITY TABLE */}
      <Card>
        <CardHeader>
          <CardTitle>Z-Wave &amp; Home Assistant Entities</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-gray-500">
              No entities have been synced yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Equipment</th>
                    <th className="px-3 py-2 text-left">Entity ID</th>
                    <th className="px-3 py-2 text-left">Domain</th>
                    <th className="px-3 py-2 text-left">Class</th>
                    <th className="px-3 py-2 text-left">Value</th>
                    <th className="px-3 py-2 text-left">Area</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                  </tr>
                </thead>

                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.entity_id} className="border-t">
                      {/* Equipment name from a_equipments via the view */}
                      <td className="px-3 py-2">
                        {row.equipment_name ?? "—"}
                      </td>

                      {/* Full entity_id (sensor.xyz) */}
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.entity_id}
                      </td>

                      <td className="px-3 py-2">{row.domain ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.device_class ?? "—"}
                      </td>

                      <td className="px-3 py-2">{formatValue(row)}</td>

                      <td className="px-3 py-2">{row.area_id ?? "—"}</td>

                      <td className="px-3 py-2 text-xs text-gray-500">
                        {row.last_updated
                          ? new Date(row.last_updated).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
