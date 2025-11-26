import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

// -----------------------------
// TYPES
// -----------------------------
interface EquipmentRecord {
  equipment_id: string;
  site_id: string;
  equipment_name: string;
  description: string | null;
  equipment_group: string;
  equipment_type: string;
  space_name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  voltage: number | null;
  amperage: number | null;
  maintenance_interval_days: number | null;
  status: string;
}

interface DeviceRecord {
  device_id: string;
  equipment_id: string;
  device_name: string;
  protocol: string;
  connection_type: string;
}

interface SensorRecord {
  sensor_id: string;
  device_id: string;
  sensor_name: string;
  sensor_type: string;
}

// -----------------------------
// SERVER COMPONENT
// -----------------------------
export default async function EquipmentPage({
  params,
}: {
  params: { siteid: string; equipmentid: string };
}) {
  const { siteid, equipmentid } = params;

  // Supabase client (server-side)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // -----------------------------
  // Load equipment record
  // -----------------------------
  const { data: equipment, error: eqError } = await supabase
    .from("a_equipments")
    .select("*")
    .eq("equipment_id", equipmentid)
    .single();

  if (eqError || !equipment) return notFound();

  // -----------------------------
  // Load devices
  // -----------------------------
  const { data: devices } = await supabase
    .from("a_devices")
    .select("*")
    .eq("equipment_id", equipmentid);

  // -----------------------------
  // Load sensors
  // -----------------------------
  const { data: sensors } = await supabase
    .from("a_sensors")
    .select("*")
    .eq("equipment_id", equipmentid);

  // Group sensors by device
  const sensorsByDevice = (devices ?? []).map((d) => ({
    device: d,
    sensors: (sensors ?? []).filter((s) => s.device_id === d.device_id),
  }));

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="p-6 space-y-10">
      {/* Back button */}
      <Link
        href={`/sites/${siteid}`}
        className="flex items-center gap-2 text-sm text-green-700 hover:text-green-900"
      >
        ← Back to Site
      </Link>

      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">
            {equipment.equipment_name}
          </h1>

          <Link
            href={`/sites/${siteid}/${equipmentid}/edit`}
            className="px-3 py-1.5 text-sm rounded-md text-white bg-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            ✏️ Edit
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <p><strong>Group:</strong> {equipment.equipment_group}</p>
          <p><strong>Type:</strong> {equipment.equipment_type}</p>
          <p><strong>Space:</strong> {equipment.space_name || "—"}</p>
          <p><strong>Manufacturer:</strong> {equipment.manufacturer || "—"}</p>
          <p><strong>Model:</strong> {equipment.model || "—"}</p>
          <p><strong>Serial #:</strong> {equipment.serial_number || "—"}</p>
          <p><strong>Voltage:</strong> {equipment.voltage || "—"}</p>
          <p><strong>Amperage:</strong> {equipment.amperage || "—"}</p>
          <p><strong>Maintenance Days:</strong> {equipment.maintenance_interval_days || "—"}</p>
          <p><strong>Status:</strong> {equipment.status}</p>
        </div>
      </div>

      {/* Devices + Sensors */}
      <div className="bg-white p-6 rounded-xl shadow border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Devices</h2>

          <Link
            href={`/settings/devices/add?equipment=${equipmentid}&site=${siteid}`}
            className="px-3 py-1.5 text-sm rounded-md text-white bg-gradient-to-r from-green-600 to-yellow-500 hover:opacity-90 flex items-center gap-2"
          >
            ＋ Add Device
          </Link>
        </div>

        {sensorsByDevice.length === 0 ? (
          <p className="text-gray-500 text-sm">No devices linked.</p>
        ) : (
          <div className="space-y-6">
            {sensorsByDevice.map(({ device, sensors }) => (
              <div key={device.device_id} className="border rounded-lg p-4">
                <h3 className="font-semibold text-green-700 text-lg mb-2">
                  {device.device_name}
                </h3>

                <p className="text-sm text-gray-600 mb-4">
                  Protocol: {device.protocol} • Connection:{" "}
                  {device.connection_type}
                </p>

                <ul className="space-y-1 text-sm">
                  {sensors.map((s) => (
                    <li key={s.sensor_id} className="border-b py-1">
                      <strong>{s.sensor_name}</strong> — {s.sensor_type}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
