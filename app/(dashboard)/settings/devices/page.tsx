"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { Plus, Trash2, ArrowUpDown, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import AddDeviceForm from "./AddDeviceForm";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Device {
  device_id: string;
  status: string;
  device_name: string;
  site_name: string | null;
  equipment_name: string | null;
  ha_device_id: string | null;
  template_name: string | null;
  device_role: string;
  ip_address: string | null;
  serial_number: string;
  firmware_version: string | null;

  // ✅ already correct
  last_message: string | null;

  created_at: string;
}

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const [sortColumn, setSortColumn] =
    useState<keyof Device>("created_at");
  const [sortOrder, setSortOrder] =
    useState<"asc" | "desc">("desc");

  const fetchDevices = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("view_settings_devices")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setDevices(data ?? []);
    else console.error(error);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const sort = (column: keyof Device) => {
    const order =
      sortColumn === column && sortOrder === "asc" ? "desc" : "asc";

    setSortColumn(column);
    setSortOrder(order);

    setDevices((prev) =>
      [...prev].sort((a, b) => {
        const av = a[column] ?? "";
        const bv = b[column] ?? "";
        return av < bv ? (order === "asc" ? -1 : 1)
             : av > bv ? (order === "asc" ? 1 : -1)
             : 0;
      })
    );
  };

  const deleteDevice = async (device_id: string) => {
    if (!confirm("Delete this device?")) return;

    const { error } = await supabase
      .from("a_devices")
      .delete()
      .eq("device_id", device_id);

    if (error) alert("Failed to delete device.");
    else fetchDevices();
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading devices…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center gap-2 text-sm text-green-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </button>

        <button
          className="flex items-center gap-2 px-4 py-2 text-white rounded-md
                     bg-gradient-to-r from-green-600 to-yellow-500"
        >
          <Plus className="w-4 h-4" /> Add Device
        </button>
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 uppercase">
            <tr>
              {[
                ["Status", "status"],
                ["Device Name", "device_name"],
                ["Site", "site_name"],
                ["Equipment", "equipment_name"],
                ["HA Device ID", "ha_device_id"],
                ["Template", "template_name"],
                ["Role", "device_role"],
                ["IP Address", "ip_address"],
                ["Serial", "serial_number"],
                ["Firmware", "firmware_version"],

                // ✅ NEW COLUMN
                ["Last Message", "last_message"],
              ].map(([label, key]) => (
                <th
                  key={key}
                  onClick={() => sort(key as keyof Device)}
                  className="p-3 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-1">
                    {label}
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                </th>
              ))}
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {devices.map((d) => (
              <tr key={d.device_id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{d.status}</td>

                <td
                  className="p-3 text-green-700 cursor-pointer hover:underline"
                  onClick={() =>
                    router.push(`/settings/devices/${d.device_id}`)
                  }
                >
                  {d.device_name}
                </td>

                <td className="p-3">{d.site_name ?? "—"}</td>
                <td className="p-3">{d.equipment_name ?? "—"}</td>
                <td className="p-3">{d.ha_device_id ?? "—"}</td>
                <td className="p-3">{d.template_name ?? "—"}</td>
                <td className="p-3">{d.device_role}</td>
                <td className="p-3">{d.ip_address ?? "—"}</td>
                <td className="p-3">{d.serial_number}</td>
                <td className="p-3">{d.firmware_version ?? "—"}</td>

                {/* ✅ NEW CELL */}
                <td className="p-3 italic text-gray-600 max-w-[320px] truncate">
                  {d.last_message ?? "—"}
                </td>

                <td className="p-3 text-center">
                  <button
                    onClick={() => deleteDevice(d.device_id)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
