import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executePushForSite, HAConfig } from "@/lib/ha-push";
import { updateDailyHealth } from "@/lib/daily-health";
import { logZoneSetpointSnapshot } from "@/lib/zone-setpoint-logger";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // If no secret configured, allow (dev mode)
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  const startMs = Date.now();

  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all managed sites that have at least one HVAC zone with a thermostat
    const { data: sites, error: sitesErr } = await supabase
      .from("a_sites")
      .select(
        "site_id, org_id, timezone, ha_url, ha_token, a_hvac_zones!inner(hvac_zone_id, thermostat_device_id, control_scope)"
      )
      .not("a_hvac_zones.thermostat_device_id", "is", null)
      .eq("a_hvac_zones.control_scope", "managed");

    if (sitesErr) {
      console.error("[cron/thermostat-enforce] Sites query error:", sitesErr.message);
      return NextResponse.json(
        { error: sitesErr.message },
        { status: 500 }
      );
    }

    if (!sites || sites.length === 0) {
      return NextResponse.json({
        sites_checked: 0,
        sites_pushed: 0,
        total_zones_pushed: 0,
        errors: [],
        duration_ms: Date.now() - startMs,
      });
    }

    // Deduplicate sites (join may return multiple rows per site)
    const uniqueSites = new Map<
      string,
      { site_id: string; org_id: string; timezone: string | null; ha_url: string | null; ha_token: string | null }
    >();
    for (const s of sites) {
      if (!uniqueSites.has(s.site_id)) {
        uniqueSites.set(s.site_id, {
          site_id: s.site_id,
          org_id: s.org_id,
          timezone: s.timezone,
          ha_url: s.ha_url,
          ha_token: s.ha_token,
        });
      }
    }

    let sitesPushed = 0;
    let totalZonesPushed = 0;
    const errors: { site_id: string; error: string }[] = [];

    for (const site of uniqueSites.values()) {
      try {
        // Build per-site HA config; fall back to env vars if columns are null
        const haConfig: HAConfig | undefined =
          site.ha_url && site.ha_token
            ? { haUrl: site.ha_url, haToken: site.ha_token }
            : undefined;

        const result = await executePushForSite(
          supabase,
          site.site_id,
          "cron_enforce",
          haConfig,
          "eagle_eyes"
        );

        const pushedCount = result.results.filter((r) => r.pushed).length;
        // "Already at target" is a skip, not a failure — only count actual errors as failed
        const skippedCount = result.results.filter((r) => !r.pushed && r.reason === "Already at target").length;
        const failedCount = result.results.filter((r) => !r.pushed && r.reason !== "Already at target").length;
        if (pushedCount > 0) sitesPushed++;
        totalZonesPushed += pushedCount;

        // Write health data
        const tz = site.timezone || "America/Chicago";
        const localDate = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
        try {
          await updateDailyHealth(supabase, {
            site_id: site.site_id,
            org_id: site.org_id,
            date: localDate,
            ha_reachable: result.ha_connected,
            zones_pushed: pushedCount,
            zones_skipped: skippedCount,
            zones_failed: failedCount,
          });
        } catch (healthErr: any) {
          console.error(`[cron/thermostat-enforce] Health update failed for ${site.site_id}:`, healthErr.message);
        }

        // Log zone setpoint snapshots for time series
        try {
          await logZoneSetpointSnapshot(supabase, site.site_id);
        } catch (logErr: any) {
          console.error(`[cron/thermostat-enforce] Setpoint log failed for ${site.site_id}:`, logErr.message);
        }

        console.log(
          `[cron/thermostat-enforce] Site ${site.site_id}: ${pushedCount}/${result.results.length} zones pushed`
        );
      } catch (err: any) {
        console.error(
          `[cron/thermostat-enforce] Site ${site.site_id} failed:`,
          err.message
        );
        errors.push({ site_id: site.site_id, error: err.message });

        // Write failed health update
        const tz = site.timezone || "America/Chicago";
        const localDate = new Date().toLocaleDateString("en-CA", { timeZone: tz });
        try {
          await updateDailyHealth(supabase, {
            site_id: site.site_id,
            org_id: site.org_id,
            date: localDate,
            ha_reachable: false,
            zones_pushed: 0,
            zones_skipped: 0,
            zones_failed: 0,
          });
        } catch (healthErr: any) {
          console.error(`[cron/thermostat-enforce] Health update failed for ${site.site_id}:`, healthErr.message);
        }
      }
    }

    return NextResponse.json({
      sites_checked: uniqueSites.size,
      sites_pushed: sitesPushed,
      total_zones_pushed: totalZonesPushed,
      errors,
      duration_ms: Date.now() - startMs,
    });
  } catch (err: any) {
    console.error("[cron/thermostat-enforce] Uncaught error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
