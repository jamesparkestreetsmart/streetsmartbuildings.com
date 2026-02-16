// components/equipment/EditEquipmentForm.tsx
"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type EquipmentStatus = "active" | "inactive" | "dummy" | "retired";

interface EquipmentType {
  equipment_type_id: string;
  name: string;
  equipment_group: string;
  description: string | null;
}

interface EquipmentModel {
  model_id: string;
  manufacturer: string;
  model: string;
  equipment_type_id: string;
  voltage: string | null;
  tonnage: number | null;
  btuh: number | null;
}

interface Space {
  space_id: string;
  name: string;
  space_type: string;
}

interface PhaseConfig {
  phase_code: string;
  description: string;
}

interface EditEquipmentFormProps {
  equipment: {
    equipment_id: string;
    site_id: string;
    equipment_name: string;
    description: string | null;
    equipment_group: string | null;
    equipment_type_id: string | null;
    space_id: string;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    manufacture_date: string | null;
    install_date: string | null;
    voltage: number | null;
    amperage: number | null;
    maintenance_interval_days: number | null;
    status: EquipmentStatus | null;
  };
  siteid: string;
}

export default function EditEquipmentForm({
  equipment,
  siteid,
}: EditEquipmentFormProps) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [equipmentModels, setEquipmentModels] = useState<EquipmentModel[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Phase configuration
  const [phaseConfigurations, setPhaseConfigurations] = useState<PhaseConfig[]>([]);
  const [phaseConfig, setPhaseConfig] = useState<string | null>(null);
  const [energyMeterDeviceId, setEnergyMeterDeviceId] = useState<string | null>(null);
  const [loadingPhase, setLoadingPhase] = useState(true);

  // Served spaces (many-to-many)
  const [servedSpaceIds, setServedSpaceIds] = useState<Set<string>>(new Set());
  const [loadingServedSpaces, setLoadingServedSpaces] = useState(true);

  const [form, setForm] = useState({
    equipment_name: equipment.equipment_name ?? "",
    description: equipment.description ?? "",
    equipment_group: equipment.equipment_group ?? "",
    equipment_type_id: equipment.equipment_type_id ?? "",
    space_id: equipment.space_id ?? "",
    manufacturer: equipment.manufacturer ?? "",
    model: equipment.model ?? "",
    serial_number: equipment.serial_number ?? "",
    manufacture_date: equipment.manufacture_date ?? "",
    install_date: equipment.install_date ?? "",
    voltage: equipment.voltage?.toString() ?? "",
    amperage: equipment.amperage?.toString() ?? "",
    maintenance_interval_days:
      equipment.maintenance_interval_days?.toString() ?? "",
    status: (equipment.status ?? "inactive") as EquipmentStatus,
  });

  // Fetch equipment types on mount
  useEffect(() => {
    const fetchEquipmentTypes = async () => {
      const { data, error } = await supabase
        .from("library_equipment_types")
        .select("equipment_type_id, name, equipment_group, description")
        .order("equipment_group")
        .order("name");

      if (error) {
        console.error("Error fetching equipment types:", error);
      } else {
        setEquipmentTypes(data || []);
      }
      setLoadingTypes(false);
    };

    fetchEquipmentTypes();
  }, []);

  // Fetch spaces for this site
  useEffect(() => {
    const fetchSpaces = async () => {
      const { data, error } = await supabase
        .from("a_spaces")
        .select("space_id, name, space_type")
        .eq("site_id", siteid)
        .order("name");

      if (error) {
        console.error("Error fetching spaces:", error);
      } else {
        setSpaces(data || []);
      }
      setLoadingSpaces(false);
    };

    fetchSpaces();
  }, [siteid]);

  // Fetch served spaces for this equipment
  useEffect(() => {
    const fetchServedSpaces = async () => {
      const { data, error } = await supabase
        .from("a_equipment_served_spaces")
        .select("space_id")
        .eq("equipment_id", equipment.equipment_id);

      if (error) {
        console.error("Error fetching served spaces:", error);
      } else {
        setServedSpaceIds(new Set((data || []).map((d: { space_id: string }) => d.space_id)));
      }
      setLoadingServedSpaces(false);
    };

    fetchServedSpaces();
  }, [equipment.equipment_id]);

  // Fetch phase configuration from linked energy meter device
  useEffect(() => {
    const fetchPhaseConfig = async () => {
      // Get phase configs list
      const { data: phases } = await supabase
        .from("library_phase_configurations")
        .select("phase_code, description")
        .order("sort_order");

      setPhaseConfigurations((phases || []) as PhaseConfig[]);

      // Get energy meter device linked to this equipment
      const { data: devs } = await supabase
        .from("a_devices")
        .select("device_id, phase_configuration, library_device_id")
        .eq("equipment_id", equipment.equipment_id);

      if (devs && devs.length > 0) {
        // Find the device with a library_device_id (energy meter)
        const meterDev = devs.find((d: any) => d.library_device_id);
        if (meterDev) {
          // Verify it's an energy meter
          const { data: libDev } = await supabase
            .from("library_devices")
            .select("device_role")
            .eq("library_device_id", meterDev.library_device_id)
            .single();

          if (libDev?.device_role === "energy_meter") {
            setEnergyMeterDeviceId(meterDev.device_id);
            setPhaseConfig(meterDev.phase_configuration || null);
          }
        }
      }

      setLoadingPhase(false);
    };

    fetchPhaseConfig();
  }, [equipment.equipment_id]);

  // Fetch models on mount if equipment type already set
  useEffect(() => {
    if (equipment.equipment_type_id) {
      fetchModelsForType(equipment.equipment_type_id);
    }
  }, [equipment.equipment_type_id]);

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleEquipmentTypeChange(typeId: string) {
    const selectedType = equipmentTypes.find(t => t.equipment_type_id === typeId);
    
    setForm((prev) => ({
      ...prev,
      equipment_type_id: typeId,
      equipment_group: selectedType?.equipment_group || prev.equipment_group,
    }));

    fetchModelsForType(typeId);
  }

  async function fetchModelsForType(typeId: string) {
    if (!typeId) {
      setEquipmentModels([]);
      return;
    }

    setLoadingModels(true);
    const { data, error } = await supabase
      .from('library_equipment_models')
      .select('model_id, manufacturer, model, equipment_type_id, voltage, tonnage, btuh')
      .eq('equipment_type_id', typeId)
      .order('manufacturer')
      .order('model');

    if (error) {
      console.error('Error fetching models:', error.message, error.code, error.details);
    } else {
      setEquipmentModels(data || []);
    }
    setLoadingModels(false);
  }

  function handleModelChange(modelId: string) {
    const selectedModel = equipmentModels.find(m => m.model_id === modelId);
    
    if (selectedModel) {
      setSelectedModelId(modelId);
      setForm((prev) => ({
        ...prev,
        manufacturer: selectedModel.manufacturer,
        model: selectedModel.model,
        voltage: selectedModel.voltage || prev.voltage,
      }));
    }
  }

  function toggleServedSpace(spaceId: string) {
    setServedSpaceIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(spaceId)) {
        newSet.delete(spaceId);
      } else {
        newSet.add(spaceId);
      }
      return newSet;
    });
  }

  // Retire equipment
  async function handleRetire() {
    if (!confirm(
      `Are you sure you want to retire "${equipment.equipment_name}"?\n\nThe equipment will be marked as retired and hidden from active views. Historical data will be preserved.\n\nYou can reactivate it later by changing the status.`
    )) {
      return;
    }

    setRetiring(true);
    setErrorMsg(null);

    const { error } = await supabase
      .from("a_equipments")
      .update({ status: "retired" })
      .eq("equipment_id", equipment.equipment_id);

    if (error) {
      setErrorMsg(`Failed to retire: ${error.message}`);
      setRetiring(false);
      return;
    }

    // Log the retirement
    await supabase.from("b_records_log").insert({
      org_id: null,
      site_id: equipment.site_id,
      equipment_id: equipment.equipment_id,
      event_type: "equipment_retired",
      source: "edit_form",
      message: `Equipment "${equipment.equipment_name}" was retired`,
      metadata: { previous_status: equipment.status },
      event_date: new Date().toISOString().split("T")[0],
    });

    router.push(`/sites/${siteid}`);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    const payload = {
      equipment_name: form.equipment_name.trim(),
      description: form.description.trim() || null,
      equipment_group: form.equipment_group.trim() || null,
      equipment_type_id: form.equipment_type_id.trim() || null,
      space_id: form.space_id || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      status: form.status,
      manufacture_date: form.manufacture_date || null,
      install_date: form.install_date || null,
      voltage: form.voltage.trim() || null,
      amperage: form.amperage.trim() || null,
      maintenance_interval_days:
        form.maintenance_interval_days === ""
          ? null
          : Number(form.maintenance_interval_days),
    };

    // Update equipment
    const { error } = await supabase
      .from("a_equipments")
      .update(payload)
      .eq("equipment_id", equipment.equipment_id);

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    // Update phase configuration on the energy meter device if changed
    if (energyMeterDeviceId && phaseConfig !== undefined) {
      const { error: phaseError } = await supabase
        .from("a_devices")
        .update({ phase_configuration: phaseConfig })
        .eq("device_id", energyMeterDeviceId);

      if (phaseError) {
        console.error("Error updating phase config:", phaseError);
      }
    }

    // Update served spaces (delete all, then insert selected)
    const { error: deleteError } = await supabase
      .from("a_equipment_served_spaces")
      .delete()
      .eq("equipment_id", equipment.equipment_id);

    if (deleteError) {
      console.error("Error deleting served spaces:", deleteError);
    }

    if (servedSpaceIds.size > 0) {
      const servedSpacesPayload = Array.from(servedSpaceIds).map((spaceId) => ({
        equipment_id: equipment.equipment_id,
        space_id: spaceId,
      }));

      const { error: insertError } = await supabase
        .from("a_equipment_served_spaces")
        .insert(servedSpacesPayload);

      if (insertError) {
        console.error("Error inserting served spaces:", insertError);
        setErrorMsg(`Equipment saved, but failed to save served spaces: ${insertError.message}`);
        setSaving(false);
        return;
      }
    }

    router.push(
      `/sites/${siteid}/equipment/${equipment.equipment_id}/individual-equipment`
    );
  }

  // Group equipment types by group
  const typesByGroup = equipmentTypes.reduce((acc, type) => {
    const group = type.equipment_group || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(type);
    return acc;
  }, {} as Record<string, EquipmentType[]>);

  const sortedGroups = Object.keys(typesByGroup).sort();

  const isHvac = form.equipment_type_id?.toLowerCase().includes('hvac');

  return (
    <Card className="border shadow-lg">
      <CardHeader className="bg-gradient-to-r from-green-600 to-yellow-400 text-white">
        <CardTitle className="text-2xl">
          Edit Equipment — {equipment.equipment_name}
        </CardTitle>
        <CardDescription className="text-white/90">
          Update details for this asset.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 rounded">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name + Status */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Equipment Name</Label>
              <Input
                value={form.equipment_name}
                onChange={(e) =>
                  handleChange("equipment_name", e.target.value)
                }
                required
              />
            </div>

            <div>
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) =>
                  handleChange("status", e.target.value)
                }
                className="w-full border rounded px-3 py-2"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="dummy">Dummy</option>
                <option value="retired">Retired</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) =>
                handleChange("description", e.target.value)
              }
              rows={3}
            />
          </div>

          {/* Group / Type */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Group</Label>
              <Input
                value={form.equipment_group}
                disabled
                className="bg-gray-100 cursor-not-allowed text-gray-700"
                placeholder="Auto-populated from type"
              />
            </div>
            
            <div>
              <Label>Type</Label>
              {loadingTypes ? (
                <Input value="Loading..." disabled />
              ) : (
                <Select
                  value={form.equipment_type_id}
                  onValueChange={handleEquipmentTypeChange}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select equipment type" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-50">
                    {sortedGroups.map((group) => (
                      <div key={group}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-700 uppercase bg-gray-100 sticky top-0">
                          {group}
                        </div>
                        {typesByGroup[group].map((type) => (
                          <SelectItem
                            key={type.equipment_type_id}
                            value={type.equipment_type_id}
                            className="bg-white hover:bg-blue-50 cursor-pointer"
                          >
                            {type.name}
                            {type.description && (
                              <span className="text-xs text-gray-500 ml-2">
                                — {type.description}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Phase Configuration - Only show if energy meter is linked */}
          {energyMeterDeviceId && (
            <div className="border-t pt-4 mt-4">
              <Label className="block mb-2">Phase Configuration</Label>
              <p className="text-xs text-gray-500 mb-2">
                Electrical wiring configuration for the energy meter on this equipment.
              </p>
              {loadingPhase ? (
                <Input value="Loading..." disabled />
              ) : (
                <select
                  value={phaseConfig || ""}
                  onChange={(e) => setPhaseConfig(e.target.value || null)}
                  className="w-full border rounded px-3 py-2 bg-white"
                >
                  <option value="">— Select phase configuration —</option>
                  {phaseConfigurations.map((pc) => (
                    <option key={pc.phase_code} value={pc.phase_code}>
                      {pc.phase_code} — {pc.description}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Installed Location (single space dropdown) */}
          <div className="border-t pt-4 mt-4">
            <Label className="block mb-2">Installed Location</Label>
            <p className="text-xs text-gray-500 mb-2">
              Where is this equipment physically located?
            </p>
            {loadingSpaces ? (
              <Input value="Loading spaces..." disabled />
            ) : (
              <Select
                value={form.space_id}
                onValueChange={(val) => handleChange("space_id", val)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select installed location" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-50">
                  {spaces.map((space) => (
                    <SelectItem
                      key={space.space_id}
                      value={space.space_id}
                      className={`bg-white hover:bg-blue-50 cursor-pointer ${
                        space.name === "Unassigned" ? "text-gray-500" : ""
                      }`}
                    >
                      {space.name}
                      {space.name !== "Unassigned" && (
                        <span className="text-xs text-gray-500 ml-2">
                          — {space.space_type}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Serves Spaces (multi-select checklist) - Only show for HVAC */}
          {isHvac && (
            <div className="border-t pt-4 mt-4">
              <Label className="block mb-2">Serves Spaces</Label>
              <p className="text-xs text-gray-500 mb-3">
                Which spaces does this HVAC equipment condition?
              </p>
              {loadingSpaces || loadingServedSpaces ? (
                <p className="text-sm text-gray-500">Loading spaces...</p>
              ) : spaces.length === 0 ? (
                <p className="text-sm text-gray-500">No spaces defined for this site.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto border rounded p-3 bg-gray-50">
                  {spaces
                    .filter((s) => s.name !== "Unassigned")
                    .map((space) => (
                      <label
                        key={space.space_id}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-1 rounded"
                      >
                        <Checkbox
                          checked={servedSpaceIds.has(space.space_id)}
                          onCheckedChange={() => toggleServedSpace(space.space_id)}
                        />
                        <span>{space.name}</span>
                      </label>
                    ))}
                </div>
              )}
              {servedSpaceIds.size > 0 && (
                <p className="text-xs text-emerald-600 mt-2">
                  {servedSpaceIds.size} space{servedSpaceIds.size !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          )}

          {/* Model Selection + Auto-fill */}
          <div className="border-t pt-4 mt-4">
            <Label className="block mb-2">Select Model (optional - auto-fills specs)</Label>
            {loadingModels ? (
              <p className="text-sm text-gray-500">Loading models...</p>
            ) : equipmentModels.length > 0 ? (
              <Select onValueChange={handleModelChange}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select a model to auto-fill specs" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-50">
                  {equipmentModels.map((model) => (
                    <SelectItem 
                      key={model.model_id} 
                      value={model.model_id}
                      className="bg-white hover:bg-blue-50 cursor-pointer"
                    >
                      {model.manufacturer} - {model.model}
                      {model.tonnage && <span className="text-xs text-gray-500"> ({model.tonnage} ton)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : form.equipment_type_id ? (
              <p className="text-sm text-gray-500">No models in library for this equipment type</p>
            ) : (
              <p className="text-sm text-gray-500">Select equipment type first</p>
            )}
          </div>

          {/* Manufacturer / Model / Serial */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Manufacturer</Label>
              <Input
                value={form.manufacturer}
                disabled
                className="bg-gray-100 cursor-not-allowed"
              />
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.model}
                disabled
                className="bg-gray-100 cursor-not-allowed"
              />
            </div>
            <div>
              <Label>Serial Number</Label>
              <Input
                value={form.serial_number}
                onChange={(e) =>
                  handleChange("serial_number", e.target.value)
                }
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Manufacture Date</Label>
              <Input
                type="date"
                value={form.manufacture_date}
                onChange={(e) =>
                  handleChange("manufacture_date", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Install Date</Label>
              <Input
                type="date"
                value={form.install_date}
                onChange={(e) =>
                  handleChange("install_date", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Maintenance Interval (days)</Label>
              <Input
                type="number"
                value={form.maintenance_interval_days}
                onChange={(e) =>
                  handleChange(
                    "maintenance_interval_days",
                    e.target.value
                  )
                }
              />
            </div>
          </div>

          {/* Electrical */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Voltage</Label>
              <Input
                type="text"
                value={form.voltage}
                disabled
                className="bg-gray-100 cursor-not-allowed"
                placeholder="Auto-filled from model"
              />
            </div>
            <div>
              <Label>Amperage</Label>
              <Input
                type="text"
                value={form.amperage}
                disabled
                className="bg-gray-100 cursor-not-allowed"
                placeholder="Auto-filled from model"
              />
            </div>
          </div>

          <CardFooter className="flex justify-between px-0">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  `/sites/${siteid}/equipment/${equipment.equipment_id}/individual-equipment`
                )
              }
            >
              Cancel
            </Button>

            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
