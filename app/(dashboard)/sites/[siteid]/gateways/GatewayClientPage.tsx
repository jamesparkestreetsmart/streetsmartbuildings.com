"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

/* ======================================================
 Types
====================================================== */

interface SyncEntityRow {
  site_id: string;
  entity_id: string;
  sensor_type: string | null;
  ha_device_id: string | null;

  ha_device_display_name: string | null;
  business_device_name: string | null;

  device_id: string | null;
  equipment_id: string | null;
  equipment_name: string | null;

  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  status?: string | null;
}

interface BusinessDevice {
  device_id: string;
  device_name: string;
  equipment_id: string | null;
  ha_device_id: string | null;
  status?: string | null;
}

interface DeviceGroup {
  ha_device_id: string;
  ha_device_display_name: string;
  equipment_id: string | null;
  equipment_name: string | null;
  entities: SyncEntityRow[];
}

/* ======================================================
 Helpers
====================================================== */

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
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [devices, setDevices] = useState<BusinessDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingHaDevice, setEditingHaDevice] = useState<string | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  /* ======================================================
   Group HA devices
  ====================================================== */

  const haDevices = useMemo<DeviceGroup[]>(() => {
    const map = new Map<string, DeviceGroup>();

    rows.forEach((r) => {
      if (!r.ha_device_id || !r.ha_device_display_name) return;

      if (!map.has(r.ha_device_id)) {
        map.set(r.ha_device_id, {
          ha_device_id: r.ha_device_id,
          ha_device_display_name: r.ha_device_display_name,
          equipment_id: r.equipment_id ?? null,
          equipment_name: r.equipment_name ?? null,
          entities: [],
        });
      }

      map.get(r.ha_device_id)!.entities.push(r);
    });

    return Array.from(map.values());
  }, [rows]);

  /* ======================================================
   Fetch (15-min auto refresh)
  ====================================================== */

  const fetchAll = useCallback(async () => {
    const [{ data: entities }, { data: eqs }, { data: devs }] =
      await Promise.all([
        supabase.from("view_entity_sync").select("*").eq("site_id", siteid),
        supabase
          .from("a_equipments")
          .select("equipment_id, equipment_name, status")
          .eq("site_id", siteid),
        supabase
          .from("a_devices")
          .select("device_id, device_name, equipment_id, ha_device_id, status")
          .eq("site_id", siteid),
      ]);

    setRows((entities ?? []) as SyncEntityRow[]);
    setEquipments((eqs ?? []) as Equipment[]);
    setDevices((devs ?? []) as BusinessDevice[]);
    setLoading(false);
  }, [siteid]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  /* ======================================================
   Submit mapping
  ====================================================== */

  const submitMapping = async (ha_device_id: string) => {
    if (selectedDeviceId === "__UNMAP__") {
      await fetch("/api/device-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteid,
          ha_device_id,
          unmap: true,
          note: "HA device unmapped via gateway UI",
        }),
      });
    } else if (selectedDeviceId) {
      await fetch("/api/device-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteid,
          ha_device_id,
          device_id: selectedDeviceId,
          note: "HA device mapped via gateway UI",
        }),
      });
    }

    setEditingHaDevice(null);
    setSelectedEquipmentId(null);
    setSelectedDeviceId(null);
    fetchAll();
  };

  /* ======================================================
   UI
  ====================================================== */

  return (
    <div className="p-6 space-y-6">
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
        haDevices.map((d) => (
          <Card key={d.ha_device_id} className="bg-white border">
            <CardHeader>
              <CardTitle className="space-y-2">
                <div className="text-emerald-700 font-semibold">
                  {d.ha_device_display_name}
                </div>
                <div className="text-xs font-mono text-gray-500">
                  HA ID: {d.ha_device_id}
                </div>

                {editingHaDevice === d.ha_device_id ? (
                  <div className="space-y-2 mt-2">
                    {/* Equipment dropdown */}
                    <Select
                      value={selectedEquipmentId ?? ""}
                      onValueChange={(v) => {
                        setSelectedEquipmentId(v);
                        setSelectedDeviceId(null);
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 text-white">
                        <SelectValue placeholder="Select equipment" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 text-white">
                        {equipments.map((eq) => (
                          <SelectItem
                            key={eq.equipment_id}
                            value={eq.equipment_id}
                          >
                            {eq.equipment_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Device dropdown */}
                    {selectedEquipmentId && (
                      <Select
                        value={selectedDeviceId ?? ""}
                        onValueChange={setSelectedDeviceId}
                      >
                        <SelectTrigger className="bg-slate-900 text-white">
                          <SelectValue placeholder="Select business device" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 text-white">
                          <SelectItem value="__UNMAP__" className="text-red-400">
                            — Unmap HA Device —
                          </SelectItem>

                          {devices
                            .filter(
                              (bd) =>
                                bd.equipment_id === selectedEquipmentId
                            )
                            .map((bd) => (
                              <SelectItem
                                key={bd.device_id}
                                value={bd.device_id}
                                className={
                                  bd.ha_device_id
                                    ? "text-yellow-400"
                                    : "text-emerald-400"
                                }
                              >
                                {bd.device_name}
                                {bd.ha_device_id ? " (mapped)" : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}

                    <div className="flex gap-2">
                      <Button
                        onClick={() => submitMapping(d.ha_device_id)}
                        disabled={!selectedDeviceId}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingHaDevice(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingHaDevice(d.ha_device_id)}
                  >
                    Reassign Device
                  </Button>
                )}
              </CardTitle>
            </CardHeader>

            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm bg-slate-900 text-white rounded">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left">Entity</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Last Seen</th>
                    <th className="px-3 py-2 text-left">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {d.entities.map((e) => (
                    <tr key={e.entity_id} className="border-t border-slate-700">
                      <td className="px-3 py-2 font-mono text-xs">
                        {e.entity_id}
                      </td>
                      <td className="px-3 py-2">
                        {e.sensor_type ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {formatRelativeTime(e.last_seen_at)}
                      </td>
                      <td className="px-3 py-2">
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
