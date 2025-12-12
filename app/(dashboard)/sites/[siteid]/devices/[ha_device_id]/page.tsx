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
  const searchParams = props.searchParams || {};

  const siteid = params?.siteid;
  const haDeviceId = params?.ha_device_id;

  const returnTo = searchParams.returnTo as string | undefined;
  const equipmentId = searchParams.equipmentId as string | undefined;

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

        <Link
          href={`/sites/${siteid}`}
          className="inline-flex items-center rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
        >
          ← Back to Site
        </Link>
      </div>
    );
  }

  /* ✅ Determine back destination */
  let backHref = `/sites/${siteid}`;

  if (returnTo === "equipment" && equipmentId) {
    backHref = `/sites/${siteid}/equipment/${equipmentId}/individual-equipment`;
  } else if (returnTo === "gateways") {
    backHref = `/sites/${siteid}/gateways`;
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
            href={backHref}
            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow hover:bg-gray-100"
          >
            ← Back
          </Link>
        </header>

        {/* Device content unchanged below */}
      </div>
    </div>
  );
}
