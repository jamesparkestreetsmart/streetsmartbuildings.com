import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Audit helper ──────────────────────────────────────────────────────────────

async function logAudit(
  siteId: string,
  opts: {
    space_id?: string;
    org_id?: string;
    action: string;
    details: Record<string, any>;
    created_by?: string;
  }
) {
  try {
    await supabase.from("b_records_log").insert({
      site_id: siteId,
      org_id: opts.org_id || null,
      event_type: opts.action,
      source: "space_sensor_mapping",
      message: opts.action.replace(/_/g, " "),
      metadata: { ...opts.details, space_id: opts.space_id || null },
      created_by: opts.created_by || "system",
      event_date: new Date().toISOString().split("T")[0],
    });
  } catch (err) {
    // Non-fatal — don't break the main operation if audit logging fails
    console.error("[spaces-summary] audit log error:", err);
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await context.params;

  try {
    const [
      { data: spaces, error: spErr },
      { data: hvacZones, error: hzErr },
      { data: devices, error: devErr },
      { data: equipments, error: eqErr },
      { data: spaceSensors, error: ssErr },
      { data: sensorReqs, error: srErr },
      { data: entitySync, error: esErr },
    ] = await Promise.all([
      supabase
        .from("a_spaces")
        .select("space_id, name, space_type, hvac_zone_id")
        .eq("site_id", siteId)
        .order("name"),
      supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id, name, equipment_id")
        .eq("site_id", siteId),
      supabase
        .from("a_devices")
        .select("device_id, space_id")
        .eq("site_id", siteId),
      supabase
        .from("a_equipments")
        .select("equipment_id, space_id")
        .eq("site_id", siteId),
      supabase
        .from("a_space_sensors")
        .select("id, space_id, sensor_type, entity_id, weight, is_primary")
        .eq("site_id", siteId),
      supabase
        .from("library_space_sensor_requirements")
        .select("space_type, sensor_role, sensor_type, required"),
      supabase
        .from("b_entity_sync")
        .select("entity_id, friendly_name, device_class, domain, last_state, last_seen_at")
        .eq("site_id", siteId)
        .or("domain.eq.sensor,domain.eq.binary_sensor"),
    ]);

    if (spErr) throw spErr;
    if (hzErr) throw hzErr;
    if (devErr) throw devErr;
    if (eqErr) throw eqErr;
    if (ssErr) throw ssErr;
    if (srErr) throw srErr;
    if (esErr) throw esErr;

    // Build HVAC zone name map + zone→equipment mapping
    const zoneMap = new Map<string, string>();
    const zoneToEquipId = new Map<string, string>();
    for (const z of hvacZones || []) {
      zoneMap.set(z.hvac_zone_id, z.name);
      if (z.equipment_id) zoneToEquipId.set(z.hvac_zone_id, z.equipment_id);
    }

    // Query equipment→spaces via a_equipment_served_spaces (no site_id column on this table)
    const equipIds = [...zoneToEquipId.values()];
    const equipToSpaceIds = new Map<string, string[]>();
    if (equipIds.length > 0) {
      const { data: servedRows } = await supabase
        .from("a_equipment_served_spaces")
        .select("equipment_id, space_id")
        .in("equipment_id", equipIds);
      for (const row of servedRows || []) {
        if (!equipToSpaceIds.has(row.equipment_id)) equipToSpaceIds.set(row.equipment_id, []);
        equipToSpaceIds.get(row.equipment_id)!.push(row.space_id);
      }
    }

    // Build zone→space_ids mapping (zone → equipment → served spaces)
    const zoneToSpaceIds: Record<string, string[]> = {};
    const spaceIdToZoneName = new Map<string, string>();
    for (const [zoneId, equipId] of zoneToEquipId) {
      const spaceIds = equipToSpaceIds.get(equipId) || [];
      zoneToSpaceIds[zoneId] = spaceIds;
      const zoneName = zoneMap.get(zoneId);
      if (zoneName) {
        for (const sid of spaceIds) {
          spaceIdToZoneName.set(sid, zoneName);
        }
      }
    }

    // Count devices per space
    const deviceCountBySpace = new Map<string, number>();
    for (const d of devices || []) {
      if (!d.space_id) continue;
      deviceCountBySpace.set(d.space_id, (deviceCountBySpace.get(d.space_id) || 0) + 1);
    }

    // Count equipment per space
    const equipCountBySpace = new Map<string, number>();
    for (const e of equipments || []) {
      if (!e.space_id) continue;
      equipCountBySpace.set(e.space_id, (equipCountBySpace.get(e.space_id) || 0) + 1);
    }

    // Group requirements by space_type
    const reqsBySpaceType = new Map<string, { sensor_role: string; sensor_type: string; required: boolean }[]>();
    for (const r of sensorReqs || []) {
      if (!reqsBySpaceType.has(r.space_type)) reqsBySpaceType.set(r.space_type, []);
      reqsBySpaceType.get(r.space_type)!.push({
        sensor_role: r.sensor_role,
        sensor_type: r.sensor_type,
        required: r.required,
      });
    }

    // Group mapped sensors by space_id
    const sensorsBySpace = new Map<string, any[]>();
    const mappedBySpace = new Map<string, Set<string>>();
    // Build global entity→space mapping for duplicate prevention
    const entityToSpace = new Map<string, { space_id: string; space_name: string }>();
    const spaceNameMap = new Map<string, string>();
    for (const sp of spaces || []) {
      spaceNameMap.set(sp.space_id, sp.name);
    }
    for (const ss of spaceSensors || []) {
      if (!sensorsBySpace.has(ss.space_id)) sensorsBySpace.set(ss.space_id, []);
      sensorsBySpace.get(ss.space_id)!.push({
        id: ss.id,
        sensor_type: ss.sensor_type,
        entity_id: ss.entity_id,
        weight: ss.weight,
        is_primary: ss.is_primary,
      });
      if (ss.entity_id) {
        if (!mappedBySpace.has(ss.space_id)) mappedBySpace.set(ss.space_id, new Set());
        mappedBySpace.get(ss.space_id)!.add(ss.sensor_type);
        entityToSpace.set(ss.entity_id, {
          space_id: ss.space_id,
          space_name: spaceNameMap.get(ss.space_id) || "Unknown",
        });
      }
    }

    // Build available entities by sensor type
    const tempEntities: any[] = [];
    const humidityEntities: any[] = [];
    const motionEntities: any[] = [];
    for (const e of entitySync || []) {
      const item = {
        entity_id: e.entity_id,
        friendly_name: e.friendly_name,
        last_state: e.last_state,
        last_seen_at: e.last_seen_at,
      };
      if (e.device_class === "temperature" || e.device_class === "air_temperature") {
        tempEntities.push(item);
      } else if (e.device_class === "humidity") {
        humidityEntities.push(item);
      } else if (e.device_class === "motion" || e.device_class === "occupancy") {
        motionEntities.push(item);
      }
    }

    // Assemble response
    const result = (spaces || []).map((sp) => {
      const reqs = reqsBySpaceType.get(sp.space_type) || [];
      const mappedSensorTypes = mappedBySpace.get(sp.space_id) || new Set<string>();

      const requiredReqs = reqs.filter((r) => r.required);
      const required_count = requiredReqs.length;
      const total_requirements = reqs.length;

      const reqSensorTypes = new Set(reqs.map((r) => r.sensor_type));
      const mapped_count = [...mappedSensorTypes].filter((st) => reqSensorTypes.has(st)).length;

      const requiredSensorTypes = new Set(requiredReqs.map((r) => r.sensor_type));
      const mapped_required_count = [...mappedSensorTypes].filter((st) => requiredSensorTypes.has(st)).length;

      const mappedRoles = reqs
        .filter((r) => mappedSensorTypes.has(r.sensor_type))
        .map((r) => r.sensor_role);

      const missingRequiredRoles = requiredReqs
        .filter((r) => !mappedSensorTypes.has(r.sensor_type))
        .map((r) => r.sensor_role);

      return {
        space_id: sp.space_id,
        name: sp.name,
        space_type: sp.space_type,
        hvac_zone_id: sp.hvac_zone_id || null,
        hvac_zone_weight: (sp as any).hvac_zone_weight ?? 1.0,
        hvac_zone_name: spaceIdToZoneName.get(sp.space_id) || (sp.hvac_zone_id ? zoneMap.get(sp.hvac_zone_id) || null : null),
        device_count: deviceCountBySpace.get(sp.space_id) || 0,
        equipment_count: equipCountBySpace.get(sp.space_id) || 0,
        required_count,
        total_requirements,
        mapped_count,
        mapped_required_count,
        mapped_roles: [...new Set(mappedRoles)],
        missing_required_roles: missingRequiredRoles,
        sensors: sensorsBySpace.get(sp.space_id) || [],
        requirements: reqs,
      };
    });

    // Build entity→space map for client-side duplicate prevention
    const mappedEntities: Record<string, { space_id: string; space_name: string }> = {};
    for (const [entityId, info] of entityToSpace) {
      mappedEntities[entityId] = info;
    }

    return NextResponse.json({
      spaces: result,
      available_temp_entities: tempEntities,
      available_humidity_entities: humidityEntities,
      available_motion_entities: motionEntities,
      mapped_entities: mappedEntities,
      zone_to_spaces: zoneToSpaceIds,
    });
  } catch (err: any) {
    console.error("Spaces summary error:", err);
    return NextResponse.json({ error: err.message || "Failed to load" }, { status: 500 });
  }
}

// ── POST — Add sensor mapping (with optional reassignment) ────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await context.params;

  try {
    const { space_id, sensor_type, entity_id, weight, is_primary, org_id, created_by, reassign_from_space_id, reassign_from_space_name } = await req.json();

    if (!space_id || !sensor_type || !entity_id) {
      return NextResponse.json({ error: "space_id, sensor_type, and entity_id required" }, { status: 400 });
    }

    // If reassigning, remove from old space first
    if (reassign_from_space_id) {
      await supabase
        .from("a_space_sensors")
        .delete()
        .eq("entity_id", entity_id)
        .eq("space_id", reassign_from_space_id)
        .eq("site_id", siteId);

      await logAudit(siteId, {
        space_id: reassign_from_space_id,
        org_id,
        action: "space_sensor_reassigned",
        details: {
          entity_id,
          sensor_type,
          from_space_id: reassign_from_space_id,
          from_space_name: reassign_from_space_name || null,
          to_space_id: space_id,
        },
        created_by,
      });
    }

    const { data, error } = await supabase
      .from("a_space_sensors")
      .insert({
        space_id,
        site_id: siteId,
        sensor_type,
        entity_id,
        weight: weight ?? 1.0,
        is_primary: is_primary ?? false,
      })
      .select("id")
      .single();

    if (error) throw error;

    if (!reassign_from_space_id) {
      await logAudit(siteId, {
        space_id,
        org_id,
        action: "space_sensor_mapped",
        details: { entity_id, sensor_type, weight: weight ?? 1.0 },
        created_by,
      });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err: any) {
    console.error("Spaces summary POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to create" }, { status: 500 });
  }
}

