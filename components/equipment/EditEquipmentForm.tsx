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

type EquipmentStatus = "active" | "inactive" | "dummy" | "retired";

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
    status: (equipment.status ?? "inactive") as EquipmentStatus,
  });

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const payload = {
      equipment_name: form.equipment_name.trim(),
      description: form.description.trim() || null,
      equipment_group: form.equipment_group.trim() || null,
      equipment_type: form.equipment_type.trim() || null,
      space_name: form.space_name.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      status: form.status as EquipmentStatus,
      manufacture_date: form.manufacture_date || null,
      install_date: form.install_date || null,
      voltage: form.voltage === "" ? null : Number(form.voltage),
      amperage: form.amperage === "" ? null : Number(form.amperage),
      maintenance_interval_days:
        form.maintenance_interval_days === ""
          ? null
          : Number(form.maintenance_interval_days),
    };

    const { error } = await supabase
      .from("a_equipments")
      .update(payload)
      .eq("equipment_id", equipment.equipment_id);

    if (error) {
      console.error("Update error:", error);
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    setSuccessMsg("Equipment updated successfully.");
    setSaving(false);

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
          Update details for this asset.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm rounded">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-700 text-sm rounded">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* remaining fields unchanged */}

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

            <Button type="submit">
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
