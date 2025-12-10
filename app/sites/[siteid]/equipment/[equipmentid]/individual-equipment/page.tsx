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
  ha_device_id: string | null;
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

interface RecordLog {
  id: number;
  event_type: string;
  source: string;
  message: string;
  metadata: any;
  created_at: string;
  device_id: string | null;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
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
    return <div className="p-6 text-red-600">Missing parameters</div>;
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

  /* -------------------- Equipment -------------------- */
  const { data: equipment } = await supabase
    .from("a_equipments")
    .select("*")
    .eq("equipment_id", equipmentid)
    .single<Equipment>();

  if (!equipment) {
    return <div className="p-6 text-red-600">Equipment not found</div>;
  }

  /* -------------------- Devices -------------------- */
  const { data: devices } = await supabase
    .from("a_devices")
    .select("*")
    .eq("equipment_id", equipmentid)
    .order("device_name", { ascending: true });

  const deviceList = (devices || []) as Device[];

  /* -------------------- Sensors -------------------- */
  let sensorsByDevice: Record<string, Sensor[]> = {};

  if (deviceList.length) {
    const deviceIds = deviceList.map((d) => d.device_id);

    const { data: sensors } = await supabase
      .from("a_sensors")
      .select("*")
      .in("device_id", deviceIds);

    if (sensors) {
      sensorsByDevice = sensors.reduce((acc: any, s: Sensor) => {
        acc[s.device_id] ||= [];
        acc[s.device_id].push(s);
        return acc;
      }, {});
    }
  }

  /* -------------------- Records Log -------------------- */
  const { data: records } = await supabase
    .from("b_records_log")
    .select("*")
    .eq("equipment_id", equipmentid)
    .order("created_at", { ascending: false })
    .limit(15);

  const recordList = (records || []) as RecordLog[];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-green-600 via-green-500 to-yellow-400 text-white p-6 shadow">
        <div className="max-w-6xl mx-auto flex justify-between">
          <div>
            <h1 className="text-2xl font-bold">{equipment.equipment_name}</h1>
            <p className="text-sm opacity-90">
              {equipment.equipment_group} • {equipment.equipment_type}
            </p>
          </div>

          <Link
            href={`/sites/${siteid}/equipment/${equipmentid}/edit`}
            className="bg-white text-green-700 px-4 py-2 rounded font-semibold"
          >
            ✏️ Edit
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* DEVICES */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Devices</h2>

          {deviceList.map((device) => (
            <div key={device.device_id} className="border rounded-lg p-4 mb-3">
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold">{device.device_name}</p>
                  <p className="text-xs text-gray-500">
                    Last seen: {formatDateTime(device.last_seen_at)}
                  </p>
                </div>

                {device.ha_device_id && (
                  <Link
                    href={`/sites/${siteid}/devices/${device.ha_device_id}?returnTo=equipment&equipmentId=${equipmentid}`}
                    className="text-xs text-green-700 underline"
                  >
                    View device →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* ACTIVITY LOG */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Activity Log</h2>

          {recordList.length === 0 ? (
            <p className="text-sm text-gray-500">
              No activity recorded yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {recordList.map((r) => (
                <li
                  key={r.id}
                  className="border-l-4 pl-3 border-emerald-500"
                >
                  <p className="text-sm font-medium">
                    {r.message}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.event_type} • {formatDateTime(r.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