// ── PATCH — Update sensor weight or zone weight ───────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await context.params;

  try {
    const body = await req.json();

    // Zone weight update (a_spaces.hvac_zone_weight — requires ALTER TABLE)
    if (body.update_zone_weight && body.space_id) {
      const newWeight = Math.min(5.0, Math.max(0.1, body.hvac_zone_weight));
      const { error } = await supabase
        .from("a_spaces")
        .update({ hvac_zone_weight: newWeight })
        .eq("space_id", body.space_id)
        .eq("site_id", siteId);
      if (error) {
        console.error("[spaces-summary] zone weight update error (column may not exist yet):", error.message);
        return NextResponse.json({ error: "hvac_zone_weight column may not exist. Run: ALTER TABLE a_spaces ADD COLUMN IF NOT EXISTS hvac_zone_weight numeric DEFAULT 1.0" }, { status: 400 });
      }

      await logAudit(siteId, {
        space_id: body.space_id,
        org_id: body.org_id,
        action: "space_zone_weight_updated",
        details: {
          old_weight: body.old_weight,
          new_weight: newWeight,
          space_name: body.space_name,
        },
        created_by: body.created_by,
      });

      return NextResponse.json({ ok: true });
    }

    // Sensor weight update (a_space_sensors)
    const { id, weight, is_primary } = body;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const update: Record<string, any> = {};
    if (weight !== undefined) update.weight = weight;
    if (is_primary !== undefined) update.is_primary = is_primary;

    const { error } = await supabase
      .from("a_space_sensors")
      .update(update)
      .eq("id", id)
      .eq("site_id", siteId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Spaces summary PATCH error:", err);
    return NextResponse.json({ error: err.message || "Failed to update" }, { status: 500 });
  }
}

// ── DELETE — Remove sensor mapping ────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await context.params;

  try {
    const { id, org_id, created_by, space_id, entity_id, sensor_type } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("a_space_sensors")
      .delete()
      .eq("id", id)
      .eq("site_id", siteId);

    if (error) throw error;

    await logAudit(siteId, {
      space_id,
      org_id,
      action: "space_sensor_unmapped",
      details: { entity_id, sensor_type },
      created_by,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Spaces summary DELETE error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete" }, { status: 500 });
  }
}
