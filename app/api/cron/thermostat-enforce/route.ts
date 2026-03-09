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

const LOCK_NAME = "thermostat-enforce";
const LOCK_TTL_MINUTES = 180;

export async function GET(req: NextRequest) {
  const startMs = Date.now();

  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── Overlap protection ──────────────────────────────────────────────────
  // Atomic lock acquisition: UPDATE only matches rows where locked_at IS NULL
  // or the lock is stale (older than TTL). If zero rows affected, either the
  // row doesn't exist yet or another instance holds a fresh lock.
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - LOCK_TTL_MINUTES * 60000).toISOString();
  const { data: lockRows } = await supabase
    .from("b_cron_locks")
    .update({ locked_at: now, last_started_at: now })
    .eq("cron_name", LOCK_NAME)
    .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
    .select("cron_name");

  if (!lockRows || lockRows.length === 0) {
    // No row was updated — either the row doesn't exist yet, or a fresh lock is held.
    // Try to insert a new row; if it conflicts (row exists), another instance holds the lock.
    const { error: insertErr } = await supabase
      .from("b_cron_locks")
      .insert({ cron_name: LOCK_NAME, locked_at: now, last_started_at: now });

    if (insertErr) {
      // Row already exists with a fresh lock — another instance is running
      console.log("[cron/thermostat-enforce] Skipping — already running (lock held)");
      return NextResponse.json({ skipped: true, reason: "already_running" });
    }
    // else: successfully created the lock row — proceed
  }

  try {
    // Fetch all sites that have at least one HVAC zone with a thermostat
    // (includes both managed and open zones — open zones get snapshots but no setpoint push)
    // status is fetched to gate health alerts: only "Active" sites generate alerts
    const { data: sites, error: sitesErr } = await supabase
      .from("a_sites")
      .select(
        "site_id, org_id, timezone, ha_url, ha_token, status, a_hvac_zones!inner(hvac_zone_id, thermostat_device_id, control_scope)"
      )
      .not("a_hvac_zones.thermostat_device_id", "is", null);

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

    // Deduplicate sites and track which have managed zones
    // site.status is used to gate health alerts — only "Active" sites trigger alerts
    const uniqueSites = new Map<
      string,
      { site_id: string; org_id: string; timezone: string | null; ha_url: string | null; ha_token: string | null; status: string | null; has_managed: boolean }
    >();
    for (const s of sites) {
      const existing = uniqueSites.get(s.site_id);
      const zones = Array.isArray(s.a_hvac_zones) ? s.a_hvac_zones : [s.a_hvac_zones];
      const hasManaged = zones.some((z: any) => z.control_scope === "managed");
      if (!existing) {
        uniqueSites.set(s.site_id, {
          site_id: s.site_id,
          org_id: s.org_id,
          timezone: s.timezone,
          ha_url: s.ha_url,
          ha_token: s.ha_token,
          status: s.status,
          has_managed: hasManaged,
        });
      } else if (hasManaged) {
        existing.has_managed = true;
      }
    }

    const managedCount = [...uniqueSites.values()].filter((s) => s.has_managed).length;
    console.log(`[cron/thermostat-enforce] Processing ${uniqueSites.size} sites (${managedCount} with managed zones)`);

    let sitesPushed = 0;
    let totalZonesPushed = 0;
    const errors: { site_id: string; error: string }[] = [];

    for (const site of uniqueSites.values()) {
      try {
        const tz = site.timezone || "America/Chicago";
        const localDate = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD

        // Only push setpoints to sites that have managed zones
        let pushedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;
        let haConnected = true;

        if (site.has_managed) {
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

          pushedCount = result.results.filter((r) => r.pushed).length;
          // "Already at target" is a skip, not a failure — only count actual errors as failed
          skippedCount = result.results.filter((r) => !r.pushed && r.reason === "Already at target").length;
          failedCount = result.results.filter((r) => !r.pushed && r.reason !== "Already at target").length;
          haConnected = result.ha_connected;
          if (pushedCount > 0) sitesPushed++;
          totalZonesPushed += pushedCount;
        } else {
          console.log(`[cron/thermostat-enforce] Site ${site.site_id}: no managed zones, skipping push (observation only)`);
        }

        // Log zone setpoint snapshots for time series (for ALL zones/sites including open & non-active)
        try {
          console.log(`[cron/thermostat-enforce] Calling logZoneSetpointSnapshot for site ${site.site_id}`);
          await logZoneSetpointSnapshot(supabase, site.site_id);
          console.log(`[cron/thermostat-enforce] logZoneSetpointSnapshot completed for site ${site.site_id}`);
        } catch (logErr: any) {
          console.error(`[cron/thermostat-enforce] Setpoint log failed for ${site.site_id}:`, logErr.message);
        }

        // ── Health alerts are gated behind site active status ──────────────────
        // Only "Active" sites generate Trust Dashboard health data and alerts.
        //   Suspended = likely billing hold; Pending/Closed/Retired/inventory = not operational.
        // Snapshot logging above is NOT gated — observability data flows for all sites.
        const isActiveSite = site.status === "Active";

        if (isActiveSite) {
          // Write health data (active sites only)
          try {
            await updateDailyHealth(supabase, {
              site_id: site.site_id,
              org_id: site.org_id,
              date: localDate,
              ha_reachable: haConnected,
              zones_pushed: pushedCount,
              zones_skipped: skippedCount,
              zones_failed: failedCount,
            });
          } catch (healthErr: any) {
            console.error(`[cron/thermostat-enforce] Health update failed for ${site.site_id}:`, healthErr.message);
          }

          // Check for >24hr compressor cycle gaps (active sites only)
          try {
            const { data: siteZones } = await supabase
              .from("a_hvac_zones")
              .select("hvac_zone_id, name, equipment_id")
              .eq("site_id", site.site_id)
              .not("equipment_id", "is", null)
              .not("thermostat_device_id", "is", null);

            if (siteZones && siteZones.length > 0) {
              const gapZones: string[] = [];
              let maxGapHours = 0;

              for (const zone of siteZones) {
                const { data: lastCycle } = await supabase
                  .from("b_compressor_cycles")
                  .select("started_at")
                  .eq("equipment_id", zone.equipment_id)
                  .order("started_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                const gapHours = lastCycle
                  ? (Date.now() - new Date(lastCycle.started_at).getTime()) / 3600000
                  : Infinity;

                if (gapHours >= 24) {
                  gapZones.push(zone.name || zone.hvac_zone_id);
                  maxGapHours = Math.max(maxGapHours, gapHours === Infinity ? 999 : gapHours);
                  console.warn(`[cron/thermostat-enforce] Compressor cycle gap >24hr for zone "${zone.name}" (${zone.hvac_zone_id}): ${gapHours === Infinity ? "no cycles ever" : Math.round(gapHours) + "hr"}`);
                }
              }

              if (gapZones.length > 0) {
                // Update health with compressor gap warning
                await updateDailyHealth(supabase, {
                  site_id: site.site_id,
                  org_id: site.org_id,
                  date: localDate,
                  compressor_cycles: {
                    zones_monitored: siteZones.length,
                    zones_with_gap: gapZones.length,
                    max_gap_hours: Math.round(maxGapHours),
                    gap_zone_names: gapZones,
                  },
                });
              }
            }
          } catch (cycleErr: any) {
            console.error(`[cron/thermostat-enforce] Compressor cycle gap check failed for ${site.site_id}:`, cycleErr.message);
          }
        }

        console.log(
          `[cron/thermostat-enforce] Site ${site.site_id}: ${pushedCount} zones pushed, has_managed=${site.has_managed}`
        );
      } catch (err: any) {
        console.error(
          `[cron/thermostat-enforce] Site ${site.site_id} failed:`,
          err.message
        );
        errors.push({ site_id: site.site_id, error: err.message });

        // Write failed health update (active sites only)
        if (site.status === "Active") {
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
  } finally {
    // Release the lock and record finish time
    await supabase
      .from("b_cron_locks")
      .update({ locked_at: null, last_finished_at: new Date().toISOString() })
      .eq("cron_name", LOCK_NAME);
  }
}
