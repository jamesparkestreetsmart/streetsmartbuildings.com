// lib/alert-evaluator.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { mapDefinitionToAlertTypeId } from "@/lib/alert-type-mapping";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AlertDefinition {
  id: string;
  org_id: string;
  name: string;
  severity: string;
  entity_type: string;        // 'sensor', 'derived', 'anomaly'
  entity_id: string | null;
  derived_metric: string | null;
  anomaly_type: string | null;
  condition_type: string;     // 'above_threshold', 'below_threshold', 'changes_to', 'stale', 'rate_of_change'
  threshold_value: number | null;
  target_value: string | null;
  target_value_type: string;
  stale_minutes: number | null;
  delta_value: number | null;
  delta_direction: string;
  window_minutes: number | null;
  sustain_minutes: number;
  resolved_dead_time_minutes: number;
  scope_level: string;
  scope_mode: string;
  scope_ids: string[] | null;
  eval_path: string;
  equipment_type: string | null;  // equipment_group value for type-level alerts
  sensor_role: string | null;     // sensor_type to find on each equipment
}

interface AlertOverride {
  override_id: string;
  org_id: string;
  alert_type_id: string;
  site_id: string | null;
  equipment_id: string | null;
  threshold_override: number | null;
  severity_override: string | null;
  cooldown_override: number | null;
  enabled: boolean;
}

interface EvalState {
  id: string;
  alert_def_id: string;
  target_level: string;
  target_id: string;
  condition_met: boolean;
  condition_true_since: string | null;
  fired: boolean;
  last_value: string | null;
  last_value_numeric: number | null;
  last_value_ts: string | null;
  window_values: { ts: string; value: number }[] | null;
  rolling_min: number | null;
  rolling_max: number | null;
  rolling_avg: number | null;
  rolling_count: number;
  last_evaluated_at: string;
  resolved_pending_since: string | null;
}

interface EvalResult {
  condition_met: boolean;
  value: string;
  value_numeric: number | null;
}

// ─── Realtime Evaluation (called from entity-sync webhook) ───────────────────

export async function evaluateRealtime(
  supabase: SupabaseClient,
  entityId: string,
  newValue: string,
  oldValue: string | null,
  orgId: string,
  siteId: string
): Promise<void> {
  try {
    // Find all enabled definitions that watch this entity
    const { data: definitions } = await supabase
      .from("b_alert_definitions")
      .select("*")
      .eq("org_id", orgId)
      .eq("enabled", true)
      .eq("entity_type", "sensor")
      .eq("entity_id", entityId)
      .in("eval_path", ["auto", "realtime"]);

    if (!definitions?.length) return;

    // Derive canonical alert_type_ids and prefetch overrides
    const defs = definitions as AlertDefinition[];
    const alertTypeIds = [...new Set(defs.map(mapDefinitionToAlertTypeId).filter(Boolean))] as string[];
    const overrides = await fetchOverridesByAlertType(supabase, orgId, alertTypeIds);

    for (const def of defs) {
      // Check scope
      if (!matchesScope(def, siteId, null, null)) continue;

      // For auto eval_path, only process threshold and changes_to in realtime
      if (def.eval_path === "auto" &&
          !["above_threshold", "below_threshold", "changes_to"].includes(def.condition_type)) {
        continue;
      }

      // Resolve overrides by canonical alert_type_id (equipment > site > org)
      const canonicalTypeId = mapDefinitionToAlertTypeId(def);
      const override = resolveOverride(overrides, canonicalTypeId, siteId, null);
      if (override && !override.enabled) continue; // Silenced — skip

      const effectiveDef = applyOverride(def, override);

      const targetLevel = "entity";
      const targetId = entityId;

      // Evaluate the condition
      const result = evaluateCondition(effectiveDef, newValue, oldValue);

      // Get or create eval state
      const evalState = await getOrCreateEvalState(supabase, def.id, targetLevel, targetId);

      // Process the result
      await processEvalResult(supabase, effectiveDef, evalState, result, targetLevel, targetId, siteId);
    }
  } catch (err) {
    console.error("[ALERT-EVAL] Realtime evaluation error:", err);
  }
}

// ─── Cron Evaluation (called from zone-setpoint-logger) ──────────────────────

