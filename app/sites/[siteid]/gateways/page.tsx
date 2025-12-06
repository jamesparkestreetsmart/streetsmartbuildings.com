// app/sites/[siteid]/gateways/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface SyncEntityRow {
  site_id: string;
  entity_id: string;
  ha_device_id: string | null;
  ha_device_name: string | null;
  domain: string | null;
  device_class: string | null;
  state: string | number | null;
  value: string | number | null;
  unit_of_measurement: string | null;
  ha_area_id: string | null;
  raw_json: any;
  last_updated_at: string | null;
}

export default function GatewayPage({
  params,
}: {
  params: { siteid: string };
}) {
  const router = useRouter();
  const siteid = params.siteid;

  const [registry, setRegistry] = useState<SyncEntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  // ---------------------
  // FETCH ENTITY SYNC DATA
  // ---------------------
  const fetchRegistry = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("b_entity_sync")
      .select("*")
      .eq("site_id", siteid);

    if (error) {
      console.error("Registry fetch error:", error);
      setRegistry([]);
    } else {
      setRegistry(data as SyncEntityRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchRegistry();
  }, [siteid]);

  // Sort alphabetically by device name
  const sorted = useMemo(() => {
    return [...registry].sort((a, b) => {
      const an = a.ha_device_name?.toLowerCase() ?? "";
      const bn = b.ha_device_name?.toLowerCase() ?? "";
      return an.localeCompare(bn);
    });
  }, [registry]);

  // ---------------------
  // SYNC HANDLING
  // ---------------------
  const webhookUrl = `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`;

  const handleRunSync = async () => {
    setSyncStatus("loading");

    try {
      const res = await fetch(`/api/sites/${siteid}/sync-ha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: [] }),
      });

      if (!res.ok) throw new Error("Sync failed");

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
    sorted[0]?.last_updated_at
      ? new Date(sorted[0].last_updated_at).toLocaleString()
      : "—";

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
            Home Assistant POSTs all entities to this webhook when discovered.
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
          <CardTitle>Z-Wave & Home Assistant Entities</CardTitle>
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
                    <th className="px-3 py-2 text-left">Device Name</th>
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
                      <td className="px-3 py-2">{row.ha_device_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.entity_id}
                      </td>
                      <td className="px-3 py-2">{row.domain ?? "—"}</td>
                      <td className="px-3 py-2">{row.device_class ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.value ?? row.state ?? "—"}
                        {row.unit_of_measurement
                          ? ` ${row.unit_of_measurement}`
                          : ""}
                      </td>
                      <td className="px-3 py-2">{row.ha_area_id ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {row.last_updated_at
                          ? new Date(row.last_updated_at).toLocaleString()
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
