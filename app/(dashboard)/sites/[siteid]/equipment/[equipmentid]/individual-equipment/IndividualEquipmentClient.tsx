"use client";

import Link from "next/link";
import AddRecordNote from "@/components/AddRecordNote";

/* ---------- Helpers ---------- */

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

export default function IndividualEquipmentClient(props: any) {
  const {
    siteid,
    equipment,
    devices = [],
    entitiesByHaDevice = {},
    recordList = [],
    siteTimezone,
    orgId,
    returnTo,
  } = props;

  /* ---------- Defensive guard ---------- */
  if (!equipment) {
    return (
      <div className="p-6 text-red-600">
        <h2 className="text-lg font-semibold mb-2">
          Equipment data not loaded
        </h2>

        <p className="text-sm mb-4">
          The server did not pass equipment data to this page.
        </p>

        <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto">
{JSON.stringify(props, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-green-600 via-green-500 to-yellow-400 text-white p-6 shadow">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{equipment.equipment_name}</h1>
            <p className="text-sm opacity-90">
              {equipment.equipment_group} • {equipment.equipment_type_id}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/sites/${siteid}`}
              className="inline-flex items-center rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25"
            >
              ← Back
            </Link>

            <Link
              href={`/sites/${siteid}/equipment/${equipment.equipment_id}/edit`}
              className="inline-flex items-center rounded-full bg-white text-green-700 px-4 py-2 text-sm font-semibold shadow hover:bg-gray-100"
            >
              ✏️ Edit
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Equipment details */}
        <section className="bg-white rounded-xl shadow p-6 grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Equipment Details</h2>
            <p><strong>Group:</strong> {equipment.equipment_group || "—"}</p>
            <p><strong>Type:</strong> {equipment.equipment_type_id || "—"}</p>
            <p><strong>Space:</strong> {equipment.space_name || "—"}</p>
            {equipment.description && (
              <p className="text-sm text-gray-700">
                <strong>Description:</strong> {equipment.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Technical Info</h2>
            <p><strong>Manufacturer:</strong> {equipment.manufacturer || "—"}</p>
            <p><strong>Model:</strong> {equipment.model || "—"}</p>
            <p><strong>Serial:</strong> {equipment.serial_number || "—"}</p>
            <p><strong>Voltage:</strong> {equipment.voltage || "—"}</p>
            <p><strong>Amperage:</strong> {equipment.amperage || "—"}</p>
            <p><strong>Status:</strong> {equipment.status}</p>
          </div>
        </section>

        {/* Devices */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Devices</h2>

          {devices.length === 0 ? (
            <p className="text-sm text-gray-500">No devices linked.</p>
          ) : (
            devices.map((device: any) => {
              const entities =
                (device.ha_device_id &&
                  entitiesByHaDevice[device.ha_device_id]) ||
                [];

              const grouped = entities.reduce((acc: any, e: any) => {
                const key = e.sensor_type || "measurement";
                if (!acc[key]) acc[key] = [];
                acc[key].push(e);
                return acc;
              }, {});

              return (
                <div key={device.device_id} className="border rounded-lg p-4 mb-4">
                  <div className="flex justify-between mb-2">
                    <div>
                      <p className="font-semibold">{device.device_name}</p>
                      <p className="text-xs text-gray-500">
                        Last seen: {formatDateTime(device.last_seen_at, siteTimezone)}
                      </p>
                    </div>

                    {device.ha_device_id && (
                      <Link
                        href={`/sites/${siteid}/devices/${device.ha_device_id}?returnTo=equipment&equipmentId=${equipment.equipment_id}`}
                        className="text-xs text-green-700 underline"
                      >
                        View device →
                      </Link>
                    )}
                  </div>

                  {entities.length > 0 && (
                    <div className="grid md:grid-cols-2 gap-3">
                      {Object.entries(grouped).map(([cat, list]: any) => (
                        <div key={cat} className="bg-gray-50 border rounded-lg p-3">
                          <p className="text-xs font-semibold mb-2 uppercase">
                            {formatCategoryLabel(cat)}
                          </p>

                          {list.map((e: any) => (
                            <div key={e.entity_id} className="flex justify-between text-xs">
                              <span className="font-mono">{e.entity_id}</span>
                              <span className="font-semibold">
                                {e.last_state ?? "—"}
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

        {/* Activity */}
        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Activity Log</h2>
            <span className="text-xs text-gray-500">Last 15 records</span>
          </div>

          <AddRecordNote
            orgId={orgId}
            siteId={siteid}
            equipmentId={equipment.equipment_id}
          />

          {recordList.length === 0 ? (
            <p className="text-sm text-gray-500">No activity recorded.</p>
          ) : (
            <ul className="space-y-3">
              {recordList.map((r: any) => (
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
