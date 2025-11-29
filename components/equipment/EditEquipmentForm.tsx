// components/equipment/EditEquipmentForm.tsx
"use client";

import { useState, FormEvent } from "react";
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

interface EditEquipmentFormProps {
  equipment: {
    equipment_id: string;
    site_id: string;
    equipment_name: string;
    description: string | null;
    equipment_group: string | null;
    equipment_type: string | null;
    space_name: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    manufacture_date: string | null; // date
    install_date: string | null; // date
    voltage: number | null;
    amperage: number | null;
    maintenance_interval_days: number | null;
    status: string | null;
  };
  siteid: string;
}

export default function EditEquipmentForm({
  equipment,
  siteid,
}: EditEquipmentFormProps) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Local form state (all editable)
  const [form, setForm] = useState({
    equipment_name: equipment.equipment_name ?? "",
    description: equipment.description ?? "",
    equipment_group: equipment.equipment_group ?? "",
    equipment_type: equipment.equipment_type ?? "",
    space_name: equipment.space_name ?? "",
    manufacturer: equipment.manufacturer ?? "",
    model: equipment.model ?? "",
    serial_number: equipment.serial_number ?? "",
    manufacture_date: equipment.manufacture_date ?? "",
    install_date: equipment.install_date ?? "",
    voltage: equipment.voltage?.toString() ?? "",
    amperage: equipment.amperage?.toString() ?? "",
    maintenance_interval_days:
      equipment.maintenance_interval_days?.toString() ?? "",
    status: equipment.status ?? "",
  });

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const payload: any = {
      equipment_name: form.equipment_name.trim(),
      description: form.description.trim() || null,
      equipment_group: form.equipment_group.trim() || null,
      equipment_type: form.equipment_type.trim() || null,
      space_name: form.space_name.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      status: form.status.trim() || null,
      manufacture_date: form.manufacture_date || null,
      install_date: form.install_date || null,
      voltage: form.voltage === "" ? null : Number(form.voltage),
      amperage: form.amperage === "" ? null : Number(form.amperage),
      maintenance_interval_days:
        form.maintenance_interval_days === ""
          ? null
          : Number(form.maintenance_interval_days),
    };

    // Basic numeric validation
    if (
      (form.voltage !== "" && Number.isNaN(payload.voltage)) ||
      (form.amperage !== "" && Number.isNaN(payload.amperage)) ||
      (form.maintenance_interval_days !== "" &&
        Number.isNaN(payload.maintenance_interval_days))
    ) {
      setSaving(false);
      setErrorMsg(
        "Voltage, amperage, and maintenance interval must be valid numbers."
      );
      return;
    }

    const { error } = await supabase
      .from("a_equipments")
      .update(payload)
      .eq("equipment_id", equipment.equipment_id);

    if (error) {
      console.error("Update error:", error);
      setErrorMsg(error.message || "Failed to save changes.");
      setSaving(false);
      return;
    }

    setSuccessMsg("Equipment updated successfully.");
    setSaving(false);

    // Navigate back to the individual equipment view
    router.push(
      `/sites/${siteid}/equipment/${equipment.equipment_id}/individual-equipment`
    );
  }

  return (
    <Card className="border border-gray-200 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-green-600 to-yellow-400 text-white rounded-t-xl">
        <CardTitle className="text-2xl">
          Edit Equipment — {equipment.equipment_name}
        </CardTitle>
        <CardDescription className="text-white/90">
          Update details for this asset. All fields are editable.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {errorMsg && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic info */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="equipment_name">Equipment Name</Label>
              <Input
                id="equipment_name"
                value={form.equipment_name}
                onChange={(e) =>
                  handleChange("equipment_name", e.target.value)
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                value={form.status}
                onChange={(e) => handleChange("status", e.target.value)}
                placeholder="active, offline, maintenance…"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={3}
            />
          </div>

          {/* Grouping */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="equipment_group">Group</Label>
              <Input
                id="equipment_group"
                value={form.equipment_group}
                onChange={(e) =>
                  handleChange("equipment_group", e.target.value)
                }
                placeholder="Refrigeration, HVAC, Lighting…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="equipment_type">Type</Label>
              <Input
                id="equipment_type"
                value={form.equipment_type}
                onChange={(e) =>
                  handleChange("equipment_type", e.target.value)
                }
                placeholder="Freezer, RTU, Hood, Panel…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="space_name">Space</Label>
              <Input
                id="space_name"
                value={form.space_name}
                onChange={(e) => handleChange("space_name", e.target.value)}
                placeholder="Kitchen, Drive Thru, Dining Room…"
              />
            </div>
          </div>

          {/* Manufacturer block */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={form.manufacturer}
                onChange={(e) =>
                  handleChange("manufacturer", e.target.value)
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={form.model}
                onChange={(e) => handleChange("model", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="serial_number">Serial Number</Label>
              <Input
                id="serial_number"
                value={form.serial_number}
                onChange={(e) =>
                  handleChange("serial_number", e.target.value)
                }
              />
            </div>
          </div>

          {/* Dates + maintenance */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="manufacture_date">Manufacture Date</Label>
              <Input
                id="manufacture_date"
                type="date"
                value={form.manufacture_date ?? ""}
                onChange={(e) =>
                  handleChange("manufacture_date", e.target.value)
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="install_date">Install Date</Label>
              <Input
                id="install_date"
                type="date"
                value={form.install_date ?? ""}
                onChange={(e) =>
                  handleChange("install_date", e.target.value)
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maintenance_interval_days">
                Maintenance Interval (days)
              </Label>
              <Input
                id="maintenance_interval_days"
                type="number"
                inputMode="numeric"
                value={form.maintenance_interval_days}
                onChange={(e) =>
                  handleChange("maintenance_interval_days", e.target.value)
                }
                min={0}
              />
            </div>
          </div>

          {/* Electrical */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="voltage">Voltage</Label>
              <Input
                id="voltage"
                type="number"
                inputMode="numeric"
                value={form.voltage}
                onChange={(e) => handleChange("voltage", e.target.value)}
                placeholder="e.g. 120"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amperage">Amperage</Label>
              <Input
                id="amperage"
                type="number"
                inputMode="numeric"
                value={form.amperage}
                onChange={(e) => handleChange("amperage", e.target.value)}
                placeholder="e.g. 10"
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
              disabled={saving}
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
