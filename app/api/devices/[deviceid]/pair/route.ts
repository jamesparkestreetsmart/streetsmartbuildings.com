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

/** POST — initiate Z-Wave pairing (SmartStart or classic inclusion) */
export async function POST(
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

  // Load device
  const { data: device } = await svc
    .from("a_devices")
    .select("device_id, site_id, smartstart_dsk, inclusion_pin, pairing_status, pairing_started_at")
    .eq("device_id", deviceid)
    .single();

  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  // Prevent concurrent pairing (< 5 min old)
  if (device.pairing_status === "pairing" && device.pairing_started_at) {
    const elapsed = Date.now() - new Date(device.pairing_started_at).getTime();
    if (elapsed < 5 * 60 * 1000) {
      return NextResponse.json({ error: "Pairing already in progress" }, { status: 409 });
    }
  }

  if (!device.site_id) {
    return NextResponse.json({ error: "Device must be assigned to a site" }, { status: 400 });
  }

  // Get HA credentials from site
  const { data: site } = await svc
    .from("a_sites")
    .select("ha_url, ha_token")
    .eq("site_id", device.site_id)
    .single();

  if (!site?.ha_url || !site?.ha_token) {
    return NextResponse.json({ error: "HA not configured for this site" }, { status: 400 });
  }

  try {
    if (device.smartstart_dsk) {
      // SmartStart provisioning
      await haFetch(
        `${site.ha_url}/api/services/zwave_js/provision_smart_start_node`,
        site.ha_token,
        {
          method: "POST",
          body: JSON.stringify({ dsk: device.smartstart_dsk }),
        }
      );
    } else if (device.inclusion_pin) {
      // Classic inclusion with PIN
      await haFetch(
        `${site.ha_url}/api/services/zwave_js/add_node`,
        site.ha_token,
        {
          method: "POST",
          body: JSON.stringify({ inclusion_strategy: 2 }),
        }
      );
    } else {
      return NextResponse.json({ error: "No DSK or PIN configured for pairing" }, { status: 400 });
    }
  } catch (err: any) {
    // Update status to failed
    await svc
      .from("a_devices")
      .update({ pairing_status: "failed", pairing_error: err.message || "HA call failed" })
      .eq("device_id", deviceid);

    return NextResponse.json({ error: "Failed to contact Home Assistant" }, { status: 502 });
  }

  // Set pairing status
  await svc
    .from("a_devices")
    .update({
      pairing_status: "pairing",
      pairing_started_at: new Date().toISOString(),
      pairing_error: null,
    })
    .eq("device_id", deviceid);

  // Log event
  await svc.from("b_records_log").insert({
    device_id: deviceid,
    site_id: device.site_id,
    event_type: "pairing_initiated",
    created_by: userId,
    details: { mode: device.smartstart_dsk ? "smartstart" : "classic" },
  }).then(() => {});

  return NextResponse.json({ ok: true, mode: device.smartstart_dsk ? "smartstart" : "classic" });
}
