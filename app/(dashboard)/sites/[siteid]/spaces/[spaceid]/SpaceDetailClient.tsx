"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowUpRight, Thermometer, Droplets, Pencil, X, Check } from "lucide-react";

/* ======================================================
 Types
====================================================== */

interface Space {
  space_id: string;
  site_id: string;
  name: string;
  space_type: string;
  created_at: string;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  equipment_type_id: string | null;
  equipment_group: string | null;
  status: string | null;
}

interface ServingHvac {
  equipment_id: string;
  equipment_name: string;
  equipment_type_id: string | null;
}

interface SpaceDevice {
  device_id: string;
  ha_device_id: string;
  weight: number;
  label: string | null;
  ha_device_name?: string;
  entities?: EntityReading[];
}

interface EntityReading {
  entity_id: string;
  device_class: string | null;
  domain: string;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

/* ======================================================
 Component
====================================================== */

export default function SpaceDetailClient({
  siteid,
  spaceid,
}: {
  siteid: string;
  spaceid: string;
}) {
  const router = useRouter();

  const [space, setSpace] = useState<Space | null>(null);
  const [equipmentInSpace, setEquipmentInSpace] = useState<Equipment[]>([]);
  const [servingHvac, setServingHvac] = useState<ServingHvac[]>([]);
  const [spaceDevices, setSpaceDevices] = useState<SpaceDevice[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing state for device weight/label
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState<number>(3);
  const [editLabel, setEditLabel] = useState<string>("");

  /* ======================================================
   Fetch data
  ====================================================== */

  const fetchAll = useCallback(async () => {
    // Fetch space details
    const { data: spaceData } = await supabase
      .from("a_spaces")
      .select("*")
      .eq("space_id", spaceid)
      .single();

    setSpace(spaceData as Space);

    // Fetch equipment located in this space
    const { data: eqInSpace } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, equipment_type_id, equipment_group, status")
      .eq("space_id", spaceid);

    setEquipmentInSpace((eqInSpace ?? []) as Equipment[]);

    // Fetch HVAC equipment serving this space
    const { data: servingData } = await supabase
      .from("a_equipment_served_spaces")
      .select(`
        equipment_id,
        a_equipments (
          equipment_name,
          equipment_type_id
        )
      `)
      .eq("space_id", spaceid);

    const hvacServing: ServingHvac[] = (servingData ?? []).map((s: any) => ({
      equipment_id: s.equipment_id,
      equipment_name: s.a_equipments?.equipment_name || "Unknown",
      equipment_type_id: s.a_equipments?.equipment_type_id || null,
    }));
    setServingHvac(hvacServing);

    // Fetch devices assigned to this space from unified a_devices table
    const { data: spaceDevices } = await supabase
      .from("a_devices")
      .select("device_id, ha_device_id, device_name, weight, label")
      .eq("space_id", spaceid);

    if (spaceDevices && spaceDevices.length > 0) {
      const haDeviceIds = spaceDevices.map((d: any) => d.ha_device_id).filter(Boolean);

      // Get entity data for these devices
      const { data: entities } = await supabase
        .from("b_entity_sync")
        .select("entity_id, ha_device_id, ha_device_name, device_class, domain, last_state, unit_of_measurement, last_seen_at")
        .eq("site_id", siteid)
        .in("ha_device_id", haDeviceIds);

      // Group entities by device
      const devicesWithEntities: SpaceDevice[] = spaceDevices.map((sd: any) => {
        const deviceEntities = (entities ?? []).filter(
          (e: any) => e.ha_device_id === sd.ha_device_id
        );
        const deviceName = sd.device_name || deviceEntities[0]?.ha_device_name || "Unknown Device";

        return {
          device_id: sd.device_id,
          ha_device_id: sd.ha_device_id,
          weight: sd.weight,
          label: sd.label,
          ha_device_name: deviceName,
          entities: deviceEntities.map((e: any) => ({
            entity_id: e.entity_id,
            device_class: e.device_class,
            domain: e.domain,
            last_state: e.last_state,
            unit_of_measurement: e.unit_of_measurement,
            last_seen_at: e.last_seen_at,
          })),
        };
      });

      setSpaceDevices(devicesWithEntities);
    } else {
      setSpaceDevices([]);
    }

    setLoading(false);
  }, [siteid, spaceid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ======================================================
   Calculate weighted averages
  ====================================================== */

  const weightedTemperature = useMemo(() => {
    let sumWeightedTemp = 0;
    let sumWeights = 0;

    spaceDevices.forEach((device) => {
      const tempEntity = device.entities?.find(
        (e) => e.domain === "sensor" && e.device_class === "temperature"
      );
      if (tempEntity && tempEntity.last_state) {
        const temp = parseFloat(tempEntity.last_state);
        if (!isNaN(temp)) {
          sumWeightedTemp += temp * device.weight;
          sumWeights += device.weight;
        }
      }
    });

    return sumWeights > 0 ? (sumWeightedTemp / sumWeights).toFixed(1) : null;
  }, [spaceDevices]);

  const weightedHumidity = useMemo(() => {
    let sumWeightedHum = 0;
    let sumWeights = 0;

    spaceDevices.forEach((device) => {
      const humEntity = device.entities?.find(
        (e) => e.domain === "sensor" && e.device_class === "humidity"
      );
      if (humEntity && humEntity.last_state) {
        const hum = parseFloat(humEntity.last_state);
        if (!isNaN(hum)) {
          sumWeightedHum += hum * device.weight;
          sumWeights += device.weight;
        }
      }
    });

    return sumWeights > 0 ? (sumWeightedHum / sumWeights).toFixed(1) : null;
  }, [spaceDevices]);

  /* ======================================================
   Update device weight/label
  ====================================================== */

  const startEditing = (device: SpaceDevice) => {
    setEditingDevice(device.device_id);
    setEditWeight(device.weight);
    setEditLabel(device.label || "");
  };

  const cancelEditing = () => {
    setEditingDevice(null);
    setEditWeight(3);
    setEditLabel("");
  };

  const saveDeviceEdit = async (device_id: string) => {
    const { error } = await supabase
      .from("a_devices")
      .update({
        weight: editWeight,
        label: editLabel.trim() || null,
      })
      .eq("device_id", device_id);

    if (error) {
      alert(`Failed to update: ${error.message}`);
      return;
    }

    cancelEditing();
    fetchAll();
  };

  /* ======================================================
   UI
  ====================================================== */

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!space) {
    return <div className="p-6 text-red-600">Space not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="text-white p-6 shadow" style={{ background: 'linear-gradient(to right, #12723A, #80B52C, #ECD018)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{space.name}</h1>
            <p className="text-sm opacity-90">{space.space_type}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/sites/${siteid}?tab=space-hvac`}
              className="inline-flex items-center rounded-full bg-white/20 px-4 py-2 text-sm font-medium hover:bg-white/30 backdrop-blur-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Weighted Averages Summary */}
        <section className="grid md:grid-cols-2 gap-4">
          <Card className="bg-white border-l-4" style={{ borderLeftColor: '#12723A' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full" style={{ backgroundColor: '#12723A20' }}>
                <Thermometer className="w-8 h-8" style={{ color: '#12723A' }} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Weighted Temperature</p>
                <p className="text-3xl font-bold" style={{ color: '#12723A' }}>
                  {weightedTemperature ? `${weightedTemperature}°F` : "—"}
                </p>
                <p className="text-xs text-gray-400">
                  {spaceDevices.filter((d) =>
                    d.entities?.some(
                      (e) => e.domain === "sensor" && e.device_class === "temperature"
                    )
                  ).length}{" "}
                  sensor(s)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-l-4" style={{ borderLeftColor: '#80B52C' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full" style={{ backgroundColor: '#80B52C20' }}>
                <Droplets className="w-8 h-8" style={{ color: '#80B52C' }} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Weighted Humidity</p>
                <p className="text-3xl font-bold" style={{ color: '#80B52C' }}>
                  {weightedHumidity ? `${weightedHumidity}%` : "—"}
                </p>
                <p className="text-xs text-gray-400">
                  {spaceDevices.filter((d) =>
                    d.entities?.some(
                      (e) => e.domain === "sensor" && e.device_class === "humidity"
                    )
                  ).length}{" "}
                  sensor(s)
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* HVAC Serving This Space */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">HVAC Equipment Serving This Space</CardTitle>
          </CardHeader>
          <CardContent>
            {servingHvac.length === 0 ? (
              <p className="text-sm text-gray-500">No HVAC equipment assigned to serve this space.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {servingHvac.map((hvac) => (
                  <Link
                    key={hvac.equipment_id}
                    href={`/sites/${siteid}/equipment/${hvac.equipment_id}/individual-equipment`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: '#12723A20', color: '#12723A' }}
                  >
                    {hvac.equipment_name}
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Equipment Located In This Space */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Equipment Located In This Space</CardTitle>
          </CardHeader>
          <CardContent>
            {equipmentInSpace.length === 0 ? (
              <p className="text-sm text-gray-500">No equipment installed in this space.</p>
            ) : (
              <div className="space-y-2">
                {equipmentInSpace.map((eq) => (
                  <Link
                    key={eq.equipment_id}
                    href={`/sites/${siteid}/equipment/${eq.equipment_id}/individual-equipment`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                  >
                    <div>
                      <p className="font-medium">{eq.equipment_name}</p>
                      <p className="text-xs text-gray-500">
                        {eq.equipment_group} • {eq.equipment_type_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          eq.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {eq.status}
                      </span>
                      <ArrowUpRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sensor Devices Assigned to This Space */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Sensor Devices</CardTitle>
            <Link
              href={`/sites/${siteid}/gateways`}
              className="text-sm hover:underline"
              style={{ color: '#12723A' }}
            >
              Assign devices →
            </Link>
          </CardHeader>
          <CardContent>
            {spaceDevices.length === 0 ? (
              <p className="text-sm text-gray-500">
                No sensor devices assigned.{" "}
                <Link
                  href={`/sites/${siteid}/gateways`}
                  className="hover:underline"
                  style={{ color: '#12723A' }}
                >
                  Go to Gateway Devices
                </Link>{" "}
                to assign sensors to this space.
              </p>
            ) : (
              <div className="space-y-4">
                {spaceDevices.map((device) => {
                  const tempEntity = device.entities?.find(
                    (e) => e.domain === "sensor" && e.device_class === "temperature"
                  );
                  const humEntity = device.entities?.find(
                    (e) => e.domain === "sensor" && e.device_class === "humidity"
                  );
                  const isEditing = editingDevice === device.device_id;

                  return (
                    <div
                      key={device.device_id}
                      className="border rounded-lg p-4 bg-gray-50"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium">{device.ha_device_name}</p>
                          <p className="text-xs text-gray-500 font-mono">
                            {device.ha_device_id}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isEditing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(device)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="bg-white p-3 rounded border space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs">Weight (1-5)</Label>
                              <Select
                                value={editWeight.toString()}
                                onValueChange={(v) => setEditWeight(parseInt(v))}
                              >
                                <SelectTrigger className="bg-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white">
                                  <SelectItem value="1">1 - Low influence</SelectItem>
                                  <SelectItem value="2">2</SelectItem>
                                  <SelectItem value="3">3 - Normal</SelectItem>
                                  <SelectItem value="4">4</SelectItem>
                                  <SelectItem value="5">5 - High influence</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Label (optional)</Label>
                              <Input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                placeholder="e.g., NW Corner"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveDeviceEdit(device.device_id)}
                              style={{ backgroundColor: '#12723A' }}
                              className="hover:opacity-90"
                            >
                              <Check className="w-4 h-4 mr-1" /> Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEditing}
                            >
                              <X className="w-4 h-4 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-4 mb-3">
                            <span 
                              className="text-xs px-2 py-1 rounded font-medium"
                              style={{ backgroundColor: '#ECD01830', color: '#A69400' }}
                            >
                              Weight: {device.weight}
                            </span>
                            {device.label && (
                              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                                {device.label}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            {tempEntity && (
                              <div 
                                className="flex items-center gap-2 p-2 rounded"
                                style={{ backgroundColor: '#12723A10' }}
                              >
                                <Thermometer className="w-5 h-5" style={{ color: '#12723A' }} />
                                <div>
                                  <p className="text-xs text-gray-500">Temperature</p>
                                  <p className="font-semibold" style={{ color: '#12723A' }}>
                                    {tempEntity.last_state ?? "—"}
                                    {tempEntity.unit_of_measurement}
                                  </p>
                                </div>
                              </div>
                            )}
                            {humEntity && (
                              <div 
                                className="flex items-center gap-2 p-2 rounded"
                                style={{ backgroundColor: '#80B52C10' }}
                              >
                                <Droplets className="w-5 h-5" style={{ color: '#80B52C' }} />
                                <div>
                                  <p className="text-xs text-gray-500">Humidity</p>
                                  <p className="font-semibold" style={{ color: '#80B52C' }}>
                                    {humEntity.last_state ?? "—"}
                                    {humEntity.unit_of_measurement}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
