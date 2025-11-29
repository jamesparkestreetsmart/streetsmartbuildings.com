// app/sites/[siteid]/equipment/[equipmentid]/individual-equipment/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ParamsPromise = Promise<{
  siteid: string;
  equipmentid: string;
}>;

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
  entity_category: string | null; // "measurement" | "diagnostic" | "config" | "system" | null
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

export default async function IndividualEquipmentPage({
  params,
}: {
  params: ParamsPromise;
}) {
  // ⬇️ Vercel sometimes passes params as a Promise – resolve it explicitly
  const { siteid, equipmentid } = await params;

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

  // 1) Load equipment
  const { data: equipment, error: equipmentError } = await supabase
    .from("a_equipments")
    .select("*")
    .eq("equipment_id", equipmentid)
    .single<Equipment>();

  if (equipmentError || !equipment) {
    console.error("Equipment fetch error:", equipmentError);
    return (
      <div className="p-6 text-red-600">
        Error loading equipment details.
      </div>
    );
  }

  // 2) Load devices for this equipment
  const { data: devices, error: devicesError } = await supabase
    .from("a_devices")
    .select("*")
    .eq("equipment_id", equipmentid)
    .order("device_name", { ascending: true });

  if (devicesError) {
    console.error("Devices fetch error:", devicesError);
  }

  const deviceList = (devices || []) as Device[];

  // 3) Load sensors for those devices (if any)
  let sensorsByDevice: Record<string, Sensor[]> = {};

  if (deviceList.length > 0) {
    const deviceIds = deviceList.map((d) => d.device_id);

    const { data: sensors, error: sensorsError } = await supabase
      .from("a_sensors")
      .select("*")
      .in("device_id", deviceIds);

    if (sensorsError) {
      console.error("Sensors fetch error:", sensorsError);
    } else if (sensors) {
      const cast = sensors as Sensor[];
      sensorsByDevice = cast.reduce<Record<string, Sensor[]>>((acc, s) => {
        if (!acc[s.device_id]) acc[s.device_id] = [];
        acc[s.device_id].push(s);
        return acc;
      }, {});
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-green-600 via-green-500 to-yellow-400 text-white p-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              {equipment.equipment_name}
            </h1>
            <p className="text-sm md:text-base opacity-90">
              {equipment.equipment_group || "Unassigned group"} •{" "}
              {equipment.equipment_type || "Unspecified type"}
            </p>
            <p className="text-xs md:text-sm opacity-80 mt-1">
              Space: {equipment.space_name || "Unassigned space"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Link
              href={`/sites/${siteid}`}
              className="inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 transition"
            >
              ← Back to Equipment List
            </Link>
            <Link
              href={`/sites/${siteid}/equipment/${equipmentid}/edit`}
              className="inline-flex items-center rounded-full bg-white text-green-700 px-4 py-2 text-sm font-semibold shadow hover:bg-gray-100 transition"
            >
              ✏️ Edit Equipment
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* EQUIPMENT DETAILS CARD */}
        <section className="bg-white rounded-xl shadow p-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold mb-2">Equipment Details</h2>
            <p>
              <span className="font-semibold">Group:</span>{" "}
              {equipment.equipment_group || "—"}
            </p>
            <p>
              <span className="font-semibold">Type:</span>{" "}
              {equipment.equipment_type || "—"}
            </p>
            <p>
              <span className="font-semibold">Space:</span>{" "}
              {equipment.space_name || "—"}
            </p>
            {equipment.description && (
              <p className="mt-2 text-sm text-gray-700">
                <span className="font-semibold">Description:</span>{" "}
                {equipment.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold mb-2">Technical Info</h2>
            <p>
              <span className="font-semibold">Manufacturer:</span>{" "}
              {equipment.manufacturer || "—"}
            </p>
            <p>
              <span className="font-semibold">Model:</span>{" "}
              {equipment.model || "—"}
            </p>
            <p>
              <span className="font-semibold">Serial:</span>{" "}
              {equipment.serial_number || "—"}
            </p>
            <p>
              <span className="font-semibold">Voltage:</span>{" "}
              {equipment.voltage || "—"}
            </p>
            <p>
              <span className="font-semibold">Amperage:</span>{" "}
              {equipment.amperage || "—"}
            </p>
            <p>
              <span className="font-semibold">Maintenance Interval:</span>{" "}
              {equipment.maintenance_interval_days
                ? `${equipment.maintenance_interval_days} days`
                : "—"}
            </p>
            <p>
              <span className="font-semibold">Status:</span>{" "}
              <span
                className={
                  equipment.status === "active"
                    ? "text-green-600 font-semibold"
                    : "text-gray-700"
                }
              >
                {equipment.status}
              </span>
            </p>
          </div>
        </section>

        {/* DEVICES + SENSORS */}
        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Devices</h2>
            <span className="text-sm text-gray-500">
              {deviceList.length === 0
                ? "No devices linked yet"
                : `${deviceList.length} device${
                    deviceList.length === 1 ? "" : "s"
                  }`}
            </span>
          </div>

          {deviceList.length === 0 && (
            <p className="text-sm text-gray-600">
              When you tie Home Assistant devices to this equipment, they will
              appear here with their sensors/entities.
            </p>
          )}

          <div className="space-y-4">
            {deviceList.map((device) => {
              const sensors = sensorsByDevice[device.device_id] || [];

              // Group sensors by entity_category (style C)
              const grouped: Record<string, Sensor[]> = sensors.reduce(
                (acc, sensor) => {
                  const cat = sensor.entity_category || "measurement";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(sensor);
                  return acc;
                },
                {} as Record<string, Sensor[]>
              );

              const categories = Object.entries(grouped).sort(
                ([a], [b]) => a.localeCompare(b) // stable alphabetical
              );

              return (
                <div
                  key={device.device_id}
                  className="border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-semibold text-base">
                        {device.device_name}
                      </h3>
                      <p className="text-xs text-gray-600">
                        {device.device_type || "Device"} •{" "}
                        {device.status || "unknown"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Last seen: {formatDateTime(device.last_seen_at)}
                      </p>
                    </div>

                    <Link
                      href={`/sites/${siteid}/equipment/${equipmentid}/device/${device.device_id}`}
                      className="text-xs font-semibold text-green-700 underline hover:text-green-800"
                    >
                      View device details →
                    </Link>
                  </div>

                  {sensors.length === 0 ? (
                    <p className="text-sm text-gray-500 mt-2">
                      No sensors/entities linked to this device yet.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {categories.map(([rawCat, list]) => (
                        <div
                          key={rawCat}
                          className="bg-gray-50 rounded-lg p-3 border border-gray-100"
                        >
                          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                            {formatCategoryLabel(rawCat)}
                          </p>

                          <div className="space-y-1.5">
                            {list.map((sensor) => (
                              <div
                                key={sensor.sensor_id}
                                className="flex items-baseline justify-between gap-2"
                              >
                                <div className="text-xs text-gray-700">
                                  {sensor.sensor_name}
                                </div>
                                <div className="text-xs text-gray-900 font-semibold">
                                  {sensor.last_value ?? "—"}
                                  {sensor.unit_of_measurement
                                    ? ` ${sensor.unit_of_measurement}`
                                    : ""}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Last updated (most recent within this category) */}
                          <p className="text-[11px] text-gray-500 mt-2">
                            Last updated:{" "}
                            {formatDateTime(
                              list
                                .map((s) => s.last_updated_at)
                                .filter(Boolean)
                                .sort()
                                .slice(-1)[0] || null
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
