import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executePushForSite, HAConfig } from "@/lib/ha-push";
import { updateDailyHealth } from "@/lib/daily-health";
import { logZoneSetpointSnapshot } from "@/lib/zone-setpoint-logger";
import { siteLocalDate } from "@/lib/utils/site-date";

export const maxDuration = 60;

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
const MAX_LOCK_AGE_MS = 4 * 60 * 1000; // 4 minutes — safely under the 5-min cron interval
const SOFT_TIMEOUT_MS = 50_000; // 50s — release lock before Vercel's 60s hard kill

export async function GET(req: NextRequest) {
  const runId = Math.random().toString(36).slice(2, 10);
  console.log(`[cron/thermostat-enforce][${runId}] ENTRY`, new Date().toISOString());

  const startMs = Date.now();

  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── Overlap protection (atomic lock acquisition) ───────────────────────
  // Single atomic UPDATE: acquires the lock only if it is not held OR is stale.
  // No read-then-act gap — Postgres guarantees only one writer succeeds.
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - MAX_LOCK_AGE_MS).toISOString();
  console.log(`[cron/thermostat-enforce][${runId}] staleThreshold=${staleThreshold}`);

  // Pre-read for stale-lock logging only (not used for acquisition decision)
  const { data: preLock } = await supabase
    .from("b_cron_locks")
    .select("locked_at")
    .eq("cron_name", LOCK_NAME)
    .maybeSingle();

  // ── Step 1: Attempt atomic UPDATE to acquire the lock ──
  console.log(`[cron/thermostat-enforce][${runId}] attempting UPDATE lock acquire`);
  const { error: lockUpdateErr } = await supabase
    .from("b_cron_locks")
    .update({
      locked_at: now,
      last_started_at: now,
      owner_run_id: runId,
      last_heartbeat_at: now,
      last_step: "lock_acquired",
    })
    .eq("cron_name", LOCK_NAME)
    .or(`locked_at.is.null,locked_at.lte.${staleThreshold}`);

  if (lockUpdateErr) {
    console.error(`[cron/thermostat-enforce][${runId}] UPDATE error:`, lockUpdateErr.message);
  }

  // ── Step 2: Read back the lock to verify ownership ──
  // We can't rely on .select() returning data from the UPDATE (PostgREST
  // may return an empty array even when the UPDATE succeeded). Instead,
  // read the lock row and check if owner_run_id matches our runId.
  const { data: postLock } = await supabase
    .from("b_cron_locks")
    .select("locked_at, owner_run_id")
    .eq("cron_name", LOCK_NAME)
    .maybeSingle();

  console.log(`[cron/thermostat-enforce][${runId}] post-UPDATE lock state:`, JSON.stringify(postLock));

  if (postLock?.owner_run_id === runId) {
    // We own the lock — proceed.
    if (preLock?.locked_at && preLock.locked_at <= staleThreshold) {
      const staleAge = Math.round((Date.now() - new Date(preLock.locked_at).getTime()) / 1000);
      console.warn(
        `[cron/thermostat-enforce][${runId}] Stale lock detected (age ${staleAge}s), cleared and proceeding`
      );
    } else {
      console.log(`[cron/thermostat-enforce][${runId}] Lock acquired via UPDATE`);
    }
  } else if (!postLock) {
    // No lock row exists — create it via INSERT.
    console.log(`[cron/thermostat-enforce][${runId}] No lock row, attempting INSERT`);
    const { error: insertErr } = await supabase
      .from("b_cron_locks")
      .insert({
        cron_name: LOCK_NAME,
        locked_at: now,
        last_started_at: now,
        owner_run_id: runId,
        last_heartbeat_at: now,
        last_step: "lock_acquired",
      });

    if (insertErr) {
      console.log(`[cron/thermostat-enforce][${runId}] INSERT conflict — another instance won`);
      return NextResponse.json({ skipped: true, reason: "already_running" });
    }
    console.log(`[cron/thermostat-enforce][${runId}] Lock created via INSERT`);
  } else {
    // Lock is held by another run — skip.
    const age = postLock.locked_at
      ? Math.round((Date.now() - new Date(postLock.locked_at).getTime()) / 1000)
      : "unknown";
    console.log(
      `[cron/thermostat-enforce][${runId}] Skipping — lock held by ${postLock.owner_run_id} (age ${age}s)`
    );
    return NextResponse.json({ skipped: true, reason: "already_running" });
  }

  // ─── Fire-and-forget heartbeat: updates lock row so losers can see our progress ─
  function heartbeat(step: string) {
    supabase
      .from("b_cron_locks")
      .update({ last_heartbeat_at: new Date().toISOString(), last_step: step })
      .eq("cron_name", LOCK_NAME)
      .then(({ error }) => {
        if (error) console.warn(`[cron/thermostat-enforce][${runId}] heartbeat update failed (${step}):`, error.message);
      });
  }

  // ─── Soft timeout: release the lock before Vercel's hard 60s kill ────────
  let softTimedOut = false;
  const softTimer = setTimeout(() => { softTimedOut = true; }, SOFT_TIMEOUT_MS);

  // Helper: release the lock with a timeout guard so it can't hang forever
  async function releaseLock() {
    console.log(`[cron/thermostat-enforce][${runId}] releaseLock called`);
    try {
      const releasePromise = supabase
        .from("b_cron_locks")
        .update({
          locked_at: null,
          owner_run_id: null,
          last_heartbeat_at: null,
          last_finished_at: new Date().toISOString(),
          last_step: "released",
        })
        .eq("cron_name", LOCK_NAME)
        .select("locked_at, last_step");

      // Race the lock release against a 5s timeout — if supabase hangs
      // (e.g. Vercel is shutting down), we still log the failure cleanly
      const result = await Promise.race([
        releasePromise,
        new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: { message: "lock release timed out after 5s" } }), 5000)
        ),
      ]);
      if (result.error) {
        console.error(`[cron/thermostat-enforce][${runId}] FAILED to release lock:`, result.error.message);
        // Retry once without timeout race — last-ditch effort
        console.log(`[cron/thermostat-enforce][${runId}] retrying lock release (no timeout race)`);
        const { error: retryErr } = await supabase
          .from("b_cron_locks")
          .update({ locked_at: null, owner_run_id: null, last_step: "released_retry" })
          .eq("cron_name", LOCK_NAME);
        if (retryErr) {
          console.error(`[cron/thermostat-enforce][${runId}] retry release also failed:`, retryErr.message);
        } else {
          console.log(`[cron/thermostat-enforce][${runId}] retry release succeeded`);
        }
      } else {
        const rows = Array.isArray(result.data) ? result.data : [result.data];
        const row = rows[0];
        console.log(`[cron/thermostat-enforce][${runId}] lock released — verify:`, JSON.stringify(row));
        // Verify locked_at is actually null
        if (row && row.locked_at !== null) {
          console.error(`[cron/thermostat-enforce][${runId}] WARNING: locked_at still not null after release!`, row.locked_at);
        }
      }
    } catch (releaseEx: any) {
      // Catch absolutely everything — the lock release must never throw
      console.error(`[cron/thermostat-enforce][${runId}] lock release threw:`, releaseEx?.message ?? releaseEx);
    }
  }

  try {
    heartbeat("sites_query");
    // Fetch all sites that have at least one HVAC zone with a thermostat
    // (includes both managed and open zones — open zones get snapshots but no setpoint push)
    // status is fetched to gate health alerts: only "Active" sites generate alerts
    const { data: sites, error: sitesErr } = await supabase
      .from("a_sites")
      .select(
        "site_id, org_id, timezone, ha_url, ha_token, status, a_hvac_zones!inner(hvac_zone_id, thermostat_device_id, control_scope)"
      )
      .not("a_hvac_zones.thermostat_device_id", "is", null)
      .eq("status", "Active");

    if (sitesErr) {
      console.error(`[cron/thermostat-enforce][${runId}] Sites query error:`, sitesErr.message);
      await releaseLock();
      return NextResponse.json(
        { error: sitesErr.message },
        { status: 500 }
      );
    }

    if (!sites || sites.length === 0) {
      await releaseLock();
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
    const allSiteIds = [...uniqueSites.keys()];
    console.log(`[cron/thermostat-enforce][${runId}] Sites fetched from a_sites: [${allSiteIds.join(", ")}]`);
    console.log(`[cron/thermostat-enforce][${runId}] Processing ${uniqueSites.size} sites (${managedCount} with managed zones)`);

    let sitesPushed = 0;
    let totalZonesPushed = 0;
    const errors: { site_id: string; error: string }[] = [];

    // ─── Per-site processing function ─────────────────────────────────────────
    const PER_SITE_TIMEOUT_MS = 20_000;

    async function processSite(
      site: { site_id: string; org_id: string; timezone: string | null; ha_url: string | null; ha_token: string | null; status: string | null; has_managed: boolean },
      runId: string
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

        heartbeat("executePushForSite");
        console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] push start`);
        const t1 = Date.now();
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
        console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] push done in ${Date.now() - t1}ms — pushed=${pushedCount} skipped=${skippedCount} failed=${failedCount} ha_connected=${haConnected}`);
      } else {
        console.log(`[cron/thermostat-enforce][${runId}] Site ${site.site_id}: no managed zones, skipping push (observation only)`);
      }

      // Log zone setpoint snapshots for time series (for ALL zones/sites including open & non-active)
      try {
        heartbeat("logZoneSetpointSnapshot");
        console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] snapshot start`);
        const t2 = Date.now();
        await logZoneSetpointSnapshot(supabase, site.site_id);
        console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] snapshot done in ${Date.now() - t2}ms`);
      } catch (logErr: any) {
        console.error(`[cron/thermostat-enforce][${runId}] Setpoint log failed for ${site.site_id}:`, logErr.message);
      }

      const isActiveSite = site.status === "Active";

      if (isActiveSite) {
        try {
          heartbeat("updateDailyHealth");
          console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] health update start`);
          const t3 = Date.now();
          await updateDailyHealth(supabase, {
            site_id: site.site_id,
            org_id: site.org_id,
            date: localDate,
            ha_reachable: haConnected,
            zones_pushed: pushedCount,
            zones_skipped: skippedCount,
            zones_failed: failedCount,
          });
          console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] health update done in ${Date.now() - t3}ms`);
        } catch (healthErr: any) {
          console.error(`[cron/thermostat-enforce][${runId}] Health update failed for ${site.site_id}:`, healthErr.message);
        }

        // Check for >24hr compressor cycle gaps (active sites only)
        try {
          heartbeat("compressor_cycle_check");

          // Skip compressor gap check if site has no compressor sensor entities
          const { count: compressorEntityCount } = await supabase
            .from("b_entity_sync")
            .select("entity_id", { count: "exact", head: true })
            .eq("site_id", site.site_id)
            .or(
              "entity_id.ilike.%compressor%,"
              + "device_class.eq.running,"
              + "sensor_type.eq.compressor"
            );

          if (!compressorEntityCount || compressorEntityCount === 0) {
            console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] no compressor sensor entities found — skipping cycle gap check`);
          } else {

          console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] fetching zones for compressor gap check`);
          const t4 = Date.now();
          const { data: siteZones } = await supabase
            .from("a_hvac_zones")
            .select("hvac_zone_id, name, equipment_id")
            .eq("site_id", site.site_id)
            .not("equipment_id", "is", null)
            .not("thermostat_device_id", "is", null);
          console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] zones fetched: ${siteZones?.length ?? 0}`);

          if (siteZones && siteZones.length > 0) {
            const gapZones: string[] = [];
            let maxGapHours = 0;

            for (const zone of siteZones) {
              console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] compressor gap check zone: ${zone.hvac_zone_id}`);
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
                console.warn(`[cron/thermostat-enforce][${runId}] Compressor cycle gap >24hr for zone "${zone.name}" (${zone.hvac_zone_id}): ${gapHours === Infinity ? "no cycles ever" : Math.round(gapHours) + "hr"}`);
              }
            }

            if (gapZones.length > 0) {
              console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] compressor gap health update start`);
              const t5 = Date.now();
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
              console.log(`[cron/thermostat-enforce][${runId}] [${site.site_id}] compressor gap health update done in ${Date.now() - t5}ms`);
            }
          }
          } // end else (has compressor entities)
        } catch (cycleErr: any) {
          console.error(`[cron/thermostat-enforce][${runId}] Compressor cycle gap check failed for ${site.site_id}:`, cycleErr.message);
        }
      }

      return { pushed: pushedCount, skipped: skippedCount, failed: failedCount, ha_connected: haConnected };
    }

    // ─── Site loop with per-site Promise.race timeout ─────────────────────────
    let siteIndex = 0;
    for (const site of uniqueSites.values()) {
      siteIndex++;
      if (softTimedOut) {
        console.warn(`[cron/thermostat-enforce][${runId}] Soft timeout reached (${SOFT_TIMEOUT_MS}ms) — aborting remaining sites to release lock before Vercel kills the function`);
        errors.push({ site_id: site.site_id, error: "soft_timeout" });
        break;
      }
      const siteStartMs = Date.now();
      console.log(`[cron/thermostat-enforce][${runId}] ▶ Starting site ${siteIndex}/${uniqueSites.size}: ${site.site_id} (status=${site.status}, has_managed=${site.has_managed})`);
      try {
        const siteResult = await Promise.race([
          processSite(site, runId),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`site_timeout: ${site.site_id} exceeded ${PER_SITE_TIMEOUT_MS}ms`)),
              PER_SITE_TIMEOUT_MS
            )
          ),
        ]);

        if (siteResult.pushed > 0) sitesPushed++;
        totalZonesPushed += siteResult.pushed;

        console.log(
          `[cron/thermostat-enforce][${runId}] ✔ Completed site ${siteIndex}/${uniqueSites.size}: ${site.site_id} in ${Date.now() - siteStartMs}ms — ${siteResult.pushed} pushed, has_managed=${site.has_managed}`
        );
      } catch (err: any) {
        if (err?.message?.startsWith("site_timeout:")) {
          console.error(`[cron/thermostat-enforce][${runId}] ✘ site ${site.site_id} timed out after ${PER_SITE_TIMEOUT_MS}ms`);
        } else {
          console.error(
            `[cron/thermostat-enforce][${runId}] ✘ Failed site ${siteIndex}/${uniqueSites.size}: ${site.site_id} after ${Date.now() - siteStartMs}ms:`,
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
            console.error(`[cron/thermostat-enforce][${runId}] Health update failed for ${site.site_id}:`, healthErr.message);
          }
        }
      }
    }

    console.log(`[cron/thermostat-enforce][${runId}] All sites processed (${errors.length} errors), releasing lock`);

    // Release lock BEFORE returning response — Vercel may kill the function
    // after the response is sent, so finally-based release is unreliable.
    await releaseLock();
    clearTimeout(softTimer);

    return NextResponse.json({
      sites_checked: uniqueSites.size,
      sites_pushed: sitesPushed,
      total_zones_pushed: totalZonesPushed,
      errors,
      soft_timed_out: softTimedOut,
      duration_ms: Date.now() - startMs,
    });
  } catch (err: any) {
    console.error(`[cron/thermostat-enforce][${runId}] Uncaught error:`, err?.message ?? err, err?.stack);
    // Release lock before returning error response too
    await releaseLock();
    clearTimeout(softTimer);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  } finally {
    // Safety net — releaseLock is idempotent, so double-calling is safe
    console.log(`[cron/thermostat-enforce][${runId}] finally block reached`);
    clearTimeout(softTimer);
    await releaseLock();
  }
}
