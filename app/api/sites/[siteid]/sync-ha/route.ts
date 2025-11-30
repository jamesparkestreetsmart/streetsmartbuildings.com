import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(
  req: Request,
  context: { params: Promise<{ siteid: string }> }
) {
  // FIX: Next.js gives us params wrapped in a Promise
  const { siteid } = await context.params;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  // Parse JSON body safely
  let payload;
  try {
    payload = await req.json();
  } catch (err) {
    console.error("Invalid JSON payload:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const devices = payload.devices ?? [];
  const entities = payload.entities ?? [];

  // Supabase SSR client (same style as your page.tsx files)
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

  // Build upsert rows
  const upserts = devices.map((dev: any) => ({
    site_id: siteid,
    ha_device_id: dev.id,
    source_gateway: "ha",
    gr_device_name: dev.name ?? null,
    gr_device_manufacturer: dev.manufacturer ?? null,
    gr_device_model: dev.model ?? null,
    gr_area: dev.area ?? null,
    gr_device_sw_version: dev.sw_version ?? null,
    gr_device_hw_version: dev.hw_version ?? null,
    gr_raw: dev,
    last_updated_at: new Date().toISOString(),
  }));

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("a_devices_gateway_registry")
      .upsert(upserts, {
        onConflict: "site_id,ha_device_id",
      });

    if (error) {
      console.error("Upsert error:", error);
      return NextResponse.json(
        { error: "Supabase upsert failed", detail: error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    status: "ok",
    siteid,
    devices_received: devices.length,
    entities_received: entities.length,
    matched: [],
    unmatched_registry: [],
  });
}
