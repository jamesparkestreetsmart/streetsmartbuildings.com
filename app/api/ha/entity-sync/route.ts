import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type IncomingEntity = {
  entity_id: string;
  friendly_name?: string | null;
  domain: string;
  device_class?: string | null;
  unit_of_measurement?: string | null;
  state?: string | number | null;
  value?: string | number | null;
  area_id?: string | null;
  ha_device_id?: string | null;
  device_name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  sw_version?: string | null;
  hw_version?: string | null;
  capabilities?: any;
  attributes?: any;
  raw?: any;
};

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    org_id,
    site_id,
    equipment_id,
    entities,
  }: {
    org_id: string;
    site_id: string;
    equipment_id: string;
    entities: IncomingEntity[];
  } = body;

  if (!org_id || !site_id || !equipment_id || !Array.isArray(entities)) {
    return NextResponse.json(
      { error: "Missing org_id, site_id, equipment_id, or entities[]" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value ?? "";
        },
      },
    }
  );

  const now = new Date().toISOString();

  const rows = entities.map((e) => ({
    org_id,
    site_id,
    equipment_id,
    entity_id: e.entity_id,
    friendly_name: e.friendly_name ?? null,
    domain: e.domain,
    device_class: e.device_class ?? null,
    unit_of_measurement: e.unit_of_measurement ?? null,
    area_id: e.area_id ?? null,
    last_state: e.value ?? e.state ?? null,
    last_updated: now,
    last_seen_at: now,
    ha_device_id: e.ha_device_id ?? null,
    device_name: e.device_name ?? null,
    manufacturer: e.manufacturer ?? null,
    model: e.model ?? null,
    sw_version: e.sw_version ?? null,
    hw_version: e.hw_version ?? null,
    capabilities: e.capabilities ?? null,
    attributes: e.attributes ?? null,
    raw_json: e.raw ?? e,
  }));

  const { error } = await supabase
    .from("b_entity_sync")
    .upsert(rows, {
      onConflict: "org_id,site_id,equipment_id,entity_id",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("ENTITY SYNC ERROR:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    entity_count: rows.length,
    synced_at: now,
  });
}
