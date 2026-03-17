// app/api/cron/sop-compliance-calc/route.ts
// Nightly cron: calculates SOP compliance for previous calendar day per site.

/**
 * COMPLIANCE PERIOD BOUNDARIES
 *
 * Periods are based on the site's local calendar day, NOT UTC.
 * - period_start: local midnight converted to UTC
 * - period_end:   next local midnight converted to UTC (exclusive)
 *
 * Use localMidnightToUTC(date, timezone) for all period calculations.
 * Do NOT use UTC midnight directly — this was a verified bug that
 * caused compliance periods to be offset by the site's UTC offset
 * (e.g. 5–6 hours for Central time sites).
 *
 * Query convention: >= period_start AND < period_end (never 23:59:59)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { siteLocalDate } from "@/lib/utils/site-date";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Space Track Metric Sources ─────────────────────────────────────────
// Maps space-track metrics to their data source in b_zone_setpoint_log.
// Space readings are derived from zone-level data via a_spaces.hvac_zone_id.
// The zone-setpoint-logger computes zone_temp_f as a weighted average of
// space sensors, so querying by hvac_zone_id gives the best available
// space-level temperature data.
const SPACE_METRIC_SOURCES: Record<string, {
  valueColumn: string;
  selectColumns: string;
}> = {
  space_temp: {
    valueColumn: "zone_temp_f",
    selectColumns: "zone_temp_f, recorded_at, phase",
  },
  humidity: {
    valueColumn: "zone_humidity",
    selectColumns: "zone_humidity, recorded_at, phase",
  },
};

interface EffectiveAssignment {
  assignment_id: string;
  template_id: string;
  owner_kind: string;
  org_id: string | null;
  scope_level: string;
  site_id: string | null;
  equipment_type_id: string | null;
  equipment_id: string | null;
  space_type: string | null;
  space_id: string | null;
  // Template fields
  target_kind: "equipment" | "space";
  label: string;
  metric: string;
  min_value: number | null;
  max_value: number | null;
  evaluation_window: string;
  unit: string;
}

interface SiteInfo {
  site_id: string;
  org_id: string;
  timezone: string;
}

interface TargetUnit {
  site: SiteInfo;
  equipment_id: string | null;
  space_id: string | null;
}

interface SpaceRow {
  space_id: string;
  site_id: string;
  space_type: string | null;
  hvac_zone_id: string | null;
}

// ── Equipment Track Fan-Out ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEquipmentTargets(
  supabase: any,
  assignment: EffectiveAssignment,
  allSites: SiteInfo[]
): Promise<TargetUnit[]> {
  switch (assignment.scope_level) {
    case "equipment": {
      if (!assignment.equipment_id) return [];
      const { data } = await supabase
        .from("a_equipments")
        .select("site_id")
        .eq("equipment_id", assignment.equipment_id)
        .single();
      if (!data) return [];
      const site = allSites.find((s) => s.site_id === data.site_id);
      if (!site) return [];
      return [{ site, equipment_id: assignment.equipment_id, space_id: null }];
    }

    case "equipment_type": {
      if (!assignment.org_id || !assignment.equipment_type_id) return [];
      const orgSites = allSites.filter((s) => s.org_id === assignment.org_id);
      const siteIds = orgSites.map((s) => s.site_id);
      if (!siteIds.length) return [];

      const { data: eqs } = await supabase
        .from("a_equipments")
        .select("equipment_id, site_id")
        .in("site_id", siteIds)
        .eq("equipment_type_id", assignment.equipment_type_id)
        .neq("status", "retired")
        .neq("status", "dummy");

      if (!eqs?.length) return [];
      const siteMap = new Map(orgSites.map((s) => [s.site_id, s]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return eqs
        .filter((e: any) => siteMap.has(e.site_id))
        .map((e: any) => ({
          site: siteMap.get(e.site_id)!,
          equipment_id: e.equipment_id,
          space_id: null,
        }));
    }

    case "org": {
      if (!assignment.org_id) return [];
      return allSites
        .filter((s) => s.org_id === assignment.org_id)
        .map((s) => ({ site: s, equipment_id: null, space_id: null }));
    }

    case "ssb": {
      return allSites.map((s) => ({ site: s, equipment_id: null, space_id: null }));
    }

    default:
      return [];
  }
}

// ── Space Track Fan-Out ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSpaceTargets(
  supabase: any,
  assignment: EffectiveAssignment,
  allSites: SiteInfo[]
): Promise<TargetUnit[]> {
  switch (assignment.scope_level) {
    case "space": {
      // Single specific space
      if (!assignment.space_id) return [];
      const { data } = await supabase
        .from("a_spaces")
        .select("space_id, site_id, space_type, hvac_zone_id")
        .eq("space_id", assignment.space_id)
        .single();
      if (!data) return [];
      const site = allSites.find((s) => s.site_id === data.site_id);
      if (!site) return [];
      return [{ site, equipment_id: null, space_id: data.space_id }];
    }

    case "space_type": {
      // All spaces of a type at a specific site
      if (!assignment.site_id || !assignment.space_type) return [];
      const site = allSites.find((s) => s.site_id === assignment.site_id);
      if (!site) return [];

      const { data: spaces } = await supabase
        .from("a_spaces")
        .select("space_id, site_id, space_type, hvac_zone_id")
        .eq("site_id", assignment.site_id)
        .eq("space_type", assignment.space_type);

      if (!spaces?.length) return [];
      return spaces.map((sp: SpaceRow) => ({
        site,
        equipment_id: null,
        space_id: sp.space_id,
      }));
    }

    case "site": {
      // All spaces at a specific site
      if (!assignment.site_id) return [];
      const site = allSites.find((s) => s.site_id === assignment.site_id);
      if (!site) return [];

      const { data: spaces } = await supabase
        .from("a_spaces")
        .select("space_id, site_id, space_type, hvac_zone_id")
        .eq("site_id", assignment.site_id);

      if (!spaces?.length) return [];
      return spaces.map((sp: SpaceRow) => ({
        site,
        equipment_id: null,
        space_id: sp.space_id,
      }));
    }

    case "org": {
      // All spaces at all sites within the org
      if (!assignment.org_id) return [];
      const orgSites = allSites.filter((s) => s.org_id === assignment.org_id);
      const siteIds = orgSites.map((s) => s.site_id);
      if (!siteIds.length) return [];

      const { data: spaces } = await supabase
        .from("a_spaces")
        .select("space_id, site_id, space_type, hvac_zone_id")
        .in("site_id", siteIds);

      if (!spaces?.length) return [];
      const siteMap = new Map(orgSites.map((s) => [s.site_id, s]));
      return spaces
        .filter((sp: SpaceRow) => siteMap.has(sp.site_id))
        .map((sp: SpaceRow) => ({
          site: siteMap.get(sp.site_id)!,
          equipment_id: null,
          space_id: sp.space_id,
        }));
    }

    case "ssb": {
      // All spaces across all sites (v1: skip — no SSB space assignments exist yet)
      console.log(`[sop-compliance-calc] SSB-level space fan-out not yet implemented, skipping assignment ${assignment.assignment_id}`);
      return [];
    }

    default:
      return [];
  }
}

function getYesterdayBounds(tz: string): { start: string; end: string; localDate: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const localYesterday = siteLocalDate(yesterday, tz);
  const localToday = siteLocalDate(now, tz);

  const startUTC = localMidnightToUTC(localYesterday, tz);
  const endUTC = localMidnightToUTC(localToday, tz);

  return {
    start: startUTC,
    end: endUTC,
    localDate: localYesterday,
  };
}

function localMidnightToUTC(localDate: string, tz: string): string {
  const [y, m, d] = localDate.split("-").map(Number);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = formatter.formatToParts(noonUTC);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";

  const match = tzPart.match(/GMT([+-]?)(\d+)(?::(\d+))?/);
  if (!match || !match[2]) {
    return new Date(Date.UTC(y, m - 1, d)).toISOString();
  }

  const sign = match[1] === "-" ? -1 : 1;
  const offsetHours = parseInt(match[2]) * sign;
  const offsetMins = parseInt(match[3] || "0") * sign;

  const midnightUTC = new Date(Date.UTC(y, m - 1, d, -offsetHours, -offsetMins));
  return midnightUTC.toISOString();
}

// ── Library-Driven Log Table Compliance (cooler_temp, freezer_temp, humidity, power_kw) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calcLogTableCompliance(
  supabase: any,
  assignment: EffectiveAssignment,
  site: SiteInfo,
  equipmentId: string | null,
  periodStart: string,
  periodEnd: string
): Promise<{ total: number; compliant: number }> {
  if (!equipmentId) {
    console.warn(`[sop-compliance-calc] Log table metric "${assignment.metric}" requires equipment_id`);
    return { total: 0, compliant: 0 };
  }

  // Step 1: Resolve sensor_role and log_table from library
  const { data: metricInfo } = await supabase
    .from("library_equipment_sop_metrics")
    .select("sensor_role, sensor_type")
    .eq("equipment_type_id", assignment.equipment_type_id || "")
    .eq("sop_metric", assignment.metric)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();

  if (!metricInfo) {
    console.warn(`[sop-compliance-calc] No library entry for metric="${assignment.metric}" equipment_type="${assignment.equipment_type_id}"`);
    return { total: 0, compliant: 0 };
  }

  // Get log_table from library_sensor_type_mapping
  const { data: mapping } = await supabase
    .from("library_sensor_type_mapping")
    .select("log_table")
    .eq("sensor_type", metricInfo.sensor_type)
    .limit(1)
    .maybeSingle();

  if (!mapping?.log_table) {
    console.warn(`[sop-compliance-calc] No log_table mapping for sensor_type="${metricInfo.sensor_type}"`);
    return { total: 0, compliant: 0 };
  }

  // Step 2: Resolve entity_id from a_sensors via requirement join
  const { data: sensors } = await supabase
    .from("a_sensors")
    .select("entity_id, label, library_equipment_sensor_requirements!inner(sensor_role)")
    .eq("equipment_id", equipmentId)
    .eq("library_equipment_sensor_requirements.sensor_role", metricInfo.sensor_role)
    .order("created_at", { ascending: true });

  if (!sensors || sensors.length === 0) {
    console.log(`[sop-compliance-calc] No sensor for equipment=${equipmentId} role=${metricInfo.sensor_role}`);
    return { total: 0, compliant: 0 };
  }

  if (sensors.length > 1) {
    console.warn(`[sop-compliance-calc] Multiple sensors for equipment=${equipmentId} role=${metricInfo.sensor_role} — using oldest (${sensors[0].entity_id})`);
  }

  const entityId = sensors[0].entity_id;

  // Step 3: Fetch readings from log table
  const { data: readings } = await supabase
    .from(mapping.log_table)
    .select("value, ts")
    .eq("entity_id", entityId)
    .eq("site_id", site.site_id)
    .gte("ts", periodStart)
    .lt("ts", periodEnd)
    .order("ts");

  if (!readings || readings.length === 0) {
    return { total: 0, compliant: 0 };
  }

  // Step 4: Filter by occupied hours if needed
  let filtered = readings;
  if (assignment.evaluation_window === "occupied_hours_only") {
    const tz = site.timezone || "America/Chicago";
    filtered = readings.filter((r: any) => {
      const localTime = new Date(r.ts).toLocaleString("en-US", { timeZone: tz });
      const localDate = new Date(localTime);
      const rMins = localDate.getHours() * 60 + localDate.getMinutes();
      // Basic occupied filter: 5AM-11PM for now
      // TODO: use manifest for precise occupied hours
      return rMins >= 300 && rMins < 1380;
    });
  }

  // Step 5: Evaluate compliance
  let compliant = 0;
  let validCount = 0;
  for (const r of filtered) {
    const val = parseFloat(String((r as any).value));
    if (r.value == null || r.value === "" || isNaN(val)) continue;
    validCount++;
    const minOk = assignment.min_value == null || val >= assignment.min_value;
    const maxOk = assignment.max_value == null || val <= assignment.max_value;
    if (minOk && maxOk) compliant++;
  }

  return { total: validCount, compliant };
}

// ── Equipment Track Compliance Calculation ──────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calcEquipmentCompliance(
  supabase: any,
  assignment: EffectiveAssignment,
  site: SiteInfo,
  equipmentId: string | null,
  periodStart: string,
  periodEnd: string
): Promise<{ total: number; compliant: number }> {
  let readings: { value: number; recorded_at: string }[] = [];

  if (assignment.metric === "zone_temp") {
    let query = supabase
      .from("b_zone_setpoint_log")
      .select("zone_temp_f, recorded_at, phase")
      .eq("site_id", site.site_id)
      .gte("recorded_at", periodStart)
      .lt("recorded_at", periodEnd)
      .not("zone_temp_f", "is", null);

    if (equipmentId) {
      const { data: zones } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id")
        .eq("equipment_id", equipmentId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zoneIds = (zones || []).map((z: any) => z.hvac_zone_id);
      if (zoneIds.length) query = query.in("hvac_zone_id", zoneIds);
      else return { total: 0, compliant: 0 };
    }

    const { data } = await query.order("recorded_at");
    if (!data) return { total: 0, compliant: 0 };

    if (assignment.evaluation_window === "occupied_hours_only") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      readings = data
        .filter((r: any) => r.phase === "occupied")
        .map((r: any) => ({ value: r.zone_temp_f, recorded_at: r.recorded_at }));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      readings = data.map((r: any) => ({ value: r.zone_temp_f, recorded_at: r.recorded_at }));
    }
  } else if (assignment.metric === "setpoint_delta") {
    let query = supabase
      .from("b_zone_setpoint_log")
      .select("zone_temp_f, active_heat_f, active_cool_f, recorded_at, phase")
      .eq("site_id", site.site_id)
      .gte("recorded_at", periodStart)
      .lt("recorded_at", periodEnd)
      .not("zone_temp_f", "is", null);

    if (equipmentId) {
      const { data: zones } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id")
        .eq("equipment_id", equipmentId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zoneIds = (zones || []).map((z: any) => z.hvac_zone_id);
      if (zoneIds.length) query = query.in("hvac_zone_id", zoneIds);
      else return { total: 0, compliant: 0 };
    }

    const { data } = await query.order("recorded_at");
    if (!data) return { total: 0, compliant: 0 };

    const filtered = assignment.evaluation_window === "occupied_hours_only"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? data.filter((r: any) => r.phase === "occupied")
      : data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readings = filtered.map((r: any) => {
      const temp = r.zone_temp_f as number;
      const heat = r.active_heat_f as number | null;
      const cool = r.active_cool_f as number | null;
      let delta = 0;
      if (heat != null && temp < heat) delta = heat - temp;
      else if (cool != null && temp > cool) delta = temp - cool;
      return { value: delta, recorded_at: r.recorded_at };
    });
  } else {
    // Library-driven path: resolve sensor → log table from library
    return calcLogTableCompliance(supabase, assignment, site, equipmentId, periodStart, periodEnd);
  }

  return countCompliant(readings, assignment);
}

// ── Space Track Compliance Calculation ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calcSpaceCompliance(
  supabase: any,
  assignment: EffectiveAssignment,
  site: SiteInfo,
  spaceId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ total: number; compliant: number }> {
  const source = SPACE_METRIC_SOURCES[assignment.metric];
  if (!source) {
    console.warn(`[sop-compliance-calc] Unknown space metric "${assignment.metric}" for assignment ${assignment.assignment_id}`);
    return { total: 0, compliant: 0 };
  }

  // Resolve space → hvac_zone_id for querying b_zone_setpoint_log
  const { data: space } = await supabase
    .from("a_spaces")
    .select("hvac_zone_id")
    .eq("space_id", spaceId)
    .single();

  if (!space?.hvac_zone_id) {
    // Space has no linked HVAC zone — no readings available
    return { total: 0, compliant: 0 };
  }

  const query = supabase
    .from("b_zone_setpoint_log")
    .select(source.selectColumns)
    .eq("site_id", site.site_id)
    .eq("hvac_zone_id", space.hvac_zone_id)
    .gte("recorded_at", periodStart)
    .lt("recorded_at", periodEnd)
    .not(source.valueColumn, "is", null);

  const { data } = await query.order("recorded_at");
  if (!data) return { total: 0, compliant: 0 };

  const filtered = assignment.evaluation_window === "occupied_hours_only"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? data.filter((r: any) => r.phase === "occupied")
    : data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readings = filtered.map((r: any) => ({
    value: r[source.valueColumn],
    recorded_at: r.recorded_at,
  }));

  return countCompliant(readings, assignment);
}

// ── Shared Compliance Counter ──────────────────────────────────────────

function countCompliant(
  readings: { value: number; recorded_at: string }[],
  assignment: EffectiveAssignment
): { total: number; compliant: number } {
  let compliant = 0;
  for (const r of readings) {
    const aboveMin = assignment.min_value == null || r.value >= assignment.min_value;
    const belowMax = assignment.max_value == null || r.value <= assignment.max_value;
    if (aboveMin && belowMax) compliant++;
  }
  return { total: readings.length, compliant };
}

async function handler(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Fetch active assignments joined with templates
  //    Active = not retired, effective date range includes today
  const { data: rawAssignments, error: queryError } = await supabase
    .from("a_sop_assignments")
    .select(`
      id,
      template_id,
      owner_kind,
      org_id,
      scope_level,
      site_id,
      equipment_type_id,
      equipment_id,
      space_type,
      space_id,
      a_sop_templates (
        target_kind, label, metric, min_value, max_value,
        evaluation_window, unit
      )
    `)
    .is("retired_at", null)
    .or(`effective_from.is.null,effective_from.lte.${today}`)
    .or(`effective_to.is.null,effective_to.gte.${today}`);

  if (queryError) {
    console.error("[sop-compliance-calc] Assignment query error:", queryError.message);
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  if (!rawAssignments || rawAssignments.length === 0) {
    console.log("[sop-compliance-calc] No active SOP assignments found. Exiting.");
    return NextResponse.json({ message: "No active SOP assignments", processed: 0 });
  }

  // Flatten template data into assignment objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: EffectiveAssignment[] = rawAssignments.map((r: any) => {
    const t = r.a_sop_templates;
    return {
      assignment_id: r.id,
      template_id: r.template_id,
      owner_kind: r.owner_kind,
      org_id: r.org_id,
      scope_level: r.scope_level,
      site_id: r.site_id,
      equipment_type_id: r.equipment_type_id,
      equipment_id: r.equipment_id,
      space_type: r.space_type,
      space_id: r.space_id,
      target_kind: t?.target_kind,
      label: t?.label,
      metric: t?.metric,
      min_value: t?.min_value != null ? Number(t.min_value) : null,
      max_value: t?.max_value != null ? Number(t.max_value) : null,
      evaluation_window: t?.evaluation_window,
      unit: t?.unit,
    };
  }).filter((a: EffectiveAssignment) => a.metric); // Skip if template join failed

  // Split by track
  const equipmentAssignments = assignments.filter((a) => a.target_kind === "equipment");
  const spaceAssignments = assignments.filter((a) => a.target_kind === "space");

  // 2. Fetch all sites
  const hasSSB = assignments.some((a) => a.scope_level === "ssb");
  const orgIds = [...new Set(assignments.map((a) => a.org_id).filter(Boolean))] as string[];

  let allSites: SiteInfo[] = [];
  if (hasSSB) {
    const { data } = await supabase.from("a_sites").select("site_id, org_id, timezone");
    allSites = (data || []) as SiteInfo[];
  } else if (orgIds.length) {
    const { data } = await supabase.from("a_sites").select("site_id, org_id, timezone").in("org_id", orgIds);
    allSites = (data || []) as SiteInfo[];
  }

  const equipStats = { configs: equipmentAssignments.length, processed: 0, skipped: 0, errors: 0 };
  const spaceStats = { configs: spaceAssignments.length, processed: 0, skipped: 0, errors: 0 };

  // ── EQUIPMENT TRACK ────────────────────────────────────────────────
  // Processes equipment-scoped SOP assignments
  // Sources: b_zone_setpoint_log (zone_temp, setpoint_delta)

  for (const assignment of equipmentAssignments) {
    const targets = await getEquipmentTargets(supabase, assignment, allSites);

    for (const target of targets) {
      try {
        const tz = target.site.timezone || "America/Chicago";
        const { start, end } = getYesterdayBounds(tz);

        // Idempotency check
        const { data: existing } = await supabase
          .from("b_sop_compliance_log")
          .select("id")
          .eq("sop_assignment_id", assignment.assignment_id)
          .eq("site_id", target.site.site_id)
          .eq("period_start", start)
          .limit(1);

        if (existing && existing.length > 0) {
          equipStats.skipped++;
          continue;
        }

        const { total, compliant } = await calcEquipmentCompliance(
          supabase, assignment, target.site, target.equipment_id, start, end
        );

        const { error: insertError } = await supabase
          .from("b_sop_compliance_log")
          .insert({
            sop_assignment_id: assignment.assignment_id,
            site_id: target.site.site_id,
            equipment_id: target.equipment_id || null,
            space_id: null,
            period_start: start,
            period_end: end,
            total_readings: total,
            compliant_readings: compliant,
          });

        if (insertError) {
          console.error(
            `[sop-compliance-calc] Equipment insert error assignment=${assignment.assignment_id} site=${target.site.site_id}:`,
            insertError.message
          );
          equipStats.errors++;
        } else {
          equipStats.processed++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[sop-compliance-calc] Equipment error assignment=${assignment.assignment_id} site=${target.site.site_id}:`,
          message
        );
        equipStats.errors++;
      }
    }
  }

  // ── SPACE TRACK ────────────────────────────────────────────────────
  // Processes space-scoped SOP assignments
  // Sources: b_zone_setpoint_log via a_spaces.hvac_zone_id (space_temp, humidity)

  for (const assignment of spaceAssignments) {
    const targets = await getSpaceTargets(supabase, assignment, allSites);

    for (const target of targets) {
      try {
        const tz = target.site.timezone || "America/Chicago";
        const { start, end } = getYesterdayBounds(tz);

        // Idempotency check — space track uses space_id in the check
        const { data: existing } = await supabase
          .from("b_sop_compliance_log")
          .select("id")
          .eq("sop_assignment_id", assignment.assignment_id)
          .eq("site_id", target.site.site_id)
          .eq("space_id", target.space_id)
          .eq("period_start", start)
          .limit(1);

        if (existing && existing.length > 0) {
          spaceStats.skipped++;
          continue;
        }

        const { total, compliant } = await calcSpaceCompliance(
          supabase, assignment, target.site, target.space_id!, start, end
        );

        const { error: insertError } = await supabase
          .from("b_sop_compliance_log")
          .insert({
            sop_assignment_id: assignment.assignment_id,
            site_id: target.site.site_id,
            equipment_id: null,
            space_id: target.space_id,
            period_start: start,
            period_end: end,
            total_readings: total,
            compliant_readings: compliant,
          });

        if (insertError) {
          console.error(
            `[sop-compliance-calc] Space insert error assignment=${assignment.assignment_id} space=${target.space_id}:`,
            insertError.message
          );
          spaceStats.errors++;
        } else {
          spaceStats.processed++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[sop-compliance-calc] Space error assignment=${assignment.assignment_id} space=${target.space_id}:`,
          message
        );
        spaceStats.errors++;
      }
    }
  }

  const summary = {
    success: true,
    summary: {
      equipment: equipStats,
      space: spaceStats,
    },
    totalAssignments: assignments.length,
    totalSites: allSites.length,
  };
  console.log("[sop-compliance-calc]", JSON.stringify(summary));
  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