export async function evaluateCron(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  try {
    // Fetch all enabled definitions for this org that use cron evaluation
    const { data: definitions } = await supabase
      .from("b_alert_definitions")
      .select("*")
      .eq("org_id", orgId)
      .eq("enabled", true);

    if (!definitions?.length) return;

    // Derive canonical alert_type_ids and prefetch overrides
    const defs = definitions as AlertDefinition[];
    const alertTypeIds = [...new Set(defs.map(mapDefinitionToAlertTypeId).filter(Boolean))] as string[];
    const overrides = await fetchOverridesByAlertType(supabase, orgId, alertTypeIds);

    for (const def of defs) {
      // Skip realtime-only definitions
      if (def.eval_path === "realtime") continue;

      // For auto path: skip threshold/changes_to for sensors (handled by realtime)
      if (def.eval_path === "auto" &&
          def.entity_type === "sensor" &&
          ["above_threshold", "below_threshold", "changes_to"].includes(def.condition_type)) {
        if (def.condition_type !== "stale") continue;
      }

      // Get targets based on scope
      const targets = await getTargetsForDefinition(supabase, def);

      for (const target of targets) {
        // Resolve overrides by canonical alert_type_id for this target (equipment > site > org)
        const canonicalTypeId = mapDefinitionToAlertTypeId(def);
        const equipmentId = target.level === "entity" ? null : null; // entity targets don't have equipment_id directly
        const override = resolveOverride(overrides, canonicalTypeId, target.site_id, equipmentId);
        if (override && !override.enabled) continue; // Silenced — skip

        const effectiveDef = applyOverride(def, override);

        // Get current value for this target
        const currentValue = await getCurrentValue(supabase, effectiveDef, target);
        if (currentValue === null && effectiveDef.condition_type !== "stale") {
          console.warn(
            `[alert-eval] Null sensor value for non-stale alert "${def.name}" (${def.id}), ` +
            `target=${target.id} (${target.level}), condition=${effectiveDef.condition_type} — skipping evaluation`
          );

          // Write structured record unless a stale alert already covers this target
          try {
            const { data: existingStale } = await supabase
              .from("b_alert_instances")
              .select("id")
              .eq("target_level", target.level)
              .eq("target_id", target.id)
              .eq("status", "active")
              .limit(1)
              .maybeSingle();

            // Only if no active alert instance already flags this target
            if (!existingStale) {
              await supabase.from("b_records_log").insert({
                org_id: def.org_id,
                site_id: target.site_id || null,
                event_type: "sensor_eval_skipped",
                event_date: new Date().toISOString().split("T")[0],
                message: `Sensor value unavailable for alert "${def.name}" — evaluation skipped`,
                source: "alert_evaluator",
                created_by: "system",
                details: {
                  alert_def_id: def.id,
                  target_level: target.level,
                  target_id: target.id,
                  condition_type: effectiveDef.condition_type,
                  entity_type: def.entity_type,
                },
              });
            }
          } catch (logErr) {
            console.error("[alert-eval] Failed to log sensor_eval_skipped:", logErr);
          }

          continue;
        }

        // Get eval state
        const evalState = await getOrCreateEvalState(
          supabase, def.id, target.level, target.id
        );

        // For stale check: use last_value_ts from eval state
        if (effectiveDef.condition_type === "stale") {
          const result = evaluateStale(effectiveDef, evalState);
          await processEvalResult(
            supabase, effectiveDef, evalState, result, target.level, target.id, target.site_id
          );
          continue;
        }

        // For rate_of_change: update rolling window
        if (effectiveDef.condition_type === "rate_of_change" && currentValue !== null) {
          const result = evaluateRateOfChange(effectiveDef, evalState, currentValue);
          await processEvalResult(
            supabase, effectiveDef, evalState, result, target.level, target.id, target.site_id
          );
          continue;
        }

        // Standard threshold/changes_to evaluation
        const result = evaluateCondition(effectiveDef, currentValue!, evalState.last_value);
        await processEvalResult(
          supabase, effectiveDef, evalState, result, target.level, target.id, target.site_id
        );
      }
    }

    // Process repeats for active instances
    await processRepeats(supabase, orgId);

  } catch (err) {
    console.error("[ALERT-EVAL] Cron evaluation error:", err);
  }
}

// ─── Condition Evaluation ────────────────────────────────────────────────────

