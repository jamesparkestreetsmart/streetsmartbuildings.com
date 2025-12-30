"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

/* ======================================================
 Types
====================================================== */
type EquipmentStatus = "active" | "inactive" | "dummy" | "retired";

interface SyncEntityRow {
  site_id: string;
  entity_id: string;
  sensor_type: string | null;
  ha_device_id: string | null;

  // NEW — from view_entity_sync
  ha_device_name: string | null;
  ha_device_display_name: string | null;
  business_device_name: string | null;

  device_id: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface DeviceGroup {
  ha_device_id: string;
  ha_device_display_name: string;
  entities: SyncEntityRow[];
}

/* ======================================================
 Helpers
====================================================== */
const isOffline = (lastSeen: string | null) => {
  if (!lastSeen) return true;
  return Date.now() - new Date(lastSeen).getTime() > 24 * 60 * 60 * 1000;
};

const formatRelativeTime = (date: string | null) => {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
};

/* ======================================================
 Component
====================================================== */
export default function GatewayClientPage({ siteid }: { siteid: string }) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* ======================================================
   Group HA devices (FINAL — DB is source of truth)
  ====================================================== */
  const devices = useMemo<DeviceGroup[]>(() => {
    const map = new Map<string, DeviceGroup>();

    rows.forEach((r) => {
      if (!r.ha_device_id || !r.ha_device_display_name) return;

      if (!map.has(r.ha_device_id)) {
        map.set(r.ha_device_id, {
          ha_device_id: r.ha_device_id,
          ha_device_display_name: r.ha_device_display_name,
          entities: [],
        });
      }

      map.get(r.ha_device_id)!.entities.push(r);
    });

    return Array.from(map.values());
  }, [rows]);

  /* ======================================================
   Fetch (15-minute auto refresh)
  ====================================================== */
  const fetchAll = useCallback(async () => {
    const { data } = await supabase
      .from("view_entity_sync")
      .select("*")
      .eq("site_id", siteid);

    setRows((data ?? []) as SyncEntityRow[]);
    setLoading(false);
  }, [siteid]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  /* ======================================================
   UI
  ====================================================== */
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Site
        </Button>
        <h1 className="text-2xl font-semibold">Gateway Devices</h1>
        <div className="w-[120px]" />
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        devices.map((d) => (
          <Card key={d.ha_device_id}>
            <CardHeader>
              <CardTitle className="space-y-1">
                <div className="text-emerald-700 font-semibold">
                  {d.ha_device_display_name}
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  HA ID: {d.ha_device_id}
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th>Entity</th>
                    <th>Type</th>
                    <th>Last Seen</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {d.entities.map((e) => (
                    <tr key={e.entity_id} className="border-t">
                      <td className="font-mono text-xs">{e.entity_id}</td>
                      <td>{e.sensor_type ?? "—"}</td>
                      <td
                        className={
                          isOffline(e.last_seen_at) ? "text-red-600" : ""
                        }
                      >
                        {formatRelativeTime(e.last_seen_at)}
                      </td>
                      <td>
                        {e.last_state
                          ? e.unit_of_measurement
                            ? `${e.last_state} ${e.unit_of_measurement}`
                            : e.last_state
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
