// app/api/sites/[siteid]/sync-ha/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// ------------------------------
// Fuzzy Matching Scoring
// ------------------------------
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

  if (e.includes("air_temperature")) score += 1;
  if (e.includes("humidity")) score += 1;
  if (e.includes("battery")) score += 1;

  return score;
}

// ------------------------------
// FIXED Next.js Typings
// ------------------------------
interface RouteContext {
  params: {
    siteid: string;
  };
}

// ------------------------------
// POST Handler
// ------------------------------
export async function POST(req: NextRequest, { params }: RouteContext) {
  const siteid = params.siteid;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  // Parse incoming JSON safely
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const entities = payload.entities ?? [];

  // ------------------------------
  // Supabase Client
  // ------------------------------
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

  // ------------------------------
  // 1. UPSERT INTO a_devices_gateway_registry
  // ------------------------------
  const upserts = entities.map((ent: any) => ({
    site_id: siteid,
    ha_entity_id: ent.entity_id,
    ha_device_id: ent.device_id,
    friendly_name: ent.friendly_name ?? null,
    domain: ent.domain ?? null,
    device_class: ent.device_class ?? null,
    unit: ent.unit ?? null,
    value: ent.value ?? null,
    state: ent.state ?? null,
    area_id: ent.area_id ?? null,
    raw: ent,
    last_seen: new Date().toISOString(),
  }));

  if (upserts.length > 0) {
    await supabase.from("b_entity_sync").upsert(upserts, {
      onConflict: "site_id,ha_entity_id",
    });
  }

  // ------------------------------
  // 2. LOAD a_sensors
  // ------------------------------
  const { data: sensors, error: errSensors } = await supabase
    .from("a_sensors")
    .select("*")
    .eq("site_id", siteid);

  if (errSensors) {
    return NextResponse.json(
      { error: "Failed to load sensors", detail: errSensors.message },
      { status: 500 }
    );
  }

  // ------------------------------
  // 3. FUZZY MATCH INTERNAL SENSORS
  // ------------------------------
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

  // ------------------------------
  // 4. UPDATE MATCHES IN Supabase
  // ------------------------------
  const updates = results
    .filter((r) => r.matched_entity && r.score >= 3)
    .map((r) => ({
      sensor_id: r.sensor_id,
      ha_entity_id: r.matched_entity,
      updated_at: new Date().toISOString(),
    }));

  if (updates.length > 0) {
    await supabase.from("a_sensors").upsert(updates, {
      onConflict: "sensor_id",
    });
  }

  // ------------------------------
  // Response
  // ------------------------------
  return NextResponse.json({
    status: "ok",
    siteid,
    entities_received: entities.length,
    sensors_checked: sensors.length,
    sensors_mapped: updates.length,
    mappings: results,
  });
}
