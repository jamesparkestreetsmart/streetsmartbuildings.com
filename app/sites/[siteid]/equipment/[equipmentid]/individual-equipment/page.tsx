import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import AddRecordNote from "@/components/AddRecordNote";

export const dynamic = "force-dynamic";

/* =======================
   Types
======================= */

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

interface Site {
  timezone: string | null;
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

interface EntityRow {
  entity_id: string;
  ha_device_id: string | null;
  sensor_type: string | null;
  unit_of_measurement: string | null;
  last_state: string | number | null;
  last_seen_at: string | null;
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

/* =======================
   Helpers
======================= */

function formatWithTimezone(value: string, timezone?: string | null) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCategoryLabel(raw: string | null): string {
  const v = (raw || "").toLowerCase();
  if (v === "measurement") return "Measurement";
  if (v === "diagnostic") return "Diagnostic";
  if (v === "config" || v === "configuration") return "Configuration";
  if (v === "system") return "System";
  if (v === "binary") return "Binary";
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "Other";
}

/* =======================
   Page
======================= */

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

  /* -------------------- Site (timezone) -------------------- */
  const { data: site } = await supabase
    .from("a_sites")
    .select("timezone")
    .eq("site_id", siteid)
    .single<Site>();

  /* -------------------- Devices -------------------- */
  const { data: devices } = await supabase
    .from("a_devices")
    .select("*")
    .eq("equipment_id", equipmentid)
    .order("device_name", { ascending: true });

  const deviceList = (devices || []) as Device[];

  /* -------------------- Entities -------------------- */
  let entitiesByHaDevice: Record<string, EntityRow[]> = {};

  if (deviceList.length) {
    const haIds = deviceList
      .map((d) => d.ha_device_id)
      .filter((id): id is string => !!id);

    if (haIds.length) {
      const { data: entities } = await supabase
        .from("view_entity_sync")
        .select(
          "entity_id, ha_device_id, sensor_type, unit_of_measurement, last_state, last_seen_at"
        )
        .in("ha_device_id", haIds);

      if (entities) {
        entitiesByHaDevice = (entities as EntityRow[]).reduce(
          (acc, e) => {
            if (!e.ha_device_id) return acc;
            acc[e.ha_device_id] ||= [];
            acc[e.ha_device_id].push(e);
            return acc;
          },
          {} as Record<string, EntityRow[]>
        );
      }
    }
  }

  /* -------------------- Activity Log -------------------- */
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

          <div className="flex gap-3">
            <Link
              href={`/sites/${siteid}`}
              className="rounded-full bg-white/15 px-4 py-2 text-sm"
            >
              ← Back to Equipment List
            </Link>

            <Link
              href={`/sites/${siteid}/equipment/${equipmentid}/edit`}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-green-700"
            >
              ✏️ Edit
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">

        {/* ACTIVITY LOG */}
        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex justify-between">
            <h2 className="text-lg font-semibold">Activity Log</h2>
            <span className="text-xs text-gray-500">Last 15 records</span>
          </div>

          <AddRecordNote
            orgId={equipment.site_id /* org join later */}
            siteId={siteid}
            equipmentId={equipmentid}
          />

          {recordList.length === 0 ? (
            <p className="text-sm text-gray-500">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {recordList.map((r) => (
                <li key={r.id} className="border-l-4 border-emerald-500 pl-3">
                  <p className="text-sm font-medium">
                    {r.metadata?.note ?? r.message}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.event_type} •{" "}
                    {formatWithTimezone(r.created_at, site?.timezone)}
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
