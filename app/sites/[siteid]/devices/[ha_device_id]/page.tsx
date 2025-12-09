import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";

/* ------------------------------
   Helpers
------------------------------ */

const HOURS_24_MS = 24 * 60 * 60 * 1000;

function isOffline(lastSeen: string | null) {
  if (!lastSeen) return true;
  return Date.now() - new Date(lastSeen).getTime() > HOURS_24_MS;
}

function formatRelativeTime(date: string | null) {
  if (!date) return "never";

  const d = new Date(date);
  const delta = Date.now() - d.getTime();

  const minutes = Math.floor(delta / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

/* ------------------------------
   PAGE
------------------------------ */

export const dynamic = "force-dynamic";

export default async function DevicePage(props: any) {
  const params = await props.params;
  const siteid = params.siteid;
  const ha_device_id = params.ha_device_id;

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

  /* ------------------------------
     1) Fetch device record
  ------------------------------ */
  const { data: device, error: deviceErr } = await supabase
    .from("a_devices")
    .select("*")
    .eq("ha_device_id", ha_device_id)
    .eq("site_id", siteid)
    .single();

  if (!device || deviceErr) {
    return (
      <div className="p-6 text-red-600">
        <h1 className="text-xl font-semibold">Device not found</h1>
        <p>{deviceErr?.message}</p>
      </div>
    );
  }

  /* ------------------------------
     2) Fetch LIVE entity signals
  ------------------------------ */
  const { data: entities } = await supabase
    .from("view_entity_sync")
    .select("*")
    .eq("ha_device_id", ha_device_id)
    .eq("site_id", siteid)
    .order("entity_id");

  /* ------------------------------
     UI — Device Page
  ------------------------------ */

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-emerald-700">
          {device.device_name || "Unnamed Device"}
        </h1>

        <Link
          href={`/sites/${siteid}/gateways`}
          className="text-sm text-emerald-700 hover:underline"
        >
          ← Back to Gateway Registry
        </Link>
      </div>

      {/* DEVICE INFO */}
      <Card>
        <CardHeader>
          <CardTitle>Device Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">

          <div>
            <strong>Name:</strong> {device.device_name}
          </div>
          <div>
            <strong>Manufacturer:</strong> {device.manufacturer}
          </div>
          <div>
            <strong>Model:</strong> {device.model}
          </div>
          <div>
            <strong>Protocol:</strong> {device.protocol}
          </div>
          <div>
            <strong>Connection:</strong> {device.connection_type}
          </div>
          <div>
            <strong>Z-Wave LR:</strong> {device.zwave_lr ? "Yes" : "No"}
          </div>
          <div>
            <strong>Firmware:</strong> {device.firmware_version}
          </div>
          <div>
            <strong>Serial #:</strong> {device.serial_number}
          </div>
          <div>
            <strong>Status:</strong>{" "}
            <span
              className={
                device.status === "active"
                  ? "text-green-700 font-semibold"
                  : device.status === "inactive"
                  ? "text-yellow-700 font-semibold"
                  : "text-red-700 font-semibold"
              }
            >
              {device.status}
            </span>
          </div>

          <div>
            <strong>Equipment:</strong>{" "}
            {device.equipment_id ? (
              <Link
                href={`/sites/${siteid}/equipment/${device.equipment_id}/individual-equipment`}
                className="text-emerald-700 hover:underline"
              >
                View Equipment →
              </Link>
            ) : (
              "Unassigned"
            )}
          </div>

          <div>
            <strong>Created:</strong>{" "}
            {new Date(device.created_at).toLocaleString()}
          </div>
        </CardContent>
      </Card>

      {/* ENTITY LIST */}
      <Card>
        <CardHeader>
          <CardTitle>Live Entities (from HA)</CardTitle>
        </CardHeader>

        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-1">Entity ID</th>
                <th className="py-1">Type</th>
                <th className="py-1">Last Seen</th>
                <th className="py-1">Value</th>
              </tr>
            </thead>

            <tbody>
              {(entities ?? []).map((e) => (
                <tr key={e.entity_id} className="border-t">
                  <td className="font-mono text-xs py-1">{e.entity_id}</td>
                  <td className="py-1 capitalize">{e.sensor_type ?? "—"}</td>
                  <td
                    className={`py-1 ${
                      isOffline(e.last_seen_at) ? "text-red-600" : ""
                    }`}
                  >
                    {formatRelativeTime(e.last_seen_at)}
                  </td>
                  <td className="py-1">
                    {e.unit_of_measurement
                      ? `${e.last_state} ${e.unit_of_measurement}`
                      : e.last_state ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
