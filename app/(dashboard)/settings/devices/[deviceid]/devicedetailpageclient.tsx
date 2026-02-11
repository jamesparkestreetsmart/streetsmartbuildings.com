// app/settings/devices/[deviceid]/devicedetailpageclient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useOrg } from "@/context/OrgContext";
import { ArrowLeft, Cpu, Trash2, Edit3, Zap, Settings } from "lucide-react";
import { useReturnTo } from "@/app/hooks/useReturnTo";

interface DeviceRow {
  device_id: string;
  device_name: string;
  serial_number: string;
  protocol: string | null;
  connection_type: string | null;
  firmware_version: string | null;
  ip_address: string | null;
  status: string | null;
  service_notes: string | null;
  created_at: string;
  device_role: string | null;
  library_device_id: string | null;
  phase_configuration: string | null;
  modbus_address: number | null;
  modbus_baud_rate: number | null;
  modbus_parity: string | null;
  modbus_stop_bits: number | null;
  electrical_service_voltage: number | null;
  ha_device_id: string | null;

  site_id: string | null;
  equipment_id: string | null;

  a_sites?: { site_id: string; site_name: string } | null;
  a_equipments?: { equipment_id: string; equipment_name: string } | null;
}

interface LibrarySensor {
  name: string;
  unit: string | null;
  sensor_type: string;
  entity_suffix: string;
  phases?: string[];
}

interface EntityMatch {
  entity_id: string;
  domain: string | null;
  last_state: string | null;
  unit_of_measurement: string | null;
  last_seen_at: string | null;
}

interface PhaseConfig {
  phase_code: string;
  description: string;
  num_phases: number;
  num_wires: number;
  has_neutral: boolean;
}

