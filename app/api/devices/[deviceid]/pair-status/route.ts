import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { haFetch } from "@/lib/ha-push";

async function getCallerUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id || null;
  } catch { return null; }
}

/** GET — poll pairing progress */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deviceid: string }> }
) {
  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { deviceid } = await params;

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: device } = await svc
    .from("a_devices")
    .select("device_id, site_id, pairing_status, pairing_started_at, paired_at, pairing_error, ha_device_id")
    .eq("device_id", deviceid)
    .single();

  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  // Already resolved
  if (device.pairing_status !== "pairing") {
    return NextResponse.json({
      pairing_status: device.pairing_status,
      ha_device_id: device.ha_device_id,
      paired_at: device.paired_at,
      pairing_error: device.pairing_error,
      elapsed_seconds: 0,
    });
  }

  const startedAt = device.pairing_started_at ? new Date(device.pairing_started_at).getTime() : Date.now();
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);

  // Timeout after 10 minutes
  if (elapsed > 600) {
    await svc
      .from("a_devices")
      .update({ pairing_status: "failed", pairing_error: "Pairing timed out after 10 minutes" })
      .eq("device_id", deviceid);

    return NextResponse.json({
      pairing_status: "failed",
      pairing_error: "Pairing timed out after 10 minutes",
      elapsed_seconds: elapsed,
    });
  }

  // Try to detect new device in HA
  if (device.site_id) {
    const { data: site } = await svc
      .from("a_sites")
      .select("ha_url, ha_token")
      .eq("site_id", device.site_id)
      .single();

    if (site?.ha_url && site?.ha_token) {
      try {
        const res = await haFetch(
          `${site.ha_url}/api/config/device_registry/list`,
          site.ha_token,
          { method: "GET" },
          8000
        );

        if (res.ok) {
          const haDevices = await res.json();
          // Look for devices added after pairing started
          const newDevices = (haDevices as any[]).filter((d: any) => {
            if (!d.config_entries) return false;
            // Check if created recently (HA doesn't always have created_at, so match by zwave_js)
            return d.config_entries.some((entry: string) =>
              entry.toLowerCase().includes("zwave")
            );
          });

          // Find a device that wasn't previously known
          if (newDevices.length > 0) {
            // Check if any of these HA devices are not yet in our DB
            const haIds = newDevices.map((d: any) => d.id);
            const { data: existing } = await svc
              .from("a_devices")
              .select("ha_device_id")
              .in("ha_device_id", haIds);

            const existingIds = new Set((existing || []).map((e) => e.ha_device_id));
            const matched = newDevices.find((d: any) => !existingIds.has(d.id));

            if (matched) {
              await svc
                .from("a_devices")
                .update({
                  pairing_status: "paired",
                  paired_at: new Date().toISOString(),
                  ha_device_id: matched.id,
                  pairing_error: null,
                })
                .eq("device_id", deviceid);

              return NextResponse.json({
                pairing_status: "paired",
                ha_device_id: matched.id,
                paired_at: new Date().toISOString(),
                elapsed_seconds: elapsed,
              });
            }
          }
        }
      } catch {
        // HA unreachable during poll — continue waiting
      }
    }
  }

  return NextResponse.json({
    pairing_status: "pairing",
    elapsed_seconds: elapsed,
  });
}
