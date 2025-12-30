"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";

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
  equipment_status: "active" | "inactive" | "dummy" | null;

  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  status: "active" | "inactive" | "dummy";
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
  equipment_status: "active" | "inactive" | "dummy" | null;
  entities: SyncEntityRow[];
}

/* ---------------------------------------------
 Constants
--------------------------------------------- */
const HOURS_24_MS = 24 * 60 * 60 * 1000;
const DUMMY_EQUIPMENT_NAME = "Inventory Closet";

/* ---------------------------------------------
 Helpers
--------------------------------------------- */
const isOffline = (lastSeen: string | null) =>
  !lastSeen ||
  Date.now() - new Date(lastSeen).getTime() > HOURS_24_MS;

const formatRelativeTime = (date: string | null) => {
  if (!date) return "never";
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
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

  /** Modal state */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    ha_device_id: string;
    previous_equipment_id: string | null;
    new_equipment_id: string | null;
  } | null>(null);
  const [note, setNote] = useState("");

  /* ---------------------------------------------
     Fetch registry
  --------------------------------------------- */
  const fetchRegistry = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("view_entity_sync")
      .select("*")
      .eq("site_id", siteid);

    setRows((data ?? []) as SyncEntityRow[]);
    setLoading(false);
  };

  /* ---------------------------------------------
     Fetch equipments
  --------------------------------------------- */
  const fetchEquipments = async () => {
    const { data } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, status")
      .eq("site_id", siteid);

    if (!data) return;

    const sorted = [...data].sort((a, b) => {
      if (a.equipment_name === DUMMY_EQUIPMENT_NAME) return -1;
      if (b.equipment_name === DUMMY_EQUIPMENT_NAME) return 1;
      return a.equipment_name.localeCompare(b.equipment_name);
    });

    setEquipments(sorted as Equipment[]);
  };

  useEffect(() => {
    fetchRegistry();
    fetchEquipments();
  }, [siteid]);

  /* ---------------------------------------------
     Group by HA device
  --------------------------------------------- */
  const devices = useMemo<DeviceGroup[]>(() => {
    const map = new Map<string, DeviceGroup>();

    rows.forEach((r) => {
      if (!r.ha_device_id) return;

      if (!map.has(r.ha_device_id)) {
        map.set(r.ha_device_id, {
          ha_device_id: r.ha_device_id,
          device_name:
            r.device_name ??
            `${r.manufacturer ?? "HA Device"} ${r.model ?? ""}`.trim(),
          manufacturer: r.manufacturer,
          model: r.model,
          equipment_id: r.equipment_id,
          equipment_name: r.equipment_name,
          equipment_status: r.equipment_status,
          entities: [],
        });
      }

      map.get(r.ha_device_id)!.entities.push(r);
    });

    return Array.from(map.values()).sort((a, b) =>
      (a.device_name ?? "").localeCompare(b.device_name ?? "")
    );
  }, [rows]);

  /* ---------------------------------------------
     Handle select change (OPEN MODAL)
  --------------------------------------------- */
  const onSelectChange = (
    device: DeviceGroup,
    newEquipmentId: string
  ) => {
    setPendingChange({
      ha_device_id: device.ha_device_id,
      previous_equipment_id: device.equipment_id,
      new_equipment_id: newEquipmentId || null,
    });
    setNote("");
    setConfirmOpen(true);
  };

  /* ---------------------------------------------
     Confirm mapping/unmapping
  --------------------------------------------- */
  const confirmChange = async () => {
    if (!pendingChange) return;

    await fetch("/api/device-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: siteid,
        ha_device_id: pendingChange.ha_device_id,
        equipment_id: pendingChange.new_equipment_id,
        note: note || null,
      }),
    });

    setConfirmOpen(false);
    setPendingChange(null);
    setNote("");

    await fetchRegistry();
  };

  const cancelChange = () => {
    setConfirmOpen(false);
    setPendingChange(null);
    setNote("");
  };

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

      {loading ? (
        <p>Loading…</p>
      ) : (
        devices.map((device) => (
          <Card key={device.ha_device_id}>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <div className="flex flex-col">
                  <Link
                    href={`/sites/${siteid}/devices/${device.ha_device_id}?returnTo=gateways`}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {device.device_name}
                  </Link>
                  <span className="text-xs text-gray-500 font-mono">
                    HA ID: {device.ha_device_id}
                  </span>
                </div>

                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={device.equipment_id ?? ""}
                  onChange={(e) =>
                    onSelectChange(device, e.target.value)
                  }
                >
                  <option value="">— Unassigned —</option>
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
                      <td
                        className={
                          isOffline(e.last_seen_at) ? "text-red-600" : ""
                        }
                      >
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

      {/* CONFIRM MODAL */}
      {confirmOpen && pendingChange && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">
              Confirm device mapping change
            </h2>

            <textarea
              className="w-full border rounded p-2 text-sm"
              rows={3}
              placeholder="Optional note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelChange}>
                Cancel
              </Button>
              <Button onClick={confirmChange}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
