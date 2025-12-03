// app/sites/[siteid]/gateways/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface GatewayEntityRow {
  id: string;
  site_id: string;
  entity_id: string;
  friendly_name: string | null;
  domain: string | null;
  device_class: string | null;
  state: string | null;
  value: string | null;
  unit: string | null;
  updated_at: string | null;
}

export default function GatewayPage({
  params,
}: {
  params: Promise<{ siteid: string }>;
}) {
  const router = useRouter();

  const [siteid, setSiteId] = useState<string>("");
  const [registry, setRegistry] = useState<GatewayEntityRow[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  /** Resolve params **/
  useEffect(() => {
    (async () => {
      const resolved = await params;
      setSiteId(resolved.siteid);
    })();
  }, [params]);

  /** Fetch registry entries **/
  const fetchRegistry = async (sid: string) => {
    setLoadingRegistry(true);

    const { data, error } = await supabase
      .from("a_devices_gateway_entities")
      .select("*")
      .eq("site_id", sid)
      .order("friendly_name", { ascending: true });

    if (error) {
      console.error("Error loading entity registry:", error);
      setRegistry([]);
    } else {
      setRegistry(data as GatewayEntityRow[]);
    }

    setLoadingRegistry(false);
  };

  useEffect(() => {
    if (!siteid) return;
    fetchRegistry(siteid);
  }, [siteid]);

  /** Copy webhook URL **/
  const handleCopyWebhook = async () => {
    const url = `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`;
    await navigator.clipboard.writeText(url);
    setSyncStatus("success");
    setTimeout(() => setSyncStatus("idle"), 1500);
  };

  /** Manual sync **/
  const handleRunSync = async () => {
    setSyncStatus("loading");

    try {
      // Basic empty POST to notify HA
      const res = await fetch(`/api/sites/${siteid}/sync-ha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: [] }),
      });

      if (!res.ok) throw new Error("Sync failed");

      // Give HA a moment (optional small delay)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Reload registry
      await fetchRegistry(siteid);

      setSyncStatus("success");
    } catch (err) {
      console.error("Manual sync error:", err);
      setSyncStatus("error");
    }

    setTimeout(() => setSyncStatus("idle"), 2000);
  };

  if (!siteid) {
    return (
      <div className="min-h-screen p-10 text-center text-gray-500">
        Loading…
      </div>
    );
  }

  const webhookUrl = `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* PAGE TITLE */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Gateway Entity Registry</h1>

        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          ← Back to Site
        </Button>
      </div>

      {/* WEBHOOK + SYNC SECTION */}
      <Card className="mb-8 border border-gray-300 shadow-sm">
        <CardHeader>
          <CardTitle>Home Assistant Sync Endpoint</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Webhook URL */}
          <div>
            <p className="text-sm text-gray-600 mb-1">
              This is the endpoint Home Assistant should POST entities to.
            </p>

            <div className="flex flex-col md:flex-row gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={handleCopyWebhook}>
                Copy
              </Button>
            </div>
          </div>

          {/* Manual Sync */}
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Click to manually trigger a sync.
            </p>

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

      {/* ENTITY REGISTRY TABLE */}
      <Card className="border border-gray-300 shadow-sm">
        <CardHeader>
          <CardTitle>Z-Wave & HA Entities</CardTitle>
        </CardHeader>

        <CardContent>
          {loadingRegistry ? (
            <p className="text-sm text-gray-500">Loading entities…</p>
          ) : registry.length === 0 ? (
            <p className="text-sm text-gray-500">
              No entities received from Home Assistant yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Entity ID</th>
                    <th className="px-3 py-2 text-left">Domain</th>
                    <th className="px-3 py-2 text-left">Class</th>
                    <th className="px-3 py-2 text-left">State</th>
                    <th className="px-3 py-2 text-left">Value</th>
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                  </tr>
                </thead>

                <tbody>
                  {registry.map((row) => (
                    <tr key={row.entity_id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2">{row.friendly_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.entity_id}
                      </td>
                      <td className="px-3 py-2">{row.domain ?? "—"}</td>
                      <td className="px-3 py-2">{row.device_class ?? "—"}</td>
                      <td className="px-3 py-2">{row.state ?? "—"}</td>
                      <td className="px-3 py-2">{row.value ?? "—"}</td>
                      <td className="px-3 py-2">{row.unit ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {row.updated_at
                          ? new Date(row.updated_at).toLocaleString()
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
