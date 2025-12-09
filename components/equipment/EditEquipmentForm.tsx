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

    const payload = {
      equipment_name: form.equipment_name.trim(),
      description: form.description.trim() || null,
      equipment_group: form.equipment_group.trim() || null,
      equipment_type: form.equipment_type.trim() || null,
      space_name: form.space_name.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      status: form.status,
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
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    router.push(
      `/sites/${siteid}/equipment/${equipment.equipment_id}/individual-equipment`
    );
  }

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

          {/* Group / Type / Space */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Group</Label>
              <Input
                value={form.equipment_group}
                onChange={(e) =>
                  handleChange("equipment_group", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Type</Label>
              <Input
                value={form.equipment_type}
                onChange={(e) =>
                  handleChange("equipment_type", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Space</Label>
              <Input
                value={form.space_name}
                onChange={(e) =>
                  handleChange("space_name", e.target.value)
                }
              />
            </div>
          </div>

          {/* Manufacturer */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Manufacturer</Label>
              <Input
                value={form.manufacturer}
                onChange={(e) =>
                  handleChange("manufacturer", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.model}
                onChange={(e) =>
                  handleChange("model", e.target.value)
                }
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
                type="number"
                value={form.voltage}
                onChange={(e) =>
                  handleChange("voltage", e.target.value)
                }
              />
            </div>
            <div>
              <Label>Amperage</Label>
              <Input
                type="number"
                value={form.amperage}
                onChange={(e) =>
                  handleChange("amperage", e.target.value)
                }
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
