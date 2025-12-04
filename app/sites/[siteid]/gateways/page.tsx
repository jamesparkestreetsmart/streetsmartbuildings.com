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
  ha_device_id: string;
  gr_device_name: string | null;
  gr_device_model: string | null;
  gr_area: string | null;
  gr_raw: any | null;
  last_updated_at: string | null;
}

export default function GatewayPage({ params }: { params: Promise<{ siteid: string }> }) {
  const router = useRouter();

  const [siteid, setSiteId] = useState<string>("");
  const [registry, setRegistry] = useState<GatewayEntityRow[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  const [syncStatus, setSyncStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  // ---------------------
  // RESOLVE PARAMS
  // ---------------------
  useEffect(() => {
    (async () => {
      const resolved = await params;
      setSiteId(resolved.siteid);
    })();
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
      setRegistry(data ?? []);
    }

    setLoadingRegistry(false);
  };

  useEffect(() => {
    if (!siteid) return;
    fetchRegistry(siteid);
  }, [siteid]);

  // ---------------------
  // SORT REGISTRY (SAFE)
  // ---------------------
  const sortedRegistry = useMemo(() => {
    try {
      return [...registry].sort((a, b) => {
        const an = a.gr_device_name?.toLowerCase() ?? "";
        const bn = b.gr_device_name?.toLowerCase() ?? "";
        return an.localeCompare(bn);
      });
    } catch (err) {
      console.error("Sorting error:", err);
      return registry;
    }
  }, [registry]);

  // ---------------------
  // COPY WEBHOOK
  // ---------------------
  const webhookUrl = siteid
    ? `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`
    : "";

  const handleCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setSyncStatus("success");
    setTimeout(() => setSyncStatus("idle"), 1500);
  };

  // ---------------------
  // RUN MANUAL SYNC
  // ---------------------
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
      console.error(err);
      setSyncStatus("error");
    }

    setTimeout(() => setSyncStatus("idle"), 2500);
  };

  if (!siteid) {
    return <div className="p-12 text-center text-gray-500">Loading…</div>;
  }

  // ---------------------
  // PAGE UI
  // ---------------------
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Gateway Entity Registry</h1>
        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          ← Back to Site
        </Button>
      </div>

      {/* SYNC SECTION */}
      <Card className="mb-8 border border-gray-300">
        <CardHeader>
          <CardTitle>Home Assistant Sync Endpoint</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-gray-700">
            This is the endpoint Home Assistant will POST detected devices & entities into.
          </p>

          <div className="flex flex-col md:flex-row gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button variant="outline" onClick={handleCopyWebhook}>
              Copy
            </Button>
          </div>

          {syncStatus !== "idle" && (
            <div className="mt-3 p-3 text-sm rounded border bg-gray-100">
              {syncStatus === "loading" && "Syncing…"}
              {syncStatus === "success" && "Sync complete ✓"}
              {syncStatus === "error" && "Sync failed — check logs."}
            </div>
          )}

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
        </CardContent>
      </Card>

      {/* LAST SYNC */}
      <p className="text-xs text-gray-500 mb-3">
        Last sync:{" "}
        {sortedRegistry.length > 0
          ? new Date(sortedRegistry[0].last_updated_at ?? "").toLocaleString()
          : "—"}
      </p>

      {/* REGISTRY TABLE */}
      <Card className="border border-gray-300">
        <CardHeader>
          <CardTitle>Z-Wave & HA Entities</CardTitle>
        </CardHeader>

        <CardContent>
          {loadingRegistry ? (
            <p className="text-gray-500">Loading…</p>
          ) : sortedRegistry.length === 0 ? (
            <p className="text-gray-500">No entities received yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Entity ID</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">Area</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedRegistry.map((row) => (
                    <tr key={row.ha_device_id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2">{row.gr_device_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.ha_device_id}</td>
                      <td className="px-3 py-2">{row.gr_device_model ?? "—"}</td>
                      <td className="px-3 py-2">{row.gr_area ?? "—"}</td>
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
