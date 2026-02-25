"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, ChevronDown, ChevronRight, X, Cpu, Sparkles } from "lucide-react";
import DeviceListPanel from "@/components/gateways/DeviceListPanel";
import SpacesPanel from "@/components/gateways/SpacesPanel";

/* ======================================================
 Types
====================================================== */

interface SyncEntity {
  site_id: string;
  entity_id: string;
  domain: string | null;
  device_class: string | null;
  ha_device_id: string | null;
  ha_device_name: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  equipment_type_id: string | null;
  equipment_group: string | null;
  status: string | null;
  org_id: string | null;
  space_id: string | null;
}

interface SensorRequirement {
  requirement_id: string;
  equipment_type_id: string;
  sensor_role: string;
  sensor_type: string;
  domain: string | null;
  device_class: string | null;
  unit: string | null;
  required: boolean;
  description: string | null;
  phase_configuration: string | null;
  package: number;
  derived: boolean;
  is_derived: boolean;
}

interface SensorBinding {
  sensor_id: string;
  equipment_id: string;
  requirement_id: string;
  entity_id: string;
  sensor_type: string;
  device_id: string | null;
  label: string | null;
}

interface DeviceRecord {
  device_id: string;
  ha_device_id: string | null;
  site_id: string;
  equipment_id: string | null;
  phase_configuration: string | null;
  library_device_id: string | null;
  ct_inverted: boolean;
}

interface LibrarySensor {
  name: string;
  unit: string | null;
  phases: string[];
  sensor_type: string;
  entity_suffix: string;
}

interface LibraryDevice {
  library_device_id: string;
  template_name: string;
  default_sensors: LibrarySensor[] | string;
  device_role: string | null;
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
  if (!value || value === "unknown" || value === "unavailable") return "—";
  return unit ? `${value} ${unit}` : value;
};

const GROUP_COLORS: Record<string, string> = {
  HVAC: "#2563eb",
  Lighting: "#eab308",
  Plumbing: "#06b6d4",
  Electrical: "#f97316",
  Refrigeration: "#8b5cf6",
  Kitchen: "#ef4444",
  Security: "#64748b",
  Other: "#6b7280",
};

const GROUP_ORDER = [
  "HVAC", "Electrical", "Refrigeration", "Kitchen",
  "Lighting", "Plumbing", "Security",
];

const PACKAGE_NAMES: Record<number, { name: string; color: string }> = {
  1: { name: "Basic Essentials", color: "#12723A" },
  2: { name: "Street Smarts", color: "#2563eb" },
  3: { name: "Eagle Eyes Pro", color: "#8b5cf6" },
};

const ANOMALY_SECTION = { name: "Anomaly Detection", color: "#dc2626" };

/** Sensor roles that involve CTs — eligible for invert toggle */
const CT_ROLES = new Set([
  "power_kw", "apparent_power", "reactive_power",
  "compressor_current", "compressor_1_current", "compressor_2_current",
  "line_current", "energy_kwh",
]);

/** Check if a sensor requirement is derived (handles both column names) */
function isDerived(r: SensorRequirement): boolean {
  return r.derived || r.is_derived;
}

