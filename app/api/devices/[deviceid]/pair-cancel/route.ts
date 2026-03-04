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

/** POST — cancel Z-Wave pairing */
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

  const { data: device } = await svc
    .from("a_devices")
    .select("device_id, site_id, smartstart_dsk")
    .eq("device_id", deviceid)
    .single();

  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  // If classic mode, tell HA to stop inclusion
  if (!device.smartstart_dsk && device.site_id) {
    const { data: site } = await svc
      .from("a_sites")
      .select("ha_url, ha_token")
      .eq("site_id", device.site_id)
      .single();

    if (site?.ha_url && site?.ha_token) {
      try {
        await haFetch(
          `${site.ha_url}/api/services/zwave_js/stop_inclusion`,
          site.ha_token,
          { method: "POST", body: JSON.stringify({}) }
        );
      } catch {
        // Best-effort
      }
    }
  }

  await svc
    .from("a_devices")
    .update({
      pairing_status: "unpaired",
      pairing_started_at: null,
      pairing_error: null,
    })
    .eq("device_id", deviceid);

  return NextResponse.json({ ok: true });
}
