import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executePushForSite, HAConfig } from "@/lib/ha-push";
import { logZoneSetpointSnapshot } from "@/lib/zone-setpoint-logger";
import { siteLocalDate } from "@/lib/utils/site-date";
import { updateDailyHealth } from "@/lib/daily-health";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LOCK_NAME = "thermostat-enforce";

/**
 * POST /api/debug/run-thermostat-enforce
 *
 * Bypasses the cron lock and runs the full thermostat-enforce logic immediately.
 * Clears any stuck lock before running.
 *
 * Query params:
 *   site_id (optional) — run for a single site only
 */
export async function POST(req: NextRequest) {
  const startMs = Date.now();

  const siteIdFilter = req.nextUrl.searchParams.get("site_id");

  // Step 1: Inspect current lock state
  const { data: lockBefore } = await supabase
    .from("b_cron_locks")
    .select("*")
    .eq("cron_name", LOCK_NAME)
    .maybeSingle();

  console.log("[debug/run-thermostat-enforce] Lock state before:", JSON.stringify(lockBefore));

  // Step 2: Clear any stuck lock (all fields)
  if (lockBefore) {
    const { data: clearResult, error: clearErr } = await supabase
      .from("b_cron_locks")
      .update({
        locked_at: null,
        owner_run_id: null,
        last_heartbeat_at: null,
        last_step: "debug_cleared",
      })
      .eq("cron_name", LOCK_NAME)
      .select("locked_at");
    if (clearErr) {
      console.error("[debug/run-thermostat-enforce] Lock clear FAILED:", clearErr.message);
      return NextResponse.json({ error: "Failed to clear lock", detail: clearErr.message, lock_before: lockBefore }, { status: 500 });
    }
    const rows = Array.isArray(clearResult) ? clearResult : [clearResult];
    const verified = rows[0];
    console.log("[debug/run-thermostat-enforce] Lock cleared, verify:", JSON.stringify(verified));
    if (verified && verified.locked_at !== null) {
      console.error("[debug/run-thermostat-enforce] WARNING: locked_at still not null after clear!");
    }
  }

  // Step 3: Run the full thermostat-enforce logic
  try {
    let siteQuery = supabase
      .from("a_sites")
      .select(
        "site_id, org_id, timezone, ha_url, ha_token, status, a_hvac_zones!inner(hvac_zone_id, thermostat_device_id, control_scope)"
      )
      .not("a_hvac_zones.thermostat_device_id", "is", null);

    if (siteIdFilter) {
      siteQuery = siteQuery.eq("site_id", siteIdFilter);
    }

    const { data: sites, error: sitesErr } = await siteQuery;

    if (sitesErr) {
      return NextResponse.json({ error: sitesErr.message, lock_before: lockBefore }, { status: 500 });
    }

    if (!sites || sites.length === 0) {
      return NextResponse.json({
        lock_before: lockBefore,
        sites_found: 0,
        message: "No sites with thermostat zones found",
        duration_ms: Date.now() - startMs,
      });
    }

    // Deduplicate sites
    const uniqueSites = new Map<string, any>();
    for (const s of sites) {
      const existing = uniqueSites.get(s.site_id);
      const zones = Array.isArray(s.a_hvac_zones) ? s.a_hvac_zones : [s.a_hvac_zones];
      const hasManaged = zones.some((z: any) => z.control_scope === "managed");
      if (!existing) {
        uniqueSites.set(s.site_id, { ...s, has_managed: hasManaged });
      } else if (hasManaged) {
        existing.has_managed = true;
      }
    }

    const results: any[] = [];

    for (const site of uniqueSites.values()) {
      const siteResult: any = { site_id: site.site_id, has_managed: site.has_managed };
      const tz = site.timezone || "America/Chicago";

      try {
        // Push setpoints (managed zones only)
        if (site.has_managed) {
          const haConfig: HAConfig | undefined =
            site.ha_url && site.ha_token
              ? { haUrl: site.ha_url, haToken: site.ha_token }
              : undefined;

          const pushResult = await executePushForSite(
            supabase,
            site.site_id,
            "debug_trigger",
            haConfig,
            "eagle_eyes"
          );
          siteResult.push = {
            pushed: pushResult.results.filter((r) => r.pushed).length,
            skipped: pushResult.results.filter((r) => !r.pushed).length,
            ha_connected: pushResult.ha_connected,
          };
        }

        // Log zone setpoint snapshots
        await logZoneSetpointSnapshot(supabase, site.site_id);
        siteResult.snapshot_logged = true;

        // Health update (active sites only)
        if (site.status === "Active") {
          const localDate = siteLocalDate(new Date(), tz);
          await updateDailyHealth(supabase, {
            site_id: site.site_id,
            org_id: site.org_id,
            date: localDate,
            ha_reachable: siteResult.push?.ha_connected ?? true,
            zones_pushed: siteResult.push?.pushed ?? 0,
            zones_skipped: siteResult.push?.skipped ?? 0,
            zones_failed: 0,
          });
          siteResult.health_updated = true;
        }
      } catch (err: any) {
        siteResult.error = err.message;
      }

      results.push(siteResult);
    }

    // Step 4: Verify lock was released (check after run)
    const { data: lockAfter } = await supabase
      .from("b_cron_locks")
      .select("*")
      .eq("cron_name", LOCK_NAME)
      .maybeSingle();

    return NextResponse.json({
      lock_before: lockBefore,
      lock_after: lockAfter,
      sites_processed: results.length,
      results,
      duration_ms: Date.now() - startMs,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      stack: err.stack,
      lock_before: lockBefore,
      duration_ms: Date.now() - startMs,
    }, { status: 500 });
  }
}

/**
 * GET /api/debug/run-thermostat-enforce
 *
 * Returns current lock state. Add ?clear=true to force-clear the lock without running enforce.
 */
export async function GET(req: NextRequest) {
  const forceClear = req.nextUrl.searchParams.get("clear") === "true";

  if (forceClear) {
    const { data: before } = await supabase
      .from("b_cron_locks")
      .select("*")
      .eq("cron_name", LOCK_NAME)
      .maybeSingle();

    const { data: after, error: clearErr } = await supabase
      .from("b_cron_locks")
      .update({
        locked_at: null,
        owner_run_id: null,
        last_heartbeat_at: null,
        last_step: "force_cleared",
      })
      .eq("cron_name", LOCK_NAME)
      .select("*");

    return NextResponse.json({
      action: "force_clear",
      lock_before: before,
      lock_after: after?.[0] ?? after,
      clear_error: clearErr?.message ?? null,
    });
  }

  const { data: lock } = await supabase
    .from("b_cron_locks")
    .select("*")
    .eq("cron_name", LOCK_NAME)
    .maybeSingle();

  const lockAge = lock?.locked_at
    ? Math.round((Date.now() - new Date(lock.locked_at).getTime()) / 1000)
    : null;

  return NextResponse.json({
    lock,
    lock_age_seconds: lockAge,
    is_stuck: lockAge !== null && lockAge > 240,
  });
}
