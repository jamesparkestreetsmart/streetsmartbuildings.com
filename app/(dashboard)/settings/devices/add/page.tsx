"use client";

// app/settings/devices/add/page.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AddDeviceForm, { NewDevice } from "./AddDeviceForm";

export default function AddDevicePage() {
  const router = useRouter();

  const [newDevice, setNewDevice] = useState<NewDevice>({
    device_name: "",
    serial_number: "",
    protocol: "",
    connection_type: "",
    firmware_version: "",
    ip_address: "",
    site_id: "",
    equipment_id: "",
    status: "active",
  });

  return (
    <div className="p-6 space-y-6">
      {/* BACK BUTTON */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-xl font-semibold">Add Device</h1>

      <AddDeviceForm
        newDevice={newDevice}
        setNewDevice={setNewDevice}
        setShowAdd={() => router.back()}
        fetchDevices={async () => {
          /* no-op for page usage */
        }}
      />
    </div>
  );
}
