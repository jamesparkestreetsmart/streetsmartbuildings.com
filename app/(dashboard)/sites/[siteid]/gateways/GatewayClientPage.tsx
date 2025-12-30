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

/* ---------------------------------------------
 Types
--------------------------------------------- */
interface SyncEntityRow {
  site_id: string;
  entity_id: string;
  sensor_type: string | null;
  ha_device_id: string | null;
  device_name: string | null;
  manufacturer?: string | null;
  model?: string | null;
  equipment_id: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
}

interface Device {
  device_id: string;
  device_name: string;
}

interface DeviceGroup {
  ha_device_id: string;
  display_name: string;
  entities: SyncEntityRow[];
}

/* ---------------------------------------------
 Helpers
--------------------------------------------- */
const formatValue = (row: SyncEntityRow) => {
  if (!row.last_state || row.last_state === "unknown") return "—";
  return row.unit_of_measurement
    ? `${row.last_state} ${row.unit_of_measurement}`
    : row.last_state;
};

/* ---------------------------------------------
 Component
--------------------------------------------- */
export default function GatewayClientPage({ siteid }: { siteid: string }) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [devicesByHa, setDevicesByHa] = useState<Record<
    string,
    {
      equipment_id?: string;
      devices?: Device[];
      device_id?: string;
      loading?: boolean;
    }
  >>({});

  const [loading, setLoading] = useState(true);

  /* ---------------------------------------------
     Fetch registry + equipment
  --------------------------------------------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: entities }, { data: eqs }] = await Promise.all([
        supabase
          .from("view_entity_sync")
          .select("*")
          .eq("site_id", siteid),
        supabase
          .from("a_equipments")
          .select("equipment_id, equipment_name")
          .eq("site_id", siteid)
          .eq("status", "active"),
      ]);

      setRows((entities ?? []) as SyncEntityRow[]);
      setEquipments((eqs ?? []) as Equipment[]);
      setLoading(false);
    };

    load();
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
          display_name:
            r.device_name ??
            `${r.manufacturer ?? "HA Device"} ${r.model ?? ""}`.trim(),
          entities: [],
        });
      }

      map.get(r.ha_device_id)!.entities.push(r);
    });

    return Array.from(map.values());
  }, [rows]);

  /* ---------------------------------------------
     Load devices for equipment
  --------------------------------------------- */
  const loadDevices = async (ha_device_id: string, equipment_id: string) => {
    setDevicesByHa((prev) => ({
      ...prev,
      [ha_device_id]: {
        equipment_id,
        loading: true,
      },
    }));

    const { data } = await supabase
      .from("a_devices")
      .select("device_id, device_name")
      .eq("equipment_id", equipment_id)
      .eq("status", "active");

    setDevicesByHa((prev) => ({
      ...prev,
      [ha_device_id]: {
        ...prev[ha_device_id],
        devices: (data ?? []) as Device[],
        loading: false,
      },
    }));
  };

  /* ---------------------------------------------
     Confirm linking
  --------------------------------------------- */
  const confirmLink = async (ha_device_id: string) => {
    const state = devicesByHa[ha_device_id];
    if (!state?.device_id) return;

    await supabase
      .from("a_devices")
      .update({ ha_device_id })
      .eq("device_id", state.device_id);

    alert("HA device linked successfully");
  };

  /* ---------------------------------------------
     UI
  --------------------------------------------- */
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Gateway Devices</h1>

      {loading ? (
        <p>Loading…</p>
      ) : (
        devices.map((d) => {
          const state = devicesByHa[d.ha_device_id] || {};

          return (
            <Card key={d.ha_device_id}>
              <CardHeader>
                <CardTitle className="space-y-1">
                  <div className="font-semibold text-emerald-700">
                    {d.display_name}
                  </div>
                  <div className="text-xs font-mono text-gray-500">
                    HA ID: {d.ha_device_id}
                  </div>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* EQUIPMENT */}
                <select
                  className="w-full border rounded px-3 py-2"
                  value={state.equipment_id ?? ""}
                  onChange={(e) =>
                    loadDevices(d.ha_device_id, e.target.value)
                  }
                >
                  <option value="">— Select Equipment —</option>
                  {equipments.map((eq) => (
                    <option key={eq.equipment_id} value={eq.equipment_id}>
                      {eq.equipment_name}
                    </option>
                  ))}
                </select>

                {/* DEVICE */}
                {state.equipment_id && (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={state.device_id ?? ""}
                    onChange={(e) =>
                      setDevicesByHa((prev) => ({
                        ...prev,
                        [d.ha_device_id]: {
                          ...prev[d.ha_device_id],
                          device_id: e.target.value,
                        },
                      }))
                    }
                  >
                    <option value="">— Select Device —</option>
                    {(state.devices ?? []).map((dev) => (
                      <option key={dev.device_id} value={dev.device_id}>
                        {dev.device_name}
                      </option>
                    ))}
                  </select>
                )}

                {/* CONFIRM */}
                {state.device_id && (
                  <Button onClick={() => confirmLink(d.ha_device_id)}>
                    Confirm Link
                  </Button>
                )}

                {/* ENTITIES */}
                <table className="w-full text-sm mt-4">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th>Entity</th>
                      <th>Type</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.entities.map((e) => (
                      <tr key={e.entity_id} className="border-t">
                        <td className="font-mono text-xs">{e.entity_id}</td>
                        <td>{e.sensor_type ?? "—"}</td>
                        <td>{formatValue(e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
