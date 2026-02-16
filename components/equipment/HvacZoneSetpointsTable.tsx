"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

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
  // Policy: Occupied
  policy_setpoint_min_f: number | null;
  policy_setpoint_max_f: number | null;
  policy_hvac_mode: string | null;
  policy_fan_mode: string | null;
  // Policy: Unoccupied
  policy_setpoint_min_unoccupied_f: number | null;
  policy_setpoint_max_unoccupied_f: number | null;
  policy_hvac_mode_unoccupied: string | null;
  policy_fan_mode_unoccupied: string | null;
  // Limits
  hard_min_f: number | null;
  hard_max_f: number | null;
  // Actual state from thermostat
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
  // Spaces
  space_count: number;
  served_spaces: string | null;
}

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
    // Occupied
    setpoint_min_f: 68,
    setpoint_max_f: 76,
    hvac_mode: "auto",
    fan_mode: "auto",
    // Unoccupied
    setpoint_min_unoccupied_f: 60,
    setpoint_max_unoccupied_f: 80,
    hvac_mode_unoccupied: "auto",
    fan_mode_unoccupied: "auto",
  });

  // Available HVAC equipment (for dropdown)
  const [availableEquipment, setAvailableEquipment] = useState<
    { equipment_id: string; equipment_name: string }[]
  >([]);

  // Available thermostat devices (for dropdown)
  const [availableThermostats, setAvailableThermostats] = useState<
    { device_id: string; device_name: string; ha_device_id: string }[]
  >([]);

  const zoneTypeDefaults: Record<string, { 
    min: number; max: number; 
    minUnocc: number; maxUnocc: number 
  }> = {
    undefined: { min: 68, max: 76, minUnocc: 60, maxUnocc: 80 },
    customer: { min: 70, max: 74, minUnocc: 60, maxUnocc: 80 },
    employee: { min: 68, max: 76, minUnocc: 55, maxUnocc: 85 },
    storage: { min: 55, max: 85, minUnocc: 50, maxUnocc: 90 },
  };

  useEffect(() => {
    const initZones = async () => {
      // Fetch available HVAC equipment
      const { data: equipment } = await supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name")
        .eq("site_id", siteId)
        .eq("equipment_group", "HVAC")
        .order("equipment_name");

      setAvailableEquipment(equipment || []);

      // Fetch available thermostat devices (climate entities)
      // First get devices that have climate entities
      const { data: climateEntities } = await supabase
        .from("b_entity_sync")
        .select("ha_device_id, ha_device_name")
        .eq("site_id", siteId)
        .like("entity_id", "climate.%");

      if (climateEntities && climateEntities.length > 0) {
        const haDeviceIds = [...new Set(climateEntities.map(e => e.ha_device_id))];
        
        // Get our device records for these HA devices
        const { data: devices } = await supabase
          .from("a_devices")
          .select("device_id, device_name, ha_device_id")
          .eq("site_id", siteId)
          .in("ha_device_id", haDeviceIds);

        // Combine: use our device name if mapped, otherwise HA name
        const thermostats = haDeviceIds.map(haId => {
          const device = devices?.find(d => d.ha_device_id === haId);
          const entity = climateEntities.find(e => e.ha_device_id === haId);
          return {
            device_id: device?.device_id || "",
            device_name: device?.device_name || entity?.ha_device_name || "Unknown Thermostat",
            ha_device_id: haId,
          };
        });

        setAvailableThermostats(thermostats);
      }

      // Check if zones exist
      const { data: existingZones } = await supabase
        .from("view_hvac_zones")
        .select("hvac_zone_id")
        .eq("site_id", siteId)
        .limit(1);

      // If no zones, auto-create templates + equipment zones
      if (!existingZones || existingZones.length === 0) {
        await autoCreateZones(equipment || []);
      }

      fetchZones();
    };

    if (orgId) {
      initZones();
    }
  }, [siteId, orgId]);

  const autoCreateZones = async (
    equipment: { equipment_id: string; equipment_name: string }[]
  ) => {
    if (!orgId) return;

    // Get all defaults
    const { data: allDefaults } = await supabase
      .from("library_zone_type_defaults")
      .select("*");

    if (!allDefaults) return;

    const defaultsByType: Record<string, any> = {};
    for (const d of allDefaults) {
      defaultsByType[d.zone_type] = d;
    }

    // 1. Create template zones for each type (unlinked)
    const templateTypes = ["customer", "employee", "storage"];
    for (const zoneType of templateTypes) {
      const defaults = defaultsByType[zoneType];
      if (!defaults) continue;

      const templateName = `${zoneType.charAt(0).toUpperCase() + zoneType.slice(1)} Zone (Template)`;

      const { data: zoneData, error: zoneError } = await supabase
        .from("a_hvac_zones")
        .insert({
          site_id: siteId,
          org_id: orgId,
          name: templateName,
          zone_type: zoneType,
          control_scope: "open",
          equipment_id: null, // Not linked
        })
        .select()
        .single();

      if (zoneError) {
        console.error("Error creating template zone:", zoneError);
        continue;
      }

      await supabase.from("b_hvac_zone_setpoints").insert({
        hvac_zone_id: zoneData.hvac_zone_id,
        setpoint_min_f: defaults.setpoint_min_f,
        setpoint_max_f: defaults.setpoint_max_f,
        hvac_mode: "auto",
        fan_mode: "auto",
        setpoint_min_unoccupied_f: defaults.setpoint_min_unoccupied_f || 60,
        setpoint_max_unoccupied_f: defaults.setpoint_max_unoccupied_f || 80,
        hvac_mode_unoccupied: "auto",
        fan_mode_unoccupied: "auto",
        hard_min_f: defaults.hard_min_f,
        hard_max_f: defaults.hard_max_f,
      });
    }

    // 2. Create zones for each HVAC equipment (linked, but type = undefined)
    const undefinedDefaults = defaultsByType["undefined"] || defaultsByType["employee"];

    for (const equip of equipment) {
      const { data: zoneData, error: zoneError } = await supabase
        .from("a_hvac_zones")
        .insert({
          site_id: siteId,
          org_id: orgId,
          name: equip.equipment_name,
          zone_type: "undefined", // Needs classification
          control_scope: "managed",
          equipment_id: equip.equipment_id,
        })
        .select()
        .single();

      if (zoneError) {
        console.error("Error creating equipment zone:", zoneError);
        continue;
      }

      await supabase.from("b_hvac_zone_setpoints").insert({
        hvac_zone_id: zoneData.hvac_zone_id,
        setpoint_min_f: undefinedDefaults.setpoint_min_f,
        setpoint_max_f: undefinedDefaults.setpoint_max_f,
        hvac_mode: "auto",
        fan_mode: "auto",
        setpoint_min_unoccupied_f: undefinedDefaults.setpoint_min_unoccupied_f || 60,
        setpoint_max_unoccupied_f: undefinedDefaults.setpoint_max_unoccupied_f || 80,
        hvac_mode_unoccupied: "auto",
        fan_mode_unoccupied: "auto",
        hard_min_f: undefinedDefaults.hard_min_f,
        hard_max_f: undefinedDefaults.hard_max_f,
      });
    }
  };

  const fetchZones = async () => {
    const { data, error } = await supabase
      .from("view_hvac_zones_with_state")
      .select("*")
      .eq("site_id", siteId)
      .order("zone_name");

    if (error) {
      console.error("Error fetching HVAC zones:", error);
    } else {
      setZones(data || []);
    }
    setLoading(false);
  };

  const handleZoneTypeChange = (zoneType: string) => {
    const defaults = zoneTypeDefaults[zoneType];
    setFormData({
      ...formData,
      zone_type: zoneType,
      setpoint_min_f: defaults.min,
      setpoint_max_f: defaults.max,
      setpoint_min_unoccupied_f: defaults.minUnocc,
      setpoint_max_unoccupied_f: defaults.maxUnocc,
    });
  };

  const handleAddZone = async () => {
    const { data: zoneData, error: zoneError } = await supabase
      .from("a_hvac_zones")
      .insert({
        site_id: siteId,
        org_id: orgId,
        name: formData.zone_name,
        zone_type: formData.zone_type,
        control_scope: formData.control_scope,
        equipment_id: formData.equipment_id || null,
        thermostat_device_id: formData.thermostat_device_id || null,
      })
      .select()
      .single();

    if (zoneError) {
      console.error("Error creating zone:", zoneError);
      return;
    }

    const { error: setpointError } = await supabase
      .from("b_hvac_zone_setpoints")
      .insert({
        hvac_zone_id: zoneData.hvac_zone_id,
        setpoint_min_f: formData.setpoint_min_f,
        setpoint_max_f: formData.setpoint_max_f,
        hvac_mode: formData.hvac_mode,
        fan_mode: formData.fan_mode,
        setpoint_min_unoccupied_f: formData.setpoint_min_unoccupied_f,
        setpoint_max_unoccupied_f: formData.setpoint_max_unoccupied_f,
        hvac_mode_unoccupied: formData.hvac_mode_unoccupied,
        fan_mode_unoccupied: formData.fan_mode_unoccupied,
      });

    if (setpointError) {
      console.error("Error creating setpoints:", setpointError);
      return;
    }

    setShowAddModal(false);
    resetForm();
    fetchZones();
  };

  const handleUpdateZone = async () => {
    if (!editingZone) return;

    const { error: zoneError } = await supabase
      .from("a_hvac_zones")
      .update({
        name: formData.zone_name,
        zone_type: formData.zone_type,
        control_scope: formData.control_scope,
        equipment_id: formData.equipment_id || null,
        thermostat_device_id: formData.thermostat_device_id || null,
      })
      .eq("hvac_zone_id", editingZone.hvac_zone_id);

    if (zoneError) {
      console.error("Error updating zone:", zoneError);
      return;
    }

    const { error: setpointError } = await supabase
      .from("b_hvac_zone_setpoints")
      .update({
        setpoint_min_f: formData.setpoint_min_f,
        setpoint_max_f: formData.setpoint_max_f,
        hvac_mode: formData.hvac_mode,
        fan_mode: formData.fan_mode,
        setpoint_min_unoccupied_f: formData.setpoint_min_unoccupied_f,
        setpoint_max_unoccupied_f: formData.setpoint_max_unoccupied_f,
        hvac_mode_unoccupied: formData.hvac_mode_unoccupied,
        fan_mode_unoccupied: formData.fan_mode_unoccupied,
      })
      .eq("hvac_zone_id", editingZone.hvac_zone_id);

    if (setpointError) {
      console.error("Error updating setpoints:", setpointError);
      return;
    }

    setEditingZone(null);
    resetForm();
    fetchZones();
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!confirm("Are you sure you want to delete this zone?")) return;

    const { error } = await supabase
      .from("a_hvac_zones")
      .delete()
      .eq("hvac_zone_id", zoneId);

    if (error) {
      console.error("Error deleting zone:", error);
      return;
    }

    fetchZones();
  };

  const resetForm = () => {
    setFormData({
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
  };

  const openEditModal = (zone: HvacZone) => {
    setEditingZone(zone);
    setFormData({
      zone_name: zone.zone_name,
      zone_type: zone.zone_type,
      control_scope: zone.control_scope,
      equipment_id: zone.equipment_id || "",
      thermostat_device_id: zone.thermostat_device_id || "",
      setpoint_min_f: zone.policy_setpoint_min_f || 68,
      setpoint_max_f: zone.policy_setpoint_max_f || 76,
      hvac_mode: zone.policy_hvac_mode || "auto",
      fan_mode: zone.policy_fan_mode || "auto",
      setpoint_min_unoccupied_f: zone.policy_setpoint_min_unoccupied_f || 55,
      setpoint_max_unoccupied_f: zone.policy_setpoint_max_unoccupied_f || 85,
      hvac_mode_unoccupied: zone.policy_hvac_mode_unoccupied || "auto",
      fan_mode_unoccupied: zone.policy_fan_mode_unoccupied || "auto",
    });
  };

  const formatZoneType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const formatMode = (mode: string) => {
    const modes: Record<string, string> = {
      auto: "Auto",
      heat: "Heat",
      cool: "Cool",
      off: "Off",
    };
    return modes[mode] || mode;
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case "heat": return "bg-red-100 text-red-800";
      case "cool": return "bg-blue-100 text-blue-800";
      case "auto": return "bg-green-100 text-green-800";
      case "off": return "bg-gray-100 text-gray-600";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  // Sorting logic
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => {
      // First: Equipment-linked zones before templates
      const aHasEquipment = a.equipment_id ? 1 : 0;
      const bHasEquipment = b.equipment_id ? 1 : 0;
      if (bHasEquipment !== aHasEquipment) {
        return bHasEquipment - aHasEquipment; // Equipment-linked first
      }

      // Then sort by selected field
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle nulls
      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      // String comparison
      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [zones, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="text-gray-300 ml-1">↕</span>;
    }
    return <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  // CSV Download
  const downloadCSV = () => {
    const headers = [
      "Zone Name",
      "Type",
      "Control Scope",
      "Occupied Min (°F)",
      "Occupied Max (°F)",
      "Occupied Mode",
      "Occupied Fan",
      "Unoccupied Min (°F)",
      "Unoccupied Max (°F)",
      "Unoccupied Mode",
      "Unoccupied Fan",
      "Equipment",
      "Serves (Spaces)"
    ];

    const rows = sortedZones.map(zone => [
      zone.zone_name,
      zone.zone_type,
      zone.control_scope,
      zone.policy_setpoint_min_f ?? "",
      zone.policy_setpoint_max_f ?? "",
      zone.policy_hvac_mode ?? "",
      zone.policy_fan_mode ?? "",
      zone.policy_setpoint_min_unoccupied_f ?? "",
      zone.policy_setpoint_max_unoccupied_f ?? "",
      zone.policy_hvac_mode_unoccupied ?? "",
      zone.policy_fan_mode_unoccupied ?? "",
      zone.equipment_name ?? "Not linked",
      zone.served_spaces ?? ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `hvac_zone_setpoints_${new Date().toISOString().split("T")[0]}.csv`);
    link.click();
  };

  return (
    <div className="rounded-xl bg-white shadow p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">HVAC Zone Setpoints</h2>
        <div className="flex gap-2">
          <button
            onClick={downloadCSV}
            disabled={zones.length === 0}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
          >
            📥 Download CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-[#12723A] text-white rounded-lg hover:bg-[#0e5c2e] transition-colors text-sm"
          >
            + Add Zone
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-4">Loading...</p>
      ) : zones.length === 0 ? (
        <p className="text-gray-500 text-center py-4">
          No HVAC zones configured. Add HVAC equipment first, then zones will be auto-created.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th 
                  className="py-3 px-2 font-semibold cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("zone_name")}
                >
                  Zone <SortIcon field="zone_name" />
                </th>
                <th 
                  className="py-3 px-2 font-semibold cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("zone_type")}
                >
                  Type <SortIcon field="zone_type" />
                </th>
                <th className="py-3 px-2 font-semibold text-center border-l bg-green-50" colSpan={3}>
                  <span className="text-green-700">Occupied (Open)</span>
                </th>
                <th className="py-3 px-2 font-semibold text-center border-l bg-gray-50" colSpan={3}>
                  <span className="text-gray-600">Unoccupied (Closed)</span>
                </th>
                <th className="py-3 px-2 font-semibold border-l">Control</th>
                <th 
                  className="py-3 px-2 font-semibold cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("equipment_name")}
                >
                  Equipment <SortIcon field="equipment_name" />
                </th>
                <th 
                  className="py-3 px-2 font-semibold cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort("space_count")}
                >
                  Serves <SortIcon field="space_count" />
                </th>
                <th className="py-3 px-2 font-semibold">Actions</th>
              </tr>
              <tr className="text-left border-b text-xs text-gray-500">
                <th></th>
                <th></th>
                <th className="py-1 px-2 border-l bg-green-50">Range</th>
                <th className="py-1 px-2 bg-green-50">Mode</th>
                <th className="py-1 px-2 bg-green-50">Fan</th>
                <th className="py-1 px-2 border-l bg-gray-50">Range</th>
                <th className="py-1 px-2 bg-gray-50">Mode</th>
                <th className="py-1 px-2 bg-gray-50">Fan</th>
                <th className="border-l"></th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedZones.map((zone) => {
                const isOpen = zone.control_scope === "open";
                return (
                <tr 
                  key={zone.hvac_zone_id} 
                  className={`border-b hover:bg-gray-50 ${isOpen ? "bg-yellow-50/50" : ""}`}
                >
                  <td className="py-3 px-2 font-medium">{zone.zone_name}</td>
                  <td className="py-3 px-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        zone.zone_type === "customer"
                          ? "bg-blue-100 text-blue-800"
                          : zone.zone_type === "employee"
                          ? "bg-amber-100 text-amber-800"
                          : zone.zone_type === "storage"
                          ? "bg-gray-100 text-gray-800"
                          : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {zone.zone_type === "undefined" ? "⚠️ Undefined" : formatZoneType(zone.zone_type)}
                    </span>
                  </td>
                  {/* Occupied */}
                  <td className={`py-3 px-2 border-l ${isOpen ? "bg-yellow-50/50" : "bg-green-50/30"}`}>
                    <span className={`font-mono font-medium ${isOpen ? "text-gray-400" : "text-green-700"}`}>
                      {zone.policy_setpoint_min_f}° - {zone.policy_setpoint_max_f}°F
                    </span>
                  </td>
                  <td className={`py-3 px-2 ${isOpen ? "bg-yellow-50/50" : "bg-green-50/30"}`}>
                    <span className={`text-xs px-2 py-0.5 rounded ${isOpen ? "bg-gray-100 text-gray-400" : getModeColor(zone.policy_hvac_mode || "auto")}`}>
                      {formatMode(zone.policy_hvac_mode || "auto")}
                    </span>
                  </td>
                  <td className={`py-3 px-2 ${isOpen ? "bg-yellow-50/50" : "bg-green-50/30"}`}>
                    <span className={`text-xs ${isOpen ? "text-gray-400" : "text-gray-600"}`}>
                      {zone.policy_fan_mode === "on" ? "On" : "Auto"}
                    </span>
                  </td>
                  {/* Unoccupied */}
                  <td className={`py-3 px-2 border-l ${isOpen ? "bg-yellow-50/50" : "bg-gray-50/50"}`}>
                    <span className={`font-mono font-medium ${isOpen ? "text-gray-400" : "text-gray-600"}`}>
                      {zone.policy_setpoint_min_unoccupied_f}° - {zone.policy_setpoint_max_unoccupied_f}°F
                    </span>
                  </td>
                  <td className={`py-3 px-2 ${isOpen ? "bg-yellow-50/50" : "bg-gray-50/50"}`}>
                    <span className={`text-xs px-2 py-0.5 rounded ${isOpen ? "bg-gray-100 text-gray-400" : getModeColor(zone.policy_hvac_mode_unoccupied || "auto")}`}>
                      {formatMode(zone.policy_hvac_mode_unoccupied || "auto")}
                    </span>
                  </td>
                  <td className={`py-3 px-2 ${isOpen ? "bg-yellow-50/50" : "bg-gray-50/50"}`}>
                    <span className={`text-xs ${isOpen ? "text-gray-400" : "text-gray-600"}`}>
                      {zone.policy_fan_mode_unoccupied === "on" ? "On" : zone.policy_fan_mode_unoccupied === "off" ? "Off" : "Auto"}
                    </span>
                  </td>
                  {/* Control */}
                  <td className="py-3 px-2 border-l">
                    {isOpen ? (
                      <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                        🔓 Open
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">
                        🔒 Managed
                      </span>
                    )}
                  </td>
                  {/* Equipment */}
                  <td className="py-3 px-2">
                    {zone.equipment_name && zone.equipment_id ? (
                      <a
                        href={`/sites/${siteId}/equipment/${zone.equipment_id}/individual-equipment`}
                        className="text-blue-700 hover:underline"
                      >
                        {zone.equipment_name}
                      </a>
                    ) : (
                      <span className="text-gray-400 italic">Not linked</span>
                    )}
                  </td>
                  {/* Serves */}
                  <td className="py-3 px-2">
                    {zone.served_spaces ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help text-gray-600">
                              {zone.space_count} space{zone.space_count !== 1 ? "s" : ""}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-gray-900 text-white px-3 py-2 rounded max-w-xs">
                            <p className="text-xs">{zone.served_spaces}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  {/* Actions */}
                  <td className="py-3 px-2">
                    <button
                      onClick={() => openEditModal(zone)}
                      className="text-blue-600 hover:text-blue-800 mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteZone(zone.hvac_zone_id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingZone) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingZone ? "Edit HVAC Zone" : "Add HVAC Zone"}
            </h3>

            <div className="space-y-4">
              {/* Row 1: Name, Equipment, Type */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zone Name
                  </label>
                  <input
                    type="text"
                    value={formData.zone_name}
                    onChange={(e) => setFormData({ ...formData, zone_name: e.target.value })}
                    placeholder="e.g., Kitchen RTU"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    HVAC Equipment
                  </label>
                  <select
                    value={formData.equipment_id}
                    onChange={(e) => setFormData({ ...formData, equipment_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">— Select —</option>
                    {availableEquipment.map((eq) => (
                      <option key={eq.equipment_id} value={eq.equipment_id}>
                        {eq.equipment_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zone Type
                  </label>
                  <select
                    value={formData.zone_type}
                    onChange={(e) => handleZoneTypeChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="undefined">⚠️ Undefined (needs classification)</option>
                    <option value="customer">Customer</option>
                    <option value="employee">Employee</option>
                    <option value="storage">Storage</option>
                  </select>
                </div>
              </div>

              {/* Thermostat Device */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🌡️ Thermostat Device
                </label>
                <select
                  value={formData.thermostat_device_id}
                  onChange={(e) => setFormData({ ...formData, thermostat_device_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">— Select Thermostat —</option>
                  {availableThermostats.map((t) => (
                    <option key={t.ha_device_id} value={t.device_id}>
                      {t.device_name}
                    </option>
                  ))}
                </select>
                {availableThermostats.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No climate devices found. Sync devices from Home Assistant first.
                  </p>
                )}
              </div>

              {/* Occupied / Unoccupied Side by Side */}
              <div className="grid grid-cols-2 gap-4">
                {/* Occupied */}
                <div className="border rounded-lg p-4 bg-green-50/50">
                  <h4 className="font-semibold text-green-700 mb-3">🟢 Occupied (Open Hours)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Min (°F)
                      </label>
                      <input
                        type="number"
                        value={formData.setpoint_min_f}
                        onChange={(e) => setFormData({ ...formData, setpoint_min_f: Number(e.target.value) })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Max (°F)
                      </label>
                      <input
                        type="number"
                        value={formData.setpoint_max_f}
                        onChange={(e) => setFormData({ ...formData, setpoint_max_f: Number(e.target.value) })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        HVAC Mode
                      </label>
                      <select
                        value={formData.hvac_mode}
                        onChange={(e) => setFormData({ ...formData, hvac_mode: e.target.value })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="auto">Auto</option>
                        <option value="heat">Heat Only</option>
                        <option value="cool">Cool Only</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Fan Mode
                      </label>
                      <select
                        value={formData.fan_mode}
                        onChange={(e) => setFormData({ ...formData, fan_mode: e.target.value })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="auto">Auto</option>
                        <option value="on">Always On</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Unoccupied */}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold text-gray-600 mb-3">⚫ Unoccupied (Closed Hours)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Min (°F)
                      </label>
                      <input
                        type="number"
                        value={formData.setpoint_min_unoccupied_f}
                        onChange={(e) => setFormData({ ...formData, setpoint_min_unoccupied_f: Number(e.target.value) })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Max (°F)
                      </label>
                      <input
                        type="number"
                        value={formData.setpoint_max_unoccupied_f}
                        onChange={(e) => setFormData({ ...formData, setpoint_max_unoccupied_f: Number(e.target.value) })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        HVAC Mode
                      </label>
                      <select
                        value={formData.hvac_mode_unoccupied}
                        onChange={(e) => setFormData({ ...formData, hvac_mode_unoccupied: e.target.value })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="auto">Auto</option>
                        <option value="heat">Heat Only</option>
                        <option value="cool">Cool Only</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Fan Mode
                      </label>
                      <select
                        value={formData.fan_mode_unoccupied}
                        onChange={(e) => setFormData({ ...formData, fan_mode_unoccupied: e.target.value })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="auto">Auto</option>
                        <option value="on">Always On</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Control Scope */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Control Scope
                </label>
                <select
                  value={formData.control_scope}
                  onChange={(e) => setFormData({ ...formData, control_scope: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="managed">🔒 Managed</option>
                  <option value="open">🔓 Open</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingZone(null);
                  resetForm();
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={editingZone ? handleUpdateZone : handleAddZone}
                disabled={!formData.zone_name}
                className="px-4 py-2 bg-[#12723A] text-white rounded-lg hover:bg-[#0e5c2e] disabled:bg-gray-300"
              >
                {editingZone ? "Save Changes" : "Add Zone"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
