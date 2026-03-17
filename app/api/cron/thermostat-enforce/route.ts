import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executePushForSite, HAConfig } from "@/lib/ha-push";
import { updateDailyHealth } from "@/lib/daily-health";
import { logZoneSetpointSnapshot } from "@/lib/zone-setpoint-logger";
import { siteLocalDate } from "@/lib/utils/site-date";

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // If no secret configured, allow (dev mode)
  return authHeader === `Bearer ${cronSecret}`;
}

const LOCK_NAME = "thermostat-enforce";
const MAX_LOCK_AGE_MS = 75 * 1000; // 75s — any lock older than Vercel's 60s kill + overhead is definitionally stale
const SOFT_TIMEOUT_MS = 50_000; // 50s — release lock before Vercel's 60s hard kill

const DEBUG_ORG_ID  = "75d9a833-0359-4042-b760-4e5d587798e6";  // PARK org
const DEBUG_SITE_ID = "aebd4fdf-2f60-4e6d-b08e-46ebc199555e";  // Oneida site

async function crumb(
  sb: ReturnType<typeof createClient<any>>,
  eventType: string,
  message: string,
  siteId?: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    await sb.from("b_records_log").insert({
      org_id:     DEBUG_ORG_ID,
      site_id:    siteId ?? null,
      event_type: eventType,
      source:     "cron_debug",
      message,
      event_date: new Date().toISOString().slice(0, 10),
      created_by: "system",
      metadata:   { ts: new Date().toISOString(), ...(extra ?? {}) },
    });
  } catch (e: any) {
    // Never let a breadcrumb throw — just console.error
    console.error(`[crumb] Failed to write ${eventType}:`, e?.message);
  }
}

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await crumb(supabase, "cron_entry", "Cron handler entered");
  console.log("[cron/thermostat-enforce] ENTRY", new Date().toISOString());
  const startMs = Date.now();

  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── Overlap protection (atomic lock acquisition) ───────────────────────
  // Single atomic UPDATE: acquires the lock only if it is not held OR is stale.
  // No read-then-act gap — Postgres guarantees only one writer succeeds.
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - MAX_LOCK_AGE_MS).toISOString();

  // Pre-read for stale-lock logging only (not used for acquisition decision)
  const { data: preLock } = await supabase
    .from("b_cron_locks")
    .select("locked_at")
    .eq("cron_name", LOCK_NAME)
    .maybeSingle();

  const { data: lockRows } = await supabase
    .from("b_cron_locks")
    .update({ locked_at: now, last_started_at: now })
    .eq("cron_name", LOCK_NAME)
    .or(`locked_at.is.null,locked_at.lte.${staleThreshold}`)
    .select("locked_at");

  if (lockRows && lockRows.length > 0) {
    // We acquired the lock via atomic UPDATE.
    if (preLock?.locked_at && preLock.locked_at <= staleThreshold) {
      const staleAge = Math.round((Date.now() - new Date(preLock.locked_at).getTime()) / 1000);
      console.warn(
        `[cron/thermostat-enforce] Stale lock detected (age ${staleAge}s), clearing and proceeding`
      );
    } else {
      console.log("[cron/thermostat-enforce] Lock acquired");
    }
  } else {
    // UPDATE matched 0 rows — either no row exists, or a fresh lock is held.
    // Try INSERT for the case where the row doesn't exist yet.
    const { error: insertErr } = await supabase
      .from("b_cron_locks")
      .insert({ cron_name: LOCK_NAME, locked_at: now, last_started_at: now });

    if (insertErr) {
      // Row exists with a fresh lock — another instance is running.
      // Read the lock to log its age.
      const { data: heldLock } = await supabase
        .from("b_cron_locks")
        .select("locked_at")
        .eq("cron_name", LOCK_NAME)
        .maybeSingle();
      const age = heldLock?.locked_at
        ? Math.round((Date.now() - new Date(heldLock.locked_at).getTime()) / 1000)
        : "unknown";
      console.log(
        `[cron/thermostat-enforce] Skipping — already running (lock held, age ${age}s)`
      );
      return NextResponse.json({ skipped: true, reason: "already_running" });
    }
    // else: successfully created the lock row — proceed
    console.log("[cron/thermostat-enforce] Lock created and acquired");
  }

  await crumb(supabase, "cron_lock_acquired", "Lock acquired");

  // ─── Soft timeout: release the lock before Vercel's hard 60s kill ────────
  let softTimedOut = false;
  const softTimer = setTimeout(() => { softTimedOut = true; }, SOFT_TIMEOUT_MS);

  // Helper: release the lock with a timeout guard so it can't hang forever
  async function releaseLock() {
    try {
      const releasePromise = supabase
        .from("b_cron_locks")
        .update({ locked_at: null, last_finished_at: new Date().toISOString() })
        .eq("cron_name", LOCK_NAME);

      // Race the lock release against a 5s timeout — if supabase hangs
      // (e.g. Vercel is shutting down), we still log the failure cleanly
      const result = await Promise.race([
        releasePromise,
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ error: { message: "lock release timed out after 5s" } }), 5000)
        ),
      ]);
      if (result.error) {
        console.error("[cron/thermostat-enforce] FAILED to release lock:", result.error.message);
      } else {
        console.log("[cron/thermostat-enforce] lock released");
        await crumb(supabase, "cron_lock_released", "Lock released");
      }
    } catch (releaseEx: any) {
      // Catch absolutely everything — the lock release must never throw
      console.error("[cron/thermostat-enforce] lock release threw:", releaseEx?.message ?? releaseEx);
    }
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
      .eq("status", "Active");
      console.log("[cron/thermostat-enforce] Sites query returned:", sites?.length ?? 0);
      await crumb(
        supabase,
        "cron_sites_found",
        `Sites query returned ${sites?.length ?? 0} rows`,
        undefined,
        { site_count: sites?.length ?? 0 }
      );
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
      const zones = (Array.isArray(s.a_hvac_zones) ? s.a_hvac_zones : [s.a_hvac_zones])
        .filter((z: any) => z.thermostat_device_id !== null);
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
    const allSiteIds = [...uniqueSites.keys()];
    console.log(`[cron/thermostat-enforce] Sites fetched from a_sites: [${allSiteIds.join(", ")}]`);
    console.log(`[cron/thermostat-enforce] Processing ${uniqueSites.size} sites (${managedCount} with managed zones)`);

    let sitesPushed = 0;
    let totalZonesPushed = 0;
    const errors: { site_id: string; error: string }[] = [];

    // ─── Per-site processing function ─────────────────────────────────────────
    const PER_SITE_TIMEOUT_MS = 15_000;

    async function processSite(
      site: { site_id: string; org_id: string; timezone: string | null; ha_url: string | null; ha_token: string | null; status: string | null; has_managed: boolean }
    ): Promise<{ pushed: number; skipped: number; failed: number; ha_connected: boolean }> {
      const tz = site.timezone || "America/Chicago";
      const localDate = siteLocalDate(new Date(), tz);

      let pushedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let haConnected = true;

      if (site.has_managed) {
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
        skippedCount = result.results.filter((r) => !r.pushed && r.reason === "Already at target").length;
        failedCount = result.results.filter((r) => !r.pushed && r.reason !== "Already at target").length;
        haConnected = result.ha_connected;
      } else {
        console.log(`[cron/thermostat-enforce] Site ${site.site_id}: no managed zones, skipping push (observation only)`);
      }

      // Log zone setpoint snapshots for time series (for ALL zones/sites including open & non-active)
      try {
        console.log(`[cron/thermostat-enforce] Calling logZoneSetpointSnapshot for site ${site.site_id}`);
        await crumb(
          supabase,
          "cron_snapshot_start",
          `logZoneSetpointSnapshot starting for site ${site.site_id}`,
          site.site_id
        );
        await logZoneSetpointSnapshot(supabase, site.site_id);
        await crumb(
          supabase,
          "cron_snapshot_done",
          `logZoneSetpointSnapshot completed for site ${site.site_id}`,
          site.site_id
        );
        console.log(`[cron/thermostat-enforce] logZoneSetpointSnapshot completed for site ${site.site_id}`);
      } catch (logErr: any) {
        console.error(`[cron/thermostat-enforce] Setpoint log failed for ${site.site_id}:`, logErr.message);
      }

      const isActiveSite = site.status === "Active";

      if (isActiveSite) {
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

      return { pushed: pushedCount, skipped: skippedCount, failed: failedCount, ha_connected: haConnected };
    }

    // ─── Site loop with per-site Promise.race timeout ─────────────────────────
    let siteIndex = 0;
    for (const site of uniqueSites.values()) {
      siteIndex++;
      if (softTimedOut) {
        console.warn(`[cron/thermostat-enforce] Soft timeout reached (${SOFT_TIMEOUT_MS}ms) — aborting remaining sites to release lock before Vercel kills the function`);
        errors.push({ site_id: site.site_id, error: "soft_timeout" });
        break;
      }
      const siteStartMs = Date.now();
      console.log(`[cron/thermostat-enforce] ▶ Starting site ${siteIndex}/${uniqueSites.size}: ${site.site_id} (status=${site.status}, has_managed=${site.has_managed})`);
      await crumb(
        supabase,
        "cron_site_start",
        `Starting site ${site.site_id} (${siteIndex}/${uniqueSites.size})`,
        site.site_id,
        { site_index: siteIndex, has_managed: site.has_managed }
      );
      try {
        const siteResult = await Promise.race([
          processSite(site),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`site_timeout: ${site.site_id} exceeded ${PER_SITE_TIMEOUT_MS}ms`)),
              PER_SITE_TIMEOUT_MS
            )
          ),
        ]);

        await crumb(
          supabase,
          "cron_site_done",
          `Site ${site.site_id} completed: pushed=${siteResult.pushed}`,
          site.site_id,
          { pushed: siteResult.pushed, skipped: siteResult.skipped, failed: siteResult.failed }
        );

        if (siteResult.pushed > 0) sitesPushed++;
        totalZonesPushed += siteResult.pushed;

        console.log(
          `[cron/thermostat-enforce] ✔ Completed site ${siteIndex}/${uniqueSites.size}: ${site.site_id} in ${Date.now() - siteStartMs}ms — ${siteResult.pushed} pushed, has_managed=${site.has_managed}`
        );
      } catch (err: any) {
        await crumb(
          supabase,
          "cron_site_error",
          `Site ${site.site_id} error: ${err?.message ?? String(err)}`,
          site.site_id,
          { error: err?.message ?? String(err) }
        );
        if (err?.message?.startsWith("site_timeout:")) {
          console.error(`[cron/thermostat-enforce] ✘ site ${site.site_id} timed out after ${PER_SITE_TIMEOUT_MS}ms`);
        } else {
          console.error(
            `[cron/thermostat-enforce] ✘ Failed site ${siteIndex}/${uniqueSites.size}: ${site.site_id} after ${Date.now() - siteStartMs}ms:`,
            err?.message ?? err
          );
        }
        errors.push({ site_id: site.site_id, error: err?.message ?? String(err) });

        // Write failed health update (active sites only)
        if (site.status === "Active") {
          const tz = site.timezone || "America/Chicago";
          const localDate = siteLocalDate(new Date(), tz);
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

    console.log(`[cron/thermostat-enforce] All sites processed (${errors.length} errors), releasing lock`);

    return NextResponse.json({
      sites_checked: uniqueSites.size,
      sites_pushed: sitesPushed,
      total_zones_pushed: totalZonesPushed,
      errors,
      soft_timed_out: softTimedOut,
      duration_ms: Date.now() - startMs,
    });
  } catch (err: any) {
    console.error("[cron/thermostat-enforce] Uncaught error:", err?.message ?? err, err?.stack);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  } finally {
    clearTimeout(softTimer);
    await releaseLock();
  }
}