function evaluateCondition(
  def: AlertDefinition,
  currentValue: string,
  previousValue: string | null
): EvalResult {
  const numericValue = parseFloat(currentValue);
  const isNumeric = !isNaN(numericValue);

  switch (def.condition_type) {
    case "above_threshold":
      return {
        condition_met: isNumeric && def.threshold_value !== null && numericValue > def.threshold_value,
        value: currentValue,
        value_numeric: isNumeric ? numericValue : null,
      };

    case "below_threshold":
      return {
        condition_met: isNumeric && def.threshold_value !== null && numericValue < def.threshold_value,
        value: currentValue,
        value_numeric: isNumeric ? numericValue : null,
      };

    case "changes_to": {
      if (!def.target_value) return { condition_met: false, value: currentValue, value_numeric: null };

      let matched = false;
      if (def.target_value_type === "numeric") {
        matched = isNumeric && numericValue === parseFloat(def.target_value);
      } else if (def.target_value_type === "boolean") {
        matched = currentValue.toLowerCase() === def.target_value.toLowerCase();
      } else {
        matched = currentValue === def.target_value;
      }

      // Only fire on CHANGE (wasn't this value before, now it is)
      const wasAlreadyTarget = previousValue === def.target_value;
      return {
        condition_met: matched && !wasAlreadyTarget,
        value: currentValue,
        value_numeric: isNumeric ? numericValue : null,
      };
    }

    default:
      return { condition_met: false, value: currentValue, value_numeric: null };
  }
}

function evaluateStale(def: AlertDefinition, evalState: EvalState): EvalResult {
  if (!def.stale_minutes || !evalState.last_value_ts) {
    return { condition_met: false, value: "unknown", value_numeric: null };
  }

  const lastUpdate = new Date(evalState.last_value_ts).getTime();
  const staleDuration = (Date.now() - lastUpdate) / 60000;

  return {
    condition_met: staleDuration >= def.stale_minutes,
    value: `${Math.round(staleDuration)} min since last update`,
    value_numeric: staleDuration,
  };
}

function evaluateRateOfChange(
  def: AlertDefinition,
  evalState: EvalState,
  currentValue: string
): EvalResult {
  const numericValue = parseFloat(currentValue);
  if (isNaN(numericValue) || !def.delta_value || !def.window_minutes) {
    return { condition_met: false, value: currentValue, value_numeric: null };
  }

  const windowValues = evalState.window_values || [];
  const now = new Date();
  const windowStart = new Date(now.getTime() - def.window_minutes * 60000);

  // Add current value and trim to window
  const updatedValues = [
    ...windowValues.filter((v) => new Date(v.ts) >= windowStart),
    { ts: now.toISOString(), value: numericValue },
  ];

  if (updatedValues.length < 2) {
    return { condition_met: false, value: currentValue, value_numeric: numericValue };
  }

  const oldest = updatedValues[0];
  const delta = numericValue - oldest.value;
  const absDelta = Math.abs(delta);

  let condition_met = absDelta >= def.delta_value;

  if (condition_met && def.delta_direction !== "any") {
    if (def.delta_direction === "increase") condition_met = delta > 0;
    if (def.delta_direction === "decrease") condition_met = delta < 0;
  }

  return {
    condition_met,
    value: currentValue,
    value_numeric: numericValue,
  };
}

// ─── Eval State Management ───────────────────────────────────────────────────

async function getOrCreateEvalState(
  supabase: SupabaseClient,
  defId: string,
  targetLevel: string,
  targetId: string
): Promise<EvalState> {
  const { data: existing } = await supabase
    .from("b_alert_eval_state")
    .select("*")
    .eq("alert_def_id", defId)
    .eq("target_level", targetLevel)
    .eq("target_id", targetId)
    .single();

  if (existing) return existing as EvalState;

  const { data: created } = await supabase
    .from("b_alert_eval_state")
    .insert({
      alert_def_id: defId,
      target_level: targetLevel,
      target_id: targetId,
      condition_met: false,
      fired: false,
      rolling_count: 0,
    })
    .select()
    .single();

  return created as EvalState;
}

// ─── Process Evaluation Result ───────────────────────────────────────────────

