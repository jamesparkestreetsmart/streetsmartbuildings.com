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

interface SOPConfig {
  id: string;
  org_id: string;
  site_id: string | null;
  equipment_id: string | null;
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

/** Determine the target sites for a config. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTargetSites(
  supabase: any,
  config: SOPConfig,
  allSites: SiteInfo[]
): Promise<SiteInfo[]> {
  if (config.equipment_id) {
    const { data } = await supabase
      .from("a_equipments")
      .select("site_id")
      .eq("equipment_id", config.equipment_id)
      .single();
    if (!data) return [];
    return allSites.filter((s) => s.site_id === data.site_id);
  }
  if (config.site_id) {
    return allSites.filter((s) => s.site_id === config.site_id);
  }
  return allSites.filter((s) => s.org_id === config.org_id);
}

/**
 * Get yesterday's date boundaries in site-local timezone.
 * Returns ISO strings for period_start (inclusive) and period_end (exclusive next-midnight).
 * Convention: queries use >= period_start AND < period_end.
 */
function getYesterdayBounds(tz: string): { start: string; end: string; localDate: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const localYesterday = siteLocalDate(yesterday, tz);
  const localToday = siteLocalDate(now, tz);

  // Convert local midnight to UTC by parsing with timezone context
  // Intl.DateTimeFormat gives us the UTC offset for a given timezone
  const startUTC = localMidnightToUTC(localYesterday, tz);
  const endUTC = localMidnightToUTC(localToday, tz);

  return {
    start: startUTC,
    end: endUTC,
    localDate: localYesterday,
  };
}

/** Convert a local YYYY-MM-DD midnight to a UTC ISO string. */
function localMidnightToUTC(localDate: string, tz: string): string {
  const [y, m, d] = localDate.split("-").map(Number);

  // Use Intl to get the UTC offset for this timezone on this date
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = formatter.formatToParts(noonUTC);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";

  // tzPart looks like "GMT-5", "GMT+5:30", or "GMT"
  const match = tzPart.match(/GMT([+-]?)(\d+)(?::(\d+))?/);
  if (!match || !match[2]) {
    // GMT+0 or unparseable — treat as UTC
    return new Date(Date.UTC(y, m - 1, d)).toISOString();
  }

  const sign = match[1] === "-" ? -1 : 1;
  const offsetHours = parseInt(match[2]) * sign;
  const offsetMins = parseInt(match[3] || "0") * sign;

  // Local midnight in UTC: subtract the offset
  // e.g. CDT (GMT-5): midnight local = 05:00 UTC
  const midnightUTC = new Date(Date.UTC(y, m - 1, d, -offsetHours, -offsetMins));
  return midnightUTC.toISOString();
}

/** Pull readings and count compliance for a (config, site) pair. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calcCompliance(
  supabase: any,
  config: SOPConfig,
  site: SiteInfo,
  periodStart: string,
  periodEnd: string
): Promise<{ total: number; compliant: number }> {
  let readings: { value: number; recorded_at: string }[] = [];

  if (config.metric === "zone_temp") {
    let query = supabase
      .from("b_zone_setpoint_log")
      .select("zone_temp_f, recorded_at, phase")
      .eq("site_id", site.site_id)
      .gte("recorded_at", periodStart)
      .lt("recorded_at", periodEnd)
      .not("zone_temp_f", "is", null);

    if (config.equipment_id) {
      const { data: zones } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id")
        .eq("equipment_id", config.equipment_id);
      const zoneIds = (zones || []).map((z: any) => z.hvac_zone_id);
      if (zoneIds.length) query = query.in("hvac_zone_id", zoneIds);
      else return { total: 0, compliant: 0 };
    }

    const { data } = await query.order("recorded_at");
    if (!data) return { total: 0, compliant: 0 };

    if (config.evaluation_window === "occupied_hours_only") {
      readings = data
        .filter((r: any) => r.phase === "occupied")
        .map((r: any) => ({ value: r.zone_temp_f, recorded_at: r.recorded_at }));
    } else {
      readings = data.map((r: any) => ({ value: r.zone_temp_f, recorded_at: r.recorded_at }));
    }
  } else if (config.metric === "setpoint_delta") {
    let query = supabase
      .from("b_zone_setpoint_log")
      .select("zone_temp_f, active_heat_f, active_cool_f, recorded_at, phase")
      .eq("site_id", site.site_id)
      .gte("recorded_at", periodStart)
      .lt("recorded_at", periodEnd)
      .not("zone_temp_f", "is", null);

    if (config.equipment_id) {
      const { data: zones } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id")
        .eq("equipment_id", config.equipment_id);
      const zoneIds = (zones || []).map((z: any) => z.hvac_zone_id);
      if (zoneIds.length) query = query.in("hvac_zone_id", zoneIds);
      else return { total: 0, compliant: 0 };
    }

    const { data } = await query.order("recorded_at");
    if (!data) return { total: 0, compliant: 0 };

    const filtered = config.evaluation_window === "occupied_hours_only"
      ? data.filter((r: any) => r.phase === "occupied")
      : data;

    readings = filtered.map((r: any) => {
      const temp = r.zone_temp_f as number;
      const heat = r.active_heat_f as number | null;
      const cool = r.active_cool_f as number | null;
      let delta = 0;
      if (heat != null && temp < heat) delta = heat - temp;
      else if (cool != null && temp > cool) delta = temp - cool;
      return { value: delta, recorded_at: r.recorded_at };
    });
  } else if (config.metric === "space_temp") {
    let query = supabase
      .from("b_zone_setpoint_log")
      .select("zone_temp_f, recorded_at, phase")
      .eq("site_id", site.site_id)
      .gte("recorded_at", periodStart)
      .lt("recorded_at", periodEnd)
      .not("zone_temp_f", "is", null);

    const { data } = await query.order("recorded_at");
    if (!data) return { total: 0, compliant: 0 };

    const filtered = config.evaluation_window === "occupied_hours_only"
      ? data.filter((r: any) => r.phase === "occupied")
      : data;

    readings = filtered.map((r: any) => ({ value: r.zone_temp_f, recorded_at: r.recorded_at }));
  } else {
    console.warn(`[sop-compliance-calc] Unknown metric "${config.metric}" for config ${config.id}`);
    return { total: 0, compliant: 0 };
  }

  let compliant = 0;
  for (const r of readings) {
    const aboveMin = config.min_value == null || r.value >= config.min_value;
    const belowMax = config.max_value == null || r.value <= config.max_value;
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

  // 1. Fetch all active SOP configs
  const { data: configs, error: configError } = await supabase
    .from("a_sop_configs")
    .select("id, org_id, site_id, equipment_id, label, metric, min_value, max_value, evaluation_window, unit")
    .or(`effective_from.is.null,effective_from.lte.${today}`)
    .or(`effective_to.is.null,effective_to.gte.${today}`);

  if (configError) {
    console.error("[sop-compliance-calc] Config query error:", configError.message);
    return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  if (!configs || configs.length === 0) {
    console.log("[sop-compliance-calc] No active SOP configs found. Exiting.");
    return NextResponse.json({ message: "No active SOP configs", processed: 0 });
  }

  // 2. Fetch all sites (for timezone + org mapping)
  const orgIds = [...new Set(configs.map((c) => c.org_id))];
  const { data: sitesData } = await supabase
    .from("a_sites")
    .select("site_id, org_id, timezone")
    .in("org_id", orgIds);
  const allSites = (sitesData || []) as SiteInfo[];

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // 3. Process each config
  for (const config of configs as SOPConfig[]) {
    const targetSites = await getTargetSites(supabase, config, allSites);

    for (const site of targetSites) {
      try {
        const tz = site.timezone || "America/Chicago";
        const { start, end } = getYesterdayBounds(tz);

        // Check for existing row (idempotency)
        const { data: existing } = await supabase
          .from("b_sop_compliance_log")
          .select("id")
          .eq("sop_config_id", config.id)
          .eq("site_id", site.site_id)
          .eq("period_start", start)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        const { total, compliant } = await calcCompliance(
          supabase, config, site, start, end
        );

        const { error: insertError } = await supabase
          .from("b_sop_compliance_log")
          .upsert(
            {
              sop_config_id: config.id,
              site_id: site.site_id,
              equipment_id: config.equipment_id || null,
              period_start: start,
              period_end: end,
              total_readings: total,
              compliant_readings: compliant,
            },
            {
              onConflict: "sop_config_id,site_id,equipment_id,period_start,period_end",
            }
          );

        if (insertError) {
          console.error(
            `[sop-compliance-calc] Insert error config=${config.id} site=${site.site_id}:`,
            insertError.message
          );
          errors++;
        } else {
          processed++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[sop-compliance-calc] Error config=${config.id} site=${site.site_id}:`,
          message
        );
        errors++;
      }
    }
  }

  const summary = {
    message: "SOP compliance calculation complete",
    configs: configs.length,
    sites: allSites.length,
    processed,
    skipped,
    errors,
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
