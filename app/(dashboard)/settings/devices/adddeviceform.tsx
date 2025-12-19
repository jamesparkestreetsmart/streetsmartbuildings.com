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
  device_name: string; // human-friendly name
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
  library_device_name: string; // ✅ template name (renamed conceptually)
  product_code: string;
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
      supabase
        .from("library_devices")
        .select(`
          library_device_id,
          library_device_name,
          product_code,
          manufacturer,
          model,
          protocol,
          connection_type,
          zwave_lr,
          default_sensors
        `),
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
  // TEMPLATE SELECT (NO NAME OVERWRITE)
  // =========================
  const handleTemplateSelect = (libraryId: string) => {
    setSelectedLibraryId(libraryId);

    if (!libraryId) return;

    const lib = libraryOptions.find(
      (l) => l.library_device_id === libraryId
    );
    if (!lib) return;

    // ✅ Only pre-fill technical attributes
    setNewDevice((prev) => ({
      ...prev,
      protocol: lib.protocol ?? prev.protocol,
      connection_type: lib.connection_type ?? prev.connection_type,
    }));
  };

  // =========================
  // SAVE DEVICE
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

    const lib = libraryOptions.find(
      (l) => l.library_device_id === selectedLibraryId
    );

    // 1) Insert device
    const { data: device, error: deviceError } = await supabase
      .from("a_devices")
      .insert({
        device_name: newDevice.device_name, // ✅ human name
        site_id: newDevice.site_id,
        equipment_id: newDevice.equipment_id,
        protocol: newDevice.protocol,
        connection_type: newDevice.connection_type,
        serial_number: newDevice.serial_number,
        firmware_version: newDevice.firmware_version,
        ip_address: newDevice.ip_address || null,
        status: newDevice.status,
        service_notes: newDevice.service_notes || null,

        // template linkage
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

    // 2) Create default sensors (if any)
    if (!lib?.default_sensors?.length) {
      await fetchDevices();
      setShowAdd(false);
      return;
    }

    const sensorTypes = lib.default_sensors.map((s) => s.sensor_type);

    const { data: mappings } = await supabase
      .from("library_sensor_type_mapping")
      .select("*")
      .in("sensor_type", sensorTypes);

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

    await supabase.from("a_sensors").insert(sensorsToInsert);

    await fetchDevices();
    setShowAdd(false);
  };

  // =========================
  // RENDER
  // =========================
  return (
    <div className="space-y-4">
      {/* DEVICE TEMPLATE */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Device Template
        </label>
        <select
          className="w-full border rounded-md p-2"
          value={selectedLibraryId}
          onChange={(e) => handleTemplateSelect(e.target.value)}
        >
          <option value="">— Custom Device —</option>
          {libraryOptions.map((lib) => (
            <option key={lib.library_device_id} value={lib.library_device_id}>
              {lib.library_device_name}
            </option>
          ))}
        </select>
      </div>

      {/* DEVICE NAME */}
      <div>
        <label className="block text-sm mb-1">Device Name</label>
        <input
          className="w-full border rounded-md p-2"
          value={newDevice.device_name}
          onChange={(e) =>
            setNewDevice((prev) => ({
              ...prev,
              device_name: e.target.value,
            }))
          }
        />
      </div>

      {/* Rest of form unchanged */}
      {/* (Serial, protocol, site, equipment, save button, etc.) */}
    </div>
  );
}
