"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";

export default function AddEquipmentButton({ siteId }: { siteId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form fields
  const [equipmentName, setEquipmentName] = useState("");
  const [group, setGroup] = useState("");
  const [type, setType] = useState("");
  const [space, setSpace] = useState("");
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

  // Equipment types from library
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);

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
        .select("equipment_type_id")
        .order("equipment_type_id");

      if (error) {
        console.error("Error fetching equipment types:", error);
        return;
      }

      if (data) {
        setEquipmentTypes(data.map((row) => row.equipment_type_id));
      }
    };

    fetchOrg();
    fetchEquipmentTypes();
  }, [siteId]);

  const resetForm = () => {
    setEquipmentName("");
    setGroup("");
    setType("");
    setSpace("");
    setDescription("");
    setManufacturer("");
    setModel("");
    setSerialNumber("");
    setManufactureDate("");
    setInstallDate("");
    setVoltage("");
    setAmperage("");
    setMaintenanceIntervalDays("");
  };

  const handleSave = async () => {
    if (!equipmentName.trim()) {
      alert("Equipment name is required");
      return;
    }

    setLoading(true);

    // 1️⃣ Duplicate check before insert
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

    // 2️⃣ Perform insert
    const { error } = await supabase.from("a_equipments").insert({
      site_id: siteId,
      org_id: orgId,
      equipment_name: equipmentName.trim(),
      equipment_group: group || null,
      equipment_type_id: type || null,
      space_name: space || null,
      description: description || null,
      manufacturer: manufacturer || null,
      model: model || null,
      serial_number: serialNumber || null,
      manufacture_date: manufactureDate || null,
      install_date: installDate || null,
      voltage: voltage ? parseInt(voltage) : null,
      amperage: amperage ? parseInt(amperage) : null,
      maintenance_interval_days: maintenanceIntervalDays
        ? parseInt(maintenanceIntervalDays)
        : null,
      status: "inactive",
      status_updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase Insert Error:", error);
      alert("Failed to add equipment.");
      setLoading(false);
      return;
    }

    // 3️⃣ Cleanup
    resetForm();
    setLoading(false);
    setOpen(false);
    window.location.reload();
  };

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

            <div className="grid grid-cols-2 gap-4">
              {/* Row 1 */}
              <Input
                placeholder="Equipment Name *"
                value={equipmentName}
                onChange={(e) => setEquipmentName(e.target.value)}
              />
              <Input
                placeholder="Group (Refrigeration, HVAC, etc.)"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              />

              {/* Row 2 */}
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Select Equipment Type</option>
                {equipmentTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Space (Kitchen, Roof, Storage)"
                value={space}
                onChange={(e) => setSpace(e.target.value)}
              />

              {/* Row 3 */}
              <Input
                placeholder="Manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
              <Input
                placeholder="Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />

              {/* Row 4 */}
              <Input
                placeholder="Serial Number"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />

              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Manufacture Date
                </label>
                <Input
                  type="date"
                  value={manufactureDate}
                  onChange={(e) => setManufactureDate(e.target.value)}
                />
              </div>

              {/* Row 5 */}
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Install Date
                </label>
                <Input
                  type="date"
                  value={installDate}
                  onChange={(e) => setInstallDate(e.target.value)}
                />
              </div>

              <Input
                placeholder="Voltage"
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
              />
              <Input
                placeholder="Amperage"
                value={amperage}
                onChange={(e) => setAmperage(e.target.value)}
              />

              {/* Row 6 */}
              <Input
                placeholder="Maintenance Interval (Days)"
                value={maintenanceIntervalDays}
                onChange={(e) => setMaintenanceIntervalDays(e.target.value)}
              />
            </div>

            <Input
              className="mt-4"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

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
