import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getCallerEmail(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.email || "system";
  } catch { return "system"; }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Default thresholds — used as fallback and for UI display
const DEFAULT_THRESHOLDS: Record<string, number> = {
  coil_freeze_temp_f: 35,
  delayed_response_min: 15,
  idle_heat_gain_f: 2,
  long_cycle_min: 120,
  short_cycle_count_1h: 4,
  filter_restriction_delta_t_max: 25,
  refrigerant_low_delta_t_min: 5,
  efficiency_ratio_min_pct: 40,
  compressor_current_threshold_a: 1.0,
};

// Human-readable labels for each threshold
const THRESHOLD_LABELS: Record<string, { label: string; unit: string; description: string }> = {
  coil_freeze_temp_f: {
    label: "Coil Freeze Temperature",
    unit: "\u00B0F",
    description: "Supply air temp below this triggers coil freeze alert",
  },
  delayed_response_min: {
    label: "Delayed Response Time",
    unit: "min",
    description: "Minutes after setpoint change with no temp movement",
  },
  idle_heat_gain_f: {
    label: "Idle Heat Gain",
    unit: "\u00B0F",
    description: "Zone temp rise above setpoint while idle",
  },
  long_cycle_min: {
    label: "Long Cycle Duration",
    unit: "min",
    description: "Compressor run time considered abnormally long",
  },
  short_cycle_count_1h: {
    label: "Short Cycle Count (1hr)",
    unit: "cycles",
    description: "Number of compressor starts per hour indicating short cycling",
  },
  filter_restriction_delta_t_max: {
    label: "Filter Restriction \u0394T",
    unit: "\u00B0F",
    description: "Max supply-to-zone temp difference suggesting restricted airflow",
  },
  refrigerant_low_delta_t_min: {
    label: "Refrigerant Low \u0394T",
    unit: "\u00B0F",
    description: "Min supply-to-zone temp difference suggesting low refrigerant",
  },
  efficiency_ratio_min_pct: {
    label: "Min Efficiency Ratio",
    unit: "%",
    description: "Minimum acceptable degrees-per-kWh efficiency",
  },
  compressor_current_threshold_a: {
    label: "Compressor Current Threshold",
    unit: "A",
    description: "Current draw above this means compressor is running",
  },
};

// GET: Fetch all managed HVAC zones with their anomaly thresholds
export async function GET(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get("org_id");
    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

    // Get all sites for this org
    const { data: sites } = await supabase
      .from("a_sites")
      .select("site_id, site_name")
      .eq("org_id", orgId);

    if (!sites || sites.length === 0) {
      return NextResponse.json({ zones: [], defaults: DEFAULT_THRESHOLDS, labels: THRESHOLD_LABELS });
    }

    const siteIds = sites.map((s: any) => s.site_id);
    const siteNameMap: Record<string, string> = {};
    for (const s of sites) siteNameMap[s.site_id] = s.site_name;

    // Get all managed zones across those sites
    const { data: zones, error } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, site_id, anomaly_thresholds")
      .in("site_id", siteIds)
      .eq("control_scope", "managed")
      .not("thermostat_device_id", "is", null)
      .order("name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Merge defaults for any zones missing thresholds
    const enriched = (zones || []).map((z: any) => ({
      ...z,
      site_name: siteNameMap[z.site_id] || "Unknown",
      anomaly_thresholds: { ...DEFAULT_THRESHOLDS, ...(z.anomaly_thresholds || {}) },
    }));

    return NextResponse.json({
      zones: enriched,
      defaults: DEFAULT_THRESHOLDS,
      labels: THRESHOLD_LABELS,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Bulk update thresholds for selected zones
export async function PATCH(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { org_id, zone_ids, thresholds } = body;

    if (!org_id || !zone_ids?.length || !thresholds) {
      return NextResponse.json({ error: "org_id, zone_ids, and thresholds required" }, { status: 400 });
    }

    // Validate threshold keys
    const validKeys = Object.keys(DEFAULT_THRESHOLDS);
    const invalidKeys = Object.keys(thresholds).filter((k: string) => !validKeys.includes(k));
    if (invalidKeys.length) {
      return NextResponse.json({ error: `Invalid threshold keys: ${invalidKeys.join(", ")}` }, { status: 400 });
    }

    // Validate threshold values are numeric and non-negative
    for (const [key, val] of Object.entries(thresholds)) {
      if (typeof val !== "number" || (val as number) < 0) {
        return NextResponse.json({ error: `${key} must be a non-negative number` }, { status: 400 });
      }
    }

    const results: { zone_id: string; success: boolean; error?: string }[] = [];

    for (const zoneId of zone_ids) {
      // Fetch current thresholds
      const { data: current } = await supabase
        .from("a_hvac_zones")
        .select("anomaly_thresholds, site_id")
        .eq("hvac_zone_id", zoneId)
        .single();

      if (!current) {
        results.push({ zone_id: zoneId, success: false, error: "Zone not found" });
        continue;
      }

      const previousThresholds = current.anomaly_thresholds || DEFAULT_THRESHOLDS;
      const newThresholds = { ...previousThresholds, ...thresholds };

      // Update the zone
      const { error: updateErr } = await supabase
        .from("a_hvac_zones")
        .update({ anomaly_thresholds: newThresholds })
        .eq("hvac_zone_id", zoneId);

      if (updateErr) {
        results.push({ zone_id: zoneId, success: false, error: updateErr.message });
        continue;
      }

      results.push({ zone_id: zoneId, success: true });
    }

    // Log to activity feed (once for the whole batch)
    const firstZone = zone_ids[0];
    const { data: zoneInfo } = await supabase
      .from("a_hvac_zones")
      .select("site_id")
      .eq("hvac_zone_id", firstZone)
      .single();

    if (zoneInfo) {
      // Get org_id from site
      const { data: siteInfo } = await supabase
        .from("a_sites")
        .select("org_id")
        .eq("site_id", zoneInfo.site_id)
        .single();

      await supabase.from("b_records_log").insert({
        org_id: siteInfo?.org_id || org_id,
        site_id: zoneInfo.site_id,
        event_type: "anomaly_config",
        message: `Anomaly thresholds updated: ${Object.keys(thresholds).join(", ")} pushed to ${zone_ids.length} zone(s)`,
        created_by: callerEmail,
        details: {
          changed_keys: Object.keys(thresholds),
          new_values: thresholds,
          zone_count: zone_ids.length,
          change_type: zone_ids.length > 1 ? "bulk_push" : "threshold_update",
        },
      });
    }

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({
      success: successCount === zone_ids.length,
      results,
      summary: `${successCount}/${zone_ids.length} zones updated`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
