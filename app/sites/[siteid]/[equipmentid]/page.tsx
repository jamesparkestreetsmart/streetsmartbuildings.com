"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Edit, Plus } from "lucide-react";

// =======================================
// TYPES
// =======================================
interface EquipmentRecord {
  equipment_id: string;
  site_id: string;
  equipment_name: string;
  description: string | null;
  equipment_group: string;
  equipment_type: string;
  space_name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  voltage: number | null;
  amperage: number | null;
  maintenance_interval_days: number | null;
  status: string;
  [key: string]: string | number | null | undefined;
}

interface DeviceRecord {
  device_id: string;
  equipment_id: string;
  device_name: string;
  protocol: string;
  connection_type: string;
  [key: string]: string | number | null | undefined;
}

interface SensorRecord {
  sensor_id: string;
  device_id: string;
  sensor_name: string;
  sensor_type: string;
  [key: string]: string | number | null | undefined;
}

type EditData = Partial<EquipmentRecord>;

// =======================================
// COMPONENT
// =======================================
export default function IndividualEquipmentPage() {
  const params = useParams<{ siteid: string; equipmentid: string }>();
  const router = useRouter();

  const siteId = params.siteid;
  const equipmentId = params.equipmentid;

  const [equipment, setEquipment] = useState<EquipmentRecord | null>(null);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [sensors, setSensors] = useState<SensorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState<EditData>({});

  // ===== LOAD EVERYTHING =====
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Load equipment
      const { data: eq } = await supabase
        .from("a_equipments")
        .select("*")
        .eq("equipment_id", equipmentId)
        .single();

      setEquipment(eq);

      if (!eq) {
        setLoading(false);
        return;
      }

      // Load devices for this equipment
      const { data: devs } = await supabase
        .from("a_devices")
        .select("*")
        .eq("equipment_id", eq.equipment_id);

      setDevices(devs || []);

      // Load sensors for this equipment
      const { data: sens } = await supabase
        .from("a_sensors")
        .select("*")
        .eq("equipment_id", eq.equipment_id);

      setSensors(sens || []);
      setLoading(false);
    };

    load();
  }, [equipmentId]);

  if (loading)
    return <div className="p-6 text-gray-500 text-sm">Loading equipment…</div>;

  if (!equipment)
    return <div className="p-6 text-red-600">Equipment not found.</div>;

  // **** Derived routes ****
  const siteRoute = `/sites/${siteId}`;

  // **** Group sensors by device_id ****
  const sensorsByDevice = devices.map((device) => ({
    device,
    sensors: sensors.filter((s) => s.device_id === device.device_id),
  }));

  return (
    <div className="p-6 space-y-10">
      {/* ===== BACK BUTTON ===== */}
      <button
        onClick={() => router.push(siteRoute)}
        className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Site
      </button>

      {/* ===== EQUIPMENT HEADER ===== */}
      <div className="bg-white p-6 rounded-xl shadow border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">
            {equipment.equipment_name}
          </h1>

          <button
            className="px-3 py-1.5 text-sm rounded-md text-white bg-green-600 hover:bg-green-700 flex items-center gap-2"
            onClick={() => {
              setEditData(equipment);
              setShowEdit(true);
            }}
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <p><strong>Group:</strong> {equipment.equipment_group}</p>
          <p><strong>Type:</strong> {equipment.equipment_type}</p>
          <p><strong>Space:</strong> {equipment.space_name || "—"}</p>
          <p><strong>Manufacturer:</strong> {equipment.manufacturer || "—"}</p>
          <p><strong>Model:</strong> {equipment.model || "—"}</p>
          <p><strong>Serial #:</strong> {equipment.serial_number || "—"}</p>
          <p><strong>Voltage:</strong> {equipment.voltage || "—"}</p>
          <p><strong>Amperage:</strong> {equipment.amperage || "—"}</p>
          <p><strong>Maintenance (days):</strong> {equipment.maintenance_interval_days || "—"}</p>
          <p><strong>Status:</strong> {equipment.status}</p>
        </div>
      </div>

      {/* ===== DEVICES + SENSORS ===== */}
      <div className="bg-white p-6 rounded-xl shadow border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Devices</h2>

          <button
            className="px-3 py-1.5 text-sm rounded-md text-white bg-gradient-to-r from-green-600 to-yellow-500 hover:opacity-90 flex items-center gap-2"
            onClick={() =>
              router.push(
                `/settings/devices/add?equipment=${equipmentId}&site=${equipment.site_id}`
              )
            }
          >
            <Plus className="w-4 h-4" />
            Add Device
          </button>
        </div>

        {sensorsByDevice.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No devices linked to this equipment.
          </p>
        ) : (
          <div className="space-y-6">
            {sensorsByDevice.map(({ device, sensors }) => (
              <div key={device.device_id} className="border rounded-lg p-4">
                <h3 className="font-semibold text-green-700 text-lg mb-2">
                  {device.device_name}
                </h3>

                <p className="text-sm text-gray-600 mb-4">
                  Protocol: {device.protocol} • Connection: {device.connection_type}
                </p>

                <ul className="space-y-1 text-sm">
                  {sensors.map((s) => (
                    <li key={s.sensor_id} className="border-b py-1">
                      <strong>{s.sensor_name}</strong> — {s.sensor_type}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== EDIT EQUIPMENT MODAL ===== */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl w-[550px] max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Edit Equipment</h2>

            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                "equipment_name",
                "description",
                "equipment_group",
                "equipment_type",
                "space_name",
                "manufacturer",
                "model",
                "serial_number",
                "voltage",
                "amperage",
                "maintenance_interval_days",
                "status",
              ].map((field) => (
                <div key={field} className="col-span-2">
                  <label className="block text-gray-600 mb-1 capitalize">
                    {field.replace(/_/g, " ")}
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded-md p-2"
                    value={editData[field] ?? ""}
                    onChange={(e) =>
                      setEditData({ ...editData, [field]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-4 py-1.5 text-sm"
                onClick={() => setShowEdit(false)}
              >
                Cancel
              </button>

              <button
                className="px-4 py-1.5 rounded-md text-white bg-green-600 hover:bg-green-700"
                onClick={async () => {
                  const { error } = await supabase
                    .from("a_equipments")
                    .update(editData)
                    .eq("equipment_id", equipmentId);

                  if (error) alert("Failed to update.");
                  else {
                    // ⬇ FIXED: merge editData with existing equipment
                    setEquipment((prev) =>
                      prev ? { ...prev, ...editData } : prev
                    );
                    setShowEdit(false);
                  }
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