async function processEvalResult(
  supabase: SupabaseClient,
  def: AlertDefinition,
  evalState: EvalState,
  result: EvalResult,
  targetLevel: string,
  targetId: string,
  siteId: string | null
): Promise<void> {
  const now = new Date().toISOString();

  const stateUpdate: Record<string, any> = {
    last_value: result.value,
    last_value_numeric: result.value_numeric,
    last_value_ts: now,
    last_evaluated_at: now,
  };

  if (result.condition_met) {
    if (!evalState.condition_met) {
      // ─── Transition: FALSE → TRUE
      stateUpdate.condition_met = true;
      stateUpdate.condition_true_since = now;
      stateUpdate.fired = false;
      stateUpdate.resolved_pending_since = null; // Clear any pending resolve

      if (def.sustain_minutes <= 0) {
        stateUpdate.fired = true;
        await fireAlert(supabase, def, targetLevel, targetId, siteId, result);
      }
    } else if (!evalState.fired && evalState.condition_true_since) {
      // ─── Condition still TRUE, check sustain
      const sustainedMs = Date.now() - new Date(evalState.condition_true_since).getTime();
      const sustainedMin = sustainedMs / 60000;

      if (sustainedMin >= def.sustain_minutes) {
        stateUpdate.fired = true;
        await fireAlert(supabase, def, targetLevel, targetId, siteId, result);
      }
    } else if (evalState.fired) {
      // ─── Already fired, update peak values on instance
      // If condition re-fires during dead time, cancel the pending resolve
      if (evalState.resolved_pending_since) {
        stateUpdate.resolved_pending_since = null;
        console.log(`[ALERT] Dead time cancelled: "${def.name}" — condition re-fired`);
      }
      await updateActiveInstance(supabase, def.id, targetLevel, targetId, result);
    }
  } else {
    if (evalState.condition_met) {
      // ─── Transition: TRUE → FALSE
      const deadTime = def.resolved_dead_time_minutes || 0;

      if (deadTime <= 0) {
        // Immediate resolve (existing behavior)
        stateUpdate.condition_met = false;
        stateUpdate.condition_true_since = null;
        stateUpdate.fired = false;
        stateUpdate.resolved_pending_since = null;
        await resolveAlert(supabase, def, targetLevel, targetId);
      } else if (!evalState.resolved_pending_since) {
        // Start dead time — keep alert active, mark pending
        stateUpdate.resolved_pending_since = now;
        console.log(`[ALERT] Dead time started: "${def.name}" — ${deadTime}min before resolve`);
      } else {
        // Dead time already started — check if elapsed
        const pendingMs = Date.now() - new Date(evalState.resolved_pending_since).getTime();
        const pendingMin = pendingMs / 60000;

        if (pendingMin >= deadTime) {
          // Dead time elapsed — resolve
          stateUpdate.condition_met = false;
          stateUpdate.condition_true_since = null;
          stateUpdate.fired = false;
          stateUpdate.resolved_pending_since = null;
          await resolveAlert(supabase, def, targetLevel, targetId);
          console.log(`[ALERT] Dead time elapsed: "${def.name}" — resolved after ${deadTime}min`);
        }
        // Otherwise keep waiting
      }
    }
  }

  await supabase
    .from("b_alert_eval_state")
    .update(stateUpdate)
    .eq("id", evalState.id);
}

// ─── Fire Alert ──────────────────────────────────────────────────────────────

