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
import { ArrowLeft, ArrowUpRight } from "lucide-react";

/* ======================================================
 Types
====================================================== */

interface SyncEntityRow {
  site_id: string;
  entity_id: string;
  domain: string | null;
  device_class: string | null;
  ha_device_id: string | null;
  ha_device_display_name: string | null;
  business_device_name: string | null;
  device_id: string | null;
  equipment_id: string | null;
  equipment_name: string | null;
  sensor_role: string | null;
  mapped_entity_id: string | null;
  space_id: string | null;
  space_name: string | null;
  space_weight: number | null;
  space_label: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  equipment_type_id: string | null;
  status?: string | null;
  org_id?: string | null;
}

interface SensorRequirement {
  equipment_type_id: string;
  sensor_role: string;
  sensor_type: string;
  domain: string | null;
  device_class: string | null;
  unit: string | null;
  required: boolean;
  description: string | null;
}

interface Space {
  space_id: string;
  name: string;
  space_type: string;
}

interface DeviceRecord {
  device_id: string;
  ha_device_id: string;
  device_name: string;
  equipment_id: string | null;
  sensor_role: string | null;
  entity_id: string | null;
  space_id: string | null;
  weight: number | null;
  label: string | null;
}

interface DeviceGroup {
  ha_device_id: string;
  ha_device_display_name: string;
  device_record: DeviceRecord | null;
  entities: SyncEntityRow[];
}

/* ======================================================
 Helpers
====================================================== */

const lastSeenClass = (date: string | null) => {
  if (!date) return "text-red-400";
  const ageMs = Date.now() - new Date(date).getTime();
  const hours = ageMs / 36e5;
  if (hours >= 24) return "text-red-400";
  if (hours >= 6) return "text-amber-300";
  return "text-emerald-300";
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

const formatValue = (value: string | null, unit: string | null) => {
  if (!value) return "—";
  const isIso =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      value
    );
  if (isIso) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }
  return unit ? `${value} ${unit}` : value;
};

/* ======================================================
 Component
====================================================== */

