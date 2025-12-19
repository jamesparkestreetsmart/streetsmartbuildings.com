"use client";

import {
  useEffect,
  useState,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";
import { supabase } from "@/lib/supabaseClient";

export interface NewDevice {
  device_name: string;
  serial_number: string;
  protocol: string;
  connection_type: string;
  firmware_version: string;
  ip_address: string;
  site_id: string;
  equipment_id: string;
  status: string;
  service_notes: string;
}

interface AddDeviceFormProps {
  newDevice: NewDevice;
  setNewDevice: Dispatch<SetStateAction<NewDevice>>;
  setShowAdd: (v: boolean) => void;
  fetchDevices: () => Promise<void>;
}

interface LibraryDevice {
  library_device_id: string;
  product_code: string;
  device_name: string;
  manufacturer?: string | null;
  model?: string | null;
  protocol: string | null;
  connection_type: string | null;
  zwave_lr?: boolean | null;
  default_sensors: {
    name: string;
    unit: string | null;
    sensor_type: string;
    entity_suffix: string;
  }[];
}

interface Site {
  site_id: string;
  site_name: string;
  status: string | null;
}

interface Equipment {
  equipment_id: string;
  equipment_name: string;
  site_id: string;
  status: string | null;
}

export default function AddDeviceForm({
  newDevice,
  setNewDevice,
  setShowAdd,
  fetchDevices,
}: AddDeviceFormProps) {
  const [libraryOptions, setLibraryOptions] = useState<LibraryDevice[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");

  // =========================
  // LOAD INITIAL DATA
  // =========================
  const loadInitialData = useCallback(async () => {
    const [libRes, sitesRes, eqRes] = await Promise.all([
      supabase.from("library_devices").select("*"),
      supabase
        .from("a_sites")
        .select("site_id, site_name, status")
        .order("site_name"),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, site_id, status")
        .order("equipment_name"),
    ]);

    if (libRes.data) setLibraryOptions(libRes.data as LibraryDevice[]);
    if (sitesRes.data) setSites(sitesRes.data as Site[]);
    if (eqRes.data) setEquipment(eqRes.data as Equipment[]);
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // =========================
  // TEMPLATE SELECT
  // =========================
  const handleTemplateSelect = (libraryId: string) => {
    setSelectedLibraryId(libraryId);

    if (!libraryId) {
      setNewDevice((prev) => ({
        ...prev,
        device_name: "",
        protocol: "",
        connection_type: "",
        firmware_version: "",
      }));
      return;
    }

    const lib = libraryOptions.find(
      (l) => l.library_device_id === libraryId
    );
    if (!lib) return;

    setNewDevice((prev) => ({
      ...prev,
      device_name: lib.device_name ?? "",
      protocol: lib.protocol ?? "",
      connection_type: lib.connection_type ?? "wireless",
      firmware_version: "",
    }));
  };

  // =========================
  // SAVE
  // =========================
  const handleSave = async () => {
    if (!newDevice.device_name || !newDevice.serial_number) {
      alert("Device Name & Serial Number are required.");
      return;
    }

    if (!newDevice.site_id || !newDevice.equipment_id) {
      alert("Please select both a Site and Equipment.");
      return;
    }

    // 🔑 Resolve library device ONCE
    const lib = libraryOptions.find(
      (l) => l.library_device_id === selectedLibraryId
    );

    // 1) Insert device
    const { data: device, error: deviceError } = await supabase
      .from("a_devices")
      .insert({
        site_id: newDevice.site_id,
        equipment_id: newDevice.equipment_id,
        device_name: newDevice.device_name,
        protocol: newDevice.protocol,
        connection_type: newDevice.connection_type,
        serial_number: newDevice.serial_number,
        firmware_version: newDevice.firmware_version,
        ip_address: newDevice.ip_address || null,
        status: newDevice.status,
        service_notes: newDevice.service_notes || null,

        // Library metadata
        library_device_id: lib?.library_device_id ?? null,
        manufacturer: lib?.manufacturer ?? null,
        model: lib?.model ?? null,
        zwave_lr: lib?.zwave_lr ?? null,
      })
      .select()
      .single();

    if (deviceError || !device) {
      console.error(deviceError);
      alert("Failed to add device.");
      return;
    }

    // 2) No sensors to add
    if (!lib || !lib.default_sensors?.length) {
      await fetchDevices();
      setShowAdd(false);
      alert("Device created.");
      return;
    }

    // 3) Load sensor mappings
    const sensorTypes = lib.default_sensors.map((s) => s.sensor_type);

    const { data: mappings, error: mappingError } = await supabase
      .from("library_sensor_type_mapping")
      .select("*")
      .in("sensor_type", sensorTypes);

    if (mappingError) {
      console.error(mappingError);
      alert("Device created, but sensor mappings failed.");
      await fetchDevices();
      setShowAdd(false);
      return;
    }

    // 4) Insert sensors
    const sensorsToInsert = lib.default_sensors.map((s) => {
      const map = mappings?.find(
        (m: any) => m.sensor_type === s.sensor_type
      );

      return {
        device_id: device.device_id,
        equipment_id: newDevice.equipment_id,
        site_id: newDevice.site_id,
        org_id: device.org_id,
        sensor_type: s.sensor_type,
        sensor_name: s.name,
        unit_of_measure: s.unit,
        protocol: device.protocol,
        scale_factor: 1,
        calibration_offset: 0,
        status: "active",
        log_table: map?.log_table ?? null,
      };
    });

    const { error: sensorError } = await supabase
      .from("a_sensors")
      .insert(sensorsToInsert);

    if (sensorError) {
      console.error(sensorError);
      alert("Device added, but sensors failed.");
    } else {
      alert("Device and default sensors added!");
    }

    await fetchDevices();
    setShowAdd(false);
  };

  // =========================
  // RENDER
  // =========================
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Device Template (optional)
        </label>
        <select
          value={selectedLibraryId}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          className="w-full border rounded-md p-2"
        >
          <option value="">— Select from Library —</option>
          {libraryOptions.map((lib) => (
            <option key={lib.library_device_id} value={lib.library_device_id}>
              {lib.device_name || "(Unnamed library device)"}
            </option>
          ))}
        </select>
      </div>

      {(
        [
          ["device_name", "Device Name"],
          ["serial_number", "Serial Number"],
          ["protocol", "Protocol"],
          ["connection_type", "Connection Type"],
          ["firmware_version", "Firmware Version"],
          ["ip_address", "IP Address"],
        ] as [keyof NewDevice, string][]
      ).map(([key, label]) => (
        <div key={key}>
          <label className="block text-sm mb-1">{label}</label>
          <input
            type="text"
            className="w-full border rounded-md p-2"
            value={newDevice[key] ?? ""}
            onChange={(e) =>
              setNewDevice((prev) => ({
                ...prev,
                [key]: e.target.value,
              }))
            }
          />
        </div>
      ))}

      <div>
        <label className="block text-sm mb-1">Site</label>
        <select
          className="w-full border rounded-md p-2"
          value={newDevice.site_id}
          onChange={(e) =>
            setNewDevice((prev) => ({
              ...prev,
              site_id: e.target.value,
              equipment_id: "",
            }))
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

      <div>
        <label className="block text-sm mb-1">Equipment</label>
        <select
          className="w-full border rounded-md p-2"
          value={newDevice.equipment_id}
          onChange={(e) =>
            setNewDevice((prev) => ({
              ...prev,
              equipment_id: e.target.value,
            }))
          }
        >
          <option value="">Select Equipment</option>
          {equipment
            .filter(
              (eq) =>
                !newDevice.site_id || eq.site_id === newDevice.site_id
            )
            .map((eq) => (
              <option key={eq.equipment_id} value={eq.equipment_id}>
                {eq.equipment_name}
              </option>
            ))}
        </select>
      </div>

      <div>
        <label className="block text-sm mb-1">Service Notes</label>
        <textarea
          className="w-full border rounded-md p-2"
          value={newDevice.service_notes}
          onChange={(e) =>
            setNewDevice((prev) => ({
              ...prev,
              service_notes: e.target.value,
            }))
          }
        />
      </div>

      <div className="flex justify-end gap-3 mt-4">
        <button
          onClick={() => setShowAdd(false)}
          className="px-4 py-1.5 text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-1.5 text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-500"
        >
          Save Device
        </button>
      </div>
    </div>
  );
}