/** Format snake_case sensor role → Title Case */
function formatRoleName(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ======================================================
 Component
====================================================== */

export default function GatewayClientPage({ siteid }: { siteid: string }) {
  const router = useRouter();

  const [syncEntities, setSyncEntities] = useState<SyncEntity[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [sensorRequirements, setSensorRequirements] = useState<SensorRequirement[]>([]);
  const [sensorBindings, setSensorBindings] = useState<SensorBinding[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [libraryDevices, setLibraryDevices] = useState<LibraryDevice[]>([]);
  const [phaseConfigurations, setPhaseConfigurations] = useState<{ phase_code: string; description: string }[]>([]);
  const [spaceMap, setSpaceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [expandedEquipment, setExpandedEquipment] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  /* ======================================================
   Fetch
  ====================================================== */

  const fetchAll = useCallback(async () => {
    const [
      { data: entities },
      { data: eqs },
      { data: reqs },
      { data: bindings },
      { data: devs },
      { data: libDevs },
      { data: phaseConfigs },
      { data: spaceRows },
    ] = await Promise.all([
      supabase
        .from("b_entity_sync")
        .select("site_id, entity_id, domain, device_class, ha_device_id, ha_device_name, last_state, unit_of_measurement, last_seen_at")
        .eq("site_id", siteid),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, equipment_type_id, equipment_group, status, org_id, space_id")
        .eq("site_id", siteid),
      supabase
        .from("library_equipment_sensor_requirements")
        .select("requirement_id, equipment_type_id, sensor_role, sensor_type, domain, device_class, unit, required, description, phase_configuration, package, derived, is_derived"),
      supabase
        .from("a_sensors")
        .select("sensor_id, equipment_id, requirement_id, entity_id, sensor_type, device_id, label")
        .eq("site_id", siteid),
      supabase
        .from("a_devices")
        .select("device_id, ha_device_id, site_id, equipment_id, phase_configuration, library_device_id, ct_inverted")
        .eq("site_id", siteid),
      supabase
        .from("library_devices")
        .select("library_device_id, template_name, default_sensors, device_role"),
      supabase
        .from("library_phase_configurations")
        .select("phase_code, description")
        .order("sort_order"),
      supabase
        .from("a_spaces")
        .select("space_id, name")
        .eq("site_id", siteid),
    ]);

    setSyncEntities((entities ?? []) as SyncEntity[]);
    setEquipments((eqs ?? []) as Equipment[]);
    setSensorRequirements((reqs ?? []) as unknown as SensorRequirement[]);
    setSensorBindings((bindings ?? []) as SensorBinding[]);
    setDevices((devs ?? []) as DeviceRecord[]);
    setLibraryDevices((libDevs ?? []) as unknown as LibraryDevice[]);
    setPhaseConfigurations((phaseConfigs ?? []) as { phase_code: string; description: string }[]);

    const sMap: Record<string, string> = {};
    (spaceRows ?? []).forEach((s: any) => { sMap[s.space_id] = s.name; });
    setSpaceMap(sMap);

    if (eqs && eqs.length > 0) {
      setOrgId(eqs[0].org_id ?? null);
    }

    if (eqs && eqs.length > 0 && expandedEquipment.size === 0) {
      setExpandedEquipment(new Set(eqs.map((e: any) => e.equipment_id)));
    }

    setLoading(false);
  }, [siteid]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  /* ======================================================
   Derived data
  ====================================================== */

  const bindingMap = useMemo(() => {
    const map = new Map<string, SensorBinding>();
    for (const b of sensorBindings) {
      map.set(`${b.equipment_id}:${b.requirement_id}`, b);
    }
    return map;
  }, [sensorBindings]);

  const entityMap = useMemo(() => {
    const map = new Map<string, SyncEntity>();
    syncEntities.forEach((e) => map.set(e.entity_id, e));
    return map;
  }, [syncEntities]);

  const haDeviceToDevice = useMemo(() => {
    const map = new Map<string, string>();
    devices.forEach((d) => {
      if (d.ha_device_id) map.set(d.ha_device_id, d.device_id);
    });
    return map;
  }, [devices]);

  const boundEntityIds = useMemo(() => {
    return new Set(sensorBindings.map((b) => b.entity_id));
  }, [sensorBindings]);

  // ha_device_id → full DeviceRecord (for ct_inverted lookup)
  const deviceByHaId = useMemo(() => {
    const map = new Map<string, DeviceRecord>();
    devices.forEach((d) => {
      if (d.ha_device_id) map.set(d.ha_device_id, d);
    });
    return map;
  }, [devices]);

  // Library device lookup
  const libraryDeviceMap = useMemo(() => {
    const map = new Map<string, LibraryDevice>();
    libraryDevices.forEach((ld) => map.set(ld.library_device_id, ld));
    return map;
  }, [libraryDevices]);

  // Parse default_sensors for a library device
  const getLibrarySensors = useCallback(
    (libraryDeviceId: string): LibrarySensor[] => {
      const ld = libraryDeviceMap.get(libraryDeviceId);
      if (!ld) return [];
      if (typeof ld.default_sensors === "string") {
        try { return JSON.parse(ld.default_sensors); }
        catch { return []; }
      }
      return ld.default_sensors ?? [];
    },
    [libraryDeviceMap]
  );

  // Get devices linked to an equipment
  const getEquipmentDevices = useCallback(
    (equipmentId: string): DeviceRecord[] => {
      return devices.filter((d) => d.equipment_id === equipmentId);
    },
    [devices]
  );

  // Get phase_configuration for an equipment (from its linked device)
  const getEquipmentPhase = useCallback(
    (equipmentId: string): string | null => {
      const dev = devices.find((d) => d.equipment_id === equipmentId && d.phase_configuration);
      return dev?.phase_configuration ?? null;
    },
    [devices]
  );

  // Build set of valid entity_ids for an equipment based on phase config
  // Returns null if no phase filtering is possible (show all)
  const getPhaseValidEntities = useCallback(
    (equipmentId: string): Set<string> | null => {
      const eqDevices = getEquipmentDevices(equipmentId);
      if (eqDevices.length === 0) return null;

      const validEntities = new Set<string>();
      let hasPhaseData = false;

      for (const dev of eqDevices) {
        if (!dev.library_device_id || !dev.phase_configuration) continue;

        const libSensors = getLibrarySensors(dev.library_device_id);
        if (libSensors.length === 0) continue;

        hasPhaseData = true;
        const phaseConfig = dev.phase_configuration;

        // Find all HA entities that belong to this device
        const deviceEntities = syncEntities.filter(
          (e) => e.ha_device_id === dev.ha_device_id
        );

        for (const libSensor of libSensors) {
          // Check if this sensor is valid for the device's phase config
          if (!libSensor.phases.includes(phaseConfig)) continue;

          // Find the matching HA entity by suffix
          const suffix = libSensor.entity_suffix.toLowerCase();
          const matched = deviceEntities.find((e) =>
            e.entity_id.toLowerCase().endsWith(suffix)
          );

          if (matched) {
            validEntities.add(matched.entity_id);
          }
        }
      }

      // Also include all entities from devices without phase data (e.g., Z-Wave sensors, thermostats)
      for (const dev of eqDevices) {
        if (dev.phase_configuration) continue; // already handled above
        const deviceEntities = syncEntities.filter(
          (e) => e.ha_device_id === dev.ha_device_id
        );
        deviceEntities.forEach((e) => validEntities.add(e.entity_id));
      }

      // Include entities not tied to any device (orphans)
      syncEntities
        .filter((e) => !e.ha_device_id)
        .forEach((e) => validEntities.add(e.entity_id));

      // Include entities from devices NOT linked to this equipment
      // (e.g., standalone temp sensors not yet assigned to a device)
      syncEntities
        .filter((e) => {
          if (!e.ha_device_id) return false;
          const dev = devices.find((d) => d.ha_device_id === e.ha_device_id);
          return !dev || !dev.equipment_id;
        })
        .forEach((e) => validEntities.add(e.entity_id));

      return hasPhaseData ? validEntities : null;
    },
    [devices, syncEntities, getEquipmentDevices, getLibrarySensors]
  );

  // Get requirements for an equipment, filtered by phase config
  const getRequirementsForEquipment = useCallback(
    (eq: Equipment): SensorRequirement[] => {
      if (!eq.equipment_type_id) return [];

      const allReqs = sensorRequirements.filter(
        (r) => r.equipment_type_id === eq.equipment_type_id
      );

      const phaseConfig = getEquipmentPhase(eq.equipment_id);

      // For each sensor_role+sensor_type, pick the most specific requirement
      const roleMap = new Map<string, SensorRequirement>();

      for (const req of allReqs) {
        const roleKey = `${req.sensor_role}:${req.sensor_type}`;

        if (req.phase_configuration === null) {
          if (!roleMap.has(roleKey)) {
            roleMap.set(roleKey, req);
          }
        } else if (req.phase_configuration === phaseConfig) {
          roleMap.set(roleKey, req);
        }
      }

      const result = Array.from(roleMap.values());

      result.sort((a, b) => {
        if (a.package !== b.package) return a.package - b.package;
        if (a.required !== b.required) return a.required ? -1 : 1;
        if (isDerived(a) !== isDerived(b)) return isDerived(a) ? 1 : -1;
        return a.sensor_role.localeCompare(b.sensor_role);
      });

      return result;
    },
    [sensorRequirements, getEquipmentPhase]
  );

  // Group equipments by equipment_group
  const groupedEquipments = useMemo(() => {
    const groups = new Map<string, Equipment[]>();

    for (const eq of equipments) {
      const group = eq.equipment_group || "Other";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(eq);
    }

    groups.forEach((list) =>
      list.sort((a, b) => a.equipment_name.localeCompare(b.equipment_name))
    );

    const sorted = new Map<string, Equipment[]>();
    for (const g of GROUP_ORDER) {
      if (groups.has(g)) sorted.set(g, groups.get(g)!);
    }
    for (const [g, list] of groups) {
      if (!sorted.has(g)) sorted.set(g, list);
    }

    return sorted;
  }, [equipments]);

  // Get candidate entities for a requirement, filtered by phase
  const getCandidates = useCallback(
    (eq: Equipment, req: SensorRequirement): SyncEntity[] => {
      const phaseValid = getPhaseValidEntities(eq.equipment_id);

      return syncEntities.filter((e) => {
        // Match domain if specified
        if (req.domain && e.domain !== req.domain) return false;
        // Match device_class if specified
        if (req.device_class && e.device_class !== req.device_class) return false;
        // Phase filter: if we have phase data, only show valid entities
        if (phaseValid && !phaseValid.has(e.entity_id)) return false;
        return true;
      });
    },
    [syncEntities, getPhaseValidEntities]
  );

  /* ======================================================
   Audit logging
  ====================================================== */

  const logSensorChange = async (
    equipmentId: string,
    action: "bind" | "unbind" | "rebind",
    sensorRole: string,
    entityId: string,
    oldEntityId?: string
  ) => {
    const message =
      action === "bind"
        ? `Sensor mapped: ${sensorRole} → ${entityId}`
        : action === "unbind"
        ? `Sensor unmapped: ${sensorRole} (was ${entityId})`
        : `Sensor remapped: ${sensorRole} → ${entityId} (was ${oldEntityId})`;

    await supabase.from("b_records_log").insert({
      org_id: orgId,
      site_id: siteid,
      equipment_id: equipmentId,
      event_type: "sensor_mapping",
      source: "gateways_page",
      message,
      metadata: { action, sensor_role: sensorRole, entity_id: entityId, old_entity_id: oldEntityId || null },
      event_date: new Date().toISOString().split("T")[0],
    });
  };

  /* ======================================================
   Bind / unbind
  ====================================================== */

  const bindEntity = async (
    eq: Equipment,
    req: SensorRequirement,
    entityId: string
  ) => {
    const key = `${eq.equipment_id}:${req.requirement_id}`;
    setSavingKey(key);

    try {
      const entity = entityMap.get(entityId);
      const deviceId = entity?.ha_device_id
        ? haDeviceToDevice.get(entity.ha_device_id) ?? null
        : null;

      const existing = bindingMap.get(key);

      if (existing) {
        const { error } = await supabase
          .from("a_sensors")
          .update({
            entity_id: entityId,
            sensor_type: req.sensor_type,
            device_id: deviceId,
            label: `${eq.equipment_name} — ${req.sensor_role}`,
          })
          .eq("sensor_id", existing.sensor_id);

        if (error) {
          console.error("Failed to update binding:", error.message, error.details, error.code);
          return;
        }
        await logSensorChange(eq.equipment_id, "rebind", req.sensor_role, entityId, existing.entity_id);
      } else {
        // Clear any existing binding that uses this entity on this equipment
        // (handles reassignment from one role to another)
        const existingForEntity = sensorBindings.find(
          (b) => b.equipment_id === eq.equipment_id && b.entity_id === entityId
        );
        if (existingForEntity) {
          await supabase
            .from("a_sensors")
            .delete()
            .eq("sensor_id", existingForEntity.sensor_id);
        }

        const { error } = await supabase
          .from("a_sensors")
          .insert({
            org_id: orgId,
            site_id: siteid,
            equipment_id: eq.equipment_id,
            requirement_id: req.requirement_id,
            entity_id: entityId,
            sensor_type: req.sensor_type,
            device_id: deviceId,
            label: `${eq.equipment_name} — ${req.sensor_role}`,
          });

        if (error) {
          console.error("Failed to create binding:", error.message, error.details, error.code);
          return;
        }
        await logSensorChange(eq.equipment_id, "bind", req.sensor_role, entityId);
      }

      await fetchAll();
    } finally {
      setSavingKey(null);
    }
  };

  const unbindEntity = async (eq: Equipment, req: SensorRequirement) => {
    const key = `${eq.equipment_id}:${req.requirement_id}`;
    const existing = bindingMap.get(key);
    if (!existing) return;

    setSavingKey(key);

    try {
      const { error } = await supabase
        .from("a_sensors")
        .delete()
        .eq("sensor_id", existing.sensor_id);

      if (error) {
        console.error("Failed to delete binding:", error.message, error.details, error.code);
        return;
      }

      await logSensorChange(eq.equipment_id, "unbind", req.sensor_role, existing.entity_id);

      await fetchAll();
    } finally {
      setSavingKey(null);
    }
  };

  /* ======================================================
   Change phase configuration on a device
  ====================================================== */

  const [savingPhase, setSavingPhase] = useState<string | null>(null);

  const changePhaseConfig = async (equipmentId: string, newPhase: string | null) => {
    setSavingPhase(equipmentId);
    try {
      const dev = devices.find((d) => d.equipment_id === equipmentId);
      if (!dev) return;

      const { error } = await supabase
        .from("a_devices")
        .update({ phase_configuration: newPhase || null })
        .eq("device_id", dev.device_id);

      if (error) {
        console.error("Failed to update phase:", error.message);
        return;
      }

      await fetchAll();
    } finally {
      setSavingPhase(null);
    }
  };

  /* ======================================================
   CT Invert toggle
  ====================================================== */

  const [savingCtInvert, setSavingCtInvert] = useState<string | null>(null);

  const toggleCtInvert = async (eq: Equipment, sensorRole: string, entityId: string, currentInverted: boolean) => {
    const entity = entityMap.get(entityId);
    if (!entity?.ha_device_id) return;
    const dev = deviceByHaId.get(entity.ha_device_id);
    if (!dev) return;

    const key = `${dev.device_id}:${sensorRole}`;
    setSavingCtInvert(key);
    try {
      const newVal = !currentInverted;
      const { error } = await supabase
        .from("a_devices")
        .update({ ct_inverted: newVal })
        .eq("device_id", dev.device_id);

      if (error) {
        console.error("Failed to toggle CT invert:", error.message);
        return;
      }

      // Audit log
      await supabase.from("b_records_log").insert({
        org_id: orgId,
        site_id: siteid,
        equipment_id: eq.equipment_id,
        device_id: dev.device_id,
        event_type: "ct_inverted",
        source: "gateways_page",
        message: `CT inverted for ${sensorRole} on ${entity.ha_device_name || dev.device_id}: ${newVal}`,
        metadata: { sensor_role: sensorRole, entity_id: entityId, ct_inverted: newVal },
        event_date: new Date().toISOString().split("T")[0],
      });

      await fetchAll();
    } finally {
      setSavingCtInvert(null);
    }
  };

  /* ======================================================
   Toggle
  ====================================================== */

  const toggleEquipment = (equipmentId: string) => {
    setExpandedEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(equipmentId)) next.delete(equipmentId);
      else next.add(equipmentId);
      return next;
    });
  };

  /* ======================================================
   Render: sensor role row
  ====================================================== */

  const renderRoleRow = (eq: Equipment, req: SensorRequirement) => {
    const key = `${eq.equipment_id}:${req.requirement_id}`;
    const binding = bindingMap.get(key);
    const boundEntity = binding ? entityMap.get(binding.entity_id) : null;
    const isSaving = savingKey === key;

    // Derived sensor
    if (isDerived(req)) {
      return (
        <tr key={req.requirement_id} className="border-t border-slate-700 bg-slate-800/30">
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-violet-400 flex-shrink-0" />
              <span className="font-mono text-xs text-slate-300">{req.sensor_role}</span>
              {req.required && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">
                  req
                </span>
              )}
            </div>
            {req.description && (
              <div className="text-[10px] text-slate-500 mt-0.5 pl-5">{req.description}</div>
            )}
          </td>
          <td className="px-3 py-2 text-xs text-slate-400 font-mono">{req.sensor_type}</td>
          <td className="px-3 py-2 text-xs text-slate-500">{req.unit || "—"}</td>
          <td className="px-3 py-2">
            <span className="text-xs text-violet-400 flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              Auto-derived
            </span>
          </td>
          <td className="px-3 py-2 text-xs text-slate-500">—</td>
          <td className="px-3 py-2 text-xs text-slate-500">—</td>
        </tr>
      );
    }

    const candidates = getCandidates(eq, req);
    const isCTRole = CT_ROLES.has(req.sensor_role);
    // CT invert state: look up device via bound entity
    const boundDeviceRecord = boundEntity?.ha_device_id ? deviceByHaId.get(boundEntity.ha_device_id) : null;
    const isCtInverted = boundDeviceRecord?.ct_inverted ?? false;
    const ctSavingKey = boundDeviceRecord ? `${boundDeviceRecord.device_id}:${req.sensor_role}` : null;
    const isSavingCt = ctSavingKey === savingCtInvert;

    // Format value with CT inversion applied
    const displayValue = (() => {
      if (!boundEntity) return null;
      const raw = boundEntity.last_state;
      if (!raw || raw === "unknown" || raw === "unavailable") return "—";
      if (isCTRole && isCtInverted) {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          const inverted = num * -1;
          return boundEntity.unit_of_measurement ? `${inverted} ${boundEntity.unit_of_measurement}` : String(inverted);
        }
      }
      return boundEntity.unit_of_measurement ? `${raw} ${boundEntity.unit_of_measurement}` : raw;
    })();

    return (
      <tr key={req.requirement_id} className="border-t border-slate-700">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-200">{req.sensor_role}</span>
            {req.required && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">
                req
              </span>
            )}
            {isCTRole && isCtInverted && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-300">
                CT Inverted
              </span>
            )}
          </div>
          {req.description && (
            <div className="text-[10px] text-slate-500 mt-0.5">{req.description}</div>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-slate-400 font-mono">{req.sensor_type}</td>
        <td className="px-3 py-2 text-xs text-slate-500">{req.unit || "—"}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <select
              value={binding?.entity_id || ""}
              disabled={isSaving}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  bindEntity(eq, req, val);
                } else if (binding) {
                  unbindEntity(eq, req);
                }
              }}
              className={`text-xs bg-slate-800 border rounded px-2 py-1.5 w-full max-w-[340px] ${
                binding
                  ? "border-emerald-600/50 text-emerald-300"
                  : "border-slate-600 text-slate-400"
              } ${isSaving ? "opacity-50" : ""}`}
            >
              <option value="">— select entity —</option>
              {candidates.map((c) => {
                const boundToOther = sensorBindings.find(
                  (b) => b.entity_id === c.entity_id && b.equipment_id !== eq.equipment_id
                );
                // Hide entities bound to other equipment entirely
                if (boundToOther) return null;
                const inUseOnSameEquipment = boundEntityIds.has(c.entity_id) && c.entity_id !== binding?.entity_id;
                return (
                  <option key={c.entity_id} value={c.entity_id}>
                    {c.entity_id.replace("sensor.", "").replace("binary_sensor.", "").replace("climate.", "")}
                    {c.last_state && c.last_state !== "unknown" && c.last_state !== "unavailable"
                      ? ` (${c.last_state}${c.unit_of_measurement ? " " + c.unit_of_measurement : ""})`
                      : ""}
                    {inUseOnSameEquipment ? " ⚠ in use" : ""}
                  </option>
                );
              })}
            </select>
            {binding && !isSaving && (
              <button
                onClick={() => unbindEntity(eq, req)}
                className="text-slate-500 hover:text-red-400 p-0.5"
                title="Unbind"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {isCTRole && binding && (
              <button
                onClick={() => toggleCtInvert(eq, req.sensor_role, binding.entity_id, isCtInverted)}
                disabled={isSavingCt}
                className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                  isCtInverted
                    ? "border-orange-500/50 bg-orange-900/30 text-orange-300"
                    : "border-slate-600 text-slate-400 hover:border-slate-500"
                } ${isSavingCt ? "opacity-50" : ""}`}
                title={isCtInverted ? "CT is inverted — click to restore" : "Invert CT polarity"}
              >
                {isSavingCt ? "…" : isCtInverted ? "CT ⟳" : "Invert CT"}
              </button>
            )}
            {isSaving && <span className="text-[10px] text-slate-500">…</span>}
          </div>
        </td>
        <td className="px-3 py-2 text-xs">
          {displayValue
            ? <span className={isCTRole && isCtInverted ? "text-orange-300" : ""}>{displayValue}</span>
            : <span className="text-slate-600">—</span>}
        </td>
        <td className={`px-3 py-2 text-xs ${lastSeenClass(boundEntity?.last_seen_at ?? null)}`}>
          {boundEntity ? formatRelativeTime(boundEntity.last_seen_at) : "—"}
        </td>
      </tr>
    );
  };

  /* ======================================================
   Render: package section
  ====================================================== */

  const renderPackageSection = (eq: Equipment, reqs: SensorRequirement[], pkg: number) => {
    // For package 1, exclude derived anomaly sensors (rendered separately)
    const pkgReqs = pkg === 1
      ? reqs.filter((r) => r.package === pkg && !isDerived(r))
      : reqs.filter((r) => r.package === pkg);
    if (pkgReqs.length === 0) return null;

    const pkgInfo = PACKAGE_NAMES[pkg] || { name: `Package ${pkg}`, color: "#6b7280" };
    const physicalCount = pkgReqs.filter((r) => !isDerived(r)).length;
    const derivedCount = pkgReqs.filter((r) => isDerived(r)).length;

    return (
      <div key={pkg} className="mb-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-t"
          style={{ backgroundColor: pkgInfo.color + "15", color: pkgInfo.color }}
        >
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pkgInfo.color }} />
          {pkgInfo.name}
          <span className="font-normal normal-case text-slate-500 ml-1">
            {physicalCount} sensors{derivedCount > 0 && ` + ${derivedCount} derived`}
          </span>
        </div>
        <table className="w-full text-sm bg-slate-900 text-white rounded-b overflow-hidden">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left w-[220px]">Sensor Role</th>
              <th className="px-3 py-2 text-left w-[130px]">Type</th>
              <th className="px-3 py-2 text-left w-[60px]">Unit</th>
              <th className="px-3 py-2 text-left">Mapped Entity</th>
              <th className="px-3 py-2 text-left w-[100px]">Value</th>
              <th className="px-3 py-2 text-left w-[100px]">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {pkgReqs.map((req) => renderRoleRow(eq, req))}
          </tbody>
        </table>
      </div>
    );
  };

  /** Render the Anomaly Detection section (package 1 derived sensors) */
  const renderAnomalySection = (eq: Equipment, reqs: SensorRequirement[]) => {
    const anomalyReqs = reqs.filter((r) => r.package === 1 && isDerived(r));
    if (anomalyReqs.length === 0) return null;

    return (
      <div key="anomaly" className="mb-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-t"
          style={{ backgroundColor: ANOMALY_SECTION.color + "15", color: ANOMALY_SECTION.color }}
        >
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ANOMALY_SECTION.color }} />
          {ANOMALY_SECTION.name}
          <span className="font-normal normal-case text-slate-500 ml-1">
            {anomalyReqs.length} auto-derived
          </span>
        </div>
        <table className="w-full text-sm bg-slate-900 text-white rounded-b overflow-hidden">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left w-[220px]">Sensor Role</th>
              <th className="px-3 py-2 text-left w-[130px]">Type</th>
              <th className="px-3 py-2 text-left w-[60px]">Unit</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left w-[100px]">Value</th>
              <th className="px-3 py-2 text-left w-[100px]">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {anomalyReqs.map((req) => (
              <tr key={req.requirement_id} className="border-t border-slate-700 bg-slate-800/30">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-red-400 flex-shrink-0" />
                    <span className="text-xs text-slate-200">{formatRoleName(req.sensor_role)}</span>
                  </div>
                  {req.description && (
                    <div className="text-[10px] text-slate-500 mt-0.5 pl-5">{req.description}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400 font-mono">{req.sensor_type}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{req.unit || "—"}</td>
                <td className="px-3 py-2">
                  <span className="text-xs text-blue-400 flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    Auto-derived
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">—</td>
                <td className="px-3 py-2 text-xs text-slate-500">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  /* ======================================================
   Render: equipment card
  ====================================================== */

  const renderEquipmentCard = (eq: Equipment) => {
    const reqs = getRequirementsForEquipment(eq);
    const isExpanded = expandedEquipment.has(eq.equipment_id);
    const phaseConfig = getEquipmentPhase(eq.equipment_id);

    const physicalReqs = reqs.filter((r) => !isDerived(r));
    const boundCount = physicalReqs.filter((r) =>
      bindingMap.has(`${eq.equipment_id}:${r.requirement_id}`)
    ).length;
    const requiredReqs = physicalReqs.filter((r) => r.required);
    const boundRequiredCount = requiredReqs.filter((r) =>
      bindingMap.has(`${eq.equipment_id}:${r.requirement_id}`)
    ).length;

    const packages = [...new Set(reqs.map((r) => r.package))].sort();

    return (
      <Card key={eq.equipment_id} className="bg-white border">
        <CardHeader
          className="pb-2 cursor-pointer select-none"
          onClick={() => toggleEquipment(eq.equipment_id)}
        >
          <CardTitle>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 font-normal">Equipment Name:</span>
                    <a
                      href={`/sites/${siteid}/equipment/${eq.equipment_id}/individual-equipment`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold hover:underline"
                      style={{ color: "#12723A" }}
                    >
                      {eq.equipment_name}
                    </a>
                  </div>
                  <div className="text-xs text-gray-500 font-normal mt-0.5 flex items-center gap-3">
                    <span>{eq.equipment_type_id?.replace(/_/g, " ") || "Unknown Type"}</span>
                    {eq.space_id && spaceMap[eq.space_id] && (
                      <span>
                        <span className="text-gray-400">Space: </span>
                        <span className="text-sky-600 font-medium">{spaceMap[eq.space_id]}</span>
                      </span>
                    )}
                    {(() => {
                      const dev = devices.find(
                        (d) => d.equipment_id === eq.equipment_id && d.library_device_id
                      );
                      if (!dev) return null;
                      // Only show phase dropdown if the device's library template is phase-aware
                      const libDev = libraryDeviceMap.get(dev.library_device_id!);
                      if (!libDev || libDev.device_role !== "energy_meter") return null;
                      const isSaving = savingPhase === eq.equipment_id;
                      return (
                        <span className="flex items-center gap-1.5">
                          <span className="text-gray-400">Phase Config:</span>
                          <select
                            value={phaseConfig || ""}
                            disabled={isSaving}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              changePhaseConfig(eq.equipment_id, e.target.value || null);
                            }}
                            className={`px-1.5 py-0.5 rounded border text-xs font-mono cursor-pointer ${
                              phaseConfig
                                ? "bg-slate-100 border-slate-300 text-slate-700"
                                : "bg-amber-50 border-amber-300 text-amber-700"
                            } ${isSaving ? "opacity-50" : ""}`}
                          >
                            <option value="">— set phase —</option>
                            {phaseConfigurations.map((pc) => (
                              <option key={pc.phase_code} value={pc.phase_code}>
                                {pc.phase_code}
                              </option>
                            ))}
                          </select>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {reqs.length > 0 ? (
                  <>
                    <span className="text-gray-500">
                      {boundCount}/{physicalReqs.length} mapped
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        boundRequiredCount === requiredReqs.length
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {boundRequiredCount}/{requiredReqs.length} required
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400">No sensor roles defined</span>
                )}
              </div>
            </div>
          </CardTitle>
        </CardHeader>

        {isExpanded && reqs.length > 0 && (
          <CardContent className="pt-0 overflow-x-auto space-y-0">
            {packages.map((pkg) => (
              <React.Fragment key={pkg}>
                {renderPackageSection(eq, reqs, pkg)}
                {pkg === 1 && renderAnomalySection(eq, reqs)}
              </React.Fragment>
            ))}
          </CardContent>
        )}

        {isExpanded && reqs.length === 0 && (
          <CardContent className="pt-0">
            <div className="text-sm text-gray-400 bg-slate-50 rounded p-4 text-center">
              No sensor requirements defined for this equipment type.
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  /* ======================================================
   Unbound entities
  ====================================================== */

  const unboundEntities = useMemo(() => {
    return syncEntities.filter(
      (e) =>
        (e.domain === "sensor" || e.domain === "binary_sensor") &&
        e.device_class &&
        !boundEntityIds.has(e.entity_id)
    );
  }, [syncEntities, boundEntityIds]);

  const renderUnboundSection = () => {
    if (unboundEntities.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 pt-2">
          <div className="text-sm font-bold uppercase tracking-wider" style={{ color: "#D97706" }}>
            Available Entities
          </div>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {unboundEntities.length}
          </span>
          <span className="text-xs text-gray-400">
            Not yet assigned to any equipment role
          </span>
        </div>
        <Card className="bg-white border">
          <CardContent className="pt-4 overflow-x-auto">
            <table className="w-full text-sm bg-slate-900 text-white rounded overflow-hidden">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left">Entity</th>
                  <th className="px-3 py-2 text-left">Domain</th>
                  <th className="px-3 py-2 text-left">Device Class</th>
                  <th className="px-3 py-2 text-left">HA Device</th>
                  <th className="px-3 py-2 text-left">Value</th>
                  <th className="px-3 py-2 text-left">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {unboundEntities.map((e) => (
                  <tr key={e.entity_id} className="border-t border-slate-700">
                    <td className="px-3 py-2 font-mono text-xs">{e.entity_id}</td>
                    <td className="px-3 py-2 text-xs">{e.domain ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{e.device_class ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {e.ha_device_name || e.ha_device_id || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {formatValue(e.last_state, e.unit_of_measurement)}
                    </td>
                    <td className={`px-3 py-2 text-xs ${lastSeenClass(e.last_seen_at)}`}>
                      {formatRelativeTime(e.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  };

  /* ======================================================
   Main
  ====================================================== */

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push(`/sites/${siteid}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Site
        </Button>
        <h1 className="text-2xl font-semibold">Equipment Sensor Mapping</h1>
        <div className="w-[120px]" />
      </div>

      <DeviceListPanel siteId={siteid} />

      <SpacesPanel siteId={siteid} />

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {Array.from(groupedEquipments.entries()).map(([group, eqs]) => (
            <div key={group} className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: GROUP_COLORS[group] || GROUP_COLORS.Other }}
                />
                <span className="text-xs text-gray-400 uppercase tracking-wider">Equipment Group:</span>
                <h2
                  className="text-sm font-bold uppercase tracking-wider"
                  style={{ color: GROUP_COLORS[group] || GROUP_COLORS.Other }}
                >
                  {group}
                </h2>
                <span className="text-xs text-gray-400">
                  {eqs.length} {eqs.length === 1 ? "unit" : "units"}
                </span>
              </div>
              {eqs.map((eq) => renderEquipmentCard(eq))}
            </div>
          ))}

          {equipments.length === 0 && (
            <Card className="bg-white border">
              <CardContent className="py-12 text-center text-gray-500">
                No equipment found. Add equipment first, then map sensors here.
              </CardContent>
            </Card>
          )}

          {renderUnboundSection()}
        </>
      )}
    </div>
  );
}
