// app/sites/[siteid]/devices/[ha_device_id]/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface DeviceRow {
  device_id: string;
  site_id: string;
  device_name: string;
  protocol: string | null;
  connection_type: string | null;
  ip_address: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  created_at: string | null;
  org_id: string | null;
  equipment_id: string | null;
  status: string | null;
  service_notes: string | null;
  zwave_lr: boolean | null;
  model: string | null;
  ha_device_id: string | null;
  library_device_id: string | null;
  manufacturer: string | null;
}

export default async function DeviceDetailsPage(props: any) {
  const params = await props.params;
  const siteid = params?.siteid;
  const haDeviceId = params?.ha_device_id;

  if (!siteid || !haDeviceId) {
    return (
      <div className="p-6 text-red-600">
        Error: Missing site ID or HA device ID.
      </div>
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

  const { data: device, error } = await supabase
    .from("a_devices")
    .select("*")
    .eq("site_id", siteid)
    .eq("ha_device_id", haDeviceId)
    .maybeSingle<DeviceRow>();

  if (error) {
    console.error("Device fetch error:", error);
  }

  if (!device) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <h1 className="text-2xl font-bold text-red-600 mb-2">
          Device not found
        </h1>
        <p className="text-red-700 text-sm mb-4">
          We couldn&apos;t find a device in <code>a_devices</code> with
          this HA Device ID.
        </p>
        <p className="text-sm text-gray-700 mb-6">
          Site ID: <code>{siteid}</code>
          <br />
          HA Device ID: <code>{haDeviceId}</code>
        </p>
        <Link
          href={`/sites/${siteid}/gateways`}
          className="inline-flex items-center rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          ← Back to Gateway Registry
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Device Details</h1>
            <p className="text-sm text-gray-600">
              {device.device_name} • {device.model || "Unknown model"}
            </p>
          </div>

          <Link
            href={`/sites/${siteid}/gateways`}
            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow hover:bg-gray-100"
          >
            ← Back to Gateway Registry
          </Link>
        </header>

        <section className="bg-white rounded-xl shadow p-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold mb-2">Device Identity</h2>
            <p>
              <span className="font-semibold">Device ID:</span>{" "}
              <code className="text-xs">{device.device_id}</code>
            </p>
            <p>
              <span className="font-semibold">HA Device ID:</span>{" "}
              <code className="text-xs">
                {device.ha_device_id ?? "—"}
              </code>
            </p>
            <p>
              <span className="font-semibold">Site ID:</span>{" "}
              <code className="text-xs">{device.site_id}</code>
            </p>
            <p>
              <span className="font-semibold">Equipment ID:</span>{" "}
              <code className="text-xs">
                {device.equipment_id ?? "Unassigned"}
              </code>
            </p>
            <p>
              <span className="font-semibold">Status:</span>{" "}
              <span className="font-semibold">
                {device.status ?? "unknown"}
              </span>
            </p>
            <p>
              <span className="font-semibold">Created At:</span>{" "}
              {device.created_at
                ? new Date(device.created_at).toLocaleString()
                : "—"}
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold mb-2">Technical Info</h2>
            <p>
              <span className="font-semibold">Protocol:</span>{" "}
              {device.protocol ?? "—"}
            </p>
            <p>
              <span className="font-semibold">Connection Type:</span>{" "}
              {device.connection_type ?? "—"}
            </p>
            <p>
              <span className="font-semibold">IP Address:</span>{" "}
              {device.ip_address ?? "—"}
            </p>
            <p>
              <span className="font-semibold">Manufacturer:</span>{" "}
              {device.manufacturer ?? "—"}
            </p>
            <p>
              <span className="font-semibold">Model:</span>{" "}
              {device.model ?? "—"}
            </p>
            <p>
              <span className="font-semibold">Serial Number:</span>{" "}
              {device.serial_number ?? "—"}
            </p>
            <p>
              <span className="font-semibold">Firmware Version:</span>{" "}
              {device.firmware_version ?? "—"}
            </p>
            <p>
              <span className="font-semibold">Z-Wave LR:</span>{" "}
              {device.zwave_lr ? "Yes" : "No / Unknown"}
            </p>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-2">Service Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {device.service_notes ?? "No notes recorded yet."}
          </p>
        </section>
      </div>
    </div>
  );
}
