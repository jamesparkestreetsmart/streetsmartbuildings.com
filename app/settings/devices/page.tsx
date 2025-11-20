"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Cpu, Plus, Trash2, Save, X, ArrowUpDown, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Device {
  device_id: string;
  device_name: string;
  serial_number: string;
  protocol: string;
  connection_type: string;
  firmware_version: string;
  ip_address: string | null;
  site_name: string | null;
  equipment_name: string | null;
  status: string | null;
  service_notes: string | null;
  created_at: string;
}

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<keyof Device>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newDevice, setNewDevice] = useState({
    device_name: "",
    serial_number: "",
    protocol: "",
    connection_type: "",
    firmware_version: "",
    ip_address: "",
    site_id: "",
    equipment_id: "",
    status: "active",
    service_notes: "",
  });

  // ========== FETCH DEVICES ==========
  const fetchDevices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("view_settings_devices")
      .select("*");

    if (error) console.error(error);
    else setDevices(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  // ========== SORTING ==========
  const handleSort = (column: keyof Device) => {
    const order = sortColumn === column && sortOrder === "asc" ? "desc" : "asc";
    setSortColumn(column);
    setSortOrder(order);

    const sorted = [...devices].sort((a, b) => {
      const aVal = a[column] ?? "";
      const bVal = b[column] ?? "";
      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });
    setDevices(sorted);
  };

  // ========== ADD DEVICE ==========
  const addDevice = async () => {
    if (!newDevice.device_name || !newDevice.serial_number) {
      alert("Device Name and Serial Number are required.");
      return;
    }

    const { error } = await supabase.from("a_devices").insert([newDevice]);
    if (error) {
      console.error(error);
      alert("Failed to add device.");
    } else {
      setShowAdd(false);
      setNewDevice({
        device_name: "",
        serial_number: "",
        protocol: "",
        connection_type: "",
        firmware_version: "",
        ip_address: "",
        site_id: "",
        equipment_id: "",
        status: "active",
        service_notes: "",
      });
      fetchDevices();
    }
  };

  // ========== UPDATE DEVICE ==========
  const updateDevice = async () => {
    if (!selectedDevice) return;

    const { error } = await supabase
      .from("a_devices")
      .update({
        device_name: selectedDevice.device_name,
        serial_number: selectedDevice.serial_number,
        protocol: selectedDevice.protocol,
        connection_type: selectedDevice.connection_type,
        firmware_version: selectedDevice.firmware_version,
        ip_address: selectedDevice.ip_address,
        status: selectedDevice.status,
        service_notes: selectedDevice.service_notes,
      })
      .eq("device_id", selectedDevice.device_id);

    if (error) {
      console.error(error);
      alert("Failed to update device.");
    } else {
      setSelectedDevice(null);
      fetchDevices();
    }
  };

  // ========== DELETE DEVICE ==========
  const deleteDevice = async (device_id: string) => {
    if (!confirm("Are you sure you want to delete this device?")) return;

    const { error } = await supabase
      .from("a_devices")
      .delete()
      .eq("device_id", device_id);

    if (error) {
      console.error(error);
      alert("Failed to delete device.");
    } else {
      setDevices(devices.filter((d) => d.device_id !== device_id));
    }
  };

  if (loading)
    return <div className="p-6 text-gray-500 text-sm">Loading devices...</div>;

  // ========== COLUMN HEADER ==========
  const renderHeader = (label: string, column: keyof Device) => (
    <th
      className="p-3 text-left cursor-pointer hover:text-green-600 select-none"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-4 h-4" />
      </div>
    </th>
  );

  return (
    <div className="p-6 space-y-8">
      {/* ===== BACK & HEADER ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Settings
          </button>
          <div className="flex items-center gap-2 ml-4">
            <Cpu className="w-6 h-6 text-green-600" />
            <h1 className="text-2xl font-semibold">My Devices</h1>
          </div>
        </div>

        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-[#00a859] to-[#d4af37] hover:from-[#15b864] hover:to-[#e1bf4b]"
        >
          <Plus className="w-4 h-4" />
          Add Device
        </button>
      </div>

      {/* ===== DEVICE TABLE ===== */}
      <div className="bg-white shadow border rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700 uppercase font-semibold">
            <tr>
              {renderHeader("Device Name", "device_name")}
              {renderHeader("Serial Number", "serial_number")}
              {renderHeader("Protocol", "protocol")}
              {renderHeader("Connection", "connection_type")}
              {renderHeader("Firmware", "firmware_version")}
              {renderHeader("IP Address", "ip_address")}
              {renderHeader("Site", "site_name")}
              {renderHeader("Equipment", "equipment_name")}
              {renderHeader("Status", "status")}
              {renderHeader("Created", "created_at")}
              <th className="p-3 text-left">Service Notes</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.length ? (
              devices.map((d) => (
                <tr
                  key={d.device_id}
                  className="border-b hover:bg-gray-50 transition"
                >
                  <td
                    className="p-3 font-medium text-green-700 cursor-pointer hover:underline"
                    onClick={() => setSelectedDevice(d)}
                  >
                    {d.device_name}
                  </td>
                  <td className="p-3">{d.serial_number}</td>
                  <td className="p-3">{d.protocol || "—"}</td>
                  <td className="p-3">{d.connection_type || "—"}</td>
                  <td className="p-3">{d.firmware_version || "—"}</td>
                  <td className="p-3">{d.ip_address || "—"}</td>
                  <td className="p-3">{d.site_name || "—"}</td>
                  <td className="p-3">{d.equipment_name || "—"}</td>
                  <td
                    className={`p-3 font-medium ${
                      d.status === "active"
                        ? "text-green-600"
                        : d.status === "offline"
                        ? "text-orange-600"
                        : "text-gray-500"
                    }`}
                  >
                    {d.status || "unknown"}
                  </td>
                  <td className="p-3">
                    {new Date(d.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 italic text-gray-600">
                    {d.service_notes || "—"}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => deleteDevice(d.device_id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={12} className="text-center text-gray-500 p-4">
                  No devices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

{/* ===== ADD DEVICE MODAL ===== */}
{showAdd && (
  <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
    <div className="bg-white rounded-xl shadow-xl w-[450px] p-6">
      <h2 className="text-lg font-semibold mb-4">Add New Device</h2>

      <div className="space-y-3 text-sm">
        {[
          { key: "device_name", label: "Device Name" },
          { key: "serial_number", label: "Serial Number" },
          { key: "protocol", label: "Protocol" },
          { key: "connection_type", label: "Connection Type" },
          { key: "firmware_version", label: "Firmware Version" },
          { key: "ip_address", label: "IP Address" },
          { key: "site_id", label: "Site ID" },
          { key: "equipment_id", label: "Equipment ID" },
          { key: "service_notes", label: "Service Notes" },
        ].map((f) => (
          <div key={f.key}>
            <label className="block text-gray-600 mb-1">{f.label}</label>
            <input
              type="text"
              value={(newDevice as any)[f.key]}
              onChange={(e) =>
                setNewDevice({
                  ...newDevice,
                  [f.key]: e.target.value,
                })
              }
              className="w-full border rounded-md p-2 text-sm"
            />
          </div>
        ))}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setShowAdd(false)}
            className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            <X className="w-4 h-4 inline mr-1" /> Cancel
          </button>

          <button
            onClick={addDevice}
            className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400 hover:from-green-700 hover:to-yellow-500"
          >
            <Save className="w-4 h-4 inline mr-1" /> Add Device
          </button>
        </div>
      </div>
    </div>
  </div>
)}

    
      {/* ===== EDIT DEVICE MODAL ===== */}
      {selectedDevice && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white rounded-xl shadow-xl w-[450px] p-6">
            <h2 className="text-lg font-semibold mb-4">Edit Device</h2>

            <div className="space-y-3 text-sm">
              {[
                { key: "device_name", label: "Device Name" },
                { key: "serial_number", label: "Serial Number" },
                { key: "protocol", label: "Protocol" },
                { key: "connection_type", label: "Connection Type" },
                { key: "firmware_version", label: "Firmware Version" },
                { key: "ip_address", label: "IP Address" },
                { key: "service_notes", label: "Service Notes" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-gray-600 mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={(selectedDevice as any)[f.key] || ""}
                    onChange={(e) =>
                      setSelectedDevice({
                        ...selectedDevice,
                        [f.key]: e.target.value,
                      })
                    }
                    className="w-full border rounded-md p-2 text-sm"
                  />
                </div>
              ))}

              <div>
                <label className="block text-gray-600 mb-1">Status</label>
                <select
                  value={selectedDevice.status || ""}
                  onChange={(e) =>
                    setSelectedDevice({
                      ...selectedDevice,
                      status: e.target.value,
                    })
                  }
                  className="w-full border rounded-md p-2 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="offline">Offline</option>
                  <option value="inactive">Inactive</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setSelectedDevice(null)}
                className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                <X className="w-4 h-4 inline mr-1" /> Cancel
              </button>
              <button
                onClick={updateDevice}
                className="px-4 py-1.5 text-sm text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-400 hover:from-green-700 hover:to-yellow-500"
              >
                <Save className="w-4 h-4 inline mr-1" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
