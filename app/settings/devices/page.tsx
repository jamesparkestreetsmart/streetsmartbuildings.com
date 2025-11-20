"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Cpu, Plus, Trash2, ArrowUpDown, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import AddDeviceForm from "./adddeviceform";

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

  // ----------------------------
  // FETCH DEVICES
  // ----------------------------
  const fetchDevices = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("view_settings_devices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setDevices(data || []);

    setLoading(false);
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  // ----------------------------
  // SORT LOGIC
  // ----------------------------
  const sort = (column: keyof Device) => {
    const newOrder =
      sortColumn === column && sortOrder === "asc" ? "desc" : "asc";

    setSortColumn(column);
    setSortOrder(newOrder);

    setDevices((prev) =>
      [...prev].sort((a, b) => {
        const aVal = a[column] ?? "";
        const bVal = b[column] ?? "";
        if (aVal < bVal) return newOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return newOrder === "asc" ? 1 : -1;
        return 0;
      })
    );
  };

  const renderHeader = (label: string, column: keyof Device) => (
    <th
      onClick={() => sort(column)}
      className="p-3 text-left cursor-pointer hover:text-green-600"
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-4 h-4" />
      </div>
    </th>
  );

  // ----------------------------
  // DELETE DEVICE
  // ----------------------------
  const deleteDevice = async (device_id: string) => {
    if (!confirm("Delete this device?")) return;

    const { error } = await supabase
      .from("a_devices")
      .delete()
      .eq("device_id", device_id);

    if (error) {
      console.error(error);
      alert("Failed to delete device.");
      return;
    }

    fetchDevices();
  };

  // ----------------------------
  // RENDER
  // ----------------------------
  if (loading)
    return <div className="p-6 text-gray-500">Loading devices...</div>;

  return (
    <div className="p-6 space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </button>

        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-500"
        >
          <Plus className="w-4 h-4" /> Add Device
        </button>
      </div>

      {/* DEVICE TABLE */}
      <div className="bg-white shadow border rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700 uppercase">
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
              <th className="p-3">Service Notes</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {devices.map((d) => (
              <tr key={d.device_id} className="border-b hover:bg-gray-50">
                <td
                  className="p-3 font-medium text-green-700 cursor-pointer hover:underline"
                  onClick={() =>
                    router.push(`/settings/devices/${d.device_id}`)
                  }
                >
                  {d.device_name}
                </td>

                <td className="p-3">{d.serial_number}</td>
                <td className="p-3">{d.protocol}</td>
                <td className="p-3">{d.connection_type}</td>
                <td className="p-3">{d.firmware_version}</td>
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
                  {d.status}
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
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ADD DEVICE MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl w-[500px]">
            <AddDeviceForm
              newDevice={newDevice}
              setNewDevice={setNewDevice}
              setShowAdd={setShowAdd}
              fetchDevices={fetchDevices}
            />
          </div>
        </div>
      )}
    </div>
  );
}
