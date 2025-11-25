"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ========= TYPES =========

interface LibraryDevice {
  library_device_id: string;
  product_code: string;
  device_name: string;
  model: string;
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

interface AddDeviceFormProps {
  siteId: string;
  equipmentId: string;
}

interface DeviceFormState {
  device_name: string;
  protocol: string;
  connection_type: string;
  model: string;
  serial_number: string;
  firmware_version: string;
  ip_address: string;
}

// ========= COMPONENT =========

export default function AddDeviceForm({ siteId, equipmentId }: AddDeviceFormProps) {
  const [libraryOptions, setLibraryOptions] = useState<LibraryDevice[]>([]);

  const [form, setForm] = useState<DeviceFormState>({
    device_name: "",
    protocol: "",
    connection_type: "wireless",
    model: "",
    serial_number: "",
    firmware_version: "",
    ip_address: "",
  });

  const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");

  // ===== LOAD LIBRARY DEVICES =====
  useEffect(() => {
    const loadLibrary = async () => {
      const { data, error } = await supabase
        .from("library_devices")
        .select("*");

      console.log("DEBUG — library_devices response:", {
        data,
        error,
        rowCount: data?.length,
      });

      setLibraryOptions((data as LibraryDevice[]) || []);
    };

    loadLibrary();
  }, []);



  // ===== SAVE DEVICE =====
  // ===== SAVE DEVICE =====
const handleSave = async () => {
  // ---- 1. Insert Device ----
  const { data: device, error: deviceError } = await supabase
    .from("a_devices")
    .insert({
      site_id: siteId,
      equipment_id: equipmentId,
      device_name: form.device_name,
      protocol: form.protocol,
      connection_type: form.connection_type,
      model: form.model,
      serial_number: form.serial_number,
      firmware_version: form.firmware_version,
      ip_address: form.ip_address,
    })
    .select()
    .single();

  if (deviceError) {
    console.error(deviceError);
    alert("Failed to add device");
    return;
  }

  // ---- 2. Find matching library row ----
  const lib = libraryOptions.find(
    (l) => l.library_device_id === selectedLibraryId
  );

  if (!lib) {
    alert("Device created (no default sensors found).");
    return;
  }

  if (!lib.default_sensors || lib.default_sensors.length === 0) {
    alert("Device created (no sensors to generate).");
    return;
  }

  console.log("Generating sensors from:", lib.default_sensors);

  // ---- 3. Lookup mapping for all sensor types ----
  const sensorTypes = lib.default_sensors.map((s) => s.sensor_type);

  const { data: mappings, error: mappingError } = await supabase
    .from("library_sensor_type_mapping")
    .select("*")
    .in("sensor_type", sensorTypes);

  if (mappingError) {
    console.error(mappingError);
    alert("Device created but failed loading sensor mappings.");
    return;
  }

  // ---- 4. Build sensor insert array ----
  const sensors = lib.default_sensors.map((s) => {
    const map = mappings.find((m) => m.sensor_type === s.sensor_type);

    return {
      device_id: device.device_id,
      equipment_id: equipmentId,
      site_id: siteId,
      org_id: device.org_id,
      sensor_type: s.sensor_type,
      sensor_name: s.name,
      unit_of_measure: s.unit,
      protocol: device.protocol,
      scale_factor: 1,
      calibration_offset: 0,
      status: "active",
      log_table: map ? map.log_table : null,   // ← 🔥 ADD THIS
    };
  });

  // ---- 5. Insert sensors ----
  const { error: sensorError } = await supabase
    .from("a_sensors")
    .insert(sensors);

  if (sensorError) {
    console.error(sensorError);
    alert("Device added but sensors failed to generate.");
    return;
  }

  alert("Device + sensors added successfully!");
};

  return (
    <div className="space-y-4">

      {/* LIBRARY DROPDOWN */}
      <label className="block text-sm font-medium text-gray-700">
        Choose from Library (optional)
      </label>

      <select
        value={selectedLibraryId}
        onChange={(e) => {
          const val = e.target.value
          setSelectedLibraryId(val)

          if (!val) {
            setForm({
              device_name: "",
              protocol: "",
              connection_type: "wireless",
              model: "",
              serial_number: "",
              firmware_version: "",
              ip_address: "",
            })
            return
          }

          const lib = libraryOptions.find((l) => l.library_device_id === val)
          if (!lib) return

          setForm({
            device_name: lib.device_name ?? "",
            protocol: lib.protocol ?? "",
            connection_type: lib.connection_type ?? "wireless",
            model: lib.model ?? "",
            serial_number: "",
            firmware_version: "",
            ip_address: "",
          })
        }}
        className="w-full border rounded-md p-2"
      >
        <option value="">— Select a device —</option>

        {libraryOptions.map((lib) => (
          <option key={lib.library_device_id} value={lib.library_device_id}>
            {lib.device_name || `DEBUG: (device_name missing)`}  
          </option>
        ))}
      </select>

      {/* INPUT FIELDS */}
      {(
        [
          ["device_name", "Device Name"],
          ["protocol", "Protocol"],
          ["connection_type", "Connection Type"],
          ["model", "Model"],
          ["serial_number", "Serial Number"],
          ["firmware_version", "Firmware Version"],
          ["ip_address", "IP Address"],
        ] as [keyof DeviceFormState, string][]
      ).map(([key, label]) => (
        <div key={key}>
          <label className="block text-sm mb-1">{label}</label>
          <input
            type="text"
            className="w-full border rounded-md p-2"
            value={form[key] ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                [key]: e.target.value,
              })
            }
          />
        </div>
      ))}

      <button
        onClick={handleSave}
        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-md mt-4"
      >
        Save Device
      </button>
    </div>
  );
}


