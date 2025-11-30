// app/sites/[siteid]/gateways/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface GatewayRegistryRow {
  gr_id: string;
  ha_device_id: string;
  source_gateway: string;
  gr_device_name: string | null;
  gr_device_manufacturer: string | null;
  gr_device_model: string | null;
  gr_area: string | null;
  gr_device_sw_version: string | null;
  gr_device_hw_version: string | null;
  last_updated_at: string | null;
}

export default function GatewayPage({
  params,
}: {
  params: Promise<{ siteid: string }>;
}) {
  const router = useRouter();
  const [siteid, setSiteId] = useState<string>("");

  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [registry, setRegistry] = useState<GatewayRegistryRow[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  /** Resolve params like our other pages */
  useEffect(() => {
    (async () => {
      const resolved = await params;
      setSiteId(resolved.siteid);
    })();
  }, [params]);

  /** Fetch registry rows */
  useEffect(() => {
    if (!siteid) return;

    const fetchRegistry = async () => {
      setLoadingRegistry(true);

      const { data, error } = await supabase
        .from("a_devices_gateway_registry")
        .select("*")
        .eq("site_id", siteid)
        .order("gr_device_name", { ascending: true });

      if (error) {
        console.error("Error loading HA registry:", error);
        setRegistry([]);
      } else {
        setRegistry(data as GatewayRegistryRow[]);
      }

      setLoadingRegistry(false);
    };

    fetchRegistry();
  }, [siteid]);

  /** COPY WEBHOOK */
  const handleCopyWebhook = async () => {
    const url = `https://streetsmartbuildings.com/api/sites/${siteid}/sync-ha`;
    await navigator.clipboard.writeText(url);

    setSyncStatus("success");
    setTimeout(() => setSyncStatus("idle"), 1500);
  };

  /** RUN SYNC NOW */
  const handleRunSync = async () => {
    setSyncStatus("loading");

    try {
      const res = await fetch(`/api/sites/${siteid}/sync-ha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devices: [], entities: [] }), // empty structure signals HA format
      });

      if (!res.ok) throw new Error("Sync failed");

      setSyncStatus("success");

      // Refresh registry after sync
      const { data } = await supabase
        .from("a_devices_gateway_registry")
        .select("*")
        .eq("site_id", siteid)
        .order("gr_device_name", { ascending: true });

      setRegistry((data as GatewayRegistryRow[]) ?? []);
    } catch (err) {
      console.error(err);
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
        <h1 className="text-3xl font-bold">Gateway & Device Sync</h1>

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
              This is the URL your Home Assistant should POST updates to.
            </p>

            <div className="flex flex-col md:flex-row gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button variant="outline" onClick={handleCopyWebhook}>
                Copy
              </Button>
            </div>
          </div>

          {/* Run Sync */}
          <div>
            <p className="text-sm text-gray-600 mb-2">
              Click to manually trigger a sync. (HA normally calls this itself.)
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

      {/* REGISTRY TABLE */}
      <Card className="border border-gray-300 shadow-sm">
        <CardHeader>
          <CardTitle>Gateway Device Registry</CardTitle>
        </CardHeader>

        <CardContent>
          {loadingRegistry ? (
            <p className="text-sm text-gray-500">Loading devices…</p>
          ) : registry.length === 0 ? (
            <p className="text-sm text-gray-500">
              No devices received from Home Assistant yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">HA Device ID</th>
                    <th className="px-3 py-2 text-left">Manufacturer</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">Area</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-left">Last Updated</th>
                  </tr>
                </thead>

                <tbody>
                  {registry.map((row) => (
                    <tr key={row.gr_id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2">{row.gr_device_name || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.ha_device_id}</td>
                      <td className="px-3 py-2">{row.gr_device_manufacturer || "—"}</td>
                      <td className="px-3 py-2">{row.gr_device_model || "—"}</td>
                      <td className="px-3 py-2">{row.gr_area || "—"}</td>
                      <td className="px-3 py-2">{row.source_gateway}</td>
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
