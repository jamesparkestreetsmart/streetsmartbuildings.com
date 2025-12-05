// app/sites/[siteid]/gateways/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface GatewayEntityRow {
  id: string;
  site_id: string;
  ha_device_id: string;        // currently our unique key (entity_id)
  gr_device_name: string | null;
  gr_device_model: string | null;
  gr_area: string | null;
  gr_raw: any | null;          // raw HA payload (includes device_id, device_name, device_class, etc.)
  last_updated_at: string | null;
}

export default function GatewayPage({
  params,
}: {
  params: { siteid: string };
}) {
  const router = useRouter();

  const [siteid, setSiteId] = useState<string>("");
  const [registry, setRegistry] = useState<GatewayEntityRow[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  const [syncStatus, setSyncStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  // ---------------------
  // RESOLVE PARAMS (FIXED)
  // ---------------------
  useEffect(() => {
    setSiteId(params.siteid);
  }, [params]);

  // ---------------------
  // FETCH REGISTRY
  // ---------------------
  const fetchRegistry = async (sid: string) => {
    setLoadingRegistry(true);

    const { data, error } = await supabase
      .from("a_devices_gateway_registry")
      .select("*")
      .eq("site_id", sid);

    if (error) {
      console.error("Error loading gateway registry:", error);
      setRegistry([]);
    } else {
      setRegistry((data ?? []) as GatewayEntityRow[]);
    }

    setLoadingRegistry(false);
  };

  useEffect(() => {
    if (!siteid) return;
    fetchRegistry(siteid);
  }, [siteid]);

  // ---------------------
  // SORT REGISTRY
  // ---------------------
  const sortedRegistry = useMemo(() => {
    try {
      return [...registry].sort((a, b) => {
        const an = a.gr_device_name?.toLowerCase() ?? "";
        const bn = b.gr_device_name?.toLowerCase() ?? "";
        const primary = an.localeCompare(bn);
        if (primary !== 0) return primary;

        const ae = a.ha_device_id?.toLowerCase() ?? "";
        const be = b.ha_device_id?.toLowerCase() ?? "";
        return ae.localeCompare(be);
      });
    } catch (err) {
      console.error("Sorting error:", err);
      return registry;
    }
  }, [registry]);

  // ---------------------
  // WEBHOOK + SYNC
  // ---------------------
  const webhookUrl = siteid
    ? `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`
    : "";

  const handleCopyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setSyncStatus("success");
    setTimeout(() => setSyncStatus("idle"), 1500);
  };

  const handleRunSync = async () => {
    setSyncStatus("loading");

    try {
      const res = await fetch(`/api/sites/${siteid}/sync-ha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: [] }),
      });

      if (!res.ok) throw new Error("Sync failed");

      await new Promise((resolve) => setTimeout(resolve, 1200));
      await fetchRegistry(siteid);

      setSyncStatus("success");
    } catch (err) {
      console.error("Manual sync error:", err);
      setSyncStatus("error");
    }

    setTimeout(() => setSyncStatus("idle"), 2500);
  };

  if (!siteid) {
    return (
      <div className="min-h-screen p-10 text-center text-gray-500">
        Loading…
      </div>
    );
  }

  // ---------------------
  // PAGE UI
  // ---------------------
  const lastSyncText =
    sortedRegistry.length > 0 && sortedRegistry[0].last_updated_at
      ? new Date(sortedRegistry[0].last_updated_at).toLocaleString()
      : "—";

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gateway Entity Registry</h1>
        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          ← Back to Site
        </Button>
      </div>

      {/* SYNC SECTION */}
      <Card className="border border-gray-300 shadow-sm">
        <CardHeader>
          <CardTitle>Home Assistant Sync Endpoint</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-gray-700">
            This is the endpoint Home Assistant will POST detected devices &amp;
            entities into.
          </p>

          <div className="flex flex-col md:flex-row gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button variant="outline" onClick={handleCopyWebhook}>
              Copy
            </Button>
          </div>

          {syncStatus !== "idle" && (
            <div
              className={`mt-3 p-3 text-sm rounded border ${
                syncStatus === "loading"
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : syncStatus === "success"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {syncStatus === "loading" && "Syncing… Home Assistant is pushing entities."}
              {syncStatus === "success" && "Sync complete — registry updated and reloaded."}
              {syncStatus === "error" && "Sync failed — see browser console / logs."}
            </div>
          )}

          <div>
            <p className="text-sm text-gray-600 mb-2">Click to manually trigger a sync.</p>
            <Button
              onClick={handleRunSync}
              disabled={syncStatus === "loading"}
              className={
                syncStatus === "success"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : syncStatus === "error"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : ""
              }
            >
              {syncStatus === "loading"
                ? "Syncing…"
                : syncStatus === "success"
                ? "Sync Complete ✓"
                : syncStatus === "error"
                ? "Sync Failed"
                : "Run Sync Now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* LAST SYNC */}
      <p className="text-xs text-gray-500">
        Last sync: <span className="font-mono">{lastSyncText}</span>
      </p>

      {/* REGISTRY TABLE */}
      <Card className="border border-gray-300 shadow-sm">
        <CardHeader>
          <CardTitle>Z-Wave &amp; HA Entities</CardTitle>
        </CardHeader>

        <CardContent>
          {loadingRegistry ? (
            <p className="text-sm text-gray-500">Loading entities…</p>
          ) : sortedRegistry.length === 0 ? (
            <p className="text-sm text-gray-500">
              No entities received from Home Assistant yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">HA Device Name</th>
                    <th className="px-3 py-2 text-left">Entity ID</th>
                    <th className="px-3 py-2 text-left">Domain</th>
                    <th className="px-3 py-2 text-left">HA Type</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">Area</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedRegistry.map((row) => {
                    const raw = row.gr_raw ?? {};
                    const domain = raw.domain ?? "—";
                    const haType =
                      raw.device_class ??
                      raw.domain ??
                      (raw.unit ? `value (${raw.unit})` : "—");
                    const deviceName =
                      raw.device_name ??
                      row.gr_device_name ??
                      raw.friendly_name ??
                      "—";

                    return (
                      <tr
                        key={row.ha_device_id}
                        className="border-t hover:bg-gray-50"
                      >
                        <td className="px-3 py-2">{deviceName}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {raw.entity_id ?? row.ha_device_id}
                        </td>
                        <td className="px-3 py-2">{domain}</td>
                        <td className="px-3 py-2">{haType}</td>
                        <td className="px-3 py-2">
                          {row.gr_device_model ?? raw.model ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.gr_area ?? raw.area_id ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {row.last_updated_at
                            ? new Date(row.last_updated_at).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
