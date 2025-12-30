"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
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
  entity_id: string;
  ha_device_id: string;
  sensor_type: string | null;
  last_state: string | null;
  last_seen_at: string | null;
  unit_of_measurement: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
}

interface Device {
  device_id: string;
  device_name: string;
  equipment_id: string;
}

/* ---------------------------------------------
 Component
--------------------------------------------- */
export default function ProvisionGatewayDevicePage() {
  const router = useRouter();
  const params = useParams();

  const siteid = params.siteid as string;
  const ha_device_id = params.ha_device_id as string;

  const [entities, setEntities] = useState<SyncEntityRow[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  const [equipmentId, setEquipmentId] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("");

  const [loading, setLoading] = useState(true);

  /* ---------------------------------------------
     Fetch HA entities
  --------------------------------------------- */
  const fetchEntities = async () => {
    const { data } = await supabase
      .from("view_entity_sync")
      .select("entity_id, ha_device_id, sensor_type, last_state, last_seen_at, unit_of_measurement")
      .eq("site_id", siteid)
      .eq("ha_device_id", ha_device_id);

    setEntities((data ?? []) as SyncEntityRow[]);
  };

  /* ---------------------------------------------
     Fetch equipment
  --------------------------------------------- */
  const fetchEquipments = async () => {
    const { data } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name")
      .eq("site_id", siteid)
      .eq("status", "active");

    setEquipments((data ?? []) as Equipment[]);
  };

  /* ---------------------------------------------
     Fetch devices for equipment
  --------------------------------------------- */
  const fetchDevices = async (equipment_id: string) => {
    const { data } = await supabase
      .from("a_devices")
      .select("device_id, device_name, equipment_id")
      .eq("equipment_id", equipment_id)
      .eq("status", "active");

    setDevices((data ?? []) as Device[]);
  };

  useEffect(() => {
    Promise.all([fetchEntities(), fetchEquipments()]).finally(() =>
      setLoading(false)
    );
  }, [siteid, ha_device_id]);

  useEffect(() => {
    if (equipmentId) {
      fetchDevices(equipmentId);
    } else {
      setDevices([]);
      setDeviceId("");
    }
  }, [equipmentId]);

  /* ---------------------------------------------
     Confirm provisioning
  --------------------------------------------- */
  const confirmProvision = async () => {
    if (!deviceId) return;

    await supabase
      .from("a_devices")
      .update({
        ha_device_id,
      })
      .eq("device_id", deviceId);

    router.push(`/sites/${siteid}/gateways`);
  };

  /* ---------------------------------------------
     UI
  --------------------------------------------- */
  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Provision HA Device</h1>
        <Button
          variant="outline"
          onClick={() => router.push(`/sites/${siteid}/gateways`)}
        >
          ← Back
        </Button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {/* STEP 1 — EQUIPMENT */}
          <Card>
            <CardHeader>
              <CardTitle>1. Select Equipment</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                className="w-full border rounded px-3 py-2"
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
              >
                <option value="">— Select Equipment —</option>
                {equipments.map((eq) => (
                  <option key={eq.equipment_id} value={eq.equipment_id}>
                    {eq.equipment_name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          {/* STEP 2 — DEVICE */}
          <Card>
            <CardHeader>
              <CardTitle>2. Select or Create Device</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="w-full border rounded px-3 py-2"
                disabled={!equipmentId}
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                <option value="">— Select Device —</option>
                {devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.device_name}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                disabled={!equipmentId}
                onClick={() =>
                  router.push(
                    `/settings/devices/add?site=${siteid}&equipment=${equipmentId}&returnTo=gateways`
                  )
                }
              >
                + Create New Device
              </Button>
            </CardContent>
          </Card>

          {/* STEP 3 — CONFIRM */}
          <Card>
            <CardHeader>
              <CardTitle>3. Link & Generate Sensors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                This will link the Home Assistant device to the selected platform
                device and generate sensors from the library.
              </p>

              <Button
                disabled={!deviceId}
                onClick={confirmProvision}
              >
                Link HA Device
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
