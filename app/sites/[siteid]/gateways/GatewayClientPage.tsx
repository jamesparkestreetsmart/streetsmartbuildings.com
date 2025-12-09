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

  entity_id: string;
  domain?: string | null;
  sensor_type: string | null;

  ha_device_id: string | null;
  device_name: string | null;
  manufacturer?: string | null;
  model?: string | null;

  equipment_id: string | null;
  equipment_name: string | null;

  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
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

/* ✅ UPDATED: ISO timestamps now render as local time */
function formatValue(row: SyncEntityRow) {
  if (!row.last_state || row.last_state === "unknown") return "—";

  // Detect ISO timestamps (sun sensors, backups, etc.)
  const parsed = Date.parse(row.last_state);
  if (!isNaN(parsed) && row.last_state.includes("T")) {
    return new Date(parsed).toLocaleString(); // ✅ local time
  }

  if (row.unit_of_measurement) {
    return `${row.last_state} ${row.unit_of_measurement}`;
  }

  return row.last_state;
}

/* ---------------------------------------------
 Component
--------------------------------------------- */
export default function GatewayClientPage({ siteid }: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  /* ---------------------------------------------
     Fetch entity registry
  --------------------------------------------- */
  const fetchRegistry = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("view_entity_sync")
      .select("*")
      .eq("site_id", siteid);

    if (error) {
      console.error("Registry fetch error:", error);
      setRows([]);
    } else {
      setRows((data ?? []) as SyncEntityRow[]);
    }

    setLoading(false);
  };

  /* ---------------------------------------------
     Fetch equipment list
  --------------------------------------------- */
  const fetchEquipments = async () => {
    const { data, error } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name")
      .eq("site_id", siteid)
      .order("equipment_name");

    if (error) {
      console.error("Equipment fetch error:", error);
      setEquipments([]);
    } else {
      setEquipments((data ?? []) as Equipment[]);
    }
  };

  useEffect(() => {
    fetchRegistry();
    fetchEquipments();
  }, [siteid]);

  /* ---------------------------------------------
     Group entities by device
  --------------------------------------------- */
  const devices = useMemo(() => {
    const map = new Map<
      string,
      {
        ha_device_id: string;
        device_name: string | null;
        manufacturer?: string | null;
        model?: string | null;
        equipment_id: string | null;
        equipment_name: string | null;
        entities: SyncEntityRow[];
      }
    >();

    rows.forEach((r) => {
      if (!r.ha_device_id) return;

      if (!map.has(r.ha_device_id)) {
        map.set(r.ha_device_id, {
          ha_device_id: r.ha_device_id,
          device_name: r.device_name,
          manufacturer: r.manufacturer,
          model: r.model,
          equipment_id: r.equipment_id,
          equipment_name: r.equipment_name,
          entities: [],
        });
      }

      map.get(r.ha_device_id)!.entities.push(r);
    });

    return Array.from(map.values());
  }, [rows]);

  /* ---------------------------------------------
     Device → equipment update
  --------------------------------------------- */
  async function updateDeviceEquipment(
    ha_device_id: string,
    equipment_id: string | null
  ) {
    await fetch("/api/device-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: siteid,
        ha_device_id,
        equipment_id,
      }),
    });

    await fetchRegistry();
  }

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
    rows[0]?.last_seen_at
      ? new Date(rows[0].last_seen_at).toLocaleString()
      : "—";

  /* ---------------------------------------------
     UI
  --------------------------------------------- */
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
          <CardTitle>Home Assistant Sync Endpoint</CardTitle>
        </CardHeader>
        <CardContent>
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

      {/* DEVICES */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-gray-500">No entities found.</p>
      ) : (
        <div className="space-y-6">
          {devices.map((device) => (
            <Card key={device.ha_device_id}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold">
                      {device.device_name ?? "Unnamed Device"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {device.manufacturer} {device.model}
                    </div>
                  </div>

                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={device.equipment_id ?? ""}
                    onChange={(e) =>
                      updateDeviceEquipment(
                        device.ha_device_id,
                        e.target.value || null
                      )
                    }
                  >
                    <option value="">Unassigned</option>
                    {equipments.map((eq) => (
                      <option key={eq.equipment_id} value={eq.equipment_id}>
                        {eq.equipment_name}
                      </option>
                    ))}
                  </select>
                </CardTitle>
              </CardHeader>

              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-1">Entity</th>
                      <th className="py-1">Type</th>
                      <th className="py-1">Last Seen</th>
                      <th className="py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {device.entities.map((e) => {
                      const offline = isOffline(e.last_seen_at);
                      return (
                        <tr key={e.entity_id} className="border-t">
                          <td className="py-1 font-mono text-xs">{e.entity_id}</td>
                          <td className="py-1 capitalize">
                            {e.sensor_type?.replace(/_/g, " ") ?? "—"}
                          </td>
                          <td className={`py-1 ${offline ? "text-red-600" : ""}`}>
                            {formatRelativeTime(e.last_seen_at)}
                          </td>
                          <td className="py-1">{formatValue(e)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
