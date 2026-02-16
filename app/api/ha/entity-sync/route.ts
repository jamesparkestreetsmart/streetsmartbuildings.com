// app/api/ha/entity-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
  last_seen_at?: string | null;

  ha_device_id?: string | null;
  device_name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  sw_version?: string | null;
  hw_version?: string | null;
};

type LibrarySensor = {
  entity_suffix: string;
  sensor_type: string;
  name: string;
};

// ─── Orphan Entity Resolution ─────────────────────────────────────────────────

async function resolveOrphanEntities(
  siteId: string,
  orphanEntities: IncomingEntity[]
): Promise<Map<string, { ha_device_id: string; device_name: string }>> {
  const result = new Map<string, { ha_device_id: string; device_name: string }>();

  if (orphanEntities.length === 0) return result;

  const { data: siteDevices } = await supabase
    .from("a_devices")
    .select("device_id, device_name, library_device_id, protocol")
    .eq("site_id", siteId)
    .not("library_device_id", "is", null);

  if (!siteDevices || siteDevices.length === 0) return result;

  const libraryIds = [...new Set(siteDevices.map((d) => d.library_device_id).filter(Boolean))];

  const { data: libraryDevices } = await supabase
    .from("library_devices")
    .select("library_device_id, default_sensors, template_name")
    .in("library_device_id", libraryIds);

  if (!libraryDevices || libraryDevices.length === 0) return result;

  const libraryMap = new Map<string, LibrarySensor[]>();
  for (const ld of libraryDevices) {
    const sensors: LibrarySensor[] =
      typeof ld.default_sensors === "string"
        ? JSON.parse(ld.default_sensors)
        : ld.default_sensors ?? [];
    libraryMap.set(ld.library_device_id, sensors);
  }

  for (const device of siteDevices) {
    if (!device.library_device_id) continue;
    const sensors = libraryMap.get(device.library_device_id);
    if (!sensors || sensors.length === 0) continue;

    const syntheticId = `device_${device.device_id}`;
    const deviceName = device.device_name || "Unknown Device";
    const suffixes = sensors.map((s) => s.entity_suffix.toLowerCase());

    const matched = orphanEntities.filter((e) => {
      const slug = e.entity_id.split(".")[1]?.toLowerCase() || "";
      return suffixes.some((suffix) => slug.endsWith(suffix));
    });

    if (matched.length >= 2) {
      for (const entity of matched) {
        result.set(entity.entity_id, {
          ha_device_id: syntheticId,
          device_name: deviceName,
        });
      }
    }
  }

  return result;
}

// ─── Site Identity Resolution ─────────────────────────────────────────────────

