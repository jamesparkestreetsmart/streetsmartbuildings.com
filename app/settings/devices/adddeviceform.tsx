"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Save, X } from "lucide-react";

interface AddDeviceFormProps {
  newDevice: any;
  setNewDevice: (v: any) => void;
  setShowAdd: (v: boolean) => void;
  fetchDevices: () => void;
}

interface LibraryDevice {
  library_device_id: string;
  device_name: string;
  manufacturer: string;
  model: string;
  protocol: string | null;
  connection_type: string | null;
  default_firmware: string | null;
  default_sensors: string | null;
  device_role: string | null;
}

interface Site {
  site_id: string;
  site_name: string;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  site_id: string;
}

export default function AddDeviceForm({
  newDevice,
  setNewDevice,
  setShowAdd,
  fetchDevices,
}: AddDeviceFormProps) {
  const [libraryDevices, setLibraryDevices] = useState<LibraryDevice[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // ============================
  // LOAD LIBRARY DEVICES, SITES, EQUIPMENT
  // ============================
  useEffect(() => {
    const load = async () => {
      const { data: lib } = await supabase
        .from("library_devices")
        .select("*")
        .order("device_name");

      const { data: sitesData } = await supabase
        .from("a_sites")
        .select("site_id, site_name")
        .order("site_name");

      const { data: eqData } = await supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, site_id")
        .order("equipment_name");

      setLibraryDevices(lib || []);
      setSites(sitesData || []);
      setEquipment(eqData || []);
    };

    load();
  }, []);

  // ============================
  // SELECT TEMPLATE → autofill fields
  // ============================
  const handleTemplateSelect = (id: string) => {
    const template = libraryDevices.find((l) => l.library_device_id === id);
    if (!template) return;

    setNewDevice({
      ...newDevice,
      device_name: template.device_name,
      protocol: template.protocol || "",
      connection_type: template.connection_type || "",
      firmware_version: template.default_firmware || "",
    });
  };

  // ============================
  // SAVE NEW DEVICE
  // ============================
  const save = async () => {
    if (!newDevice.device_name || !newDevice.serial_number) {
      alert("Device Name & Serial Number required.");
      return;
    }

    const { error } = await supabase.from("a_devices").insert([
      {
        device_name: newDevice.device_name,
        serial_number: newDevice.serial_number,
        protocol: newDevice.protocol,
        connection_type: newDevice.connection_type,
        firmware_version: newDevice.firmware_version,
        ip_address: newDevice.ip_address || null,
        site_id: newDevice.site_id || null,
        equipment_id: newDevice.equipment_id || null,
        status: newDevice.status,
        service_notes: newDevice.service_notes || null,
      },
    ]);

    if (error) {
      console.error(error);
      alert("Error adding device.");
      return;
    }

    setShowAdd(false);
    fetchDevices();
  };

  // ============================
  // RENDER
  // ============================
  return (
    <div>
      {/* TEMPLATE */}
      <div className="mb-3">
        <label className="block text-sm font-semibold mb-1">Device Template</label>
        <select
          className="w-full border rounded-md p-2"
          onChange={(e) => handleTemplateSelect(e.target.value)}
        >
          <option value="">Select Template...</option>
          {libraryDevices.map((d) => (
            <option key={d.library_device_id} value={d.library_device_id}>
              {d.device_name}
            </option>
          ))}
        </select>
      </div>

      {/* DEVICE NAME */}
      <div className="mb-3">
        <label className="block text-sm">Device Name</label>
        <input
          className="w-full border rounded-md p-2"
          value={newDevice.device_name}
          onChange={(e) => setNewDevice({ ...newDevice, device_name: e.target.value })}
        />
      </div>

      {/* SERIAL */}
      <div className="mb-3">
        <label className="block text-sm">Serial Number</label>
        <input
          className="w-full border rounded-md p-2"
          value={newDevice.serial_number}
          onChange={(e) => setNewDevice({ ...newDevice, serial_number: e.target.value })}
        />
      </div>

      {/* PROTOCOL */}
      <div className="mb-3">
        <label className="block text-sm">Protocol</label>
        <input
          className="w-full border rounded-md p-2"
          value={newDevice.protocol}
          onChange={(e) => setNewDevice({ ...newDevice, protocol: e.target.value })}
        />
      </div>

      {/* CONNECTION TYPE */}
      <div className="mb-3">
        <label className="block text-sm">Connection</label>
        <input
          className="w-full border rounded-md p-2"
          value={newDevice.connection_type}
          onChange={(e) => setNewDevice({ ...newDevice, connection_type: e.target.value })}
        />
      </div>

      {/* FIRMWARE */}
      <div className="mb-3">
        <label className="block text-sm">Firmware</label>
        <input
          className="w-full border rounded-md p-2"
          value={newDevice.firmware_version}
          onChange={(e) =>
            setNewDevice({ ...newDevice, firmware_version: e.target.value })
          }
        />
      </div>

      {/* SITE */}
      <div className="mb-3">
        <label className="block text-sm">Site</label>
        <select
          className="w-full border rounded-md p-2"
          value={newDevice.site_id}
          onChange={(e) =>
            setNewDevice({ ...newDevice, site_id: e.target.value, equipment_id: "" })
          }
        >
          <option value="">Select Site</option>
          {sites.map((s) => (
            <option key={s.site_id} value={s.site_id}>
              {s.site_name}
            </option>
          ))}
        </select>
      </div>

      {/* EQUIPMENT */}
      <div className="mb-3">
        <label className="block text-sm">Equipment</label>
        <select
          className="w-full border rounded-md p-2"
          value={newDevice.equipment_id}
          onChange={(e) => setNewDevice({ ...newDevice, equipment_id: e.target.value })}
        >
          <option value="">Select Equipment</option>
          {equipment
            .filter((eq) => !newDevice.site_id || eq.site_id === newDevice.site_id)
            .map((eq) => (
              <option key={eq.equipment_id} value={eq.equipment_id}>
                {eq.equipment_name}
              </option>
            ))}
        </select>
      </div>

      {/* SERVICE NOTES */}
      <div className="mb-3">
        <label className="block text-sm">Service Notes</label>
        <textarea
          className="w-full border rounded-md p-2"
          value={newDevice.service_notes}
          onChange={(e) =>
            setNewDevice({ ...newDevice, service_notes: e.target.value })
          }
        />
      </div>

      {/* BUTTONS */}
      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={() => setShowAdd(false)}
          className="px-4 py-1.5 text-gray-600 hover:text-gray-800"
        >
          <X className="w-4 h-4 inline mr-1" /> Cancel
        </button>

        <button
          onClick={save}
          className="px-4 py-1.5 text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-500 hover:from-green-700 hover:to-yellow-600"
        >
          <Save className="w-4 h-4 inline mr-1" /> Add Device
        </button>
      </div>
    </div>
  );
}
