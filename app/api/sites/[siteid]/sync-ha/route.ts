import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest, context: any) {
  const siteid = context?.params?.siteid;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  // Parse JSON payload safely
  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entities = payload.entities ?? [];

  // Create Supabase client
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value || "";
        }
      }
    }
  );

  // Build upserts
  const upserts = entities.map((ent: any) => ({
    site_id: siteid,
    entity_id: ent.entity_id,
    friendly_name: ent.friendly_name ?? null,
    domain: ent.domain ?? null,
    device_class: ent.device_class ?? null,
    value: ent.value ?? null,
    unit_of_measurement: ent.unit ?? null,
    state: ent.state ?? null,
    ha_device_id: ent.device_id ?? null,
    ha_device_name: ent.device_name ?? null,
    ha_area_id: ent.area_id ?? null,
    equipment_id: null,
    raw_json: ent,
    last_updated_at: new Date().toISOString()
  }));

  // Insert/upsert into b_entity_sync
  const { error } = await supabase
    .from("b_entity_sync")
    .upsert(upserts, { onConflict: "site_id,entity_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    site_id: siteid,
    entities_received: entities.length,
  });
}
