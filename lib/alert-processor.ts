// lib/alert-processor.ts
import { SupabaseClient } from "@supabase/supabase-js";

interface AlertRule {
  id: string;
  org_id: string;
  name: string;
  trigger_type: string;
  trigger_conditions: {
    anomaly_types?: string[];
    severity?: string[];
    min_duration_min?: number;
  };
  scope_type: string;
  scope_ids: string[] | null;
  notify_channels: string[];
  notify_users: string[] | null;
  cooldown_min: number;
  auto_resolve: boolean;
}

interface AnomalyEvent {
  id: number;
  org_id: string;
  site_id: string;
  hvac_zone_id: string;
  equipment_id: string;
  anomaly_type: string;
  severity: string;
  started_at: string;
  ended_at: string | null;
  peak_value: number | null;
  trigger_snapshot: Record<string, any>;
}

// Generate human-readable alert message from anomaly context
function generateAlertMessage(anomaly: AnomalyEvent): { title: string; message: string } {
  const typeLabels: Record<string, string> = {
    coil_freeze: "Coil Freeze Detected",
    short_cycling: "Short Cycling Detected",
    long_cycle: "Long Compressor Cycle",
    filter_restriction: "Possible Filter Restriction",
    refrigerant_low: "Low Refrigerant Suspected",
    idle_heat_gain: "Idle Heat Gain",
    delayed_temp_response: "Delayed Temperature Response",
  };

  const snapshot = anomaly.trigger_snapshot || {};
  const typeLabel = typeLabels[anomaly.anomaly_type] || anomaly.anomaly_type;
  const severityTag = anomaly.severity === "critical" ? "[CRITICAL]" : anomaly.severity === "warning" ? "[WARNING]" : "[INFO]";
  const title = `${severityTag} ${typeLabel}`;

  // Build contextual message
  const parts: string[] = [];
  if (snapshot.zone_temp_f) parts.push(`Zone: ${snapshot.zone_temp_f}°F`);
  if (snapshot.supply_temp_f) parts.push(`Supply: ${snapshot.supply_temp_f}°F`);
  if (snapshot.delta_t_f) parts.push(`ΔT: ${snapshot.delta_t_f}°F`);
  if (snapshot.power_kw) parts.push(`Power: ${snapshot.power_kw} kW`);
  if (snapshot.current_a) parts.push(`Current: ${snapshot.current_a}A`);
  if (snapshot.cycle_count_1h) parts.push(`Cycles/hr: ${snapshot.cycle_count_1h}`);

  const message = parts.length
    ? `${typeLabel}. Conditions at detection: ${parts.join(", ")}.`
    : `${typeLabel} detected. Check equipment status.`;

  return { title, message };
}

