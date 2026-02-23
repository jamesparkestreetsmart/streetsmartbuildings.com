import { SupabaseClient } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────────────

export interface HealthChecks {
  cron: {
    last_run_at: string | null;
    gap_minutes: number;
    runs_today: number;
  };
  ha_connection: {
    reachable: boolean;
    last_seen_at: string | null;
    downtime_minutes: number;
  };
  devices: {
    total: number;
    responsive: number;
    unresponsive: number;
  };
  sensors: {
    total: number;
    fresh: number;
    stale: number;
  };
  directives: {
    total: number;
    pushed: number;
    failed: number;
    skipped: number;
  };
  entity_sync: {
    total: number;
    synced: number;
    orphaned: number;
  };
}

export interface ScoreResult {
  score: number;
  status: "green" | "yellow" | "red";
  critical: boolean;
  criticalReason: string | null;
}

export interface DailyHealthRow {
  id: string;
  site_id: string;
  org_id: string;
  date: string;
  overall_status: "green" | "yellow" | "red" | "no_data";
  score: number;
  critical_failure: boolean;
  critical_failure_reason: string | null;
  sla_warning: boolean;
  sla_breach: boolean;
  checks: HealthChecks;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Default checks ─────────────────────────────────────────────────

export function defaultChecks(): HealthChecks {
  return {
    cron: { last_run_at: null, gap_minutes: 0, runs_today: 0 },
    ha_connection: { reachable: false, last_seen_at: null, downtime_minutes: 0 },
    devices: { total: 0, responsive: 0, unresponsive: 0 },
    sensors: { total: 0, fresh: 0, stale: 0 },
    directives: { total: 0, pushed: 0, failed: 0, skipped: 0 },
    entity_sync: { total: 0, synced: 0, orphaned: 0 },
  };
}

// ── Score calculation ──────────────────────────────────────────────

export function calculateScore(checks: HealthChecks): ScoreResult {
  // Weighted component scores (0-100 each)
  const cronScore = calcCronScore(checks.cron);
  const haScore = calcHAScore(checks.ha_connection);
  const deviceScore = calcDeviceScore(checks.devices);
  const sensorScore = calcSensorScore(checks.sensors);
  const directiveScore = calcDirectiveScore(checks.directives);
  const syncScore = calcSyncScore(checks.entity_sync);

  // Weighted total
  let score = Math.round(
    cronScore * 0.25 +
    haScore * 0.20 +
    deviceScore * 0.20 +
    sensorScore * 0.15 +
    directiveScore * 0.10 +
    syncScore * 0.10
  );

  // Duration-based penalties
  if (checks.ha_connection.downtime_minutes > 120) score = Math.max(0, score - 25);
  else if (checks.ha_connection.downtime_minutes > 30) score = Math.max(0, score - 10);

  if (checks.cron.gap_minutes > 120) score = Math.max(0, score - 15);
  else if (checks.cron.gap_minutes > 30) score = Math.max(0, score - 5);

  score = Math.max(0, Math.min(100, score));

  // Critical failure checks — auto-red overrides
  const criticalReasons: string[] = [];
  if (checks.cron.gap_minutes > 120) criticalReasons.push("Cron gap >2hr");
  if (checks.ha_connection.downtime_minutes > 60) criticalReasons.push("HA offline >60min");
  if (checks.sensors.total > 0 && checks.sensors.fresh === 0) criticalReasons.push("All sensors stale");
  if (checks.devices.total > 0 && checks.devices.responsive === 0) criticalReasons.push("All devices unresponsive");

  const critical = criticalReasons.length > 0;
  const criticalReason = critical ? criticalReasons.join("; ") : null;

  let status: "green" | "yellow" | "red";
  if (critical) {
    status = "red";
    score = Math.min(score, 69);
  } else if (score >= 90) {
    status = "green";
  } else if (score >= 70) {
    status = "yellow";
  } else {
    status = "red";
  }

  return { score, status, critical, criticalReason };
}

function calcCronScore(cron: HealthChecks["cron"]): number {
  if (cron.runs_today === 0) return 0;
  if (cron.gap_minutes <= 10) return 100;
  if (cron.gap_minutes <= 30) return 80;
  if (cron.gap_minutes <= 60) return 60;
  if (cron.gap_minutes <= 120) return 30;
  return 10;
}

function calcHAScore(ha: HealthChecks["ha_connection"]): number {
  if (!ha.reachable && !ha.last_seen_at) return 0;
  if (ha.reachable && ha.downtime_minutes === 0) return 100;
  if (ha.downtime_minutes <= 10) return 90;
  if (ha.downtime_minutes <= 30) return 70;
  if (ha.downtime_minutes <= 60) return 50;
  return 20;
}

function calcDeviceScore(devices: HealthChecks["devices"]): number {
  if (devices.total === 0) return 100; // No devices to monitor
  return Math.round((devices.responsive / devices.total) * 100);
}

function calcSensorScore(sensors: HealthChecks["sensors"]): number {
  if (sensors.total === 0) return 100;
  return Math.round((sensors.fresh / sensors.total) * 100);
}

function calcDirectiveScore(directives: HealthChecks["directives"]): number {
  if (directives.total === 0) return 100;
  const successRate = directives.pushed / directives.total;
  return Math.round(successRate * 100);
}

function calcSyncScore(sync: HealthChecks["entity_sync"]): number {
  if (sync.total === 0) return 100;
  return Math.round((sync.synced / sync.total) * 100);
}

// ── Upsert daily health ────────────────────────────────────────────

interface UpdateParams {
  site_id: string;
  org_id: string;
  date: string; // YYYY-MM-DD
  ha_reachable?: boolean;
  zones_pushed?: number;
  zones_skipped?: number;
  zones_failed?: number;
}

export async function updateDailyHealth(
  supabase: SupabaseClient,
  params: UpdateParams
): Promise<void> {
  const { site_id, org_id, date } = params;

  // Fetch existing row
  const { data: existing } = await supabase
    .from("b_daily_health")
    .select("*")
    .eq("site_id", site_id)
    .eq("date", date)
    .maybeSingle();

  const checks: HealthChecks = existing?.checks
    ? { ...defaultChecks(), ...existing.checks }
    : defaultChecks();

  // Merge incremental updates from cron push
  const now = new Date().toISOString();

  // Update cron checks
  checks.cron.last_run_at = now;
  checks.cron.runs_today = (checks.cron.runs_today || 0) + 1;
  if (checks.cron.runs_today > 1 && existing?.checks?.cron?.last_run_at) {
    const lastRun = new Date(existing.checks.cron.last_run_at).getTime();
    const gap = Math.round((Date.now() - lastRun) / 60000);
    checks.cron.gap_minutes = Math.max(checks.cron.gap_minutes, gap);
  }

  // Update HA connection
  if (params.ha_reachable !== undefined) {
    checks.ha_connection.reachable = params.ha_reachable;
    if (params.ha_reachable) {
      checks.ha_connection.last_seen_at = now;
    } else {
      // Accumulate downtime (assume ~5 min between cron runs)
      checks.ha_connection.downtime_minutes += 5;
    }
  }

  // Update directive counts
  const totalZones = (params.zones_pushed || 0) + (params.zones_skipped || 0) + (params.zones_failed || 0);
  if (totalZones > 0) {
    checks.directives.total += totalZones;
    checks.directives.pushed += params.zones_pushed || 0;
    checks.directives.skipped += params.zones_skipped || 0;
    checks.directives.failed += params.zones_failed || 0;
  }

  // Calculate score
  const result = calculateScore(checks);

  // SLA tracking: breach if score < 70 for any day, warning if < 80
  const sla_breach = result.score < 70;
  const sla_warning = result.score < 80;

  const row = {
    site_id,
    org_id,
    date,
    overall_status: result.status,
    score: result.score,
    critical_failure: result.critical,
    critical_failure_reason: result.criticalReason,
    sla_warning,
    sla_breach,
    checks,
    last_computed_at: now,
    updated_at: now,
  };

  await supabase
    .from("b_daily_health")
    .upsert(row, { onConflict: "site_id,date" });
}
