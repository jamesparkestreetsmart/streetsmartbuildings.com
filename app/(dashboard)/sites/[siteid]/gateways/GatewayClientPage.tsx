"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

/* ---------------------------------------------
 Types
--------------------------------------------- */
type EquipmentStatus = "active" | "inactive" | "dummy" | "retired";

interface SyncEntityRow {
  site_id: string;
  entity_id: string;
  sensor_type: string | null;
  ha_device_id: string | null;
  device_name: string | null;
  manufacturer?: string | null;
  model?: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
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

/* ---------------------------------------------
 Helpers
--------------------------------------------- */
const formatValue = (row: SyncEntityRow) => {
  if (!row.last_state || row.last_state === "unknown") return "—";
  return row.unit_of_measurement
    ? `${row.last_state} ${row.unit_of_measurement}`
    : row.last_state;
};

const statusSuffix = (status: EquipmentStatus) => {
  if (status === "retired") return " (Retired)";
  if (status === "inactive") return " (Inactive)";
  if (status === "dummy") return " (Dummy)";
  return "";
};

/* ---------------------------------------------
 Component
--------------------------------------------- */
export default function GatewayClientPage({ siteid }: { siteid: string }) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Per-HA device UI state
   * committed_* = saved in DB
   * staged_*    = user selections (not saved)
   */
  const [stateByHa, setStateByHa] = useState<
    Record<
      string,
      {
        mode: LinkMode;

        committed_equipment_id?: string;
        committed_equipment_name?: string;
        committed_device_id?: string;
        committed_device_name?: string;

        staged_equipment_id?: string;
        staged_device_id?: string;

        available_devices?: Device[];
        loading_devices?: boolean;
      }
    >
  >({});

  /* ---------------------------------------------
     Group entities by HA device
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
     Initial load
  --------------------------------------------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: entityRows }, { data: equipmentRows }] =
        await Promise.all([
          supabase.from("view_entity_sync").select("*").eq("site_id", siteid),
          supabase
            .from("a_equipments")
            .select("equipment_id, equipment_name, status")
            .eq("site_id", siteid),
        ]);

      setRows((entityRows ?? []) as SyncEntityRow[]);
      setEquipments((equipmentRows ?? []) as Equipment[]);

      // hydrate already-linked devices
      const haIds = Array.from(
        new Set(
          (entityRows ?? [])
            .map((r: any) => r.ha_device_id)
            .filter(Boolean)
        )
      );

      let linked: any[] = [];
      if (haIds.length) {
        const { data } = await supabase
          .from("a_devices")
          .select("device_id, device_name, equipment_id, ha_device_id")
          .in("ha_device_id", haIds);
        linked = data ?? [];
      }

      const nextState: any = {};
      for (const haId of haIds) {
        const link = linked.find((l) => l.ha_device_id === haId);
        const eq = equipmentRows?.find(
          (e: any) => e.equipment_id === link?.equipment_id
        );

        if (link) {
          nextState[haId] = {
            mode: "linked",
            committed_device_id: link.device_id,
            committed_device_name: link.device_name,
            committed_equipment_id: link.equipment_id,
            committed_equipment_name: eq?.equipment_name,
          };
        } else {
          nextState[haId] = {
            mode: "unlinked",
          };
        }
      }

      setStateByHa(nextState);
      setLoading(false);
    };

    load();
  }, [siteid]);

  /* ---------------------------------------------
     Load devices for selected equipment (staged)
  --------------------------------------------- */
  const loadDevices = useCallback(
    async (haId: string, equipmentId: string) => {
      setStateByHa((prev) => ({
        ...prev,
        [haId]: {
          ...prev[haId],
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

      setStateByHa((prev) => ({
        ...prev,
        [haId]: {
          ...prev[haId],
          available_devices: (data ?? []) as Device[],
          loading_devices: false,
        },
      }));
    },
    []
  );

  /* ---------------------------------------------
     Commit link / reassignment
  --------------------------------------------- */
  const commitLink = async (haId: string) => {
    const st = stateByHa[haId];
    if (!st?.staged_device_id) return;

    await supabase
      .from("a_devices")
      .update({ ha_device_id: haId })
      .eq("device_id", st.staged_device_id);

    setStateByHa((prev) => ({
      ...prev,
      [haId]: {
        mode: "linked",
        committed_device_id: st.staged_device_id,
        committed_device_name:
          st.available_devices?.find(
            (d) => d.device_id === st.staged_device_id
          )?.device_name,
        committed_equipment_id: st.staged_equipment_id,
        committed_equipment_name: equipments.find(
          (e) => e.equipment_id === st.staged_equipment_id
        )?.equipment_name,
      },
    }));
  };

  /* ---------------------------------------------
     UI
  --------------------------------------------- */
  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold">Gateway Devices</h1>
        <div className="w-[88px]" />
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        devices.map((d) => {
          const st = stateByHa[d.ha_device_id] || { mode: "unlinked" };

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

                  {st.mode === "linked" && (
                    <div className="text-sm text-gray-700 mt-2">
                      Linked to{" "}
                      <span className="font-medium">
                        {st.committed_device_name}
                      </span>{" "}
                      →{" "}
                      <span className="font-medium">
                        {st.committed_equipment_name}
                      </span>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* ACTION BUTTON */}
                {st.mode === "linked" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setStateByHa((prev) => ({
                        ...prev,
                        [d.ha_device_id]: {
                          ...prev[d.ha_device_id],
                          mode: "editing",
                          staged_equipment_id:
                            prev[d.ha_device_id].committed_equipment_id,
                        },
                      }))
                    }
                  >
                    Reassign Device
                  </Button>
                )}

                {/* EQUIPMENT */}
                {(st.mode === "unlinked" || st.mode === "editing") && (
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
                        {statusSuffix(eq.status)}
                      </option>
                    ))}
                  </select>
                )}

                {/* DEVICE */}
                {st.staged_equipment_id && (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={st.staged_device_id ?? ""}
                    onChange={(e) =>
                      setStateByHa((prev) => ({
                        ...prev,
                        [d.ha_device_id]: {
                          ...prev[d.ha_device_id],
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
                      <option key={dev.device_id} value={dev.device_id}>
                        {dev.device_name}
                      </option>
                    ))}
                  </select>
                )}

                {/* COMMIT */}
                {st.staged_device_id && (
                  <div className="flex gap-2">
                    <Button onClick={() => commitLink(d.ha_device_id)}>
                      {st.mode === "editing" ? "Update Link" : "Link Device"}
                    </Button>

                    {st.mode === "editing" && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setStateByHa((prev) => ({
                            ...prev,
                            [d.ha_device_id]: {
                              ...prev[d.ha_device_id],
                              mode: "linked",
                              staged_device_id: undefined,
                              staged_equipment_id: undefined,
                            },
                          }))
                        }
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
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
