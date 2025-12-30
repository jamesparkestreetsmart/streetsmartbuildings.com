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
  const [loading, setLoading] = useState(true);

  /* ======================================================
   Group devices (DB is source of truth)
  ====================================================== */

  const devices = useMemo<DeviceGroup[]>(() => {
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
   Fetch (15-minute auto refresh)
  ====================================================== */

  const fetchAll = useCallback(async () => {
    const [{ data: entities }, { data: eqs }] = await Promise.all([
      supabase.from("view_entity_sync").select("*").eq("site_id", siteid),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name")
        .eq("site_id", siteid),
    ]);

    setRows((entities ?? []) as SyncEntityRow[]);
    setEquipments((eqs ?? []) as Equipment[]);
    setLoading(false);
  }, [siteid]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  /* ======================================================
   Map / Unmap handler
  ====================================================== */

  const handleMapChange = async (
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
        note: equipment_id
          ? "Device mapped via gateway UI"
          : "Device unmapped via gateway UI",
      }),
    });

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
        devices.map((d) => (
          <Card
            key={d.ha_device_id}
            className="bg-white border border-gray-200"
          >
            <CardHeader>
              <CardTitle className="space-y-2">
                <div className="text-emerald-700 font-semibold">
                  {d.ha_device_display_name}
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  HA ID: {d.ha_device_id}
                </div>

                {/* Mapping Control */}
                <Select
                  value={d.equipment_id ?? "unmapped"}
                  onValueChange={(val) =>
                    handleMapChange(
                      d.ha_device_id,
                      val === "unmapped" ? null : val
                    )
                  }
                >
                  <SelectTrigger className="w-[320px] mt-2">
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="unmapped">
                      — Unmap Device —
                    </SelectItem>

                    {equipments.map((eq) => {
                      const isUsed = rows.some(
                        (r) =>
                          r.equipment_id === eq.equipment_id &&
                          r.ha_device_id !== d.ha_device_id
                      );

                      return (
                        <SelectItem
                          key={eq.equipment_id}
                          value={eq.equipment_id}
                          className={
                            isUsed
                              ? "text-yellow-700"
                              : "text-emerald-700"
                          }
                        >
                          {eq.equipment_name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {d.equipment_name && (
                  <div className="text-xs text-gray-500">
                    Mapped to: {d.equipment_name}
                  </div>
                )}
              </CardTitle>
            </CardHeader>

            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-emerald-700 text-white">
                    <th className="px-3 py-2 text-left">Entity</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Last Seen</th>
                    <th className="px-3 py-2 text-left">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {d.entities.map((e, idx) => (
                    <tr
                      key={e.entity_id}
                      className={
                        idx % 2 === 0
                          ? "bg-gray-50 hover:bg-gray-100"
                          : "bg-white hover:bg-gray-100"
                      }
                    >
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