async function resolveSiteIdentity(
  body: any
): Promise<{ site_id: string; org_id: string } | { error: string; status: number }> {
  const { site_slug, site_id, org_id } = body;

  if (site_slug) {
    const { data: site, error } = await supabase
      .from("a_sites")
      .select("site_id, org_id")
      .eq("site_slug", site_slug)
      .single();

    if (error || !site) {
      return { error: `Site not found for slug: ${site_slug}`, status: 404 };
    }

    return { site_id: site.site_id, org_id: site.org_id };
  }

  if (site_id && org_id) {
    return { site_id, org_id };
  }

  return { error: "Missing site_slug (or site_id + org_id)", status: 400 };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

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

  const identity = await resolveSiteIdentity(body);
  if ("error" in identity) {
    return NextResponse.json(
      { ok: false, error: identity.error },
      { status: identity.status }
    );
  }

  const { site_id, org_id } = identity;
  const { equipment_id, entities } = body ?? {};

  if (!Array.isArray(entities) || entities.length === 0) {
    return NextResponse.json(
      { ok: false, error: "entities must be a non-empty array" },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const incoming = (entities as IncomingEntity[]).filter((e) => e && e.entity_id && e.domain);

  // Load sensor type mappings — only keep 1:1 matches
  const { data: mappings } = await supabase
    .from("library_sensor_type_mapping")
    .select("sensor_type, ha_device_class")
    .not("ha_device_class", "is", null)
    .neq("ha_device_class", "");

  // Build auto-assign map: only where device_class has exactly one sensor_type
  const dcCounts: Record<string, string[]> = {};
  for (const m of mappings || []) {
    if (!dcCounts[m.ha_device_class]) dcCounts[m.ha_device_class] = [];
    if (!dcCounts[m.ha_device_class].includes(m.sensor_type)) {
      dcCounts[m.ha_device_class].push(m.sensor_type);
    }
  }

  const autoAssignMap: Record<string, string> = {};
  for (const [dc, types] of Object.entries(dcCounts)) {
    if (types.length === 1) {
      autoAssignMap[dc] = types[0];
    }
  }

  // Load existing sensor_type assignments so we don't overwrite manual picks
  const entityIds = incoming.map((e) => e.entity_id);
  const { data: existingEntities } = await supabase
    .from("b_entity_sync")
    .select("entity_id, sensor_type")
    .eq("site_id", site_id)
    .in("entity_id", entityIds);

  const existingSensorTypes = new Map<string, string | null>();
  for (const e of existingEntities || []) {
    existingSensorTypes.set(e.entity_id, e.sensor_type);
  }

  // Resolve orphan entities
  const orphans = incoming.filter((e) => !e.ha_device_id);
  const orphanMap = await resolveOrphanEntities(site_id, orphans);

  // Update a_devices.ha_device_id for matched devices (one-time link)
  if (orphanMap.size > 0) {
    const syntheticIds = new Set<string>();
    orphanMap.forEach((v) => syntheticIds.add(v.ha_device_id));

    for (const syntheticId of syntheticIds) {
      const deviceId = syntheticId.replace("device_", "");
      await supabase
        .from("a_devices")
        .update({ ha_device_id: syntheticId })
        .eq("device_id", deviceId)
        .is("ha_device_id", null);
    }
  }

  // Build rows
  let autoAssigned = 0;
  let preserved = 0;

  const rows = incoming.map((e) => {
    const orphanMatch = orphanMap.get(e.entity_id);

    // sensor_type logic:
    // 1. Preserve existing (manual pick from gateways UI)
    // 2. Auto-assign ONLY if device_class has exactly one sensor_type
    // 3. null — user picks from dropdown on gateways page
    let sensorType: string | null = null;
    const existing = existingSensorTypes.get(e.entity_id);

    if (existing) {
      sensorType = existing;
      preserved++;
    } else if (e.device_class && autoAssignMap[e.device_class]) {
      sensorType = autoAssignMap[e.device_class];
      autoAssigned++;
    }

    return {
      org_id,
      site_id,
      equipment_id: equipment_id || null,
      entity_id: e.entity_id,

      friendly_name: e.friendly_name ?? null,
      domain: e.domain,
      device_class: e.device_class ?? null,
      unit_of_measurement: e.unit_of_measurement ?? null,
      area_id: e.area_id ?? null,

      last_state:
        e.state !== undefined && e.state !== null
          ? String(e.state)
          : e.last_state ?? null,

      last_updated: e.last_updated ?? nowIso,
      last_seen_at: nowIso,

      ha_device_id: e.ha_device_id ?? orphanMatch?.ha_device_id ?? null,
      ha_device_name: e.device_name ?? orphanMatch?.device_name ?? null,

      manufacturer: e.manufacturer ?? null,
      model: e.model ?? null,
      sw_version: e.sw_version ?? null,
      hw_version: e.hw_version ?? null,
      sensor_type: sensorType,
      raw_json: e as any,
    };
  });

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid entities in payload" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("b_entity_sync")
    .upsert(rows, {
      onConflict: "site_id,entity_id",
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
    orphans_matched: orphanMap.size,
    sensor_types: {
      auto_assigned: autoAssigned,
      preserved: preserved,
    },
  });
}