async function fireAlert(
  supabase: SupabaseClient,
  def: AlertDefinition,
  targetLevel: string,
  targetId: string,
  siteId: string | null,
  result: EvalResult
): Promise<void> {
  const targetName = await resolveTargetName(supabase, targetLevel, targetId);

  const { data: instance, error } = await supabase
    .from("b_alert_instances")
    .insert({
      org_id: def.org_id,
      alert_def_id: def.id,
      target_level: targetLevel,
      target_id: targetId,
      target_name: targetName,
      status: "active",
      first_detected_at: new Date().toISOString(),
      fired_at: new Date().toISOString(),
      trigger_value: result.value,
      trigger_value_numeric: result.value_numeric,
      peak_value: result.value_numeric,
      last_value: result.value_numeric,
      last_evaluated_at: new Date().toISOString(),
      context: {
        alert_name: def.name,
        entity_type: def.entity_type,
        entity_id: def.entity_id,
        derived_metric: def.derived_metric,
        anomaly_type: def.anomaly_type,
        condition_type: def.condition_type,
        threshold_value: def.threshold_value,
        target_value: def.target_value,
        delta_value: def.delta_value,
        site_id: siteId,
      },
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return; // Unique constraint — already active
    console.error("[ALERT-EVAL] Failed to create instance:", error);
    return;
  }

  if (!instance) return;

  console.log(`[ALERT] FIRED: "${def.name}" — ${targetName} (${result.value})`);

  await dispatchNotifications(supabase, def, instance.id, "fired", targetName, result);
}

// ─── Resolve Alert ───────────────────────────────────────────────────────────

async function resolveAlert(
  supabase: SupabaseClient,
  def: AlertDefinition,
  targetLevel: string,
  targetId: string
): Promise<void> {
  const { data: instance } = await supabase
    .from("b_alert_instances")
    .select("id, fired_at")
    .eq("alert_def_id", def.id)
    .eq("target_level", targetLevel)
    .eq("target_id", targetId)
    .eq("status", "active")
    .single();

  if (!instance) return;

  const resolvedAt = new Date();
  const firedAt = new Date(instance.fired_at);
  const durationMin = (resolvedAt.getTime() - firedAt.getTime()) / 60000;

  await supabase
    .from("b_alert_instances")
    .update({
      status: "resolved",
      resolved_at: resolvedAt.toISOString(),
      duration_min: Math.round(durationMin * 10) / 10,
    })
    .eq("id", instance.id);

  console.log(`[ALERT] RESOLVED: "${def.name}" after ${durationMin.toFixed(1)} min`);

  await dispatchNotifications(supabase, def, instance.id, "resolved", null, null);
}

// ─── Update Active Instance (peak tracking) ──────────────────────────────────

async function updateActiveInstance(
  supabase: SupabaseClient,
  defId: string,
  targetLevel: string,
  targetId: string,
  result: EvalResult
): Promise<void> {
  if (result.value_numeric === null) return;

  const { data: instance } = await supabase
    .from("b_alert_instances")
    .select("id, peak_value")
    .eq("alert_def_id", defId)
    .eq("target_level", targetLevel)
    .eq("target_id", targetId)
    .eq("status", "active")
    .single();

  if (instance) {
    const newPeak = Math.max(instance.peak_value || 0, Math.abs(result.value_numeric));
    await supabase
      .from("b_alert_instances")
      .update({
        peak_value: newPeak,
        last_value: result.value_numeric,
        last_evaluated_at: new Date().toISOString(),
      })
      .eq("id", instance.id);
  }
}

// ─── Dispatch Notifications ──────────────────────────────────────────────────

async function dispatchNotifications(
  supabase: SupabaseClient,
  def: AlertDefinition,
  instanceId: number,
  notificationType: "fired" | "repeat" | "resolved",
  targetName: string | null,
  result: EvalResult | null
): Promise<void> {
  const { data: subscriptions } = await supabase
    .from("b_alert_subscriptions")
    .select("*")
    .eq("alert_def_id", def.id)
    .eq("enabled", true);

  if (!subscriptions?.length) {
    // No subscribers — still create a dashboard notification for org visibility
    const { title, message } = buildNotificationContent(def, notificationType, targetName, result);
    await supabase.from("b_alert_notifications").insert({
      org_id: def.org_id,
      instance_id: instanceId,
      subscription_id: null,
      channel: "dashboard",
      notification_type: notificationType,
      title,
      message,
      severity: def.severity,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
    return;
  }

  for (const sub of subscriptions) {
    if (notificationType === "resolved" && !sub.send_resolved) continue;
    if (isInQuietHours(sub)) continue;

    const { title, message } = buildNotificationContent(def, notificationType, targetName, result);

    if (sub.dashboard_enabled) {
      await supabase.from("b_alert_notifications").insert({
        org_id: def.org_id,
        instance_id: instanceId,
        subscription_id: sub.id,
        channel: "dashboard",
        notification_type: notificationType,
        recipient_user_id: sub.user_id,
        title,
        message,
        severity: def.severity,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    }

    if (sub.email_enabled) {
      await createEmailDelivery(supabase, def, sub, instanceId, notificationType, title, message);
    }

    if (sub.sms_enabled) {
      await createSmsDelivery(supabase, def, sub, instanceId, notificationType, title, message);
    }
  }
}

// ─── Repeat Processing ───────────────────────────────────────────────────────

async function processRepeats(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  const { data: activeInstances } = await supabase
    .from("b_alert_instances")
    .select("id, alert_def_id, target_level, target_id, target_name, last_value")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (!activeInstances?.length) return;

  for (const instance of activeInstances) {
    const { data: repeatSubs } = await supabase
      .from("b_alert_subscriptions")
      .select("*")
      .eq("alert_def_id", instance.alert_def_id)
      .eq("enabled", true)
      .eq("repeat_enabled", true);

    if (!repeatSubs?.length) continue;

    const { data: def } = await supabase
      .from("b_alert_definitions")
      .select("*")
      .eq("id", instance.alert_def_id)
      .single();

    if (!def) continue;

    for (const sub of repeatSubs) {
      // Check max_repeats
      if (sub.max_repeats !== null) {
        const { count } = await supabase
          .from("b_alert_notifications")
          .select("id", { count: "exact", head: true })
          .eq("instance_id", instance.id)
          .eq("subscription_id", sub.id)
          .eq("notification_type", "repeat");

        if ((count || 0) >= sub.max_repeats) continue;
      }

      // Check repeat interval
      const { data: lastNotif } = await supabase
        .from("b_alert_notifications")
        .select("created_at, repeat_number")
        .eq("instance_id", instance.id)
        .eq("subscription_id", sub.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (lastNotif?.length) {
        const lastSent = new Date(lastNotif[0].created_at).getTime();
        const intervalMs = (sub.repeat_interval_min || 60) * 60 * 1000;
        if (Date.now() - lastSent < intervalMs) continue;
      }

      const repeatNumber = (lastNotif?.[0]?.repeat_number || 0) + 1;
      const { title, message } = buildNotificationContent(
        def as AlertDefinition, "repeat", instance.target_name, null
      );

      const channels = [];
      if (sub.dashboard_enabled) channels.push("dashboard");
      if (sub.email_enabled) channels.push("email");
      if (sub.sms_enabled) channels.push("sms");

      for (const channel of channels) {
        if (isInQuietHours(sub) && channel !== "dashboard") continue;

        await supabase.from("b_alert_notifications").insert({
          org_id: def.org_id,
          instance_id: instance.id,
          subscription_id: sub.id,
          channel,
          notification_type: "repeat",
          recipient_user_id: sub.user_id,
          title: `[Repeat #${repeatNumber}] ${title}`,
          message,
          severity: def.severity,
          status: channel === "dashboard" ? "sent" : "pending",
          sent_at: channel === "dashboard" ? new Date().toISOString() : null,
          repeat_number: repeatNumber,
        });
      }
    }
  }
}

// ─── Override Resolution ─────────────────────────────────────────────────────

// TODO: Overrides will later map from alert definitions to canonical
// `library_alert_types.alert_type_id` values (e.g. high_temperature, short_cycling).
// Stubbed to return [] while the override architecture is being reworked.
async function fetchOverrides(
  _supabase: SupabaseClient,
  _defIds: string[]
): Promise<AlertOverride[]> {
  return [];
}

/**
 * Fetches overrides from b_alert_overrides scoped to org + canonical alert_type_ids.
 * Only pulls rows relevant to the current evaluation batch.
 */
async function fetchOverridesByAlertType(
  supabase: SupabaseClient,
  orgId: string,
  alertTypeIds: string[]
): Promise<AlertOverride[]> {
  if (alertTypeIds.length === 0) return [];
  const { data, error } = await supabase
    .from("b_alert_overrides")
    .select("override_id, org_id, alert_type_id, site_id, equipment_id, threshold_override, severity_override, cooldown_override, enabled")
    .eq("org_id", orgId)
    .in("alert_type_id", alertTypeIds);
  if (error) {
    console.error("[fetchOverridesByAlertType] query failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }
  return (data || []) as AlertOverride[];
}

function resolveOverride(
  overrides: AlertOverride[],
  alertTypeId: string | null,
  siteId: string | null,
  equipmentId: string | null
): AlertOverride | null {
  if (!alertTypeId) return null;
  const typeOverrides = overrides.filter((o) => o.alert_type_id === alertTypeId);
  if (typeOverrides.length === 0) return null;

  // Most specific wins: equipment > site > org
  if (equipmentId) {
    const equipMatch = typeOverrides.find((o) => o.equipment_id === equipmentId);
    if (equipMatch) return equipMatch;
  }
  if (siteId) {
    const siteMatch = typeOverrides.find((o) => o.site_id === siteId && !o.equipment_id);
    if (siteMatch) return siteMatch;
  }
  // Org-level: no site_id, no equipment_id
  const orgMatch = typeOverrides.find((o) => !o.site_id && !o.equipment_id);
  return orgMatch || null;
}

function applyOverride(
  def: AlertDefinition,
  override: AlertOverride | null
): AlertDefinition {
  if (!override) return def;
  return {
    ...def,
    threshold_value: override.threshold_override ?? def.threshold_value,
    severity: override.severity_override ?? def.severity,
    // cooldown_override maps to resolved_dead_time_minutes on the definition
    resolved_dead_time_minutes: override.cooldown_override ?? def.resolved_dead_time_minutes,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function matchesScope(
  def: AlertDefinition,
  siteId: string | null,
  equipmentId: string | null,
  zoneId: string | null
): boolean {
  if (def.scope_mode === "all") return true;

  // Empty include list = unassigned definition → evaluate nothing
  if (def.scope_mode === "include" && (!def.scope_ids || def.scope_ids.length === 0)) return false;

  // Empty exclude list = exclude nothing → evaluate everything
  if (def.scope_mode === "exclude" && (!def.scope_ids || def.scope_ids.length === 0)) return true;

  let targetId: string | null = null;
  if (def.scope_level === "site") targetId = siteId;
  if (def.scope_level === "equipment") targetId = equipmentId;
  if (def.scope_level === "zone") targetId = zoneId;

  if (!targetId) return false;

  const isInList = def.scope_ids!.includes(targetId);
  return def.scope_mode === "include" ? isInList : !isInList;
}

async function getTargetsForDefinition(
  supabase: SupabaseClient,
  def: AlertDefinition
): Promise<{ level: string; id: string; site_id: string }[]> {
  // Specific sensor entity
  if (def.entity_type === "sensor" && def.entity_id) {
    const { data: sensor } = await supabase
      .from("b_entity_sync")
      .select("entity_id, site_id")
      .eq("entity_id", def.entity_id)
      .single();

    if (sensor) {
      return [{ level: "entity", id: sensor.entity_id, site_id: sensor.site_id }];
    }
    return [];
  }

  // Equipment-type alert: find sensors matching sensor_role on all equipment of this type
  if (def.entity_type === "sensor" && !def.entity_id && def.equipment_type && def.sensor_role) {
    let eqQuery = supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name, site_id")
      .eq("org_id", def.org_id)
      .eq("equipment_group", def.equipment_type);

    const { data: equipment } = await eqQuery;
    if (!equipment?.length) return [];

    const targets: { level: string; id: string; site_id: string }[] = [];

    for (const equip of equipment) {
      // Check scope filter
      if (!matchesScope(def, equip.site_id, equip.equipment_id, null)) continue;

      const { data: sensor } = await supabase
        .from("a_sensors")
        .select("entity_id")
        .eq("equipment_id", equip.equipment_id)
        .eq("sensor_type", def.sensor_role)
        .limit(1)
        .maybeSingle();

      if (sensor?.entity_id) {
        targets.push({
          level: "entity",
          id: sensor.entity_id,
          site_id: equip.site_id,
        });
      }
    }
    return targets;
  }

  // For derived/anomaly: targets are zones
  const { data: zones } = await supabase
    .from("a_hvac_zones")
    .select("hvac_zone_id, site_id")
    .eq("org_id", def.org_id);

  if (!zones?.length) return [];

  return zones
    .filter((z: any) => matchesScope(def, z.site_id, null, z.hvac_zone_id))
    .map((z: any) => ({
      level: "zone",
      id: z.hvac_zone_id,
      site_id: z.site_id,
    }));
}

async function getCurrentValue(
  supabase: SupabaseClient,
  def: AlertDefinition,
  target: { level: string; id: string; site_id: string }
): Promise<string | null> {
  // For sensor entities (specific or resolved from equipment-type)
  if (def.entity_type === "sensor") {
    const entityId = def.entity_id || (target.level === "entity" ? target.id : null);
    if (!entityId) return null;
    const { data } = await supabase
      .from("b_entity_sync")
      .select("last_state")
      .eq("entity_id", entityId)
      .single();
    return data?.last_state || null;
  }

  if (def.entity_type === "derived" && def.derived_metric) {
    const { data } = await supabase
      .from("b_zone_setpoint_log")
      .select(def.derived_metric)
      .eq("hvac_zone_id", target.id)
      .order("logged_at", { ascending: false })
      .limit(1)
      .single();

    return data?.[def.derived_metric as keyof typeof data]?.toString() || null;
  }

  if (def.entity_type === "anomaly" && def.anomaly_type) {
    const { data } = await supabase
      .from("b_anomaly_events")
      .select("id")
      .eq("hvac_zone_id", target.id)
      .eq("anomaly_type", def.anomaly_type)
      .is("ended_at", null)
      .limit(1);

    return data?.length ? "true" : "false";
  }

  return null;
}

async function resolveTargetName(
  supabase: SupabaseClient,
  targetLevel: string,
  targetId: string
): Promise<string> {
  try {
    if (targetLevel === "entity") {
      const { data } = await supabase
        .from("a_sensors")
        .select("label")
        .eq("entity_id", targetId)
        .limit(1)
        .single();
      return data?.label || targetId;
    }
    if (targetLevel === "zone") {
      const { data } = await supabase
        .from("a_hvac_zones")
        .select("name")
        .eq("hvac_zone_id", targetId)
        .single();
      return data?.name || targetId;
    }
    if (targetLevel === "site") {
      const { data } = await supabase
        .from("a_sites")
        .select("site_name")
        .eq("site_id", targetId)
        .single();
      return data?.site_name || targetId;
    }
  } catch {}
  return targetId;
}

function buildNotificationContent(
  def: AlertDefinition,
  notificationType: string,
  targetName: string | null,
  result: EvalResult | null
): { title: string; message: string } {
  const severityTag = def.severity === "critical" ? "[CRITICAL]" : def.severity === "warning" ? "[WARNING]" : "[INFO]";
  const target = targetName || "Unknown target";

  if (notificationType === "resolved") {
    return {
      title: `Resolved: ${def.name} — ${target}`,
      message: `The "${def.name}" alert has been resolved.`,
    };
  }

  let conditionText = "";
  if (def.condition_type === "above_threshold") {
    conditionText = `exceeded ${def.threshold_value}`;
    if (result?.value_numeric !== null && result?.value_numeric !== undefined) {
      conditionText += ` (current: ${result.value_numeric})`;
    }
  } else if (def.condition_type === "below_threshold") {
    conditionText = `dropped below ${def.threshold_value}`;
    if (result?.value_numeric !== null && result?.value_numeric !== undefined) {
      conditionText += ` (current: ${result.value_numeric})`;
    }
  } else if (def.condition_type === "changes_to") {
    conditionText = `changed to "${def.target_value}"`;
  } else if (def.condition_type === "stale") {
    conditionText = `no data for ${def.stale_minutes}+ minutes`;
  } else if (def.condition_type === "rate_of_change") {
    conditionText = `changed by ${def.delta_value} within ${def.window_minutes} min`;
  }

  return {
    title: `${severityTag} ${def.name} — ${target}`,
    message: `${def.name}: ${conditionText}.`,
  };
}

function isInQuietHours(sub: any): boolean {
  if (!sub.quiet_hours_override || !sub.quiet_start || !sub.quiet_end) return false;

  const tz = sub.timezone || "America/Chicago";
  try {
    const now = new Date().toLocaleTimeString("en-US", { timeZone: tz, hour12: false });
    const currentMinutes = parseInt(now.split(":")[0]) * 60 + parseInt(now.split(":")[1]);

    const [startH, startM] = sub.quiet_start.split(":").map(Number);
    const [endH, endM] = sub.quiet_end.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch {
    return false;
  }
}

async function createEmailDelivery(
  supabase: SupabaseClient,
  def: AlertDefinition,
  sub: any,
  instanceId: number,
  notificationType: string,
  title: string,
  message: string
): Promise<void> {
  // Always resolve email from auth profile
  const { data: user } = await supabase.auth.admin.getUserById(sub.user_id);
  const email = user?.user?.email || null;
  if (!email) return;

  await supabase.from("b_alert_notifications").insert({
    org_id: def.org_id,
    instance_id: instanceId,
    subscription_id: sub.id,
    channel: "email",
    notification_type: notificationType,
    recipient_user_id: sub.user_id,
    recipient_address: email,
    title,
    message,
    severity: def.severity,
    status: "pending",
  });
}

async function createSmsDelivery(
  supabase: SupabaseClient,
  def: AlertDefinition,
  sub: any,
  instanceId: number,
  notificationType: string,
  title: string,
  message: string
): Promise<void> {
  // Always resolve phone from user profile
  const { data: userRow } = await supabase
    .from("a_users")
    .select("phone_number")
    .eq("user_id", sub.user_id)
    .single();
  const phone = userRow?.phone_number || null;
  if (!phone) return;

  await supabase.from("b_alert_notifications").insert({
    org_id: def.org_id,
    instance_id: instanceId,
    subscription_id: sub.id,
    channel: "sms",
    notification_type: notificationType,
    recipient_user_id: sub.user_id,
    recipient_address: phone,
    title,
    message,
    severity: def.severity,
    status: "pending",
  });
}
