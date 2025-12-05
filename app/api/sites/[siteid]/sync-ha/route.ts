// app/api/sites/[siteid]/sync-ha/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/* --------------------------------------------------------------------------
   FUZZY MATCHING — scores how well an HA entity matches a Supabase sensor
   -------------------------------------------------------------------------- */
function scoreMatch(sensorName: string, entityId: string): number {
  const n = sensorName.toLowerCase();
  const e = entityId.toLowerCase();
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

/* --------------------------------------------------------------------------
   HOME ASSISTANT PAYLOAD TYPES
   -------------------------------------------------------------------------- */
interface HAEntity {
  entity_id: string;
  friendly_name?: string | null;
  domain?: string | null;
  device_class?: string | null;
  value?: any;
  unit?: string | null;
  state?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  area_id?: string | null;
}

interface HAIncomingPayload {
  entities?: HAEntity[];
  devices?: any[];
}

/* --------------------------------------------------------------------------
   POST ROUTE — receives registry from Home Assistant
   -------------------------------------------------------------------------- */
export async function POST(
  req: NextRequest,
  { params }: { params: { siteid: string } }
) {
  const { siteid } = params;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  /* ----------------------------------------------------------------------
     1. Parse Incoming JSON From Home Assistant
     ---------------------------------------------------------------------- */
  let payload: HAIncomingPayload = {};
  try {
    payload = await req.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entities: HAEntity[] = payload.entities ?? [];
  const devices = payload.devices ?? [];

  /* ----------------------------------------------------------------------
     2. Create Supabase Server Client
     ---------------------------------------------------------------------- */
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

  /* ----------------------------------------------------------------------
     3. UPSERT ENTITY REGISTRY INTO b_entity_sync TABLE
        (Your new normalized registry structure)
     ---------------------------------------------------------------------- */
  const registryUpserts = entities.map((ent) => ({
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
    equipment_id: null, // you will fill during commissioning
    raw_json: ent,
    last_updated_at: new Date().toISOString(),
  }));

  if (registryUpserts.length > 0) {
    const { error: regErr } = await supabase
      .from("b_entity_sync")
      .upsert(registryUpserts, { onConflict: "site_id,entity_id" });

    if (regErr) {
      return NextResponse.json(
        { error: "Failed to upsert b_entity_sync", detail: regErr.message },
        { status: 500 }
      );
    }
  }

  /* ----------------------------------------------------------------------
     4. LOAD SENSORS FROM a_sensors TABLE
     ---------------------------------------------------------------------- */
  const { data: sensors, error: sensorsErr } = await supabase
    .from("a_sensors")
    .select("*")
    .eq("site_id", siteid);

  if (sensorsErr) {
    return NextResponse.json(
      { error: "Failed to load sensors", detail: sensorsErr.message },
      { status: 500 }
    );
  }

  /* ----------------------------------------------------------------------
     5. FUZZY MATCH SENSORS WITH HA ENTITIES
     ---------------------------------------------------------------------- */
  const matchResults = (sensors ?? []).map((sensor) => {
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const ent of entities) {
      const score = scoreMatch(sensor.sensor_name, ent.entity_id);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = ent.entity_id;
      }
    }

    return {
      sensor_id: sensor.sensor_id,
      sensor_name: sensor.sensor_name,
      matched_entity: bestMatch,
      score: bestScore,
    };
  });

  /* ----------------------------------------------------------------------
     6. UPDATE SENSOR MAPPINGS WITH MATCHED ENTITIES (Score ≥ 3)
     ---------------------------------------------------------------------- */
  const sensorUpdates = matchResults
    .filter((m) => m.matched_entity && m.score >= 3)
    .map((m) => ({
      sensor_id: m.sensor_id,
      ha_entity_id: m.matched_entity!,
      updated_at: new Date().toISOString(),
    }));

  if (sensorUpdates.length > 0) {
    const { error: updErr } = await supabase
      .from("a_sensors")
      .upsert(sensorUpdates, { onConflict: "sensor_id" });

    if (updErr) {
      return NextResponse.json(
        { error: "Failed to update a_sensors", detail: updErr.message },
        { status: 500 }
      );
    }
  }

  /* ----------------------------------------------------------------------
     7. RESPONSE — return detailed mapping report
     ---------------------------------------------------------------------- */
  return NextResponse.json(
    {
      status: "ok",
      site_id: siteid,
      entities_received: entities.length,
      devices_received: devices.length,
      sensors_checked: sensors?.length ?? 0,
      sensors_mapped: sensorUpdates.length,
      mappings: matchResults,
    },
    { status: 200 }
  );
}
