// app/api/ha/entity-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server-side Supabase client (no cookies needed – HA is not a browser)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

type IncomingEntity = {
  entity_id: string;
  friendly_name?: string | null;
  domain: string;
  device_class?: string | null;
  unit_of_measurement?: string | null;
  area_id?: string | null;
  state?: string | number | null;
  last_state?: string | null;
  last_updated?: string | null;

  ha_device_id?: string | null;
  device_name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  sw_version?: string | null;
  hw_version?: string | null;

  capabilities?: Record<string, unknown> | null;
  attributes?: Record<string, unknown> | null;
  raw_json?: Record<string, unknown> | null;
};

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { org_id, site_id, equipment_id, entities } = body ?? {};

  if (!org_id || !site_id || !equipment_id) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing org_id, site_id, or equipment_id",
      },
      { status: 400 }
    );
  }

  if (!Array.isArray(entities) || entities.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "entities must be a non-empty array",
      },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();

  // Build rows for b_entity_sync
  const rows = (entities as IncomingEntity[])
    .filter((e) => e && e.entity_id && e.domain)
    .map((e) => ({
      org_id,
      site_id,
      equipment_id,
      entity_id: e.entity_id,

      friendly_name: e.friendly_name ?? null,
      domain: e.domain,
      device_class: e.device_class ?? null,
      unit_of_measurement: e.unit_of_measurement ?? null,
      area_id: e.area_id ?? null,

      // last_state is always stored as text
      last_state:
        e.state !== undefined && e.state !== null
          ? String(e.state)
          : e.last_state ?? null,

      // if HA didn't send a last_updated, fall back to "now"
      last_updated: e.last_updated ?? nowIso,
      last_seen_at: nowIso,

      ha_device_id: e.ha_device_id ?? null,
      ha_device_name: e.device_name ?? null,
      manufacturer: e.manufacturer ?? null,
      model: e.model ?? null,
      sw_version: e.sw_version ?? null,
      hw_version: e.hw_version ?? null,

      capabilities: e.capabilities ?? null,
      attributes: e.attributes ?? null,

      // keep raw payload for debugging – great for future analytics
      raw_json: e.raw_json ?? (e as any),
    }));

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid entities in payload" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("b_entity_sync")
    .upsert(rows, {
      // Match your PK: (org_id, site_id, equipment_id, entity_id)
      onConflict: "org_id,site_id,equipment_id,entity_id",
    });

  if (error) {
    console.error("b_entity_sync upsert error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to upsert entities",
        details: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Entities synced successfully",
    count: rows.length,
  });
}
