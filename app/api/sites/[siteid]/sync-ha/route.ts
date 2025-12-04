// app/api/sites/[siteid]/sync-ha/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Simple fuzzy scoring using keyword overlap */
function scoreMatch(name: string, entity: string) {
  const n = name.toLowerCase();
  const e = entity.toLowerCase();

  let score = 0;

  const keywords = [
    "freezer",
    "kitchen",
    "ambient",
    "dining",
    "thermostat",
    "humidity",
    "temperature",
    "battery",
    "leak",
    "water",
  ];

  for (const k of keywords) {
    if (n.includes(k) && e.includes(k)) score += 2;
  }

  // bonus for temperature/humidity structure
  if (e.includes("air_temperature")) score += 1;
  if (e.includes("humidity")) score += 1;
  if (e.includes("battery")) score += 1;

  return score;
}

export async function POST(req: NextRequest, context: { params: Promise<{ siteid: string }> }) {
  const { siteid } = await context.params;
  if (!siteid) return NextResponse.json({ error: "Missing siteid" }, { status: 400 });

  let payload: any;
  try {
    payload = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const devices = payload.devices ?? [];
  const entities = payload.entities ?? [];

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { get(name: string) { return cookieStore.get(name)?.value; } },
    }
  );

  // ============================================================
  // 1. UPSERT ENTITY REGISTRY (keep your existing behavior)
  // ============================================================

  const upserts = [
    ...entities.map((ent: any) => ({
      site_id: siteid,
      ha_device_id: ent.entity_id,
      source_gateway: "ha",
      gr_device_name: ent.friendly_name ?? null,
      gr_raw: ent,
      last_updated_at: new Date().toISOString(),
    })),
  ];

  if (upserts.length > 0) {
    await supabase.from("a_devices_gateway_registry").upsert(upserts, {
      onConflict: "site_id,ha_device_id",
    });
  }

  // ============================================================
  // 2. LOAD SUPABASE SENSORS (the a_sensors table)
  // ============================================================

  const { data: sensors, error: errSensors } = await supabase
    .from("a_sensors")
    .select("*")
    .eq("site_id", siteid);

  if (errSensors) {
    return NextResponse.json({ error: "Failed to load sensors", detail: errSensors.message }, { status: 500 });
  }

  // ============================================================
  // 3. PERFORM FUZZY MATCHING
  // ============================================================

  const results: any[] = [];

  for (const sensor of sensors) {
    let bestMatch = null;
    let bestScore = 0;

    for (const ent of entities) {
      const score = scoreMatch(sensor.sensor_name, ent.entity_id);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = ent.entity_id;
      }
    }

    results.push({
      sensor_id: sensor.sensor_id,
      sensor_name: sensor.sensor_name,
      matched_entity: bestMatch,
      score: bestScore,
    });
  }

  // ============================================================
  // 4. UPDATE MATCHED SENSORS IN SUPABASE
  // ============================================================

  const updates = results
    .filter(r => r.matched_entity && r.score >= 3) // minimum score threshold
    .map(r => ({
      sensor_id: r.sensor_id,
      ha_entity_id: r.matched_entity,
      updated_at: new Date().toISOString(),
    }));

  if (updates.length > 0) {
    await supabase.from("a_sensors").upsert(updates, {
      onConflict: "sensor_id",
    });
  }

  return NextResponse.json({
    status: "ok",
    siteid,
    entities_received: entities.length,
    sensors_checked: sensors.length,
    sensors_mapped: updates.length,
    mappings: results,
  });
}
