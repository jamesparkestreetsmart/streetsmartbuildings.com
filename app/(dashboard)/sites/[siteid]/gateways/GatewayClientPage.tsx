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
  device_id: string | null;
  device_name: string | null;
  manufacturer?: string | null;
  model?: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  status: EquipmentStatus;
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

type LinkMode = "unlinked" | "linked" | "editing";

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

const equipmentSuffix = (status: EquipmentStatus) =>
  status === "retired"
    ? " (Retired)"
    : status === "inactive"
    ? " (Inactive)"
    : status === "dummy"
    ? " (Dummy)"
    : "";

/* ======================================================
 Component
====================================================== */
export default function GatewayClientPage({ siteid }: { siteid: string }) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  const [stateByHa, setStateByHa] = useState<
    Record<
      string,
      {
        mode: LinkMode;
        committed_device_id?: string;
        committed_device_name?: string;
        committed_equipment_id?: string;
        committed_equipment_name?: string;

        staged_equipment_id?: string;
        staged_device_id?: string;

        available_devices?: Device[];
        loading_devices?: boolean;
      }
    >
  >({});

  /* ======================================================
   Group HA devices
  ====================================================== */
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

  /* ======================================================
   Data fetch (with 15 min auto refresh)
  ====================================================== */
  const fetchAll = useCallback(async () => {
    const [{ data: entities }, { data: eqs }] = await Promise.all([
      supabase.from("view_entity_sync").select("*").eq("site_id", siteid),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, status")
        .eq("site_id", siteid),
    ]);

    setRows((entities ?? []) as SyncEntityRow[]);
    setEquipments((eqs ?? []) as Equipment[]);

    const haIds = Array.from(
      new Set((entities ?? []).map((e: any) => e.ha_device_id).filter(Boolean))
    );

    if (!haIds.length) return;

    const { data: linked } = await supabase
      .from("a_devices")
      .select("device_id, device_name, equipment_id, ha_device_id")
      .in("ha_device_id", haIds);

    const next: any = {};
    for (const haId of haIds) {
      const link = linked?.find((l) => l.ha_device_id === haId);
      const eq = eqs?.find((e: any) => e.equipment_id === link?.equipment_id);

      next[haId] = link
        ? {
            mode: "linked",
            committed_device_id: link.device_id,
            committed_device_name: link.device_name,
            committed_equipment_id: link.equipment_id,
            committed_equipment_name: eq?.equipment_name,
          }
        : { mode: "unlinked" };
    }

    setStateByHa(next);
    setLoading(false);
  }, [siteid]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  /* ======================================================
   Device loading + commit
  ====================================================== */
  const loadDevices = async (haId: string, equipmentId: string) => {
    setStateByHa((p) => ({
      ...p,
      [haId]: {
        ...p[haId],
        staged_equipment_id: equipmentId,
        staged_device_id: undefined,
        loading_devices: true,
      },
    }));

    const { data } = await supabase
      .from("a_devices")
      .select("device_id, device_name")
      .eq("equipment_id", equipmentId)
      .eq("status", "active");

    setStateByHa((p) => ({
      ...p,
      [haId]: {
        ...p[haId],
        available_devices: (data ?? []) as Device[],
        loading_devices: false,
      },
    }));
  };

  const commitLink = async (haId: string) => {
    const st = stateByHa[haId];
    if (!st?.staged_device_id) return;

    await supabase
      .from("a_devices")
      .update({ ha_device_id: haId })
      .eq("device_id", st.staged_device_id);

    fetchAll();
  };

  /* ======================================================
   UI
  ====================================================== */
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => router.push(`/sites/${siteid}`)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Site
        </Button>
        <h1 className="text-2xl font-semibold">Gateway Devices</h1>
        <div className="w-[120px]" />
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        devices.map((d) => {
          const st = stateByHa[d.ha_device_id] ?? { mode: "unlinked" };

          return (
            <Card key={d.ha_device_id}>
              <CardHeader>
                <CardTitle>
                  <div className="text-emerald-700 font-semibold">
                    {st.committed_device_id ? (
                      <Link
                        href={`/settings/devices/${st.committed_device_id}`}
                        className="underline"
                      >
                        {st.committed_device_name}
                      </Link>
                    ) : (
                      d.display_name
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    HA ID: {d.ha_device_id}
                  </div>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {st.mode === "linked" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setStateByHa((p) => ({
                        ...p,
                        [d.ha_device_id]: {
                          ...p[d.ha_device_id],
                          mode: "editing",
                          staged_equipment_id:
                            p[d.ha_device_id].committed_equipment_id,
                        },
                      }))
                    }
                  >
                    Reassign Device
                  </Button>
                )}

                {(st.mode === "editing" || st.mode === "unlinked") && (
                  <>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={st.staged_equipment_id ?? ""}
                      onChange={(e) =>
                        loadDevices(d.ha_device_id, e.target.value)
                      }
                    >
                      <option value="">— Select Equipment —</option>
                      {equipments.map((eq) => (
                        <option
                          key={eq.equipment_id}
                          value={eq.equipment_id}
                          disabled={eq.status === "retired"}
                        >
                          {eq.equipment_name}
                          {equipmentSuffix(eq.status)}
                        </option>
                      ))}
                    </select>

                    {st.staged_equipment_id && (
                      <select
                        className="w-full border rounded px-3 py-2"
                        value={st.staged_device_id ?? ""}
                        onChange={(e) =>
                          setStateByHa((p) => ({
                            ...p,
                            [d.ha_device_id]: {
                              ...p[d.ha_device_id],
                              staged_device_id: e.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">
                          {st.loading_devices
                            ? "Loading devices…"
                            : "— Select Device —"}
                        </option>
                        {(st.available_devices ?? []).map((dev) => (
                          <option
                            key={dev.device_id}
                            value={dev.device_id}
                          >
                            {dev.device_name}
                          </option>
                        ))}
                      </select>
                    )}

                    {st.staged_device_id && (
                      <Button onClick={() => commitLink(d.ha_device_id)}>
                        {st.mode === "editing"
                          ? "Update Link"
                          : "Link Device"}
                      </Button>
                    )}
                  </>
                )}

                {/* Entities */}
                <table className="w-full text-sm mt-4">
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
                            isOffline(e.last_seen_at)
                              ? "text-red-600"
                              : ""
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
          );
        })
      )}
    </div>
  );
}
