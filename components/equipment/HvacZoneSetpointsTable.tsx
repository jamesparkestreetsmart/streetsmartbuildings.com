"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import ZoneWeightBar from "@/components/hvac/ZoneWeightBar";
import SpaceSensorPanel from "@/components/hvac/SpaceSensorPanel";

interface ResolvedSetpoints {
  occupied_heat_f: number;
  occupied_cool_f: number;
  unoccupied_heat_f: number;
  unoccupied_cool_f: number;
  occupied_fan_mode: string;
  occupied_hvac_mode: string;
  unoccupied_fan_mode: string;
  unoccupied_hvac_mode: string;
  guardrail_min_f: number;
  guardrail_max_f: number;
  manager_offset_up_f: number;
  manager_offset_down_f: number;
  manager_override_reset_minutes: number;
  source: "profile" | "zone_override" | "default";
  profile_name?: string;
}

interface HvacZone {
  hvac_zone_id: string;
  zone_name: string;
  zone_type: string;
  control_scope: string;
  equipment_id: string | null;
  equipment_name: string | null;
  equipment_status: string | null;
  thermostat_device_id: string | null;
  thermostat_ha_device_id: string | null;
  profile_id: string | null;
  is_override: boolean;
  resolved_setpoints: ResolvedSetpoints | null;
  policy_setpoint_min_f: number | null;
  policy_setpoint_max_f: number | null;
  policy_hvac_mode: string | null;
  policy_fan_mode: string | null;
  policy_setpoint_min_unoccupied_f: number | null;
  policy_setpoint_max_unoccupied_f: number | null;
  policy_hvac_mode_unoccupied: string | null;
  policy_fan_mode_unoccupied: string | null;
  hard_min_f: number | null;
  hard_max_f: number | null;
  actual_hvac_mode: string | null;
  actual_hvac_action: string | null;
  actual_setpoint_f: number | null;
  actual_setpoint_high_f: number | null;
  actual_setpoint_low_f: number | null;
  actual_temperature_f: number | null;
  actual_humidity: number | null;
  actual_fan_mode: string | null;
  actual_fan_action: string | null;
  actual_preset: string | null;
  battery_level: number | null;
  is_powered: boolean | null;
  actual_last_synced: string | null;
  space_count: number;
  served_spaces: string | null;
}

interface Profile {
  profile_id: string;
  profile_name: string;
}

// ── Zone-config types (from ZoneSpaceConfig) ────────────────────────

interface SensorRow {
  id?: string;
  sensor_type: string;
  entity_id: string | null;
  weight: number;
  is_primary?: boolean;
  value: string | null;
  unit: string | null;
  last_seen_at: string | null;
  device_name: string | null;
  fresh?: boolean;
}

interface SpaceData {
  space_id: string;
  name: string;
  space_type: string;
  zone_weight: number | null;
  sensors: SensorRow[];
  computed_temp: number | null;
  temp_source: string;
}

interface ThermostatData {
  name: string;
  temp_f: number | null;
  humidity: number | null;
  last_synced: string | null;
}

interface ZoneConfigEntry {
  hvac_zone_id: string;
  name: string;
  equipment_id: string | null;
  equipment_name: string | null;
  control_scope: string;
  zone_temp_source: string;
  profile_name: string | null;
  thermostat: ThermostatData | null;
  spaces: SpaceData[];
  computed_zone_temp: number | null;
}

interface ZoneConfigData {
  zones: ZoneConfigEntry[];
  unassigned_spaces: { space_id: string; name: string; space_type: string }[];
  available_entities: {
    temperature: { entity_id: string; device_name: string | null; value: string | null; unit: string | null; bound: boolean }[];
    humidity: { entity_id: string; device_name: string | null; value: string | null; unit: string | null; bound: boolean }[];
    occupancy: { entity_id: string; device_name: string | null; value: string | null; unit: string | null; bound: boolean }[];
  };
}

interface SpaceEdit {
  zone_weight: number | null;
  sensors: SensorRow[];
}

// ── Main component types ────────────────────────────────────────────

type SortField = "zone_name" | "zone_type" | "equipment_name" | "policy_setpoint_min_f" | "space_count";
type SortDirection = "asc" | "desc";

interface Props {
  siteId: string;
  orgId: string;
}

