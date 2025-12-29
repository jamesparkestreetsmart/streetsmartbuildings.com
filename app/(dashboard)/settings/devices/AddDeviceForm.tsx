// app/(dashboard)/settings/devices/adddeviceform.tsx
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
  // LOAD LIBRARY + SITES + EQUIPMENT
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

    if (libRes.data) {
      setLibraryOptions(libRes.data as LibraryDevice[]);
    }

    if (sitesRes.data) {
      setSites(sitesRes.data as Site[]);
    }

    if (eqRes.data) {
      setEquipment(eqRes.data as Equipment[]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadInitialData();
    })();
  }, [loadInitialData]);

  // =========================
  // TEMPLATE SELECT
  // =========================
  const handleTemplateSelect = (libraryId: string) => {
    setSelectedLibraryId(libraryId);

    if (!libraryId) {
      // Reset device fields but keep site/equipment/status/service_notes
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
      // leave site_id, equipment_id, status, service_notes as-is
    }));
  };

  // =========================
  // SAVE (DEVICE + OPTIONAL SENSORS)
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
      })
      .select()
      .single();

    if (deviceError || !device) {
      console.error(deviceError);
      alert("Failed to add device.");
      return;
    }

    // 2) If no library template selected, we're done
    const lib = libraryOptions.find(
      (l) => l.library_device_id === selectedLibraryId
    );
    if (!lib || !lib.default_sensors || lib.default_sensors.length === 0) {
      await fetchDevices();
      setShowAdd(false);
      alert("Device created.");
      return;
    }

    // 3) Load mappings for all sensor types
    const sensorTypes = lib.default_sensors.map((s) => s.sensor_type);

    const { data: mappings, error: mappingError } = await supabase
      .from("library_sensor_type_mapping")
      .select("*")
      .in("sensor_type", sensorTypes);

    if (mappingError) {
      console.error(mappingError);
      alert("Device created, but failed to load sensor mappings.");
      await fetchDevices();
      setShowAdd(false);
      return;
    }

    // 4) Build a_sensors rows
    const sensorsToInsert = lib.default_sensors.map((s) => {
      const map = (mappings ?? []).find(
        (m: Record<string, unknown>) => m.sensor_type === s.sensor_type
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
        log_table: map ? map.log_table : null,
      };
    });

    const { error: sensorError } = await supabase
      .from("a_sensors")
      .insert(sensorsToInsert);

    if (sensorError) {
      console.error(sensorError);
      alert("Device added, but sensors failed to generate.");
    } else {
      alert("Device and default sensors added successfully!");
    }

    await fetchDevices();
    setShowAdd(false);
  };

  // =========================
  // RENDER
  // =========================
  return (
    <div className="space-y-4">
      {/* TEMPLATE DROPDOWN */}
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

      {/* BASIC FIELDS */}
      {(
        [
          ["device_name", "Device Name"],
          ["serial_number", "Serial Number"],
          ["protocol", "Protocol"],
          ["connection_type", "Connection Type"],
          ["model", "Model (optional)"],
          ["firmware_version", "Firmware Version"],
          ["ip_address", "IP Address"],
        ] as [keyof NewDevice | "model", string][]
      ).map(([key, label]) => {
        // "model" is not in NewDevice, so keep it from template only (no persistence)
        if (key === "model") {
          return (
            <div key={key}>
              <label className="block text-sm mb-1">{label}</label>
              <input
                type="text"
                className="w-full border rounded-md p-2"
                // read-only placeholder for now based off library model if needed
                placeholder="(optional)"
                disabled
              />
            </div>
          );
        }

        const nk = key as keyof NewDevice;

        return (
          <div key={nk}>
            <label className="block text-sm mb-1">{label}</label>
            <input
              type="text"
              className="w-full border rounded-md p-2"
              value={newDevice[nk] ?? ""}
              onChange={(e) =>
                setNewDevice((prev) => ({
                  ...prev,
                  [nk]: e.target.value,
                }))
              }
            />
          </div>
        );
      })}

      {/* SITE */}
      <div>
        <label className="block text-sm mb-1">Site</label>
        <select
          className="w-full border rounded-md p-2"
          value={newDevice.site_id}
          onChange={(e) => {
            const site_id = e.target.value;
            setNewDevice((prev) => ({
              ...prev,
              site_id,
              equipment_id: "", // reset equipment when site changes
            }));
          }}
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

      {/* SERVICE NOTES */}
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

      {/* BUTTONS */}
      <div className="flex justify-end gap-3 mt-4">
        <button
          onClick={() => setShowAdd(false)}
          className="px-4 py-1.5 text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-1.5 text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-500 hover:from-green-700 hover:to-yellow-600"
        >
          Save Device
        </button>
      </div>
    </div>
  );
}
