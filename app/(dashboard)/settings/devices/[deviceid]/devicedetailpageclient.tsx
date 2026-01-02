// app/settings/devices/[deviceid]/devicedetailpageclient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Cpu, Trash2, Edit3 } from "lucide-react";
import { useReturnTo } from "@/app/hooks/useReturnTo";

interface DeviceRow {
  device_id: string;
  device_name: string;
  serial_number: string;
  protocol: string | null;
  connection_type: string | null;
  firmware_version: string | null;
  ip_address: string | null;
  status: string | null;
  service_notes: string | null;
  created_at: string;

  site_id: string | null;
  equipment_id: string | null;

  a_sites?: { site_id: string; site_name: string } | null;
  a_equipments?: { equipment_id: string; equipment_name: string } | null;
}

interface SensorRow {
  sensor_id: string;
  sensor_name: string;
  sensor_type: string;
  unit_of_measure: string | null;
  log_table: string | null;
  status: string | null;
}

export default function DeviceDetailPageClient({
  deviceid,
}: {
  deviceid: string;
}) {
  const router = useRouter();

  /** 🔁 CENTRALIZED BACK NAVIGATION */
  const { goBack } = useReturnTo("/settings/devices");

  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<DeviceRow | null>(null);
  const [sensors, setSensors] = useState<SensorRow[]>([]);

  const [sites, setSites] = useState<{ site_id: string; site_name: string }[]>(
    []
  );

  const [equipment, setEquipment] = useState<
    { equipment_id: string; equipment_name: string; site_id: string }[]
  >([]);

  const [showEdit, setShowEdit] = useState(false);

  const [editData, setEditData] = useState<Record<string, any>>({
    device_name: "",
    serial_number: "",
    protocol: "",
    connection_type: "",
    firmware_version: "",
    ip_address: "",
    status: "",
    service_notes: "",
    site_id: "",
    equipment_id: "",
  });

  // ------------------------------
  // LOAD DEVICE + SENSORS
  // ------------------------------
  const loadData = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("a_devices")
      .select(
        `
        *,
        a_sites:site_id ( site_id, site_name ),
        a_equipments:equipment_id ( equipment_id, equipment_name )
      `
      )
      .eq("device_id", deviceid)
      .single();

    if (error) {
      console.error("Error loading device:", error);
    }

    setDevice(data as DeviceRow);

    const { data: sensorRows } = await supabase
      .from("a_sensors")
      .select(
        "sensor_id, sensor_name, sensor_type, unit_of_measure, log_table, status"
      )
      .eq("device_id", deviceid)
      .order("sensor_name");

    setSensors((sensorRows as SensorRow[]) || []);

    const { data: siteRows } = await supabase
      .from("a_sites")
      .select("site_id, site_name")
      .order("site_name");

    setSites((siteRows as { site_id: string; site_name: string }[]) || []);

    const { data: eqRows } = await supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, site_id")
      .order("equipment_name");

    setEquipment(
      (eqRows as { equipment_id: string; equipment_name: string; site_id: string }[]) ||
        []
    );

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceid]);

  // ------------------------------
  // OPEN EDIT MODAL
  // ------------------------------
  const openEdit = () => {
    if (!device) return;

    setEditData({
      device_name: device.device_name,
      serial_number: device.serial_number,
      protocol: device.protocol || "",
      connection_type: device.connection_type || "",
      firmware_version: device.firmware_version || "",
      ip_address: device.ip_address || "",
      status: device.status || "active",
      service_notes: device.service_notes || "",
      site_id: device.site_id || "",
      equipment_id: device.equipment_id || "",
    });

    setShowEdit(true);
  };

  // ------------------------------
  // SAVE EDIT
  // ------------------------------
  const saveEdit = async () => {
    if (!device) return;

    const { error } = await supabase
      .from("a_devices")
      .update({
        ...editData,
        site_id: editData.site_id || null,
        equipment_id: editData.equipment_id || null,
      })
      .eq("device_id", device.device_id);

    if (error) {
      console.error(error);
      alert("Update failed");
      return;
    }

    setShowEdit(false);
    loadData();
  };

  // ------------------------------
  // DELETE DEVICE
  // ------------------------------
  const deleteDevice = async () => {
    if (!device) return;
    if (!confirm("Delete device?")) return;

    await supabase.from("a_devices").delete().eq("device_id", device.device_id);
    goBack();
  };

  // ------------------------------
  // RETIRE DEVICE
  // ------------------------------
  const retireDevice = async () => {
    if (!device) return;

    await supabase
      .from("a_devices")
      .update({ status: "retired" })
      .eq("device_id", device.device_id);

    loadData();
  };

  // ------------------------------
  // RENDER
  // ------------------------------

  if (loading)
    return <div className="p-6 text-gray-500 text-sm">Loading...</div>;

  if (!device)
    return (
      <div className="p-6">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-red-600 text-sm">Device not found.</p>
      </div>
    );

  const siteName = device.a_sites?.site_name || "—";
  const equipmentName = device.a_equipments?.equipment_name || "—";

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-green-600" />
          <h1 className="text-2xl font-semibold">{device.device_name}</h1>
        </div>
      </div>

      {/* MAIN INFO CARD */}
      <div className="bg-white border rounded-xl shadow p-6 flex flex-col md:flex-row justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">Device Information</h2>
          <p><b>Serial:</b> {device.serial_number}</p>
          <p><b>Protocol:</b> {device.protocol || "—"}</p>
          <p><b>Connection:</b> {device.connection_type || "—"}</p>
          <p><b>Firmware:</b> {device.firmware_version || "—"}</p>
          <p><b>IP:</b> {device.ip_address || "—"}</p>
          <p><b>Status:</b> {device.status}</p>
          <p><b>Created:</b> {new Date(device.created_at).toLocaleString()}</p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-4">
          <div className="text-sm">
            <h2 className="text-lg font-semibold mb-1">Location</h2>
            <p><b>Site:</b> {siteName}</p>
            <p><b>Equipment:</b> {equipmentName}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={openEdit}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Edit3 className="w-4 h-4 inline mr-1" /> Edit
            </button>
            <button
              onClick={retireDevice}
              className="px-3 py-1.5 text-sm bg-yellow-200 text-yellow-800 rounded-md"
            >
              Retire
            </button>
            <button
              onClick={deleteDevice}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 inline mr-1" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* SENSORS */}
      <div className="bg-white border rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-3">
          Sensors Connected to This Device
        </h2>

        {sensors.length === 0 ? (
          <p className="text-gray-500 text-sm">No sensors found.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-gray-700 font-semibold">
              <tr>
                <th className="p-2 text-left">Sensor Name</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Unit</th>
                <th className="p-2 text-left">Log Table</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((s) => (
                <tr key={s.sensor_id} className="border-b">
                  <td className="p-2">{s.sensor_name}</td>
                  <td className="p-2">{s.sensor_type}</td>
                  <td className="p-2">{s.unit_of_measure || "—"}</td>
                  <td className="p-2">{s.log_table || "—"}</td>
                  <td className="p-2">{s.status || "unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* EDIT MODAL */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-[450px] max-w-[90vw]">
            <h2 className="text-lg font-semibold mb-4">Edit Device</h2>

            <div className="space-y-3 text-sm">
              {[
                "device_name",
                "serial_number",
                "protocol",
                "connection_type",
                "firmware_version",
                "ip_address",
                "service_notes",
              ].map((field) => (
                <div key={field}>
                  <label className="block mb-1 capitalize">
                    {field.replace("_", " ")}
                  </label>
                  <input
                    className="w-full border rounded-md p-2"
                    value={editData[field] || ""}
                    onChange={(e) =>
                      setEditData({ ...editData, [field]: e.target.value })
                    }
                  />
                </div>
              ))}

              <div>
                <label className="block mb-1">Status</label>
                <select
                  className="w-full border rounded-md p-2"
                  value={editData.status}
                  onChange={(e) =>
                    setEditData({ ...editData, status: e.target.value })
                  }
                >
                  <option value="active">Active</option>
                  <option value="offline">Offline</option>
                  <option value="inactive">Inactive</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              <div>
                <label className="block mb-1">Site</label>
                <select
                  className="w-full border rounded-md p-2"
                  value={editData.site_id}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      site_id: e.target.value,
                      equipment_id: "",
                    })
                  }
                >
                  <option value="">Select Site</option>
                  {sites.map((site) => (
                    <option key={site.site_id} value={site.site_id}>
                      {site.site_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1">Equipment</label>
                <select
                  className="w-full border rounded-md p-2"
                  value={editData.equipment_id}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      equipment_id: e.target.value,
                    })
                  }
                >
                  <option value="">Select Equipment</option>
                  {equipment
                    .filter((eq) =>
                      editData.site_id ? eq.site_id === editData.site_id : true
                    )
                    .map((eq) => (
                      <option key={eq.equipment_id} value={eq.equipment_id}>
                        {eq.equipment_name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-1.5 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
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