export default function DeviceDetailPageClient({
  deviceid,
}: {
  deviceid: string;
}) {
  const router = useRouter();
  const { selectedOrgId } = useOrg();
  const { goBack } = useReturnTo("/settings/devices");

  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<DeviceRow | null>(null);
  const [librarySensors, setLibrarySensors] = useState<LibrarySensor[]>([]);
  const [phaseConfig, setPhaseConfig] = useState<PhaseConfig | null>(null);
  const [entityMatches, setEntityMatches] = useState<Map<string, EntityMatch>>(
    new Map()
  );

  const [sites, setSites] = useState<{ site_id: string; site_name: string }[]>(
    []
  );
  const [equipment, setEquipment] = useState<
    { equipment_id: string; equipment_name: string; site_id: string }[]
  >([]);

  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});

  /* ---- Load device + related data ---- */
  const loadData = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("a_devices")
      .select(
        `
        *,
        a_sites:site_id ( site_id, site_name ),
        a_equipments:equipment_id ( equipment_id, equipment_name )
      `
      )
      .eq("device_id", deviceid)
      .single();

    if (error) {
      console.error("Error loading device:", error);
      setLoading(false);
      return;
    }

    const dev = data as DeviceRow;
    setDevice(dev);

    // Load library sensors if linked to a template
    if (dev.library_device_id) {
      const { data: libData } = await supabase
        .from("library_devices")
        .select("default_sensors")
        .eq("library_device_id", dev.library_device_id)
        .single();

      if (libData?.default_sensors) {
        const allSensors = libData.default_sensors as LibrarySensor[];

        // Filter by phase configuration if set
        const filtered = dev.phase_configuration
          ? allSensors.filter(
              (s) =>
                !s.phases || s.phases.includes(dev.phase_configuration!)
            )
          : allSensors;

        setLibrarySensors(filtered);
      }
    }

    // Load phase config description
    if (dev.phase_configuration) {
      const { data: pcData } = await supabase
        .from("library_phase_configurations")
        .select("*")
        .eq("phase_code", dev.phase_configuration)
        .single();

      if (pcData) setPhaseConfig(pcData as PhaseConfig);
    }

    // Load entity matches from HA sync if device has ha_device_id
    if (dev.ha_device_id && dev.site_id) {
      const { data: entityData } = await supabase
        .from("view_entity_sync")
        .select("entity_id, domain, last_state, unit_of_measurement, last_seen_at")
        .eq("ha_device_id", dev.ha_device_id)
        .eq("site_id", dev.site_id);

      if (entityData) {
        const map = new Map<string, EntityMatch>();
        entityData.forEach((e: any) => {
          // Match by entity_suffix pattern
          const entityId = e.entity_id as string;
          map.set(entityId, e as EntityMatch);
        });
        setEntityMatches(map);
      }
    }

    // Load sites and equipment for edit modal (org-scoped)
    if (selectedOrgId) {
      const [{ data: siteRows }, { data: eqRows }] = await Promise.all([
        supabase
          .from("a_sites")
          .select("site_id, site_name")
          .eq("org_id", selectedOrgId)
          .order("site_name"),
        supabase
          .from("a_equipments")
          .select("equipment_id, equipment_name, site_id")
          .eq("org_id", selectedOrgId)
          .order("equipment_name"),
      ]);

      setSites(siteRows ?? []);
      setEquipment(eqRows ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [deviceid, selectedOrgId]);

  /* ---- Find entity match for a sensor ---- */
  const findEntityForSensor = (sensor: LibrarySensor): EntityMatch | null => {
    if (!device?.ha_device_id) return null;

    // Try to match by entity_suffix pattern
    for (const [entityId, entity] of entityMatches) {
      if (entityId.endsWith(sensor.entity_suffix)) {
        return entity;
      }
    }
    return null;
  };

  /* ---- Edit modal ---- */
  const openEdit = () => {
    if (!device) return;
    setEditData({
      device_name: device.device_name,
      serial_number: device.serial_number,
      protocol: device.protocol || "",
      connection_type: device.connection_type || "",
      firmware_version: device.firmware_version || "",
      ip_address: device.ip_address || "",
      status: device.status || "active",
      service_notes: device.service_notes || "",
      site_id: device.site_id || "",
      equipment_id: device.equipment_id || "",
      modbus_address: device.modbus_address ?? "",
      modbus_baud_rate: device.modbus_baud_rate ?? 19200,
      modbus_parity: device.modbus_parity ?? "E",
      modbus_stop_bits: device.modbus_stop_bits ?? 1,
      electrical_service_voltage: device.electrical_service_voltage ?? "",
    });
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!device) return;

    const updatePayload: Record<string, any> = {
      device_name: editData.device_name,
      serial_number: editData.serial_number,
      protocol: editData.protocol,
      connection_type: editData.connection_type,
      firmware_version: editData.firmware_version,
      ip_address: editData.ip_address || null,
      status: editData.status,
      service_notes: editData.service_notes || null,
      site_id: editData.site_id || null,
      equipment_id: editData.equipment_id || null,
    };

    // Include energy meter fields if applicable
    if (device.device_role === "energy_meter") {
      updatePayload.modbus_address = editData.modbus_address || null;
      updatePayload.modbus_baud_rate = editData.modbus_baud_rate || null;
      updatePayload.modbus_parity = editData.modbus_parity || null;
      updatePayload.modbus_stop_bits = editData.modbus_stop_bits || null;
      updatePayload.electrical_service_voltage =
        editData.electrical_service_voltage || null;
    }

    const { error } = await supabase
      .from("a_devices")
      .update(updatePayload)
      .eq("device_id", device.device_id);

    if (error) {
      console.error(error);
      alert("Update failed");
      return;
    }

    setShowEdit(false);
    loadData();
  };

  const deleteDevice = async () => {
    if (!device) return;
    if (!confirm("Delete device?")) return;
    await supabase
      .from("a_devices")
      .delete()
      .eq("device_id", device.device_id);
    goBack();
  };

  const retireDevice = async () => {
    if (!device) return;
    await supabase
      .from("a_devices")
      .update({ status: "retired" })
      .eq("device_id", device.device_id);
    loadData();
  };

  /* ---- Render ---- */
  if (loading)
    return <div className="p-6 text-gray-500 text-sm">Loading...</div>;

  if (!device)
    return (
      <div className="p-6">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-red-600 text-sm">Device not found.</p>
      </div>
    );

  const siteName = device.a_sites?.site_name || "—";
  const equipmentName = device.a_equipments?.equipment_name || "—";
  const isEnergyMeter = device.device_role === "energy_meter";

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-green-600" />
          <h1 className="text-2xl font-semibold">{device.device_name}</h1>
          {device.device_role && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {device.device_role.replace("_", " ")}
            </span>
          )}
        </div>
      </div>

      {/* MAIN INFO CARD */}
      <div className="bg-white border rounded-xl shadow p-6 flex flex-col md:flex-row justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">Device Information</h2>
          <p>
            <b>Serial:</b> {device.serial_number}
          </p>
          <p>
            <b>Protocol:</b> {device.protocol || "—"}
          </p>
          <p>
            <b>Connection:</b> {device.connection_type || "—"}
          </p>
          <p>
            <b>Firmware:</b> {device.firmware_version || "—"}
          </p>
          <p>
            <b>IP:</b> {device.ip_address || "—"}
          </p>
          <p>
            <b>Status:</b>{" "}
            <span
              className={
                device.status === "active"
                  ? "text-green-600 font-medium"
                  : device.status === "retired"
                  ? "text-red-400 line-through"
                  : "text-gray-600"
              }
            >
              {device.status}
            </span>
          </p>
          <p>
            <b>Created:</b> {new Date(device.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-4">
          <div className="text-sm">
            <h2 className="text-lg font-semibold mb-1">Location</h2>
            <p>
              <b>Site:</b> {siteName}
            </p>
            <p>
              <b>Equipment:</b> {equipmentName}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={openEdit}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Edit3 className="w-4 h-4 inline mr-1" /> Edit
            </button>
            <button
              onClick={retireDevice}
              className="px-3 py-1.5 text-sm bg-yellow-200 text-yellow-800 rounded-md"
            >
              Retire
            </button>
            <button
              onClick={deleteDevice}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 inline mr-1" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* ELECTRICAL CONFIGURATION (energy meters only) */}
      {isEnergyMeter && (
        <div className="bg-white border border-blue-200 rounded-xl shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-blue-800">
              Electrical Configuration
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-0.5">
                Phase Configuration
              </p>
              <p className="font-semibold text-blue-700">
                {device.phase_configuration || "—"}
              </p>
              {phaseConfig && (
                <p className="text-xs text-gray-400">
                  {phaseConfig.description}
                </p>
              )}
            </div>

            <div>
              <p className="text-gray-500 text-xs mb-0.5">Service Voltage</p>
              <p className="font-semibold">
                {device.electrical_service_voltage
                  ? `${device.electrical_service_voltage}V`
                  : "—"}
              </p>
            </div>

            {phaseConfig && (
              <>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Phases / Wires</p>
                  <p className="font-semibold">
                    {phaseConfig.num_phases}Φ / {phaseConfig.num_wires}W
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Neutral</p>
                  <p className="font-semibold">
                    {phaseConfig.has_neutral ? "Yes" : "No"}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODBUS CONFIGURATION (energy meters only) */}
      {isEnergyMeter && (
        <div className="bg-white border rounded-xl shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Modbus Communication</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Slave Address</p>
              <p className="font-semibold font-mono">
                {device.modbus_address ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Baud Rate</p>
              <p className="font-semibold font-mono">
                {device.modbus_baud_rate?.toLocaleString() ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Parity</p>
              <p className="font-semibold">
                {device.modbus_parity === "E"
                  ? "Even"
                  : device.modbus_parity === "O"
                  ? "Odd"
                  : device.modbus_parity === "N"
                  ? "None"
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">Stop Bits</p>
              <p className="font-semibold font-mono">
                {device.modbus_stop_bits ?? "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* EXPECTED SENSORS (from library template) */}
      <div className="bg-white border rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-3">
          {isEnergyMeter
            ? `Expected Sensors (${device.phase_configuration || "all phases"})`
            : "Expected Sensors"}
        </h2>

        {librarySensors.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {device.library_device_id
              ? "No sensors defined for this configuration."
              : "No device template linked — sensors are not predefined."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-700 font-semibold">
                <tr>
                  <th className="p-2 text-left">Sensor Name</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Unit</th>
                  <th className="p-2 text-left">Entity Suffix</th>
                  <th className="p-2 text-left">HA Entity</th>
                  <th className="p-2 text-left">Live Value</th>
                  <th className="p-2 text-left">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {librarySensors.map((s) => {
                  const entity = findEntityForSensor(s);

                  return (
                    <tr key={s.sensor_type} className="border-b">
                      <td className="p-2 font-medium">{s.name}</td>
                      <td className="p-2 font-mono text-xs text-gray-500">
                        {s.sensor_type}
                      </td>
                      <td className="p-2">{s.unit || "—"}</td>
                      <td className="p-2 font-mono text-xs text-gray-400">
                        {s.entity_suffix}
                      </td>
                      <td className="p-2">
                        {entity ? (
                          <span className="font-mono text-xs text-green-700">
                            {entity.entity_id}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">
                            not linked
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {entity?.last_state ? (
                          <span className="font-mono">
                            {entity.last_state}
                            {entity.unit_of_measurement
                              ? ` ${entity.unit_of_measurement}`
                              : ""}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-2">
                        {entity?.last_seen_at ? (
                          <span
                            className={`text-xs ${
                              Date.now() -
                                new Date(entity.last_seen_at).getTime() <
                              6 * 3600000
                                ? "text-green-600"
                                : Date.now() -
                                    new Date(entity.last_seen_at).getTime() <
                                  24 * 3600000
                                ? "text-amber-500"
                                : "text-red-500"
                            }`}
                          >
                            {formatRelativeTime(entity.last_seen_at)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-[500px] max-w-[90vw] max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Edit Device</h2>

            <div className="space-y-3 text-sm">
              {[
                "device_name",
                "serial_number",
                "protocol",
                "connection_type",
                "firmware_version",
                "ip_address",
                "service_notes",
              ].map((field) => (
                <div key={field}>
                  <label className="block mb-1 capitalize">
                    {field.replace(/_/g, " ")}
                  </label>
                  <input
                    className="w-full border rounded-md p-2"
                    value={editData[field] || ""}
                    onChange={(e) =>
                      setEditData({ ...editData, [field]: e.target.value })
                    }
                  />
                </div>
              ))}

              <div>
                <label className="block mb-1">Status</label>
                <select
                  className="w-full border rounded-md p-2"
                  value={editData.status}
                  onChange={(e) =>
                    setEditData({ ...editData, status: e.target.value })
                  }
                >
                  <option value="active">Active</option>
                  <option value="offline">Offline</option>
                  <option value="inactive">Inactive</option>
                  <option value="retired">Retired</option>
                </select>
              </div>

              {/* Energy meter specific fields */}
              {isEnergyMeter && (
                <>
                  <hr className="my-3" />
                  <p className="text-xs font-semibold text-blue-700 uppercase">
                    Modbus Settings
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1">Slave Address</label>
                      <input
                        type="number"
                        min={1}
                        max={247}
                        className="w-full border rounded-md p-2"
                        value={editData.modbus_address ?? ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            modbus_address: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Baud Rate</label>
                      <select
                        className="w-full border rounded-md p-2"
                        value={editData.modbus_baud_rate ?? 19200}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            modbus_baud_rate: Number(e.target.value),
                          })
                        }
                      >
                        {[9600, 19200, 38400, 57600, 115200].map((br) => (
                          <option key={br} value={br}>
                            {br.toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1">Parity</label>
                      <select
                        className="w-full border rounded-md p-2"
                        value={editData.modbus_parity ?? "E"}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            modbus_parity: e.target.value,
                          })
                        }
                      >
                        <option value="N">None</option>
                        <option value="E">Even</option>
                        <option value="O">Odd</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1">Stop Bits</label>
                      <select
                        className="w-full border rounded-md p-2"
                        value={editData.modbus_stop_bits ?? 1}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            modbus_stop_bits: Number(e.target.value),
                          })
                        }
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1">
                      Electrical Service Voltage
                    </label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={editData.electrical_service_voltage ?? ""}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          electrical_service_voltage: e.target.value
                            ? Number(e.target.value)
                            : "",
                        })
                      }
                    >
                      <option value="">—</option>
                      {[120, 208, 240, 277, 480].map((v) => (
                        <option key={v} value={v}>
                          {v}V
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <hr className="my-3" />

              <div>
                <label className="block mb-1">Site</label>
                <select
                  className="w-full border rounded-md p-2"
                  value={editData.site_id}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      site_id: e.target.value,
                      equipment_id: "",
                    })
                  }
                >
                  <option value="">Select Site</option>
                  {sites.map((site) => (
                    <option key={site.site_id} value={site.site_id}>
                      {site.site_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1">Equipment</label>
                <select
                  className="w-full border rounded-md p-2"
                  value={editData.equipment_id}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      equipment_id: e.target.value,
                    })
                  }
                >
                  <option value="">Select Equipment</option>
                  {equipment
                    .filter((eq) =>
                      editData.site_id
                        ? eq.site_id === editData.site_id
                        : true
                    )
                    .map((eq) => (
                      <option key={eq.equipment_id} value={eq.equipment_id}>
                        {eq.equipment_name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-1.5 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Helper ---- */
function formatRelativeTime(date: string | null): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
