"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export default function AddEquipmentButton({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form fields
  const [equipmentName, setEquipmentName] = useState("");
  const [group, setGroup] = useState("");
  const [typeId, setTypeId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [description, setDescription] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [voltage, setVoltage] = useState("");
  const [amperage, setAmperage] = useState("");
  const [maintenanceIntervalDays, setMaintenanceIntervalDays] = useState("");

  // Auto-load org_id from site
  const [orgId, setOrgId] = useState<string | null>(null);

  // Data from library/site
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [equipmentModels, setEquipmentModels] = useState<EquipmentModel[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingSpaces, setLoadingSpaces] = useState(true);

  useEffect(() => {
    const fetchOrg = async () => {
      const { data } = await supabase
        .from("a_sites")
        .select("org_id")
        .eq("site_id", siteId)
        .single();

      if (data?.org_id) setOrgId(data.org_id);
    };

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

    const fetchSpaces = async () => {
      const { data, error } = await supabase
        .from("a_spaces")
        .select("space_id, name, space_type")
        .eq("site_id", siteId)
        .order("name");

      if (error) {
        console.error("Error fetching spaces:", error);
      } else {
        setSpaces(data || []);
      }
      setLoadingSpaces(false);
    };

    fetchOrg();
    fetchEquipmentTypes();
    fetchSpaces();
  }, [siteId]);

  // Fetch models when equipment type changes
  async function fetchModelsForType(equipmentTypeId: string) {
    if (!equipmentTypeId) {
      setEquipmentModels([]);
      return;
    }

    setLoadingModels(true);
    const { data, error } = await supabase
      .from("library_equipment_models")
      .select("model_id, manufacturer, model, equipment_type_id, voltage, tonnage, btuh")
      .eq("equipment_type_id", equipmentTypeId)
      .order("manufacturer")
      .order("model");

    if (error) {
      console.error("Error fetching models:", error);
    } else {
      setEquipmentModels(data || []);
    }
    setLoadingModels(false);
  }

  // Handle type selection - auto-populate group
  function handleTypeChange(selectedTypeId: string) {
    const selectedType = equipmentTypes.find(t => t.equipment_type_id === selectedTypeId);
    setTypeId(selectedTypeId);
    setGroup(selectedType?.equipment_group || "");
    
    // Clear model-related fields when type changes
    setManufacturer("");
    setModel("");
    setVoltage("");
    
    // Fetch models for this type
    fetchModelsForType(selectedTypeId);
  }

  // Handle model selection - auto-fill specs
  function handleModelChange(modelId: string) {
    const selectedModel = equipmentModels.find(m => m.model_id === modelId);
    
    if (selectedModel) {
      setManufacturer(selectedModel.manufacturer);
      setModel(selectedModel.model);
      setVoltage(selectedModel.voltage || "");
    }
  }

  const resetForm = () => {
    setEquipmentName("");
    setGroup("");
    setTypeId("");
    setSpaceId("");
    setDescription("");
    setManufacturer("");
    setModel("");
    setSerialNumber("");
    setManufactureDate("");
    setInstallDate("");
    setVoltage("");
    setAmperage("");
    setMaintenanceIntervalDays("");
    setEquipmentModels([]);
  };

  const handleSave = async () => {
    if (!equipmentName.trim()) {
      alert("Equipment name is required");
      return;
    }

    setLoading(true);

    // Duplicate check before insert
    const { data: existing, error: checkErr } = await supabase
      .from("a_equipments")
      .select("equipment_id")
      .eq("site_id", siteId)
      .eq("equipment_name", equipmentName.trim());

    if (checkErr) {
      console.error("Duplicate check error:", checkErr);
      alert("Unexpected error while checking duplicates.");
      setLoading(false);
      return;
    }

    if ((existing ?? []).length > 0) {
      alert(
        "An equipment with this name already exists at this site. Choose a different name."
      );
      setLoading(false);
      return;
    }

    // Perform insert
    const { error } = await supabase.from("a_equipments").insert({
      site_id: siteId,
      org_id: orgId,
      equipment_name: equipmentName.trim(),
      equipment_group: group || null,
      equipment_type_id: typeId || null,
      space_id: spaceId || null,
      description: description || null,
      manufacturer: manufacturer || null,
      model: model || null,
      serial_number: serialNumber || null,
      manufacture_date: manufactureDate || null,
      install_date: installDate || null,
      voltage: voltage || null,
      amperage: amperage || null,
      maintenance_interval_days: maintenanceIntervalDays
        ? parseInt(maintenanceIntervalDays)
        : null,
      status: "inactive",
    });

    if (error) {
      console.error("Supabase Insert Error:", error);
      alert("Failed to add equipment: " + error.message);
      setLoading(false);
      return;
    }

    // Cleanup
    resetForm();
    setLoading(false);
    setOpen(false);
    window.location.reload();
  };

  // Group equipment types by group
  const typesByGroup = equipmentTypes.reduce((acc, type) => {
    const grp = type.equipment_group || "Other";
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(type);
    return acc;
  }, {} as Record<string, EquipmentType[]>);

  const sortedGroups = Object.keys(typesByGroup).sort();

  return (
    <>
      {/* Button */}
      <Button
        onClick={() => setOpen(true)}
        className="bg-green-600 hover:bg-green-700 text-white shadow px-4"
      >
        + Add Equipment
      </Button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-semibold mb-4">Add New Equipment</h2>

            <div className="space-y-4">
              {/* Row 1: Name + Status placeholder */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Equipment Name *</Label>
                  <Input
                    placeholder="e.g., Walk-in Freezer #1"
                    value={equipmentName}
                    onChange={(e) => setEquipmentName(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Group</Label>
                  <Input
                    value={group}
                    disabled
                    className="bg-gray-100 cursor-not-allowed"
                    placeholder="Auto-filled from type"
                  />
                </div>
              </div>

              {/* Row 2: Type + Space */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Type</Label>
                  {loadingTypes ? (
                    <Input value="Loading..." disabled />
                  ) : (
                    <Select value={typeId} onValueChange={handleTypeChange}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select equipment type" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-[60]">
                        {sortedGroups.map((grp) => (
                          <div key={grp}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-gray-700 uppercase bg-gray-100 sticky top-0">
                              {grp}
                            </div>
                            {typesByGroup[grp].map((type) => (
                              <SelectItem
                                key={type.equipment_type_id}
                                value={type.equipment_type_id}
                                className="bg-white hover:bg-blue-50 cursor-pointer"
                              >
                                {type.name}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <Label className="text-sm font-medium">Installed Location</Label>
                  {loadingSpaces ? (
                    <Input value="Loading..." disabled />
                  ) : (
                    <Select value={spaceId} onValueChange={setSpaceId}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select space" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-[60]">
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
              </div>

              {/* Model Selection */}
              <div className="border-t pt-4">
                <Label className="text-sm font-medium">Select Model (optional - auto-fills specs)</Label>
                {loadingModels ? (
                  <p className="text-sm text-gray-500 mt-1">Loading models...</p>
                ) : equipmentModels.length > 0 ? (
                  <Select onValueChange={handleModelChange}>
                    <SelectTrigger className="bg-white mt-1">
                      <SelectValue placeholder="Select a model to auto-fill specs" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px] overflow-y-auto bg-white border-2 border-gray-300 shadow-xl z-[60]">
                      {equipmentModels.map((m) => (
                        <SelectItem
                          key={m.model_id}
                          value={m.model_id}
                          className="bg-white hover:bg-blue-50 cursor-pointer"
                        >
                          {m.manufacturer} - {m.model}
                          {m.tonnage && (
                            <span className="text-xs text-gray-500 ml-1">
                              ({m.tonnage} ton)
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : typeId ? (
                  <p className="text-sm text-gray-500 mt-1">No models in library for this equipment type</p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">Select equipment type first</p>
                )}
              </div>

              {/* Row 3: Manufacturer + Model + Serial */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Manufacturer</Label>
                  <Input
                    value={manufacturer}
                    disabled
                    className="bg-gray-100 cursor-not-allowed"
                    placeholder="Auto-filled from model"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Model</Label>
                  <Input
                    value={model}
                    disabled
                    className="bg-gray-100 cursor-not-allowed"
                    placeholder="Auto-filled from model"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Serial Number</Label>
                  <Input
                    placeholder="Unique per unit"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 4: Dates + Maintenance */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Manufacture Date</Label>
                  <Input
                    type="date"
                    value={manufactureDate}
                    onChange={(e) => setManufactureDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Install Date</Label>
                  <Input
                    type="date"
                    value={installDate}
                    onChange={(e) => setInstallDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Maintenance Interval (days)</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 90"
                    value={maintenanceIntervalDays}
                    onChange={(e) => setMaintenanceIntervalDays(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 5: Electrical */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Voltage</Label>
                  <Input
                    value={voltage}
                    disabled
                    className="bg-gray-100 cursor-not-allowed"
                    placeholder="Auto-filled from model"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Amperage</Label>
                  <Input
                    value={amperage}
                    disabled
                    className="bg-gray-100 cursor-not-allowed"
                    placeholder="Auto-filled from model"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <Label className="text-sm font-medium">Description</Label>
                <Input
                  placeholder="Optional notes about this equipment"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => {
                  resetForm();
                  setOpen(false);
                }}
              >
                Cancel
              </Button>

              <Button
                className="bg-green-600 text-white hover:bg-green-700"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Equipment"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
