"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ---------------------------------------------
 Types — matches view_entity_sync
--------------------------------------------- */
interface SyncEntityRow {
  org_id: string;
  site_id: string;

  equipment_id: string | null;
  equipment_name: string | null;

  entity_id: string;
  sensor_type: string | null;

  ha_device_id: string | null;
  device_name: string | null;

  last_seen_at: string | null;
  first_seen_at: string | null;

  unit_of_measurement: string | null;
  last_state: string | null;
}

interface Props {
  siteid: string;
}

/* ---------------------------------------------
 Time helpers
--------------------------------------------- */
const HOURS_24_MS = 24 * 60 * 60 * 1000;

function isOffline(lastSeen: string | null) {
  if (!lastSeen) return true;
  return Date.now() - new Date(lastSeen).getTime() > HOURS_24_MS;
}

function formatRelativeTime(date: string | null) {
  if (!date) return "never";

  const deltaMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(deltaMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

/* ---------------------------------------------
 Component
--------------------------------------------- */
export default function GatewayClientPage({ siteid }: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  /* ---------------------------------------------
     Fetch from view_entity_sync
  --------------------------------------------- */
  const fetchRegistry = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("view_entity_sync")
      .select("*")
      .eq("site_id", siteid)
      .not("sensor_type", "is", null);

    if (error) {
      console.error("Registry fetch error:", error);
      setRows([]);
    } else {
      setRows((data ?? []) as SyncEntityRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchRegistry();
  }, [siteid]);

  /* ---------------------------------------------
     Stable sort by entity name
  --------------------------------------------- */
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) =>
      a.entity_id.localeCompare(b.entity_id)
    );
  }, [rows]);

  /* ---------------------------------------------
     Sync logic
  --------------------------------------------- */
  const webhookUrl = `/api/ha/entity-sync`;

  const handleRunSync = async () => {
    setSyncStatus("loading");

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteid }),
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
    sorted[0]?.last_seen_at
      ? new Date(sorted[0].last_seen_at).toLocaleString()
      : "—";

  const formatValue = (row: SyncEntityRow) => {
    if (!row.last_state || row.last_state === "unknown") return "—";
    if (row.unit_of_measurement) {
      return `${row.last_state} ${row.unit_of_measurement}`;
    }
    return row.last_state;
  };

  /* ---------------------------------------------
     UI
  --------------------------------------------- */
  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gateway Entity Registry</h1>
        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          ← Back to Site
        </Button>
      </div>

      {/* SYNC CARD */}
      <Card>
        <CardHeader>
          <CardTitle>Home Assistant Sync Endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-2">
            Home Assistant POSTs entity data to this endpoint.
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
          <CardTitle>Entities (Mapped & Meaningful)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-gray-500">
              No mapped entities found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Entity</th>
                    <th className="px-3 py-2 text-left">Device</th>
                    <th className="px-3 py-2 text-left">Sensor Type</th>
                    <th className="px-3 py-2 text-left">Equipment</th>
                    <th className="px-3 py-2 text-left">Last Seen</th>
                    <th className="px-3 py-2 text-left">Value</th>
                  </tr>
                </thead>

                <tbody>
                  {sorted.map((row) => {
                    const offline = isOffline(row.last_seen_at);

                    return (
                      <tr key={row.entity_id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.entity_id}
                        </td>

                        <td className="px-3 py-2">
                          {row.device_name ?? (
                            <span className="italic text-gray-400">
                              Unassigned
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-2 capitalize">
                          {row.sensor_type?.replace(/_/g, " ") ?? "—"}
                        </td>

                        {/* Equipment dropdown placeholder */}
                        <td className="px-3 py-2">
                          {row.equipment_name ?? "—"}
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                offline ? "bg-red-500" : "bg-green-500"
                              }`}
                            />
                            <span
                              className={offline ? "text-red-600" : ""}
                            >
                              {formatRelativeTime(row.last_seen_at)}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          {formatValue(row)}
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
