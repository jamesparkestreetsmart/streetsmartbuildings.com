import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Expected JSON payload from Home Assistant:
 * {
 *   "devices": [...],
 *   "entities": [...]
 * }
 */

export async function POST(
  req: Request,
  { params }: { params: { siteid: string } }
) {
  const { siteid } = await params;
  if (!siteid) {
    return NextResponse.json(
      { error: "Missing siteid param" },
      { status: 400 }
    );
  }

  // Parse incoming HA registry export
  const body = await req.json();
  const devices = body.devices || [];
  const entities = body.entities || [];

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

  // Validate site exists
  const { data: site, error: siteErr } = await supabase
    .from("a_sites")
    .select("site_id")
    .eq("site_id", siteid)
    .single();

  if (siteErr || !site) {
    return NextResponse.json(
      { error: "Invalid site ID." },
      { status: 404 }
    );
  }

  // --- INSERT / UPDATE HA DEVICES INTO REGISTRY ---
  for (const dev of devices) {
    const haId = dev.id;
    if (!haId) continue;

    const payload = {
      site_id: siteid,
      ha_device_id: haId,
      gr_device_name: dev.name || null,
      gr_device_manufacturer: dev.manufacturer || null,
      gr_device_model: dev.model || null,
      gr_device_sw_version: dev.sw_version || null,
      gr_device_hw_version: dev.hw_version || null,
      gr_area: dev.area || null,
      gr_raw: dev,
    };

    // Upsert (unique on site_id, ha_device_id)
    await supabase.from("a_devices_gateway_registry").upsert(payload, {
      onConflict: "site_id,ha_device_id",
    });
  }

  // --- FETCH BUSINESS DEVICES FOR THIS SITE ---
  const { data: businessDevices } = await supabase
    .from("a_devices")
    .select("*")
    .eq("site_id", siteid);

  // --- MATCHING LOGIC: based ONLY on ha_device_id ---
  let matched: any[] = [];
  let unmatchedRegistry: any[] = [];

  for (const dev of devices) {
    const haId = dev.id;
    const match = businessDevices?.find(
      (d) => d.ha_device_id === haId
    );

    if (match) {
      // Update metadata but preserve business data
      await supabase
        .from("a_devices")
        .update({
          device_name: dev.name || match.device_name,
          manufacturer: dev.manufacturer || match.manufacturer,
          model: dev.model || match.model,
          firmware_version: dev.sw_version || match.firmware_version,
        })
        .eq("device_id", match.device_id);

      matched.push({
        ha_device_id: haId,
        business_device_id: match.device_id,
        merged: true,
      });
    } else {
      unmatchedRegistry.push({
        ha_device_id: haId,
        name: dev.name,
        model: dev.model,
        manufacturer: dev.manufacturer,
      });
    }
  }

  return NextResponse.json({
    status: "ok",
    siteid,
    devices_received: devices.length,
    entities_received: entities.length,
    matched,
    unmatched_registry: unmatchedRegistry,
  });
}
