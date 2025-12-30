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
interface SyncEntityRow {
  site_id: string;
  entity_id: string;
  sensor_type: string | null;
  ha_device_id: string | null;
  device_name: string | null; // from view_entity_sync (not HA API)
  manufacturer?: string | null;
  model?: string | null;
  equipment_id: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

type EquipmentStatus = "active" | "inactive" | "dummy" | "retired";

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  status: EquipmentStatus;
}

interface Device {
  device_id: string;
  device_name: string;
}

interface LinkedDeviceRow {
  ha_device_id: string | null;
  device_id: string;
  device_name: string;
  equipment_id: string | null;
  status?: string | null;
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

const isRetired = (status: EquipmentStatus) => status === "retired";

const statusLabel = (status: EquipmentStatus) => {
  if (status === "retired") return " (Retired)";
  if (status === "dummy") return " (Dummy)";
  if (status === "inactive") return " (Inactive)";
  return "";
};

/* ---------------------------------------------
 Component
--------------------------------------------- */
export default function GatewayClientPage({ siteid }: { siteid: string }) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [devicesByHa, setDevicesByHa] = useState<
    Record<
      string,
      {
        equipment_id?: string;
        devices?: Device[];
        device_id?: string;
        loading?: boolean;

        // derived / display
        linked_device_name?: string;
        linked_equipment_name?: string;
        linked_equipment_status?: EquipmentStatus;
        isLinked?: boolean;
      }
    >
  >({});

  const [loading, setLoading] = useState(true);

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

  const equipmentById = useMemo(() => {
    const m = new Map<string, Equipment>();
    equipments.forEach((e) => m.set(e.equipment_id, e));
    return m;
  }, [equipments]);

