// app/(dashboard)/sites/[siteid]/equipment/[equipmentid]/individual-equipment/page.tsx

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

function formatDateTime(value: string | null, tz: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "short",
    timeStyle: "short",
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

function safeReturnToHref(
  siteid: string,
  returnToRaw: unknown
): string {
  // Default back target
  let backHref = `/sites/${siteid}`;

  if (typeof returnToRaw !== "string" || !returnToRaw) {
    return backHref;
  }

  // If caller passed a real path (GatewayClientPage does this), use it.
  // Example: /sites/{siteid}/gateways
  if (returnToRaw.startsWith("/")) {
    return returnToRaw;
  }

  // Optional named shortcuts if you ever pass returnTo=gateways etc.
  if (returnToRaw === "gateways") return `/sites/${siteid}/gateways`;
  if (returnToRaw === "site") return `/sites/${siteid}`;

  return backHref;
}

/* =======================
   Page
======================= */

export default async function IndividualEquipmentPage({
  params,
  searchParams,
}: {
  params: { siteid?: string; equipmentid?: string };
  searchParams?: { returnTo?: string };
}) {
  const siteid = params?.siteid;
  const equipmentid = params?.equipmentid;

  // ✅ HARD GUARD — tells you EXACTLY what is missing
  if (!siteid || !equipmentid) {
    return (
      <pre className="p-6 text-red-600 whitespace-pre-wrap">
        Missing parameters
        {"\n"}siteid: {String(siteid)}
        {"\n"}equipmentid: {String(equipmentid)}
        {"\n\n"}params:
        {"\n"}{JSON.stringify(params, null, 2)}
        {"\n\n"}searchParams:
        {"\n"}{JSON.stringify(searchParams, null, 2)}
      </pre>
    );
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

  /* -------------------- Load Site (timezone + org) -------------------- */
  const { data: site, error: siteError } = await supabase
    .from("a_sites")
    .select("timezone, org_id")
    .eq("site_id", siteid)
    .single();

  if (siteError || !site) {
    return (
      <div className="p-6 text-red-600">
        Site not found (site_id: {siteid})
      </div>
    );
  }

  const siteTimezone = site.timezone || "America/Chicago";

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
        entitiesByHaDevice = (entities as EntityRow[]).reduce<
          Record<string, EntityRow[]>
        >((acc, e) => {
          if (!e.ha_device_id) return acc;
          if (!acc[e.ha_device_id]) acc[e.ha_device_id] = [];
          acc[e.ha_device_id].push(e);
          return acc;
        }, {});
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

  /* -------------------- Back button target -------------------- */
  const backHref = safeReturnToHref(siteid, searchParams?.returnTo);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-green-600 via-green-500 to-yellow-400 text-white p-6 shadow">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{equipment.equipment_name}</h1>
            <p className="text-sm opacity-90">
              {equipment.equipment_group} • {equipment.equipment_type}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25 transition"
            >
              ← Back
            </Link>

            <Link
              href={`/sites/${siteid}/equipment/${equipmentid}/edit`}
              className="inline-flex items-center rounded-full bg-white text-green-700 px-4 py-2 text-sm font-semibold shadow hover:bg-gray-100 transition"
            >
              ✏️ Edit
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* -------------------- EQUIPMENT DETAILS -------------------- */}
        <section className="bg-white rounded-xl shadow p-6 grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Equipment Details</h2>
            <p>
              <strong>Group:</strong> {equipment.equipment_group || "—"}
            </p>
            <p>
              <strong>Type:</strong> {equipment.equipment_type || "—"}
            </p>
            <p>
              <strong>Space:</strong> {equipment.space_name || "—"}
            </p>

            {equipment.description && (
              <p className="text-sm text-gray-700">
                <strong>Description:</strong> {equipment.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Technical Info</h2>
            <p>
              <strong>Manufacturer:</strong> {equipment.manufacturer || "—"}
            </p>
            <p>
              <strong>Model:</strong> {equipment.model || "—"}
            </p>
            <p>
              <strong>Serial:</strong> {equipment.serial_number || "—"}
            </p>
            <p>
              <strong>Voltage:</strong> {equipment.voltage || "—"}
            </p>
            <p>
              <strong>Amperage:</strong> {equipment.amperage || "—"}
            </p>

            <p>
              <strong>Maintenance:</strong>{" "}
              {equipment.maintenance_interval_days
                ? `${equipment.maintenance_interval_days} days`
                : "—"}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              <span
                className={
                  equipment.status === "active"
                    ? "text-green-600 font-semibold"
                    : "text-gray-600"
                }
              >
                {equipment.status}
              </span>
            </p>
          </div>
        </section>

        {/* -------------------- DEVICES + ENTITIES -------------------- */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Devices</h2>

          {deviceList.length === 0 ? (
            <p className="text-sm text-gray-500">
              No devices linked yet. Once HA devices are mapped, they’ll show
              here.
            </p>
          ) : (
            deviceList.map((device) => {
              const entities =
                (device.ha_device_id &&
                  entitiesByHaDevice[device.ha_device_id]) ||
                [];

              const grouped = entities.reduce<Record<string, EntityRow[]>>(
                (acc, e) => {
                  const key = e.sensor_type || "measurement";
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(e);
                  return acc;
                },
                {}
              );

              return (
                <div
                  key={device.device_id}
                  className="border rounded-lg p-4 mb-4"
                >
                  <div className="flex justify-between mb-2">
                    <div>
                      <p className="font-semibold">{device.device_name}</p>
                      <p className="text-xs text-gray-500">
                        Last seen: {formatDateTime(device.last_seen_at, siteTimezone)}
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

                  {entities.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No entities synced yet for this device.
                    </p>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      {Object.entries(grouped).map(([cat, list]) => (
                        <div
                          key={cat}
                          className="bg-gray-50 border rounded-lg p-3"
                        >
                          <p className="text-xs font-semibold mb-2 uppercase text-gray-700">
                            {formatCategoryLabel(cat)}
                          </p>

                          {list.map((e) => (
                            <div
                              key={e.entity_id}
                              className="flex justify-between text-xs"
                            >
                              <span className="font-mono">{e.entity_id}</span>
                              <span className="font-semibold">
                                {e.last_state ?? "—"}
                                {e.unit_of_measurement
                                  ? ` ${e.unit_of_measurement}`
                                  : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>

        {/* -------------------- ACTIVITY LOG -------------------- */}
        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Activity Log</h2>
            <span className="text-xs text-gray-500">Last 15 records</span>
          </div>

          <AddRecordNote
            orgId={site.org_id}
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
                    {r.event_type} • {formatDateTime(r.created_at, siteTimezone)}
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