export default function HvacZoneSetpointsTable({ siteId, orgId }: Props) {
  const [zones, setZones] = useState<HvacZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingZone, setEditingZone] = useState<HvacZone | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [savedZoneId, setSavedZoneId] = useState<string | null>(null);

  // Expanded inline space-config rows
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

  // Zone-config data (for inline panels)
  const [zoneConfigData, setZoneConfigData] = useState<ZoneConfigData | null>(null);
  const [zoneConfigLoading, setZoneConfigLoading] = useState(false);
  const [spaceEdits, setSpaceEdits] = useState<Map<string, Map<string, SpaceEdit>>>(new Map());
  const [savingZone, setSavingZone] = useState<string | null>(null);
  const [savedZone, setSavedZone] = useState<string | null>(null);
  const [assigningSpace, setAssigningSpace] = useState<string | null>(null);

  // Inline editing state
  const [inlineEdit, setInlineEdit] = useState<{
    zoneId: string;
    field: string;
    value: number;
  } | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("zone_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Form state
  const [formData, setFormData] = useState({
    zone_name: "",
    zone_type: "undefined",
    control_scope: "open",
    equipment_id: "",
    thermostat_device_id: "",
    setpoint_min_f: 68,
    setpoint_max_f: 76,
    hvac_mode: "auto",
    fan_mode: "auto",
    setpoint_min_unoccupied_f: 60,
    setpoint_max_unoccupied_f: 80,
    hvac_mode_unoccupied: "auto",
    fan_mode_unoccupied: "auto",
  });

  const [availableEquipment, setAvailableEquipment] = useState<
    { equipment_id: string; equipment_name: string }[]
  >([]);

  const [availableThermostats, setAvailableThermostats] = useState<
    { device_id: string; device_name: string; ha_device_id: string }[]
  >([]);

  const zoneTypeDefaults: Record<string, { min: number; max: number; minUnocc: number; maxUnocc: number }> = {
    undefined: { min: 68, max: 76, minUnocc: 60, maxUnocc: 80 },
    customer: { min: 70, max: 74, minUnocc: 60, maxUnocc: 80 },
    employee: { min: 68, max: 76, minUnocc: 55, maxUnocc: 85 },
    storage: { min: 55, max: 85, minUnocc: 50, maxUnocc: 90 },
  };

  // ── Fetches ──────────────────────────────────────────────────────

  const fetchProfiles = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/thermostat/profiles?org_id=${orgId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setProfiles(data.map((p: any) => ({ profile_id: p.profile_id, profile_name: p.profile_name })));
      }
    } catch (err) {
      console.error("Error fetching profiles:", err);
    }
  }, [orgId]);

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch(`/api/thermostat/zone-setpoints?site_id=${siteId}`);
      const apiZones = await res.json();

      if (Array.isArray(apiZones) && apiZones.length > 0) {
        const { data: viewData } = await supabase
          .from("view_hvac_zones_with_state")
          .select("*")
          .eq("site_id", siteId);

        const viewMap = new Map<string, any>();
        for (const v of viewData || []) viewMap.set(v.hvac_zone_id, v);

        const merged: HvacZone[] = apiZones.map((z: any) => {
          const view = viewMap.get(z.hvac_zone_id);
          const rs = z.resolved_setpoints;
          return {
            hvac_zone_id: z.hvac_zone_id,
            zone_name: z.name || view?.zone_name || "",
            zone_type: z.zone_type || view?.zone_type || "undefined",
            control_scope: z.control_scope || view?.control_scope || "open",
            equipment_id: z.equipment_id || view?.equipment_id || null,
            equipment_name: view?.equipment_name || null,
            equipment_status: view?.equipment_status || null,
            thermostat_device_id: z.thermostat_device_id || view?.thermostat_device_id || null,
            thermostat_ha_device_id: view?.thermostat_ha_device_id || null,
            profile_id: z.profile_id || null,
            is_override: z.is_override ?? true,
            resolved_setpoints: rs || null,
            policy_setpoint_min_f: rs?.occupied_heat_f ?? view?.policy_setpoint_min_f ?? null,
            policy_setpoint_max_f: rs?.occupied_cool_f ?? view?.policy_setpoint_max_f ?? null,
            policy_hvac_mode: rs?.occupied_hvac_mode ?? view?.policy_hvac_mode ?? null,
            policy_fan_mode: rs?.occupied_fan_mode ?? view?.policy_fan_mode ?? null,
            policy_setpoint_min_unoccupied_f: rs?.unoccupied_heat_f ?? view?.policy_setpoint_min_unoccupied_f ?? null,
            policy_setpoint_max_unoccupied_f: rs?.unoccupied_cool_f ?? view?.policy_setpoint_max_unoccupied_f ?? null,
            policy_hvac_mode_unoccupied: rs?.unoccupied_hvac_mode ?? view?.policy_hvac_mode_unoccupied ?? null,
            policy_fan_mode_unoccupied: rs?.unoccupied_fan_mode ?? view?.policy_fan_mode_unoccupied ?? null,
            hard_min_f: view?.hard_min_f ?? null,
            hard_max_f: view?.hard_max_f ?? null,
            actual_hvac_mode: view?.actual_hvac_mode ?? null,
            actual_hvac_action: view?.actual_hvac_action ?? null,
            actual_setpoint_f: view?.actual_setpoint_f ?? null,
            actual_setpoint_high_f: view?.actual_setpoint_high_f ?? null,
            actual_setpoint_low_f: view?.actual_setpoint_low_f ?? null,
            actual_temperature_f: view?.actual_temperature_f ?? null,
            actual_humidity: view?.actual_humidity ?? null,
            actual_fan_mode: view?.actual_fan_mode ?? null,
            actual_fan_action: view?.actual_fan_action ?? null,
            actual_preset: view?.actual_preset ?? null,
            battery_level: view?.battery_level ?? null,
            is_powered: view?.is_powered ?? null,
            actual_last_synced: view?.actual_last_synced ?? null,
            space_count: view?.space_count ?? 0,
            served_spaces: view?.served_spaces ?? null,
          };
        });
        setZones(merged);
      } else {
        const { data, error } = await supabase
          .from("view_hvac_zones_with_state")
          .select("*")
          .eq("site_id", siteId)
          .order("zone_name");
        if (!error && data) {
          setZones(data.map((d: any) => ({ ...d, profile_id: null, is_override: true, resolved_setpoints: null })));
        }
      }
    } catch (err) {
      console.error("Error fetching zones:", err);
      const { data } = await supabase
        .from("view_hvac_zones_with_state")
        .select("*")
        .eq("site_id", siteId)
        .order("zone_name");
      if (data) {
        setZones(data.map((d: any) => ({ ...d, profile_id: null, is_override: true, resolved_setpoints: null })));
      }
    }
    setLoading(false);
  }, [siteId]);

  const fetchZoneConfig = useCallback(async () => {
    setZoneConfigLoading(true);
    try {
      const res = await fetch(`/api/zone-config?site_id=${siteId}`);
      const json = await res.json();
      setZoneConfigData(json);
    } catch (err) {
      console.error("Failed to fetch zone config:", err);
    }
    setZoneConfigLoading(false);
  }, [siteId]);

  useEffect(() => {
    const initZones = async () => {
      const { data: equipment } = await supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name")
        .eq("site_id", siteId)
        .eq("equipment_group", "HVAC")
        .order("equipment_name");
      setAvailableEquipment(equipment || []);

      const { data: climateEntities } = await supabase
        .from("b_entity_sync")
        .select("ha_device_id, ha_device_name")
        .eq("site_id", siteId)
        .like("entity_id", "climate.%");

      if (climateEntities && climateEntities.length > 0) {
        const haDeviceIds = [...new Set(climateEntities.map((e) => e.ha_device_id))];
        const { data: devices } = await supabase
          .from("a_devices")
          .select("device_id, device_name, ha_device_id")
          .eq("site_id", siteId)
          .in("ha_device_id", haDeviceIds);
        setAvailableThermostats(
          haDeviceIds.map((haId) => {
            const device = devices?.find((d) => d.ha_device_id === haId);
            const entity = climateEntities.find((e) => e.ha_device_id === haId);
            return {
              device_id: device?.device_id || "",
              device_name: device?.device_name || entity?.ha_device_name || "Unknown Thermostat",
              ha_device_id: haId,
            };
          })
        );
      }

      const { data: existingZones } = await supabase
        .from("view_hvac_zones")
        .select("hvac_zone_id")
        .eq("site_id", siteId)
        .limit(1);

      if (!existingZones || existingZones.length === 0) {
        await autoCreateZones(equipment || []);
      }

      fetchProfiles();
      fetchZones();
      fetchZoneConfig();
    };

    if (orgId) initZones();
  }, [siteId, orgId, fetchProfiles, fetchZones, fetchZoneConfig]);

  // ── Auto-create zones (unchanged) ───────────────────────────────

  const autoCreateZones = async (equipment: { equipment_id: string; equipment_name: string }[]) => {
    if (!orgId) return;
    const { data: allDefaults } = await supabase.from("library_zone_type_defaults").select("*");
    if (!allDefaults) return;
    const defaultsByType: Record<string, any> = {};
    for (const d of allDefaults) defaultsByType[d.zone_type] = d;

    for (const zoneType of ["customer", "employee", "storage"]) {
      const defaults = defaultsByType[zoneType];
      if (!defaults) continue;
      const templateName = `${zoneType.charAt(0).toUpperCase() + zoneType.slice(1)} Zone (Template)`;
      const { data: zoneData, error: zoneError } = await supabase
        .from("a_hvac_zones")
        .insert({ site_id: siteId, org_id: orgId, name: templateName, zone_type: zoneType, control_scope: "open", equipment_id: null })
        .select()
        .single();
      if (zoneError) continue;
      await supabase.from("b_hvac_zone_setpoints").insert({
        hvac_zone_id: zoneData.hvac_zone_id,
        setpoint_min_f: defaults.setpoint_min_f,
        setpoint_max_f: defaults.setpoint_max_f,
        hvac_mode: "auto", fan_mode: "auto",
        setpoint_min_unoccupied_f: defaults.setpoint_min_unoccupied_f || 60,
        setpoint_max_unoccupied_f: defaults.setpoint_max_unoccupied_f || 80,
        hvac_mode_unoccupied: "auto", fan_mode_unoccupied: "auto",
        hard_min_f: defaults.hard_min_f, hard_max_f: defaults.hard_max_f,
      });
    }

    const undefinedDefaults = defaultsByType["undefined"] || defaultsByType["employee"];
    for (const equip of equipment) {
      const { data: zoneData, error: zoneError } = await supabase
        .from("a_hvac_zones")
        .insert({ site_id: siteId, org_id: orgId, name: equip.equipment_name, zone_type: "undefined", control_scope: "managed", equipment_id: equip.equipment_id })
        .select()
        .single();
      if (zoneError) continue;
      await supabase.from("b_hvac_zone_setpoints").insert({
        hvac_zone_id: zoneData.hvac_zone_id,
        setpoint_min_f: undefinedDefaults.setpoint_min_f,
        setpoint_max_f: undefinedDefaults.setpoint_max_f,
        hvac_mode: "auto", fan_mode: "auto",
        setpoint_min_unoccupied_f: undefinedDefaults.setpoint_min_unoccupied_f || 60,
        setpoint_max_unoccupied_f: undefinedDefaults.setpoint_max_unoccupied_f || 80,
        hvac_mode_unoccupied: "auto", fan_mode_unoccupied: "auto",
        hard_min_f: undefinedDefaults.hard_min_f, hard_max_f: undefinedDefaults.hard_max_f,
      });
    }
  };

  // ── Profile / inline setpoint handlers (unchanged) ──────────────

  const handleProfileChange = async (zoneId: string, profileId: string, currentIsOverride: boolean) => {
    if (profileId === "__custom__") {
      const res = await fetch("/api/thermostat/zone-setpoints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hvac_zone_id: zoneId, is_override: true, occupied_heat_f: 68, occupied_cool_f: 76, unoccupied_heat_f: 55, unoccupied_cool_f: 85 }),
      });
      if (res.ok) { flashSaved(zoneId); fetchZones(); }
    } else {
      const res = await fetch("/api/thermostat/zone-setpoints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hvac_zone_id: zoneId, profile_id: profileId, is_override: false }),
      });
      if (res.ok) { flashSaved(zoneId); fetchZones(); }
    }
  };

  const saveInlineEdit = async (zoneId: string, field: string, value: number) => {
    const fieldMap: Record<string, string> = {
      occ_heat: "occupied_heat_f", occ_cool: "occupied_cool_f",
      unocc_heat: "unoccupied_heat_f", unocc_cool: "unoccupied_cool_f",
    };
    const apiField = fieldMap[field];
    if (!apiField) return;
    const res = await fetch("/api/thermostat/zone-setpoints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hvac_zone_id: zoneId, [apiField]: value }),
    });
    if (res.ok) { flashSaved(zoneId); fetchZones(); }
    setInlineEdit(null);
  };

  const flashSaved = (zoneId: string) => {
    setSavedZoneId(zoneId);
    setTimeout(() => setSavedZoneId(null), 1200);
  };

  const startInlineEdit = (zone: HvacZone, field: string, currentValue: number) => {
    if (!zone.is_override && zone.profile_id) {
      if (!confirm("Override profile for this zone? This will switch to custom setpoints.")) return;
    }
    setInlineEdit({ zoneId: zone.hvac_zone_id, field, value: currentValue });
  };

  // ── Inline space-config handlers ─────────────────────────────────

  const toggleZoneExpand = (zoneId: string) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  };

  const getSpaceData = useCallback(
    (zoneId: string, space: SpaceData): SpaceData => {
      const edit = spaceEdits.get(zoneId)?.get(space.space_id);
      if (!edit) return space;
      return { ...space, zone_weight: edit.zone_weight, sensors: edit.sensors };
    },
    [spaceEdits]
  );

  const setSpaceEdit = useCallback(
    (zoneId: string, spaceId: string, updater: (prev: SpaceEdit) => SpaceEdit, zone: ZoneConfigEntry) => {
      setSpaceEdits((prev) => {
        const next = new Map(prev);
        const zoneEdits = new Map(next.get(zoneId) || new Map());
        const space = zone.spaces.find((s) => s.space_id === spaceId);
        const current = zoneEdits.get(spaceId) || {
          zone_weight: space?.zone_weight ?? null,
          sensors: space?.sensors ? JSON.parse(JSON.stringify(space.sensors)) : [],
        };
        zoneEdits.set(spaceId, updater(current));
        next.set(zoneId, zoneEdits);
        return next;
      });
    },
    []
  );

  const handleZoneWeightChange = useCallback(
    (zoneId: string, zone: ZoneConfigEntry) => (spaceId: string, weight: number | null) => {
      setSpaceEdit(zoneId, spaceId, (prev) => ({ ...prev, zone_weight: weight }), zone);
    },
    [setSpaceEdit]
  );

  const handleSensorChange = useCallback(
    (zoneId: string, zone: ZoneConfigEntry) => (spaceId: string, index: number, field: string, value: any) => {
      setSpaceEdit(zoneId, spaceId, (prev) => {
        const sensors = [...prev.sensors];
        sensors[index] = { ...sensors[index], [field]: value };
        return { ...prev, sensors };
      }, zone);
    },
    [setSpaceEdit]
  );

  const handleAddSensor = useCallback(
    (zoneId: string, zone: ZoneConfigEntry) => (spaceId: string, sensorType: string) => {
      setSpaceEdit(zoneId, spaceId, (prev) => {
        const sensors = [...prev.sensors];
        if (sensorType === "temperature") {
          const existingTemp = sensors.filter((s) => s.sensor_type === "temperature");
          const newWeight = parseFloat((1 / (existingTemp.length + 1)).toFixed(2));
          for (const s of sensors) if (s.sensor_type === "temperature") s.weight = newWeight;
          sensors.push({ sensor_type: "temperature", entity_id: null, weight: newWeight, value: null, unit: null, last_seen_at: null, device_name: null });
        } else {
          sensors.push({ sensor_type: sensorType, entity_id: null, weight: 1.0, value: null, unit: null, last_seen_at: null, device_name: null });
        }
        return { ...prev, sensors };
      }, zone);
    },
    [setSpaceEdit]
  );

  const handleRemoveSensor = useCallback(
    (zoneId: string, zone: ZoneConfigEntry) => (spaceId: string, index: number) => {
      setSpaceEdit(zoneId, spaceId, (prev) => {
        const sensors = prev.sensors.filter((_, i) => i !== index);
        const tempSensors = sensors.filter((s) => s.sensor_type === "temperature");
        if (tempSensors.length > 0) {
          const newWeight = parseFloat((1 / tempSensors.length).toFixed(2));
          for (const s of sensors) if (s.sensor_type === "temperature") s.weight = newWeight;
        }
        return { ...prev, sensors };
      }, zone);
    },
    [setSpaceEdit]
  );

  const handleAutoDistribute = useCallback(
    (zoneId: string, zone: ZoneConfigEntry) => {
      if (!zone || zone.spaces.length === 0) return;
      setSpaceEdits((prev) => {
        const next = new Map(prev);
        const zoneEdits = new Map(next.get(zoneId) || new Map());
        const evenZoneWeight = parseFloat((1 / zone.spaces.length).toFixed(2));
        for (const space of zone.spaces) {
          const current = zoneEdits.get(space.space_id) || {
            zone_weight: space.zone_weight,
            sensors: JSON.parse(JSON.stringify(space.sensors)),
          };
          const sensors = [...current.sensors];
          const tempSensors = sensors.filter((s) => s.sensor_type === "temperature");
          if (tempSensors.length > 0) {
            const evenSensorWeight = parseFloat((1 / tempSensors.length).toFixed(2));
            for (const s of sensors) if (s.sensor_type === "temperature") s.weight = evenSensorWeight;
          }
          zoneEdits.set(space.space_id, { zone_weight: evenZoneWeight, sensors });
        }
        next.set(zoneId, zoneEdits);
        return next;
      });
    },
    []
  );

  const handleSpaceSave = useCallback(
    async (zoneId: string) => {
      if (!zoneConfigData) return;
      const zone = zoneConfigData.zones.find((z) => z.hvac_zone_id === zoneId);
      if (!zone) return;
      const zoneEdits = spaceEdits.get(zoneId);
      if (!zoneEdits || zoneEdits.size === 0) return;

      setSavingZone(zoneId);
      try {
        const spaces = zone.spaces.map((sp) => {
          const edit = zoneEdits.get(sp.space_id);
          return {
            space_id: sp.space_id,
            zone_weight: edit?.zone_weight ?? sp.zone_weight,
            sensors: (edit?.sensors ?? sp.sensors).map((s) => ({
              id: s.id || undefined,
              sensor_type: s.sensor_type,
              entity_id: s.entity_id,
              weight: s.weight,
            })),
          };
        });

        const res = await fetch("/api/zone-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, hvac_zone_id: zoneId, spaces }),
        });

        if (res.ok) {
          setSpaceEdits((prev) => { const next = new Map(prev); next.delete(zoneId); return next; });
          setSavedZone(zoneId);
          setTimeout(() => setSavedZone(null), 2000);
          await fetchZoneConfig();
          await fetchZones();
        } else {
          const err = await res.json();
          alert(err.error || "Save failed");
        }
      } catch (err) {
        console.error("Save failed:", err);
        alert("Save failed");
      }
      setSavingZone(null);
    },
    [zoneConfigData, spaceEdits, siteId, fetchZoneConfig, fetchZones]
  );

  const handleAssignSpace = useCallback(
    async (spaceId: string, equipmentId: string) => {
      setAssigningSpace(spaceId);
      try {
        await fetch("/api/zone-config/assign-space", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, space_id: spaceId, equipment_id: equipmentId }),
        });
        await fetchZoneConfig();
        await fetchZones();
      } catch (err) {
        console.error("Assign space failed:", err);
      }
      setAssigningSpace(null);
    },
    [siteId, fetchZoneConfig, fetchZones]
  );

  const handleRemoveSpace = useCallback(
    async (spaceId: string) => {
      setAssigningSpace(spaceId);
      try {
        await fetch("/api/zone-config/assign-space", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId, space_id: spaceId, equipment_id: null }),
        });
        await fetchZoneConfig();
        await fetchZones();
      } catch (err) {
        console.error("Remove space failed:", err);
      }
      setAssigningSpace(null);
    },
    [siteId, fetchZoneConfig, fetchZones]
  );

  const isZoneDirty = useCallback(
    (zoneId: string) => {
      const ze = spaceEdits.get(zoneId);
      return ze != null && ze.size > 0;
    },
    [spaceEdits]
  );

  const zoneWeightStatus = useCallback(
    (zoneId: string, zone: ZoneConfigEntry) => {
      const spaces = zone.spaces.map((sp) => getSpaceData(zoneId, sp));
      const weights = spaces.filter((s) => s.zone_weight != null);
      if (weights.length === 0) return { sum: 0, valid: true };
      const sum = weights.reduce((acc, s) => acc + (s.zone_weight || 0), 0);
      return { sum, valid: Math.abs(sum - 1.0) < 0.01 };
    },
    [getSpaceData]
  );

  // ── Zone add/edit modal handlers (unchanged) ─────────────────────

  const handleZoneTypeChange = (zoneType: string) => {
    const defaults = zoneTypeDefaults[zoneType];
    setFormData({ ...formData, zone_type: zoneType, setpoint_min_f: defaults.min, setpoint_max_f: defaults.max, setpoint_min_unoccupied_f: defaults.minUnocc, setpoint_max_unoccupied_f: defaults.maxUnocc });
  };

  const handleAddZone = async () => {
    const { data: zoneData, error: zoneError } = await supabase
      .from("a_hvac_zones")
      .insert({ site_id: siteId, org_id: orgId, name: formData.zone_name, zone_type: formData.zone_type, control_scope: formData.control_scope, equipment_id: formData.equipment_id || null, thermostat_device_id: formData.thermostat_device_id || null })
      .select()
      .single();
    if (zoneError) { console.error("Error creating zone:", zoneError); return; }
    await supabase.from("b_hvac_zone_setpoints").insert({
      hvac_zone_id: zoneData.hvac_zone_id,
      setpoint_min_f: formData.setpoint_min_f, setpoint_max_f: formData.setpoint_max_f,
      hvac_mode: formData.hvac_mode, fan_mode: formData.fan_mode,
      setpoint_min_unoccupied_f: formData.setpoint_min_unoccupied_f, setpoint_max_unoccupied_f: formData.setpoint_max_unoccupied_f,
      hvac_mode_unoccupied: formData.hvac_mode_unoccupied, fan_mode_unoccupied: formData.fan_mode_unoccupied,
    });
    setShowAddModal(false);
    resetForm();
    fetchZones();
  };

  const handleUpdateZone = async () => {
    if (!editingZone) return;
    await supabase.from("a_hvac_zones").update({ name: formData.zone_name, zone_type: formData.zone_type, control_scope: formData.control_scope, equipment_id: formData.equipment_id || null, thermostat_device_id: formData.thermostat_device_id || null }).eq("hvac_zone_id", editingZone.hvac_zone_id);
    await supabase.from("b_hvac_zone_setpoints").update({ setpoint_min_f: formData.setpoint_min_f, setpoint_max_f: formData.setpoint_max_f, hvac_mode: formData.hvac_mode, fan_mode: formData.fan_mode, setpoint_min_unoccupied_f: formData.setpoint_min_unoccupied_f, setpoint_max_unoccupied_f: formData.setpoint_max_unoccupied_f, hvac_mode_unoccupied: formData.hvac_mode_unoccupied, fan_mode_unoccupied: formData.fan_mode_unoccupied }).eq("hvac_zone_id", editingZone.hvac_zone_id);
    setEditingZone(null);
    resetForm();
    fetchZones();
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!confirm("Are you sure you want to delete this zone?")) return;
    await supabase.from("a_hvac_zones").delete().eq("hvac_zone_id", zoneId);
    fetchZones();
  };

  const resetForm = () => {
    setFormData({ zone_name: "", zone_type: "undefined", control_scope: "open", equipment_id: "", thermostat_device_id: "", setpoint_min_f: 68, setpoint_max_f: 76, hvac_mode: "auto", fan_mode: "auto", setpoint_min_unoccupied_f: 60, setpoint_max_unoccupied_f: 80, hvac_mode_unoccupied: "auto", fan_mode_unoccupied: "auto" });
  };

  const openEditModal = (zone: HvacZone) => {
    setEditingZone(zone);
    setFormData({ zone_name: zone.zone_name, zone_type: zone.zone_type, control_scope: zone.control_scope, equipment_id: zone.equipment_id || "", thermostat_device_id: zone.thermostat_device_id || "", setpoint_min_f: zone.policy_setpoint_min_f || 68, setpoint_max_f: zone.policy_setpoint_max_f || 76, hvac_mode: zone.policy_hvac_mode || "auto", fan_mode: zone.policy_fan_mode || "auto", setpoint_min_unoccupied_f: zone.policy_setpoint_min_unoccupied_f || 55, setpoint_max_unoccupied_f: zone.policy_setpoint_max_unoccupied_f || 85, hvac_mode_unoccupied: zone.policy_hvac_mode_unoccupied || "auto", fan_mode_unoccupied: zone.policy_fan_mode_unoccupied || "auto" });
  };

  // ── Display helpers ──────────────────────────────────────────────

  const formatZoneType = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

  const formatMode = (mode: string) => ({ auto: "Auto", heat: "Heat", cool: "Cool", off: "Off" }[mode] || mode);

  const getModeColor = (mode: string) => {
    switch (mode) {
      case "heat": return "bg-red-100 text-red-800";
      case "cool": return "bg-blue-100 text-blue-800";
      case "auto": return "bg-green-100 text-green-800";
      case "off": return "bg-gray-100 text-gray-600";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getSourceBadge = (zone: HvacZone) => {
    const source = zone.resolved_setpoints?.source;
    const rs = zone.resolved_setpoints;
    let badge;
    if (source === "profile") {
      badge = <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{rs?.profile_name || "Profile"}</span>;
    } else if (source === "zone_override") {
      badge = <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">Custom</span>;
    } else {
      badge = <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-400">defaults</span>;
    }
    const indicators: string[] = [];
    if (rs) {
      if (rs.guardrail_min_f !== 45 || rs.guardrail_max_f !== 95) indicators.push(`${rs.guardrail_min_f}°–${rs.guardrail_max_f}°`);
      if (rs.manager_offset_up_f > 0 || rs.manager_offset_down_f > 0) indicators.push(`±${rs.manager_offset_up_f}°`);
    }
    return (
      <div className="flex flex-col gap-0.5">
        {badge}
        {indicators.length > 0 && <span className="text-[10px] text-gray-400">{indicators.join(" ")}</span>}
      </div>
    );
  };

  // ── Sorting ──────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection("asc"); }
  };

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => {
      const aHasEquipment = a.equipment_id ? 1 : 0;
      const bHasEquipment = b.equipment_id ? 1 : 0;
      if (bHasEquipment !== aHasEquipment) return bHasEquipment - aHasEquipment;
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";
      if (typeof aVal === "string") { aVal = aVal.toLowerCase(); bVal = (bVal as string).toLowerCase(); }
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [zones, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">⇅</span>;
    return <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  // ── Inline editable setpoint cell ───────────────────────────────

  const SetpointCell = ({ zone, field, value, bgClass, textClass }: {
    zone: HvacZone; field: string; value: number | null; bgClass: string; textClass: string;
  }) => {
    const isProfileLinked = !zone.is_override && !!zone.profile_id;
    const isEditing = inlineEdit?.zoneId === zone.hvac_zone_id && inlineEdit?.field === field;
    if (isEditing) {
      return (
        <input
          type="number" autoFocus
          className="w-16 border-2 border-green-400 rounded px-1 py-0.5 text-sm font-mono"
          value={inlineEdit.value}
          onChange={(e) => setInlineEdit({ ...inlineEdit, value: Number(e.target.value) })}
          onBlur={() => saveInlineEdit(zone.hvac_zone_id, field, inlineEdit.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveInlineEdit(zone.hvac_zone_id, field, inlineEdit.value);
            if (e.key === "Escape") setInlineEdit(null);
          }}
        />
      );
    }
    return (
      <span
        className={`font-mono cursor-pointer hover:underline ${textClass} ${isProfileLinked ? "opacity-60" : "font-medium"}`}
        onClick={() => startInlineEdit(zone, field, value ?? 68)}
        title={isProfileLinked ? "Click to override profile" : "Click to edit"}
      >
        {value ?? "—"}°
      </span>
    );
  };

  // ── CSV Download ─────────────────────────────────────────────────

  const downloadCSV = () => {
    const headers = ["Zone Name", "Type", "Profile", "Source", "Control Scope", "Occupied Heat (°F)", "Occupied Cool (°F)", "Occupied Mode", "Occupied Fan", "Unoccupied Heat (°F)", "Unoccupied Cool (°F)", "Unoccupied Mode", "Unoccupied Fan", "Equipment", "Serves (Spaces)"];
    const rows = sortedZones.map((zone) => [zone.zone_name, zone.zone_type, zone.resolved_setpoints?.profile_name || (zone.is_override ? "Custom" : "Default"), zone.resolved_setpoints?.source || "unknown", zone.control_scope, zone.policy_setpoint_min_f ?? "", zone.policy_setpoint_max_f ?? "", zone.policy_hvac_mode ?? "", zone.policy_fan_mode ?? "", zone.policy_setpoint_min_unoccupied_f ?? "", zone.policy_setpoint_max_unoccupied_f ?? "", zone.policy_hvac_mode_unoccupied ?? "", zone.policy_fan_mode_unoccupied ?? "", zone.equipment_name ?? "Not linked", zone.served_spaces ?? ""]);
    const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `hvac_zone_setpoints_${new Date().toISOString().split("T")[0]}.csv`);
    link.click();
  };

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="rounded-xl bg-white shadow p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">HVAC Zone Setpoints</h2>
        <div className="flex gap-2">
          <button onClick={downloadCSV} disabled={zones.length === 0} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50">
            Download CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-[#12723A] text-white rounded-lg hover:bg-[#0e5c2e] transition-colors text-sm">
            + Add Zone
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-4">Loading...</p>
      ) : zones.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No HVAC zones configured. Add HVAC equipment first, then zones will be auto-created.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-3 px-2 w-6"></th>{/* expand toggle */}
                <th className="py-3 px-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort("zone_name")}>Zone <SortIcon field="zone_name" /></th>
                <th className="py-3 px-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort("zone_type")}>Type <SortIcon field="zone_type" /></th>
                <th className="py-3 px-2 font-semibold">Profile</th>
                <th className="py-3 px-2 font-semibold text-center border-l bg-green-50" colSpan={3}><span className="text-green-700">Occupied (Open)</span></th>
                <th className="py-3 px-2 font-semibold text-center border-l bg-gray-50" colSpan={3}><span className="text-gray-600">Unoccupied (Closed)</span></th>
                <th className="py-3 px-2 font-semibold border-l">Control</th>
                <th className="py-3 px-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort("equipment_name")}>Equipment <SortIcon field="equipment_name" /></th>
                <th className="py-3 px-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort("space_count")}>Serves <SortIcon field="space_count" /></th>
                <th className="py-3 px-2 font-semibold">Actions</th>
              </tr>
              <tr className="text-left border-b text-xs text-gray-500">
                <th></th><th></th><th></th><th></th>
                <th className="py-1 px-2 border-l bg-green-50">Heat</th>
                <th className="py-1 px-2 bg-green-50">Cool</th>
                <th className="py-1 px-2 bg-green-50">Mode</th>
                <th className="py-1 px-2 border-l bg-gray-50">Heat</th>
                <th className="py-1 px-2 bg-gray-50">Cool</th>
                <th className="py-1 px-2 bg-gray-50">Mode</th>
                <th className="border-l"></th><th></th><th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {sortedZones.map((zone) => {
                const isOpen = zone.control_scope === "open";
                const isSaved = savedZoneId === zone.hvac_zone_id;
                const isExpanded = expandedZones.has(zone.hvac_zone_id);
                const configZone = zoneConfigData?.zones.find((z) => z.hvac_zone_id === zone.hvac_zone_id);
                const spaceNames = zone.served_spaces
                  ? zone.served_spaces.split(",").map((s) => s.trim()).filter(Boolean)
                  : [];

                return (
                  <React.Fragment key={zone.hvac_zone_id}>
                    {/* ── Main zone row ── */}
                    <tr
                      className={`border-b hover:bg-gray-50 transition-all ${isOpen ? "bg-yellow-50/50" : ""} ${isSaved ? "ring-2 ring-green-400 ring-inset" : ""}`}
                    >
                      {/* Expand toggle */}
                      <td className="py-3 px-2">
                        <button
                          onClick={() => toggleZoneExpand(zone.hvac_zone_id)}
                          className="text-gray-400 hover:text-gray-700 transition-colors"
                          title={isExpanded ? "Collapse spaces" : "Manage spaces"}
                        >
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />
                          }
                        </button>
                      </td>
                      <td className="py-3 px-2 font-medium">{zone.zone_name}</td>
                      <td className="py-3 px-2">
                        <span className={`text-xs px-2 py-1 rounded ${zone.zone_type === "customer" ? "bg-blue-100 text-blue-800" : zone.zone_type === "employee" ? "bg-amber-100 text-amber-800" : zone.zone_type === "storage" ? "bg-gray-100 text-gray-800" : "bg-orange-100 text-orange-800"}`}>
                          {zone.zone_type === "undefined" ? "Undefined" : formatZoneType(zone.zone_type)}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex flex-col gap-1">
                          <select
                            className="text-xs border rounded px-1 py-0.5 max-w-[120px]"
                            value={!zone.is_override && zone.profile_id ? zone.profile_id : "__custom__"}
                            onChange={(e) => handleProfileChange(zone.hvac_zone_id, e.target.value, zone.is_override)}
                          >
                            <option value="__custom__">Custom Override</option>
                            {profiles.map((p) => <option key={p.profile_id} value={p.profile_id}>{p.profile_name}</option>)}
                          </select>
                          {getSourceBadge(zone)}
                        </div>
                      </td>
                      {/* Occupied Heat */}
                      <td className={`py-3 px-2 border-l ${isOpen ? "bg-yellow-50/50" : "bg-green-50/30"}`}>
                        <SetpointCell zone={zone} field="occ_heat" value={zone.policy_setpoint_min_f} bgClass={isOpen ? "bg-yellow-50/50" : "bg-green-50/30"} textClass={isOpen ? "text-gray-400" : "text-green-700"} />
                      </td>
                      {/* Occupied Cool */}
                      <td className={`py-3 px-2 ${isOpen ? "bg-yellow-50/50" : "bg-green-50/30"}`}>
                        <SetpointCell zone={zone} field="occ_cool" value={zone.policy_setpoint_max_f} bgClass={isOpen ? "bg-yellow-50/50" : "bg-green-50/30"} textClass={isOpen ? "text-gray-400" : "text-green-700"} />
                      </td>
                      {/* Occupied Mode */}
                      <td className={`py-3 px-2 ${isOpen ? "bg-yellow-50/50" : "bg-green-50/30"}`}>
                        <span className={`text-xs px-2 py-0.5 rounded ${isOpen ? "bg-gray-100 text-gray-400" : getModeColor(zone.policy_hvac_mode || "auto")}`}>{formatMode(zone.policy_hvac_mode || "auto")}</span>
                      </td>
                      {/* Unoccupied Heat */}
                      <td className={`py-3 px-2 border-l ${isOpen ? "bg-yellow-50/50" : "bg-gray-50/50"}`}>
                        <SetpointCell zone={zone} field="unocc_heat" value={zone.policy_setpoint_min_unoccupied_f} bgClass={isOpen ? "bg-yellow-50/50" : "bg-gray-50/50"} textClass={isOpen ? "text-gray-400" : "text-gray-600"} />
                      </td>
                      {/* Unoccupied Cool */}
                      <td className={`py-3 px-2 ${isOpen ? "bg-yellow-50/50" : "bg-gray-50/50"}`}>
                        <SetpointCell zone={zone} field="unocc_cool" value={zone.policy_setpoint_max_unoccupied_f} bgClass={isOpen ? "bg-yellow-50/50" : "bg-gray-50/50"} textClass={isOpen ? "text-gray-400" : "text-gray-600"} />
                      </td>
                      {/* Unoccupied Mode */}
                      <td className={`py-3 px-2 ${isOpen ? "bg-yellow-50/50" : "bg-gray-50/50"}`}>
                        <span className={`text-xs px-2 py-0.5 rounded ${isOpen ? "bg-gray-100 text-gray-400" : getModeColor(zone.policy_hvac_mode_unoccupied || "auto")}`}>{formatMode(zone.policy_hvac_mode_unoccupied || "auto")}</span>
                      </td>
                      {/* Control */}
                      <td className="py-3 px-2 border-l">
                        {isOpen
                          ? <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">Open</span>
                          : <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">Managed</span>
                        }
                      </td>
                      {/* Equipment */}
                      <td className="py-3 px-2">
                        {zone.equipment_name && zone.equipment_id
                          ? <a href={`/sites/${siteId}/equipment/${zone.equipment_id}/individual-equipment`} className="text-blue-700 hover:underline">{zone.equipment_name}</a>
                          : <span className="text-gray-400 italic">Not linked</span>
                        }
                      </td>
                      {/* Serves — space name chips, clickable to expand */}
                      <td className="py-3 px-2 max-w-[200px]">
                        {spaceNames.length > 0 ? (
                          <button
                            onClick={() => toggleZoneExpand(zone.hvac_zone_id)}
                            className="flex flex-wrap gap-1 text-left group"
                            title="Click to manage spaces"
                          >
                            {spaceNames.map((name) => (
                              <span
                                key={name}
                                className="inline-block text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 group-hover:bg-indigo-100 transition-colors"
                              >
                                {name}
                              </span>
                            ))}
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleZoneExpand(zone.hvac_zone_id)}
                            className="text-xs text-gray-400 hover:text-indigo-600 italic transition-colors"
                            title="Click to assign spaces"
                          >
                            + assign spaces
                          </button>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="py-3 px-2">
                        <button onClick={() => openEditModal(zone)} className="text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                        <button onClick={() => handleDeleteZone(zone.hvac_zone_id)} className="text-red-600 hover:text-red-800">Delete</button>
                      </td>
                    </tr>

                    {/* ── Inline space management panel ── */}
                    {isExpanded && (
                      <tr key={`${zone.hvac_zone_id}-spaces`} className="border-b bg-slate-50">
                        <td colSpan={15} className="px-6 py-4">
                          <div className="border border-indigo-100 rounded-lg bg-white shadow-sm overflow-hidden">
                            {/* Panel header */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border-b border-indigo-100">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-indigo-800">
                                  Space Configuration — {zone.zone_name}
                                </span>
                                {configZone && (
                                  <span className="text-xs text-indigo-500">
                                    {configZone.spaces.length} space{configZone.spaces.length !== 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => toggleZoneExpand(zone.hvac_zone_id)}
                                className="text-indigo-400 hover:text-indigo-700 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="p-4">
                              {zoneConfigLoading ? (
                                <p className="text-sm text-gray-400">Loading space data...</p>
                              ) : !configZone ? (
                                <p className="text-sm text-gray-400 italic">No space configuration found for this zone.</p>
                              ) : configZone.spaces.length === 0 ? (
                                <p className="text-sm text-gray-400 italic">No spaces assigned yet.</p>
                              ) : (
                                <div className="space-y-3">
                                  {/* Weight bar */}
                                  <ZoneWeightBar
                                    spaces={configZone.spaces.map((sp) => {
                                      const edited = getSpaceData(zone.hvac_zone_id, sp);
                                      return { name: edited.name, zone_weight: edited.zone_weight, computed_temp: edited.computed_temp };
                                    })}
                                  />

                                  {/* Space sensor panels */}
                                  {configZone.spaces.map((space) => (
                                    <SpaceSensorPanel
                                      key={space.space_id}
                                      space={getSpaceData(zone.hvac_zone_id, space)}
                                      availableEntities={zoneConfigData!.available_entities}
                                      thermostatTemp={configZone.thermostat?.temp_f ?? null}
                                      onZoneWeightChange={handleZoneWeightChange(zone.hvac_zone_id, configZone)}
                                      onSensorChange={handleSensorChange(zone.hvac_zone_id, configZone)}
                                      onAddSensor={handleAddSensor(zone.hvac_zone_id, configZone)}
                                      onRemoveSensor={handleRemoveSensor(zone.hvac_zone_id, configZone)}
                                    />
                                  ))}

                                  {/* Footer: weights + save */}
                                  {(() => {
                                    const ws = zoneWeightStatus(zone.hvac_zone_id, configZone);
                                    const dirty = isZoneDirty(zone.hvac_zone_id);
                                    return (
                                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                                        <div className="flex items-center gap-4 text-xs">
                                          {configZone.computed_zone_temp != null && (
                                            <span className="text-gray-600">
                                              Zone Temp: <span className="font-mono font-medium">{configZone.computed_zone_temp}°F</span>
                                              <span className="text-gray-400 ml-1">(weighted avg)</span>
                                            </span>
                                          )}
                                          {ws.sum > 0 && (
                                            <span className={ws.valid ? "text-green-600" : "text-amber-600"}>
                                              Zone Weights: {(ws.sum * 100).toFixed(0)}%{ws.valid ? " ✓" : " — should total 100%"}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => handleAutoDistribute(zone.hvac_zone_id, configZone)}
                                            className="px-3 py-1 rounded text-xs border text-gray-600 hover:bg-gray-50"
                                          >
                                            Auto-Distribute
                                          </button>
                                          <button
                                            onClick={() => handleSpaceSave(zone.hvac_zone_id)}
                                            disabled={!dirty || savingZone === zone.hvac_zone_id}
                                            className={`px-3 py-1 rounded text-xs font-medium ${
                                              savedZone === zone.hvac_zone_id
                                                ? "bg-green-100 text-green-700"
                                                : dirty
                                                ? "bg-gradient-to-r from-[#00a859] to-[#d4af37] text-white hover:opacity-90"
                                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                                            } disabled:opacity-50`}
                                          >
                                            {savingZone === zone.hvac_zone_id ? "Saving..." : savedZone === zone.hvac_zone_id ? "Saved!" : "Save"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* Assign / remove spaces */}
                              <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t">
                                {zoneConfigData?.unassigned_spaces && zoneConfigData.unassigned_spaces.length > 0 && zone.equipment_id && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-400">Assign space:</span>
                                    <select
                                      value=""
                                      onChange={(e) => { if (e.target.value) handleAssignSpace(e.target.value, zone.equipment_id!); }}
                                      disabled={assigningSpace != null}
                                      className="border rounded px-2 py-1 text-xs bg-white"
                                    >
                                      <option value="">+ Add space...</option>
                                      {zoneConfigData.unassigned_spaces.map((sp) => (
                                        <option key={sp.space_id} value={sp.space_id}>{sp.name} ({sp.space_type})</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {configZone && configZone.spaces.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {configZone.spaces.map((sp) => (
                                      <button
                                        key={sp.space_id}
                                        onClick={() => handleRemoveSpace(sp.space_id)}
                                        disabled={assigningSpace === sp.space_id}
                                        className="text-[10px] px-2 py-0.5 rounded border text-gray-400 hover:text-red-500 hover:border-red-300 disabled:opacity-50"
                                        title={`Remove ${sp.name} from zone`}
                                      >
                                        {sp.name} ×
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal (unchanged) */}
      {(showAddModal || editingZone) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">{editingZone ? "Edit HVAC Zone" : "Add HVAC Zone"}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zone Name</label>
                  <input type="text" value={formData.zone_name} onChange={(e) => setFormData({ ...formData, zone_name: e.target.value })} placeholder="e.g., Kitchen RTU" className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">HVAC Equipment</label>
                  <select value={formData.equipment_id} onChange={(e) => setFormData({ ...formData, equipment_id: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">— Select —</option>
                    {availableEquipment.map((eq) => <option key={eq.equipment_id} value={eq.equipment_id}>{eq.equipment_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zone Type</label>
                  <select value={formData.zone_type} onChange={(e) => handleZoneTypeChange(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                    <option value="undefined">Undefined (needs classification)</option>
                    <option value="customer">Customer</option>
                    <option value="employee">Employee</option>
                    <option value="storage">Storage</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thermostat Device</label>
                <select value={formData.thermostat_device_id} onChange={(e) => setFormData({ ...formData, thermostat_device_id: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                  <option value="">— Select Thermostat —</option>
                  {availableThermostats.map((t) => <option key={t.ha_device_id} value={t.device_id}>{t.device_name}</option>)}
                </select>
                {availableThermostats.length === 0 && <p className="text-xs text-gray-500 mt-1">No climate devices found. Sync devices from Home Assistant first.</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 bg-green-50/50">
                  <h4 className="font-semibold text-green-700 mb-3">Occupied (Open Hours)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Heat (°F)</label><input type="number" value={formData.setpoint_min_f} onChange={(e) => setFormData({ ...formData, setpoint_min_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Cool (°F)</label><input type="number" value={formData.setpoint_max_f} onChange={(e) => setFormData({ ...formData, setpoint_max_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">HVAC Mode</label><select value={formData.hvac_mode} onChange={(e) => setFormData({ ...formData, hvac_mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm"><option value="auto">Auto</option><option value="heat">Heat Only</option><option value="cool">Cool Only</option><option value="off">Off</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Fan Mode</label><select value={formData.fan_mode} onChange={(e) => setFormData({ ...formData, fan_mode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm"><option value="auto">Auto</option><option value="on">Always On</option></select></div>
                  </div>
                </div>
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold text-gray-600 mb-3">Unoccupied (Closed Hours)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Heat (°F)</label><input type="number" value={formData.setpoint_min_unoccupied_f} onChange={(e) => setFormData({ ...formData, setpoint_min_unoccupied_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Cool (°F)</label><input type="number" value={formData.setpoint_max_unoccupied_f} onChange={(e) => setFormData({ ...formData, setpoint_max_unoccupied_f: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">HVAC Mode</label><select value={formData.hvac_mode_unoccupied} onChange={(e) => setFormData({ ...formData, hvac_mode_unoccupied: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm"><option value="auto">Auto</option><option value="heat">Heat Only</option><option value="cool">Cool Only</option><option value="off">Off</option></select></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Fan Mode</label><select value={formData.fan_mode_unoccupied} onChange={(e) => setFormData({ ...formData, fan_mode_unoccupied: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm"><option value="auto">Auto</option><option value="on">Always On</option><option value="off">Off</option></select></div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Control Scope</label>
                <select value={formData.control_scope} onChange={(e) => setFormData({ ...formData, control_scope: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                  <option value="managed">Managed</option>
                  <option value="open">Open</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowAddModal(false); setEditingZone(null); resetForm(); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={editingZone ? handleUpdateZone : handleAddZone} disabled={!formData.zone_name} className="px-4 py-2 bg-[#12723A] text-white rounded-lg hover:bg-[#0e5c2e] disabled:bg-gray-300">{editingZone ? "Save Changes" : "Add Zone"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