  /* ---------------------------------------------
     Load devices for equipment
     - preserves currently selected device_id if still present
  --------------------------------------------- */
  const loadDevices = useCallback(
    async (ha_device_id: string, equipment_id: string) => {
      setDevicesByHa((prev) => ({
        ...prev,
        [ha_device_id]: {
          ...prev[ha_device_id],
          equipment_id,
          loading: true,
          // changing equipment implies device selection should reset
          device_id: prev[ha_device_id]?.equipment_id === equipment_id ? prev[ha_device_id]?.device_id : undefined,
        },
      }));

      // NOTE: for selection we typically want "active" devices only.
      // Already-linked devices are shown via the linked mapping even if inactive.
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
          // if current selected device_id is not in list anymore, clear it
          device_id:
            prev[ha_device_id]?.device_id &&
            (data ?? []).some((d: any) => d.device_id === prev[ha_device_id]?.device_id)
              ? prev[ha_device_id]?.device_id
              : prev[ha_device_id]?.device_id,
        },
      }));
    },
    []
  );

  /* ---------------------------------------------
     Fetch registry + equipment + linked mappings
  --------------------------------------------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: entities }, { data: eqs }] = await Promise.all([
        supabase.from("view_entity_sync").select("*").eq("site_id", siteid),
        supabase
          .from("a_equipments")
          .select("equipment_id, equipment_name, status")
          .eq("site_id", siteid),
      ]);

      const entityRows = (entities ?? []) as SyncEntityRow[];
      const equipmentRows = (eqs ?? []) as Equipment[];

      setRows(entityRows);
      setEquipments(equipmentRows);

      // Build HA device list from the fetched entity rows
      const haIds = Array.from(
        new Set(entityRows.map((r) => r.ha_device_id).filter(Boolean))
      ) as string[];

      // Hydrate already-linked HA devices (a_devices.ha_device_id)
      // This is what lets the UI show "already linked" + preselect dropdowns.
      let linked: LinkedDeviceRow[] = [];
      if (haIds.length > 0) {
        const { data: linkedRows } = await supabase
          .from("a_devices")
          .select("ha_device_id, device_id, device_name, equipment_id, status")
          .in("ha_device_id", haIds);

        linked = (linkedRows ?? []) as LinkedDeviceRow[];
      }

      // Map linked state into devicesByHa
      const nextState: Record<string, any> = {};
      for (const haId of haIds) {
        const link = linked.find((r) => r.ha_device_id === haId);

        if (link?.equipment_id) {
          const eq = equipmentRows.find((e) => e.equipment_id === link.equipment_id);
          nextState[haId] = {
            equipment_id: link.equipment_id,
            device_id: link.device_id,
            isLinked: true,
            linked_device_name: link.device_name,
            linked_equipment_name: eq?.equipment_name ?? undefined,
            linked_equipment_status: (eq?.status as EquipmentStatus) ?? undefined,
          };
        } else if (link) {
          // linked but missing equipment_id (shouldn't happen, but safe)
          nextState[haId] = {
            device_id: link.device_id,
            isLinked: true,
            linked_device_name: link.device_name,
          };
        } else {
          nextState[haId] = {
            isLinked: false,
          };
        }
      }

      setDevicesByHa((prev) => ({
        ...prev,
        ...nextState,
      }));

      // For linked devices that have equipment_id, preload the device dropdown list
      // so user can see the selected device immediately.
      await Promise.all(
        haIds
          .map((haId) => {
            const st = nextState[haId];
            if (st?.equipment_id) return { haId, equipment_id: st.equipment_id as string };
            return null;
          })
          .filter(Boolean)
          .map(({ haId, equipment_id }: any) => loadDevices(haId, equipment_id))
      );

      setLoading(false);
    };

    load();
  }, [siteid, loadDevices]);

  /* ---------------------------------------------
     Confirm linking (update chosen platform device)
  --------------------------------------------- */
  const confirmLink = async (ha_device_id: string) => {
    const state = devicesByHa[ha_device_id];
    if (!state?.device_id) return;

    await supabase
      .from("a_devices")
      .update({ ha_device_id })
      .eq("device_id", state.device_id);

    // refresh linked display state locally
    const eq = state.equipment_id ? equipmentById.get(state.equipment_id) : undefined;

    setDevicesByHa((prev) => ({
      ...prev,
      [ha_device_id]: {
        ...prev[ha_device_id],
        isLinked: true,
        linked_device_name:
          (prev[ha_device_id]?.devices ?? []).find((d) => d.device_id === state.device_id)
            ?.device_name ?? prev[ha_device_id]?.linked_device_name,
        linked_equipment_name: eq?.equipment_name ?? prev[ha_device_id]?.linked_equipment_name,
        linked_equipment_status: eq?.status ?? prev[ha_device_id]?.linked_equipment_status,
      },
    }));

    alert("HA device linked successfully");
  };

  /* ---------------------------------------------
     UI
  --------------------------------------------- */
  return (
    <div className="p-6 space-y-6">
      {/* HEADER w/ BACK */}
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

        {/* spacer to keep title centered-ish without overthinking layout */}
        <div className="w-[88px]" />
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        devices.map((d) => {
          const state = devicesByHa[d.ha_device_id] || {};
          const selectedEq =
            state.equipment_id && equipmentById.get(state.equipment_id)
              ? equipmentById.get(state.equipment_id)
              : undefined;

          const showLinkedBanner = Boolean(state.isLinked && state.device_id);

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

                  {showLinkedBanner && (
                    <div className="text-sm text-gray-700 mt-2">
                      <span className="font-medium">Currently linked:</span>{" "}
                      {state.linked_device_name ?? "Unknown Device"}
                      {state.linked_equipment_name ? (
                        <>
                          {" "}
                          <span className="text-gray-500">→</span>{" "}
                          <span className="font-medium">
                            {state.linked_equipment_name}
                            {state.linked_equipment_status
                              ? statusLabel(state.linked_equipment_status)
                              : ""}
                          </span>
                        </>
                      ) : null}
                    </div>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* EQUIPMENT */}
                <select
                  className="w-full border rounded px-3 py-2"
                  value={state.equipment_id ?? ""}
                  onChange={(e) => loadDevices(d.ha_device_id, e.target.value)}
                >
                  <option value="">— Select Equipment —</option>

                  {equipments.map((eq) => {
                    const disabled = isRetired(eq.status);
                    return (
                      <option
                        key={eq.equipment_id}
                        value={eq.equipment_id}
                        disabled={disabled}
                      >
                        {eq.equipment_name}
                        {statusLabel(eq.status)}
                      </option>
                    );
                  })}
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
                    <option value="">
                      {state.loading ? "Loading devices…" : "— Select Device —"}
                    </option>

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
                    {showLinkedBanner ? "Update Link" : "Confirm Link"}
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
