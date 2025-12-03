// app/api/sites/[siteid]/sync-ha/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ siteid: string }> }
): Promise<NextResponse> {
  // Next 16: params is a Promise in your current setup
  const { siteid } = await context.params;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  // Parse JSON payload
  let payload: any;
  try {
    payload = await req.json();
  } catch (err) {
    console.error("Invalid JSON payload:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const devices = payload.devices ?? [];
  const entities = payload.entities ?? [];

  // Supabase client
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

  // Build upsert rows into a_devices_gateway_registry
  // We’ll treat each ENTITY as a "device" row for now.
  const upserts = [
    // Existing device objects (if you ever use them again)
    ...devices.map((dev: any) => ({
      site_id: siteid,
      ha_device_id: dev.id ?? dev.entity_id ?? null,
      source_gateway: "ha",
      gr_device_name: dev.name ?? dev.friendly_name ?? null,
      gr_device_manufacturer: dev.manufacturer ?? null,
      gr_device_model: dev.model ?? null,
      gr_area: dev.area ?? null,
      gr_device_sw_version: dev.sw_version ?? null,
      gr_device_hw_version: dev.hw_version ?? null,
      gr_raw: dev,
      last_updated_at: new Date().toISOString(),
    })),

    // NEW: entity-based rows
    ...entities.map((ent: any) => ({
      site_id: siteid,
      ha_device_id: ent.entity_id, // use entity_id as our unique key
      source_gateway: "ha",
      gr_device_name: ent.friendly_name ?? null,
      gr_device_manufacturer: ent.manufacturer ?? null,
      gr_device_model: ent.model ?? null,
      gr_area: ent.area ?? null,
      gr_device_sw_version: ent.sw_version ?? null,
      gr_device_hw_version: ent.hw_version ?? null,
      gr_raw: ent,
      last_updated_at: new Date().toISOString(),
    })),
  ];

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("a_devices_gateway_registry")
      .upsert(upserts, {
        onConflict: "site_id,ha_device_id",
      });

    if (error) {
      console.error("Supabase upsert error in /sync-ha:", error);
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
    rows_upserted: upserts.length,
  });
}