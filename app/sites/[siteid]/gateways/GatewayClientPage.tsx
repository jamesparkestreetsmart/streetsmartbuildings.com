"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* ---------------------------------------------
 Types
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

interface DeviceGroup {
  ha_device_id: string;
  device_name: string | null;
  manufacturer?: string | null;
  model?: string | null;
  equipment_id: string | null;
  equipment_name: string | null;
  entities: SyncEntityRow[];
}

/* ---------------------------------------------
 Constants
--------------------------------------------- */
const HOURS_24_MS = 24 * 60 * 60 * 1000;
const DUMMY_EQUIPMENT_NAME = "Inventory Closet";

/* ---------------------------------------------
 Time helpers
--------------------------------------------- */
const isOffline = (lastSeen: string | null) => {
  if (!lastSeen) return true;
  return Date.now() - new Date(lastSeen).getTime() > HOURS_24_MS;
};

const formatRelativeTime = (date: string | null) => {
  if (!date) return "never";

  const deltaMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(deltaMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

const formatValue = (row: SyncEntityRow) => {
  if (!row.last_state || row.last_state === "unknown") return "—";
  return row.unit_of_measurement
    ? `${row.last_state} ${row.unit_of_measurement}`
    : row.last_state;
};

/* ---------------------------------------------
 Component
--------------------------------------------- */
export default function GatewayClientPage({ siteid }: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------------------------------------------
     Fetch registry
  --------------------------------------------- */
  const fetchRegistry = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("view_entity_sync")
      .select("*")
      .eq("site_id", siteid);

    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data ?? []) as SyncEntityRow[]);
    }

    setLoading(false);
  };

  /* ---------------------------------------------
     Fetch equipment list (✅ dummy first)
  --------------------------------------------- */
  const fetchEquipments = async () => {
    const { data, error } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name")
      .eq("site_id", siteid);

    if (error || !data) return;

    const sorted = [...data].sort((a, b) => {
      if (a.equipment_name === DUMMY_EQUIPMENT_NAME) return -1;
      if (b.equipment_name === DUMMY_EQUIPMENT_NAME) return 1;
      return a.equipment_name.localeCompare(b.equipment_name);
    });

    setEquipments(sorted);
  };

  useEffect(() => {
    fetchRegistry();
    fetchEquipments();
  }, [siteid]);

  /* ---------------------------------------------
     Group by HA device (stable, deterministic)
  --------------------------------------------- */
  const devices = useMemo<DeviceGroup[]>(() => {
    const map = new Map<string, DeviceGroup>();

    rows.forEach((r) => {
      if (!r.ha_device_id) return;

      if (!map.has(r.ha_device_id)) {
        map.set(r.ha_device_id, {
          ha_device_id: r.ha_device_id,
          device_name: r.device_name ?? "Unnamed Device",
          manufacturer: r.manufacturer,
          model: r.model,
          equipment_id: r.equipment_id,
          equipment_name: r.equipment_name,
          entities: [],
        });
      }

      map.get(r.ha_device_id)!.entities.push(r);
    });

    const grouped = Array.from(map.values()).sort((a, b) => {
      const aName = a.device_name?.toLowerCase() ?? "";
      const bName = b.device_name?.toLowerCase() ?? "";

      if (aName && bName && aName !== bName) {
        return aName.localeCompare(bName);
      }

      return a.ha_device_id.localeCompare(b.ha_device_id);
    });

    // Stable entity ordering inside each device
    grouped.forEach((d) =>
      d.entities.sort((a, b) => a.entity_id.localeCompare(b.entity_id))
    );

    return grouped;
  }, [rows]);

  /* ---------------------------------------------
     Persist device → equipment mapping
  --------------------------------------------- */
  const updateDeviceEquipment = async (
    ha_device_id: string,
    equipment_id: string | null
  ) => {
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
  };

  const webhookUrl = "/api/ha/entity-sync";

  /* ---------------------------------------------
     UI
  --------------------------------------------- */
  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gateway Entity Registry</h1>
        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          ← Back to Site
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Home Assistant Sync Endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <Input readOnly value={webhookUrl} className="font-mono text-xs mb-2" />
          <Button onClick={() => navigator.clipboard.writeText(webhookUrl)}>
            Copy Endpoint
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <p>Loading…</p>
      ) : (
        devices.map((device) => (
          <Card key={device.ha_device_id}>
            <CardHeader>
              <CardTitle className="flex justify-between">
                <div>
                  <div>{device.device_name}</div>
                  <div className="text-xs text-gray-500">
                    {device.manufacturer} {device.model}
                  </div>
                </div>

                <select
                  className="border rounded px-2 py-1"
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
                  <tr className="border-b text-gray-500">
                    <th>Entity</th>
                    <th>Type</th>
                    <th>Last Seen</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {device.entities.map((e) => (
                    <tr key={e.entity_id} className="border-t">
                      <td className="font-mono text-xs">{e.entity_id}</td>
                      <td>{e.sensor_type ?? "—"}</td>
                      <td className={isOffline(e.last_seen_at) ? "text-red-600" : ""}>
                        {formatRelativeTime(e.last_seen_at)}
                      </td>
                      <td>{formatValue(e)}</td>
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