export default function GatewayClientPage({ siteid }: { siteid: string }) {
  const router = useRouter();

  const [rows, setRows] = useState<SyncEntityRow[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [sensorRequirements, setSensorRequirements] = useState<SensorRequirement[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingHaDevice, setEditingHaDevice] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  /* ======================================================
   Navigation helpers
  ====================================================== */

  const goToEquipment = (equipmentId: string) => {
    router.push(
      `/sites/${siteid}/equipment/${equipmentId}/individual-equipment?returnTo=gateways`
    );
  };

  const goToSpace = (spaceId: string) => {
    router.push(`/sites/${siteid}/spaces/${spaceId}`);
  };

  /* ======================================================
   Group HA devices
  ====================================================== */

  const haDevices = useMemo<DeviceGroup[]>(() => {
    const map = new Map<string, DeviceGroup>();

    rows.forEach((r) => {
      if (!r.ha_device_id || !r.ha_device_display_name) return;

      if (!map.has(r.ha_device_id)) {
        // Find the device record from a_devices
        const deviceRecord = devices.find(d => d.ha_device_id === r.ha_device_id);

        map.set(r.ha_device_id, {
          ha_device_id: r.ha_device_id,
          ha_device_display_name: r.ha_device_display_name,
          device_record: deviceRecord || null,
          entities: [],
        });
      }

      const device = map.get(r.ha_device_id)!;

      // Only add entity if it's not already in the list (deduplicate by entity_id)
      if (!device.entities.some((e) => e.entity_id === r.entity_id)) {
        device.entities.push(r);
      }
    });

    return Array.from(map.values());
  }, [rows, devices]);

  /* ======================================================
   Group sensor requirements by equipment type
  ====================================================== */

  const requirementsByType = useMemo(() => {
    const map = new Map<string, SensorRequirement[]>();
    
    sensorRequirements.forEach((req) => {
      if (!map.has(req.equipment_type_id)) {
        map.set(req.equipment_type_id, []);
      }
      map.get(req.equipment_type_id)!.push(req);
    });

    // Sort each list: required first, then alphabetically
    map.forEach((list) => {
      list.sort((a, b) => {
        if (a.required !== b.required) return a.required ? -1 : 1;
        return a.sensor_role.localeCompare(b.sensor_role);
      });
    });

    return map;
  }, [sensorRequirements]);

  /* ======================================================
   Get assigned roles for each equipment
  ====================================================== */

  const assignedRolesByEquipment = useMemo(() => {
    const map = new Map<string, Map<string, string>>(); // equipment_id -> (sensor_role -> ha_device_id)
    
    devices.forEach((d) => {
      if (d.equipment_id && d.sensor_role && d.ha_device_id) {
        if (!map.has(d.equipment_id)) {
          map.set(d.equipment_id, new Map());
        }
        map.get(d.equipment_id)!.set(d.sensor_role, d.ha_device_id);
      }
    });

    return map;
  }, [devices]);

  const sortedEquipments = useMemo(
    () =>
      [...equipments].sort((a, b) =>
        a.equipment_name.localeCompare(b.equipment_name)
      ),
    [equipments]
  );

  const sortedSpaces = useMemo(
    () =>
      [...spaces]
        .filter((s) => s.name !== "Unassigned")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [spaces]
  );

  /* ======================================================
   Fetch (15-min auto refresh)
  ====================================================== */

  const fetchAll = useCallback(async () => {
    const [
      { data: entities },
      { data: eqs },
      { data: devs },
      { data: reqs },
      { data: spcs },
    ] = await Promise.all([
      supabase.from("view_entity_sync").select("*").eq("site_id", siteid),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, equipment_type_id, status, org_id")
        .eq("site_id", siteid),
      supabase
        .from("a_devices")
        .select("device_id, ha_device_id, device_name, equipment_id, sensor_role, entity_id, space_id, weight, label")
        .eq("site_id", siteid),
      supabase
        .from("library_equipment_sensor_requirements")
        .select("equipment_type_id, sensor_role, sensor_type, domain, device_class, unit, required, description"),
      supabase
        .from("a_spaces")
        .select("space_id, name, space_type")
        .eq("site_id", siteid),
    ]);

    setRows((entities ?? []) as SyncEntityRow[]);
    setEquipments((eqs ?? []) as Equipment[]);
    setDevices((devs ?? []) as DeviceRecord[]);
    setSensorRequirements((reqs ?? []) as SensorRequirement[]);
    setSpaces((spcs ?? []) as Space[]);

    if (eqs && eqs.length > 0) {
      setOrgId(eqs[0].org_id ?? null);
    }

    setLoading(false);
  }, [siteid]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  /* ======================================================
   Submit mapping - unified a_devices table
  ====================================================== */

  const submitMapping = async (
    ha_device_id: string,
    ha_device_name: string,
    currentDeviceRecord: DeviceRecord | null
  ) => {
    if (!selectedValue || !orgId) return;

    // Handle unmap - clear the ha_device_id, don't delete the record
    if (selectedValue === "__UNMAP__") {
      if (currentDeviceRecord) {
        const { error } = await supabase
          .from("a_devices")
          .update({
            ha_device_id: null,
            equipment_id: null,
            sensor_role: null,
            entity_id: null,
            space_id: null,
            weight: null,
            label: null,
          })
          .eq("device_id", currentDeviceRecord.device_id);

        if (error) {
          alert(`Failed to unmap: ${error.message}`);
          return;
        }
      }

      setEditingHaDevice(null);
      setSelectedValue(null);
      fetchAll();
      return;
    }

    // Check if mapping to space
    if (selectedValue.startsWith("SPACE::")) {
      const spaceId = selectedValue.replace("SPACE::", "");

      if (currentDeviceRecord) {
        // Update existing record - switch to space mapping
        const { error } = await supabase
          .from("a_devices")
          .update({
            space_id: spaceId,
            weight: 3,
            label: null,
            equipment_id: null,
            sensor_role: null,
            entity_id: null,
          })
          .eq("device_id", currentDeviceRecord.device_id);

        if (error) {
          alert(`Failed to update mapping: ${error.message}`);
          return;
        }
      } else {
        // Create new record for space mapping
        const { error } = await supabase
          .from("a_devices")
          .insert({
            site_id: siteid,
            org_id: orgId,
            ha_device_id: ha_device_id,
            device_name: ha_device_name,
            space_id: spaceId,
            weight: 3,
            label: null,
            equipment_id: null,
            sensor_role: null,
            entity_id: null,
            status: 'active',
          });

        if (error) {
          alert(`Failed to create mapping: ${error.message}`);
          return;
        }
      }
    } else {
      // Mapping to equipment with sensor role
      // Format: EQUIP::{equipment_id}::{sensor_role}
      const parts = selectedValue.split("::");
      const equipmentId = parts[1];
      const sensorRole = parts[2];

      // Find the equipment and its type
      const equipment = equipments.find(e => e.equipment_id === equipmentId);
      const deviceName = currentDeviceRecord?.device_name || `${equipment?.equipment_name || 'Device'} - ${sensorRole}`;

      // Find the sensor requirement to get domain + device_class for auto-matching
      const requirement = sensorRequirements.find(
        r => r.equipment_type_id === equipment?.equipment_type_id && r.sensor_role === sensorRole
      );

      // Auto-match entity based on domain + device_class
      let matchedEntityId: string | null = null;
      if (requirement?.domain) {
        // Find the device's entities from rows
        const deviceEntities = rows.filter(r => r.ha_device_id === ha_device_id);
        
        // Find matching entity by domain and device_class
        const matchedEntity = deviceEntities.find(e => {
          const domainMatch = e.domain === requirement.domain;
          const deviceClassMatch = !requirement.device_class || e.device_class === requirement.device_class;
          return domainMatch && deviceClassMatch;
        });
        
        matchedEntityId = matchedEntity?.entity_id || null;
      }

      if (currentDeviceRecord) {
        // Update existing record - switch to equipment mapping
        const { error } = await supabase
          .from("a_devices")
          .update({
            equipment_id: equipmentId,
            sensor_role: sensorRole,
            entity_id: matchedEntityId,
            space_id: null,
            weight: null,
            label: null,
          })
          .eq("device_id", currentDeviceRecord.device_id);

        if (error) {
          alert(`Failed to update mapping: ${error.message}`);
          return;
        }
      } else {
        // Create new record for equipment mapping
        const { error } = await supabase
          .from("a_devices")
          .insert({
            site_id: siteid,
            org_id: orgId,
            ha_device_id: ha_device_id,
            device_name: deviceName,
            equipment_id: equipmentId,
            sensor_role: sensorRole,
            entity_id: matchedEntityId,
            space_id: null,
            weight: null,
            label: null,
            status: 'active',
          });

        if (error) {
          alert(`Failed to create mapping: ${error.message}`);
          return;
        }
      }
    }

    setEditingHaDevice(null);
    setSelectedValue(null);
    fetchAll();
  };

  /* ======================================================
   Get mapping display info
  ====================================================== */

  const getMappingDisplay = (d: DeviceGroup) => {
    const record = d.device_record;
    if (!record) return null;

    // Check equipment mapping
    if (record.equipment_id) {
      const equipment = equipments.find(e => e.equipment_id === record.equipment_id);
      return {
        type: "equipment" as const,
        equipmentName: equipment?.equipment_name || "Unknown Equipment",
        equipmentId: record.equipment_id,
        sensorRole: record.sensor_role,
      };
    }

    // Check space mapping
    if (record.space_id) {
      const space = spaces.find(s => s.space_id === record.space_id);
      return {
        type: "space" as const,
        spaceName: space?.name || "Unknown Space",
        spaceId: record.space_id,
        weight: record.weight,
      };
    }

    return null;
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
        haDevices.map((d) => {
          const mapping = getMappingDisplay(d);

          return (
            <Card key={d.ha_device_id} className="bg-white border">
              <CardHeader>
                <CardTitle className="space-y-2">
                  <div className="font-semibold" style={{ color: '#12723A' }}>
                    {d.ha_device_display_name}
                  </div>

                  <div className="text-xs font-mono text-gray-500">
                    HA ID: {d.ha_device_id}
                  </div>

                  {mapping && (
                    <div className="text-sm text-gray-600">
                      Mapped to:{" "}
                      {mapping.type === "equipment" ? (
                        <span className="font-medium">
                          <button
                            onClick={() => goToEquipment(mapping.equipmentId)}
                            className="hover:underline"
                            style={{ color: '#12723A' }}
                          >
                            {mapping.equipmentName}
                          </button>
                          {mapping.sensorRole && (
                            <span className="ml-1 text-gray-600">
                              → <span className="font-semibold">{mapping.sensorRole}</span>
                            </span>
                          )}
                          <span 
                            className="ml-2 text-xs px-2 py-0.5 rounded"
                            style={{ backgroundColor: '#12723A20', color: '#12723A' }}
                          >
                            Equipment
                          </span>
                          {d.device_record?.entity_id && (
                            <div className="mt-1 text-xs text-gray-500">
                              Entity: <span className="font-mono">{d.device_record.entity_id}</span>
                            </div>
                          )}
                        </span>
                      ) : (
                        <span className="font-medium">
                          <button
                            onClick={() => goToSpace(mapping.spaceId)}
                            className="inline-flex items-center gap-1 hover:underline"
                            style={{ color: '#80B52C' }}
                          >
                            {mapping.spaceName}
                            <ArrowUpRight className="w-3 h-3 opacity-70" />
                          </button>
                          <span 
                            className="ml-2 text-xs px-2 py-0.5 rounded"
                            style={{ backgroundColor: '#80B52C20', color: '#5a8020' }}
                          >
                            Space
                          </span>
                          <span className="ml-1 text-xs text-gray-500">
                            (Weight: {mapping.weight})
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  {editingHaDevice === d.ha_device_id ? (
                    <div className="space-y-2 mt-2">
                      <Select
                        value={selectedValue ?? ""}
                        onValueChange={setSelectedValue}
                      >
                        <SelectTrigger className="bg-white border-gray-300">
                          <SelectValue placeholder="Select equipment role or space" />
                        </SelectTrigger>

                        <SelectContent className="bg-white border-2 border-gray-300 shadow-xl max-h-[400px] overflow-y-auto">
                          <SelectItem
                            value="__UNMAP__"
                            className="text-red-600 hover:bg-red-50"
                          >
                            — Unmap Device —
                          </SelectItem>

                          {/* Equipment Section with Sensor Roles */}
                          <div 
                            className="px-3 py-2 text-xs font-bold uppercase sticky top-0"
                            style={{ backgroundColor: '#12723A15', color: '#12723A' }}
                          >
                            📦 Equipment & Sensor Roles
                          </div>
                          
                          {sortedEquipments.map((eq) => {
                            const roles = eq.equipment_type_id 
                              ? requirementsByType.get(eq.equipment_type_id) || []
                              : [];
                            const assignedRoles = assignedRolesByEquipment.get(eq.equipment_id);

                            return (
                              <div key={eq.equipment_id}>
                                <div className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100">
                                  {eq.equipment_name}
                                  {eq.equipment_type_id && (
                                    <span className="text-gray-400 ml-1">
                                      ({eq.equipment_type_id})
                                    </span>
                                  )}
                                </div>
                                
                                {roles.length === 0 ? (
                                  <div className="px-6 py-1 text-xs text-gray-400 italic">
                                    No sensor roles defined for this equipment type
                                  </div>
                                ) : (
                                  roles.map((role) => {
                                    const assignedTo = assignedRoles?.get(role.sensor_role);
                                    const isAssignedToThis = assignedTo === d.ha_device_id;
                                    const isAssignedToOther = !!(assignedTo && assignedTo !== d.ha_device_id);

                                    return (
                                      <SelectItem
                                        key={`${eq.equipment_id}::${role.sensor_role}`}
                                        value={`EQUIP::${eq.equipment_id}::${role.sensor_role}`}
                                        disabled={isAssignedToOther}
                                        className={`pl-6 ${
                                          isAssignedToThis
                                            ? "bg-green-50 text-green-700"
                                            : isAssignedToOther
                                            ? "text-gray-400 cursor-not-allowed"
                                            : "hover:bg-gray-50"
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-xs">→</span>
                                          <span className={role.required ? "font-semibold" : ""}>
                                            {role.sensor_role}
                                          </span>
                                          {role.required && (
                                            <span className="text-xs text-red-500">*</span>
                                          )}
                                          {role.description && (
                                            <span className="text-xs text-gray-400">
                                              — {role.description}
                                            </span>
                                          )}
                                          {isAssignedToThis && (
                                            <span className="text-xs text-green-600">(current)</span>
                                          )}
                                          {isAssignedToOther && (
                                            <span className="text-xs text-gray-400">(assigned)</span>
                                          )}
                                        </div>
                                      </SelectItem>
                                    );
                                  })
                                )}
                              </div>
                            );
                          })}

                          {/* Spaces Section */}
                          <div 
                            className="px-3 py-2 text-xs font-bold uppercase sticky top-0 mt-2"
                            style={{ backgroundColor: '#80B52C15', color: '#5a8020' }}
                          >
                            🏠 Spaces (Ambient Sensors)
                          </div>
                          
                          {sortedSpaces.map((space) => {
                            const isCurrentMapping =
                              d.device_record?.space_id === space.space_id;

                            return (
                              <SelectItem
                                key={space.space_id}
                                value={`SPACE::${space.space_id}`}
                                className={
                                  isCurrentMapping
                                    ? "bg-green-50 text-green-700"
                                    : "hover:bg-gray-50"
                                }
                              >
                                {space.name}
                                <span className="text-xs text-gray-400 ml-2">
                                  ({space.space_type})
                                </span>
                                {isCurrentMapping && (
                                  <span className="text-xs text-green-600 ml-1">
                                    (current)
                                  </span>
                                )}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>

                      <div className="flex gap-2">
                        <Button
                          onClick={() =>
                            submitMapping(
                              d.ha_device_id,
                              d.ha_device_display_name,
                              d.device_record
                            )
                          }
                          disabled={!selectedValue}
                          style={{ backgroundColor: '#12723A' }}
                          className="hover:opacity-90"
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingHaDevice(null);
                            setSelectedValue(null);
                          }}
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
                      {mapping ? "Reassign Device" : "Assign Device"}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm bg-slate-900 text-white rounded">
                  <thead className="bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left">Entity</th>
                      <th className="px-3 py-2 text-left">Domain</th>
                      <th className="px-3 py-2 text-left">Device Class</th>
                      <th className="px-3 py-2 text-left">Last Seen</th>
                      <th className="px-3 py-2 text-left">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.entities.map((e) => {
                      const isMappedEntity = d.device_record?.entity_id === e.entity_id;
                      return (
                        <tr
                          key={e.entity_id}
                          className={`border-t border-slate-700 ${isMappedEntity ? 'bg-green-900/30' : ''}`}
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {isMappedEntity && (
                              <span className="text-green-400 mr-2">✓</span>
                            )}
                            {e.entity_id}
                          </td>
                          <td className="px-3 py-2">{e.domain ?? "—"}</td>
                          <td className="px-3 py-2">{e.device_class ?? "—"}</td>
                          <td
                            className={`px-3 py-2 ${lastSeenClass(e.last_seen_at)}`}
                          >
                            {formatRelativeTime(e.last_seen_at)}
                          </td>
                          <td className="px-3 py-2">
                            {formatValue(e.last_state, e.unit_of_measurement)}
                          </td>
                        </tr>
                      );
                    })}
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
