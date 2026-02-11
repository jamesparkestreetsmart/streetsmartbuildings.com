"use client";

import {
  useEffect,
  useState,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { useOrg } from "@/context/OrgContext";
import type { NewDevice } from "@/types/device";

/* =========================
   TYPES
========================= */

interface AddDeviceFormProps {
  newDevice: NewDevice;
  setNewDevice: Dispatch<SetStateAction<NewDevice>>;
  setShowAdd: (v: boolean) => void;
  fetchDevices: () => Promise<void>;
  /** Pre-select equipment when navigating from equipment page */
  preselectedEquipmentId?: string;
  preselectedSiteId?: string;
}

interface LibraryDevice {
  library_device_id: string;
  template_name: string;
  manufacturer: string | null;
  model: string | null;
  protocol: string | null;
  connection_type: string | null;
  zwave_lr?: boolean | null;
  device_role: string | null;
  compatible_phases: string[] | null;
  default_sensors: {
    name: string;
    unit: string | null;
    sensor_type: string;
    entity_suffix: string;
    phases?: string[];
  }[];
}

interface PhaseConfig {
  phase_code: string;
  description: string;
  num_phases: number;
  num_wires: number;
  has_neutral: boolean;
  sort_order: number;
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

/* =========================
   CONSTANTS
========================= */

const COMMON_BAUD_RATES = [9600, 19200, 38400, 57600, 115200];
const PARITY_OPTIONS = [
  { value: "N", label: "None" },
  { value: "E", label: "Even" },
  { value: "O", label: "Odd" },
];
const STOP_BITS_OPTIONS = [1, 2];
const SERVICE_VOLTAGES = [120, 208, 240, 277, 480];

/* =========================
   COMPONENT
========================= */

export default function AddDeviceForm({
  newDevice,
  setNewDevice,
  setShowAdd,
  fetchDevices,
  preselectedEquipmentId,
  preselectedSiteId,
}: AddDeviceFormProps) {
  const { selectedOrgId } = useOrg();

  const [libraryOptions, setLibraryOptions] = useState<LibraryDevice[]>([]);
  const [phaseConfigs, setPhaseConfigs] = useState<PhaseConfig[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Energy meter specific fields
  const [phaseConfiguration, setPhaseConfiguration] = useState<string>("");
  const [modbusAddress, setModbusAddress] = useState<number>(1);
  const [modbusBaudRate, setModbusBaudRate] = useState<number>(19200);
  const [modbusParity, setModbusParity] = useState<string>("E");
  const [modbusStopBits, setModbusStopBits] = useState<number>(1);
  const [electricalServiceVoltage, setElectricalServiceVoltage] =
    useState<number | "">("");

  // Derived state
  const selectedTemplate = libraryOptions.find(
    (l) => l.library_device_id === selectedLibraryId
  );
  const isEnergyMeter = selectedTemplate?.device_role === "energy_meter";
  const showPhaseConfig =
    selectedTemplate?.compatible_phases &&
    selectedTemplate.compatible_phases.length > 0;

  // Filter phase configs to only those compatible with selected template
  const availablePhases = showPhaseConfig
    ? phaseConfigs.filter((pc) =>
        selectedTemplate!.compatible_phases!.includes(pc.phase_code)
      )
    : [];

  // Sensors that apply to the selected phase config (for preview only)
  const applicableSensors =
    selectedTemplate && phaseConfiguration
      ? selectedTemplate.default_sensors.filter(
          (s) => !s.phases || s.phases.includes(phaseConfiguration)
        )
      : selectedTemplate?.default_sensors ?? [];

  /* =========================
     LOAD INITIAL DATA
  ========================= */
  const loadInitialData = useCallback(async () => {
    if (!selectedOrgId) return;

    const [libRes, phaseRes, sitesRes, eqRes] = await Promise.all([
      supabase
        .from("library_devices")
        .select(
          "library_device_id, template_name, manufacturer, model, protocol, connection_type, zwave_lr, device_role, compatible_phases, default_sensors"
        )
        .order("template_name"),
      supabase
        .from("library_phase_configurations")
        .select("*")
        .order("sort_order"),
      supabase
        .from("a_sites")
        .select("site_id, site_name, status")
        .eq("org_id", selectedOrgId)
        .order("site_name"),
      supabase
        .from("a_equipments")
        .select("equipment_id, equipment_name, site_id, status")
        .eq("org_id", selectedOrgId)
        .order("equipment_name"),
    ]);

    if (libRes.data) setLibraryOptions(libRes.data as LibraryDevice[]);
    if (phaseRes.data) setPhaseConfigs(phaseRes.data as PhaseConfig[]);
    if (sitesRes.data) setSites(sitesRes.data as Site[]);
    if (eqRes.data) setEquipment(eqRes.data as Equipment[]);
  }, [selectedOrgId]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Apply preselections after data loads
  useEffect(() => {
    if (preselectedSiteId && sites.length > 0) {
      setNewDevice((prev) => ({ ...prev, site_id: preselectedSiteId }));
    }
  }, [preselectedSiteId, sites, setNewDevice]);

  useEffect(() => {
    if (preselectedEquipmentId && equipment.length > 0) {
      setNewDevice((prev) => ({
        ...prev,
        equipment_id: preselectedEquipmentId,
      }));
    }
  }, [preselectedEquipmentId, equipment, setNewDevice]);

  /* =========================
     TEMPLATE SELECT
  ========================= */
  const handleTemplateSelect = (libraryId: string) => {
    setSelectedLibraryId(libraryId);
    setPhaseConfiguration(""); // Reset phase when template changes

    if (!libraryId) {
      setNewDevice((prev) => ({
        ...prev,
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
      protocol: lib.protocol ?? "",
      connection_type: lib.connection_type ?? "wireless",
      firmware_version: "",
    }));

    // Set modbus defaults for energy meters
    if (lib.device_role === "energy_meter") {
      setModbusBaudRate(19200);
      setModbusParity("E");
      setModbusStopBits(1);
      setModbusAddress(1);
    }
  };

  /* =========================
     SAVE DEVICE
  ========================= */
  const handleSave = async () => {
    if (!selectedOrgId) {
      alert("Please select an organization first.");
      return;
    }

    if (!newDevice.device_name || !newDevice.serial_number) {
      alert("Device Name & Serial Number are required.");
      return;
    }

    if (!newDevice.site_id || !newDevice.equipment_id) {
      alert("Please select both a Site and Equipment.");
      return;
    }

    if (showPhaseConfig && !phaseConfiguration) {
      alert("Please select a Phase Configuration for this meter.");
      return;
    }

    setSaving(true);

    const lib = libraryOptions.find(
      (l) => l.library_device_id === selectedLibraryId
    );

    /* ---- Build insert payload ---- */
    const insertPayload: Record<string, any> = {
      org_id: selectedOrgId,
      site_id: newDevice.site_id,
      equipment_id: newDevice.equipment_id,
      device_name: newDevice.device_name,
      template_name: lib?.template_name ?? null,
      library_device_id: lib?.library_device_id ?? null,
      protocol: newDevice.protocol,
      connection_type: newDevice.connection_type,
      serial_number: newDevice.serial_number,
      firmware_version: newDevice.firmware_version,
      ip_address: newDevice.ip_address || null,
      status: newDevice.status,
      device_role: lib?.device_role ?? null,
    };

    // Add energy meter fields
    if (isEnergyMeter) {
      insertPayload.phase_configuration = phaseConfiguration || null;
      insertPayload.modbus_address = modbusAddress;
      insertPayload.modbus_baud_rate = modbusBaudRate;
      insertPayload.modbus_parity = modbusParity;
      insertPayload.modbus_stop_bits = modbusStopBits;
      if (electricalServiceVoltage !== "") {
        insertPayload.electrical_service_voltage = electricalServiceVoltage;
      }
    }

    /* ---- Insert Device ---- */
    const { error: deviceError } = await supabase
      .from("a_devices")
      .insert(insertPayload)
      .select()
      .single();

    if (deviceError) {
      console.error(deviceError);
      alert("Failed to add device.");
      setSaving(false);
      return;
    }

    /* ---- Done — sensors are resolved at runtime from library_devices.default_sensors ---- */
    await fetchDevices();
    setShowAdd(false);
    alert("Device created successfully!");
    setSaving(false);
  };

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="space-y-4">
      {/* TEMPLATE */}
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
              {lib.template_name}
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

      {/* ================================
          PHASE CONFIGURATION (energy meters)
      ================================ */}
      {showPhaseConfig && (
        <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span className="text-sm font-semibold text-blue-800">
              Electrical Configuration
            </span>
          </div>

          {/* Phase Config Dropdown */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Phase Configuration{" "}
              <span className="text-red-500">*</span>
            </label>
            <select
              value={phaseConfiguration}
              onChange={(e) => setPhaseConfiguration(e.target.value)}
              className={`w-full border rounded-md p-2 ${
                !phaseConfiguration ? "border-amber-400 bg-amber-50/30" : ""
              }`}
            >
              <option value="">— Select Phase Configuration —</option>
              {availablePhases.map((pc) => (
                <option key={pc.phase_code} value={pc.phase_code}>
                  {pc.phase_code} — {pc.description}
                </option>
              ))}
            </select>
            {!phaseConfiguration && (
              <p className="text-xs text-amber-600 mt-1">
                Match this to the wiring configuration shown on the meter
                display
              </p>
            )}
          </div>

          {/* Electrical Service Voltage */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Electrical Service Voltage
            </label>
            <select
              value={electricalServiceVoltage}
              onChange={(e) =>
                setElectricalServiceVoltage(
                  e.target.value ? Number(e.target.value) : ""
                )
              }
              className="w-full border rounded-md p-2"
            >
              <option value="">— Select Voltage —</option>
              {SERVICE_VOLTAGES.map((v) => (
                <option key={v} value={v}>
                  {v}V
                </option>
              ))}
            </select>
          </div>

          {/* Sensor preview when phase is selected */}
          {phaseConfiguration && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-500 mb-1.5">
                Sensors for {phaseConfiguration}:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {applicableSensors.map((s) => (
                  <span
                    key={s.sensor_type}
                    className="text-[11px] px-2 py-0.5 bg-white border border-blue-200 rounded-full text-blue-700"
                  >
                    {s.name}
                    {s.unit ? ` (${s.unit})` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================
          MODBUS CONFIGURATION (energy meters)
      ================================ */}
      {isEnergyMeter && (
        <div className="border border-gray-200 bg-gray-50/50 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-sm font-semibold text-gray-700">
              Modbus Communication
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Slave Address */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Slave Address
              </label>
              <input
                type="number"
                min={1}
                max={247}
                value={modbusAddress}
                onChange={(e) => setModbusAddress(Number(e.target.value))}
                className="w-full border rounded-md p-2"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">1–247</p>
            </div>

            {/* Baud Rate */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Baud Rate
              </label>
              <select
                value={modbusBaudRate}
                onChange={(e) => setModbusBaudRate(Number(e.target.value))}
                className="w-full border rounded-md p-2"
              >
                {COMMON_BAUD_RATES.map((br) => (
                  <option key={br} value={br}>
                    {br.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Parity */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Parity
              </label>
              <select
                value={modbusParity}
                onChange={(e) => setModbusParity(e.target.value)}
                className="w-full border rounded-md p-2"
              >
                {PARITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} ({p.value})
                  </option>
                ))}
              </select>
            </div>

            {/* Stop Bits */}
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Stop Bits
              </label>
              <select
                value={modbusStopBits}
                onChange={(e) => setModbusStopBits(Number(e.target.value))}
                className="w-full border rounded-md p-2"
              >
                {STOP_BITS_OPTIONS.map((sb) => (
                  <option key={sb} value={sb}>
                    {sb}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* SITE */}
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

      {/* ACTIONS */}
      <div className="flex justify-end gap-3 mt-4">
        <button
          onClick={() => setShowAdd(false)}
          className="px-4 py-1.5 text-gray-600 hover:text-gray-800"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-white rounded-md bg-gradient-to-r from-green-600 to-yellow-500 hover:from-green-700 hover:to-yellow-600 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Device"}
        </button>
      </div>
    </div>
  );
}
