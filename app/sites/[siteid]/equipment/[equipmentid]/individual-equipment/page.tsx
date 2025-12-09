// app/sites/[siteid]/equipment/[equipmentid]/individual-equipment/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Equipment {
  equipment_id: string;
  site_id: string;
  equipment_name: string;
  description: string | null;
  equipment_group: string | null;
  equipment_type: string | null;
  space_name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  manufacture_date: string | null;
  install_date: string | null;
  voltage: string | null;
  amperage: string | null;
  maintenance_interval_days: number | null;
  status: string;
}

interface Device {
  device_id: string;
  equipment_id: string;
  device_name: string;
  device_type: string | null;
  status: string | null;
  last_seen_at: string | null;
}

interface Sensor {
  sensor_id: string;
  device_id: string;
  sensor_name: string;
  entity_category: string | null;
  unit_of_measurement: string | null;
  last_value: string | number | null;
  last_updated_at: string | null;
}

function formatDateTime(value: string | null) {
  if (!value) return "No data";
  return new Date(value).toLocaleString();
}

function formatCategoryLabel(raw: string | null): string {
  const v = (raw || "").toLowerCase();
  if (v === "measurement") return "Measurement";
  if (v === "diagnostic") return "Diagnostic";
  if (v === "config" || v === "configuration") return "Configuration";
  if (v === "system") return "System";
  if (v === "binary") return "Binary";
  return "Other";
}

export default async function IndividualEquipmentPage(props: any) {
  const params = await props.params;
  const siteid = params?.siteid;
  const equipmentid = params?.equipmentid;

  if (!siteid || !equipmentid) {
    return <div className="p-6 text-red-600">Error: Missing site or equipment ID.</div>;
  }

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

  const { data: equipment } = await supabase
    .from("a_equipments")
    .select("*")
    .eq("equipment_id", equipmentid)
    .single();

  const { data: devices } = await supabase
    .from("a_devices")
    .select("*")
    .eq("equipment_id", equipmentid)
    .order("device_name", { ascending: true });

  const deviceList = (devices || []) as Device[];

  let sensorsByDevice: Record<string, Sensor[]> = {};

  if (deviceList.length > 0) {
    const deviceIds = deviceList.map((d) => d.device_id);
    const { data: sensors } = await supabase
      .from("a_sensors")
      .select("*")
      .in("device_id", deviceIds);

    sensorsByDevice =
      sensors?.reduce((acc: Record<string, Sensor[]>, s: Sensor) => {
        if (!acc[s.device_id]) acc[s.device_id] = [];
        acc[s.device_id].push(s);
        return acc;
      }, {}) || {};
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-green-600 via-green-500 to-yellow-400 text-white p-6">
        <div className="max-w-6xl mx-auto flex justify-between">
          <h1 className="text-3xl font-bold">{equipment.equipment_name}</h1>
          <Link
            href={`/sites/${siteid}/equipment/${equipmentid}/edit`}
            className="bg-white text-green-700 px-4 py-2 rounded-full font-semibold"
          >
            ✏️ Edit Equipment
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-lg">Devices</h2>

          {deviceList.map((device) => {
            const sensors = sensorsByDevice[device.device_id] || [];

            return (
              <div key={device.device_id} className="border rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <h3 className="font-semibold">{device.device_name}</h3>
                    <p className="text-xs text-gray-600">
                      Last seen: {formatDateTime(device.last_seen_at)}
                    </p>
                  </div>

                  {/* ✅ FIXED LINK */}
                  <Link
                    href={`/sites/${siteid}/devices/${device.device_id}`}
                    className="text-xs font-semibold text-green-700 underline"
                  >
                    View device details →
                  </Link>
                </div>

                {sensors.map((sensor) => (
                  <div key={sensor.sensor_id} className="text-xs text-gray-700">
                    {sensor.sensor_name}:{" "}
                    {sensor.last_value ?? "—"}
                    {sensor.unit_of_measurement
                      ? ` ${sensor.unit_of_measurement}`
                      : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