// Main alert processor — call from cron after manageAnomalyEvents()
export async function processAlerts(
  supabase: SupabaseClient,
  orgId: string,
  activeAnomalyEvents: AnomalyEvent[]
): Promise<void> {
  try {
    // 1. Fetch enabled rules for this org
    const { data: rules, error: rulesErr } = await supabase
      .from("b_alert_rules")
      .select("*")
      .eq("org_id", orgId)
      .eq("enabled", true);

    if (rulesErr || !rules?.length) return;

    // 2. For each active anomaly event, check each rule
    for (const anomaly of activeAnomalyEvents) {
      for (const rule of rules as AlertRule[]) {
        // Check if rule applies to this anomaly type
        if (!matchesRule(rule, anomaly)) continue;

        // Check scope
        if (!matchesScope(rule, anomaly)) continue;

        // Check cooldown — has this rule already fired for this anomaly recently?
        const { data: recent } = await supabase
          .from("b_alert_notifications")
          .select("id, created_at")
          .eq("rule_id", rule.id)
          .eq("anomaly_event_id", anomaly.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (recent?.length) {
          const lastFired = new Date(recent[0].created_at).getTime();
          const cooldownMs = (rule.cooldown_min || 60) * 60 * 1000;
          if (Date.now() - lastFired < cooldownMs) continue; // Still in cooldown
        }

        // Fire the alert
        const { title, message } = generateAlertMessage(anomaly);

        const notification = {
          org_id: orgId,
          site_id: anomaly.site_id,
          rule_id: rule.id,
          anomaly_event_id: anomaly.id,
          title,
          message,
          severity: anomaly.severity,
          context: {
            anomaly_type: anomaly.anomaly_type,
            zone_id: anomaly.hvac_zone_id,
            equipment_id: anomaly.equipment_id,
            snapshot: anomaly.trigger_snapshot,
            peak_value: anomaly.peak_value,
          },
          status: "active",
          channels_sent: [] as string[],
        };

        // Insert dashboard notification
        const { data: inserted, error: insertErr } = await supabase
          .from("b_alert_notifications")
          .insert(notification)
          .select("id")
          .single();

        if (insertErr) {
          console.error(`[ALERT] Failed to create notification:`, insertErr);
          continue;
        }

        const channelsSent: string[] = ["dashboard"];

        // Send email if channel enabled
        if (rule.notify_channels.includes("email")) {
          try {
            await sendAlertEmail(supabase, rule, anomaly, title, message);
            channelsSent.push("email");
          } catch (emailErr) {
            console.error(`[ALERT] Email send failed:`, emailErr);
          }
        }

        // Send SMS if channel enabled (future: integrate Twilio)
        if (rule.notify_channels.includes("sms")) {
          // TODO: Twilio integration
          console.log(`[ALERT] SMS alert queued for rule ${rule.name}`);
        }

        // Update channels_sent
        if (inserted?.id) {
          await supabase
            .from("b_alert_notifications")
            .update({
              channels_sent: channelsSent,
              ...(channelsSent.includes("email") ? { email_sent_at: new Date().toISOString() } : {}),
            })
            .eq("id", inserted.id);
        }

        console.log(`[ALERT] Fired: "${title}" via ${channelsSent.join(", ")} (rule: ${rule.name})`);
      }
    }

    // 3. Auto-resolve notifications for closed anomaly events
    await autoResolveNotifications(supabase, orgId);

  } catch (err) {
    console.error("[ALERT] processAlerts error:", err);
  }
}

function matchesRule(rule: AlertRule, anomaly: AnomalyEvent): boolean {
  const conditions = rule.trigger_conditions;

  // Check anomaly type filter
  if (conditions.anomaly_types?.length) {
    if (!conditions.anomaly_types.includes(anomaly.anomaly_type)) return false;
  }

  // Check severity filter
  if (conditions.severity?.length) {
    if (!conditions.severity.includes(anomaly.severity)) return false;
  }

  // Check minimum duration (for rules that only fire after anomaly persists)
  if (conditions.min_duration_min) {
    const durationMs = Date.now() - new Date(anomaly.started_at).getTime();
    const durationMin = durationMs / 60000;
    if (durationMin < conditions.min_duration_min) return false;
  }

  return true;
}

function matchesScope(rule: AlertRule, anomaly: AnomalyEvent): boolean {
  if (rule.scope_type === "org") return true; // Applies to entire org
  if (!rule.scope_ids?.length) return true;

  if (rule.scope_type === "site") {
    return rule.scope_ids.includes(anomaly.site_id);
  }
  if (rule.scope_type === "zone") {
    return rule.scope_ids.includes(anomaly.hvac_zone_id);
  }
  return false;
}

// Auto-resolve dashboard notifications when anomaly closes
async function autoResolveNotifications(supabase: SupabaseClient, orgId: string): Promise<void> {
  // Find active notifications whose anomaly events have ended
  const { data: activeNotifs } = await supabase
    .from("b_alert_notifications")
    .select("id, anomaly_event_id, rule_id")
    .eq("org_id", orgId)
    .eq("status", "active")
    .not("anomaly_event_id", "is", null);

  if (!activeNotifs?.length) return;

  // Check which anomaly events have been resolved
  const anomalyIds = activeNotifs.map((n: any) => n.anomaly_event_id).filter(Boolean);
  const { data: resolvedAnomalies } = await supabase
    .from("b_anomaly_events")
    .select("id")
    .in("id", anomalyIds)
    .not("ended_at", "is", null);

  if (!resolvedAnomalies?.length) return;

  const resolvedIds = new Set(resolvedAnomalies.map((a: any) => a.id));

  // Get rules to check auto_resolve flag
  const ruleIds = [...new Set(activeNotifs.map((n: any) => n.rule_id))];
  const { data: rules } = await supabase
    .from("b_alert_rules")
    .select("id, auto_resolve")
    .in("id", ruleIds);

  const autoResolveRules = new Set((rules || []).filter((r: any) => r.auto_resolve).map((r: any) => r.id));

  // Resolve matching notifications
  for (const notif of activeNotifs as any[]) {
    if (resolvedIds.has(notif.anomaly_event_id) && autoResolveRules.has(notif.rule_id)) {
      await supabase
        .from("b_alert_notifications")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", notif.id);
    }
  }
}

// Email sender — uses existing email infrastructure
async function sendAlertEmail(
  supabase: SupabaseClient,
  rule: AlertRule,
  anomaly: AnomalyEvent,
  title: string,
  message: string
): Promise<void> {
  // Determine recipients
  let recipients = rule.notify_users;

  if (!recipients?.length) {
    // Fallback: fetch org admin emails
    const { data: orgUsers } = await supabase
      .from("a_org_users")
      .select("email")
      .eq("org_id", rule.org_id)
      .in("role", ["owner", "admin"]);

    recipients = (orgUsers || []).map((u: any) => u.email);
  }

  if (!recipients?.length) return;

  // TODO: Check b_user_notification_prefs for quiet hours

  // Queue the email via activity log for now
  // TODO: Replace with actual email send call (Resend/SES)
  for (const email of recipients) {
    await supabase.from("b_records_log").insert({
      org_id: rule.org_id,
      site_id: anomaly.site_id,
      event_type: "alert_email",
      message: `Alert email sent to ${email}: ${title}`,
      created_by: "system",
      details: {
        recipient: email,
        subject: `[Eagle Eyes] ${title}`,
        body: message,
        anomaly_event_id: anomaly.id,
        rule_id: rule.id,
      },
    });
  }
}
