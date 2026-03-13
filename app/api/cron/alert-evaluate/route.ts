// app/api/cron/alert-evaluate/route.ts
// Evaluates enabled alert definitions against active alert instances,
// then queues SMS notifications for qualifying subscribers.

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface AlertDefinition {
  id: string;
  org_id: string;
  name: string;
  severity: string;
  entity_type: string;
  entity_id: string | null;
  anomaly_type: string;
  condition_type: string;
  threshold_value: number | null;
  sustain_minutes: number | null;
  scope_level: string;
  scope_mode: string | null;
  scope_ids: string[] | null;
  equipment_type: string | null;
  sensor_role: string | null;
  enabled: boolean;
}

interface AlertInstance {
  id: number;
  org_id: string;
  alert_def_id: string;
  status: string;
  severity: string;
  trigger_value: number | null;
  target_name: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

interface Subscription {
  id: string;
  alert_def_id: string;
  user_id: string;
  sms_enabled: boolean;
}

interface UserNotifPrefs {
  user_id: string;
  sms_enabled: boolean;
  quiet_start: string | null; // e.g. "22:00"
  quiet_end: string | null;   // e.g. "07:00"
  timezone: string | null;
}

interface UserPhone {
  user_id: string;
  phone_number: string;
}

async function handler() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const result = await evaluateAlerts(supabase);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ALERT-EVALUATE] Fatal error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function evaluateAlerts(supabase: SupabaseClient): Promise<{
  orgs_checked: number;
  definitions_evaluated: number;
  notifications_queued: number;
}> {
  let definitionsEvaluated = 0;
  let notificationsQueued = 0;

  // 1. Fetch all enabled alert definitions, grouped by org
  const { data: definitions, error: defErr } = await supabase
    .from("b_alert_definitions")
    .select("*")
    .eq("enabled", true)
    .order("org_id");

  if (defErr) {
    console.error("[ALERT-EVALUATE] Failed to fetch definitions:", defErr);
    return { orgs_checked: 0, definitions_evaluated: 0, notifications_queued: 0 };
  }

  console.log(`[DEBUG] Fetched ${definitions?.length ?? 0} enabled definitions`);
  if (!definitions?.length) {
    console.log("[DEBUG] No enabled definitions found — returning early");
    return { orgs_checked: 0, definitions_evaluated: 0, notifications_queued: 0 };
  }

  // Group definitions by org
  const byOrg = new Map<string, AlertDefinition[]>();
  for (const def of definitions as AlertDefinition[]) {
    const list = byOrg.get(def.org_id) || [];
    list.push(def);
    byOrg.set(def.org_id, list);
  }

  // 2. Process each org
  for (const [orgId, orgDefs] of byOrg) {
    const defIds = orgDefs.map((d) => d.id);

    // Fetch active/unresolved alert instances matching these definitions
    const { data: instances, error: instErr } = await supabase
      .from("b_alert_instances")
      .select("*")
      .eq("org_id", orgId)
      .in("alert_def_id", defIds)
      .in("status", ["active", "unresolved"]);

    if (instErr) {
      console.error(`[ALERT-EVALUATE] Failed to fetch instances for org ${orgId}:`, instErr);
      continue;
    }

    console.log(`[DEBUG] Org ${orgId}: fetched ${instances?.length ?? 0} active/unresolved instances`);
    if (instances?.length) {
      console.log(`[DEBUG] Instance alert_def_ids:`, (instances as AlertInstance[]).map(i => i.alert_def_id));
    }
    if (!instances?.length) {
      console.log(`[DEBUG] Org ${orgId}: SKIP — no active instances, marking ${orgDefs.length} defs as evaluated`);
      definitionsEvaluated += orgDefs.length;
      continue;
    }

    // Build a map of definition_id -> instances
    const instancesByDef = new Map<string, AlertInstance[]>();
    for (const inst of instances as AlertInstance[]) {
      const list = instancesByDef.get(inst.alert_def_id) || [];
      list.push(inst);
      instancesByDef.set(inst.alert_def_id, list);
    }

    // Fetch subscriptions for these definitions where sms_enabled
    const { data: subscriptionsRaw, error: subErr } = await supabase
      .from("b_alert_subscriptions")
      .select("*")
      .in("alert_def_id", defIds)
      .eq("sms_enabled", true);

    if (subErr) {
      console.error(`[ALERT-EVALUATE] Failed to fetch subscriptions for org ${orgId}:`, subErr);
      continue;
    }

    // Filter out muted/snoozed subscriptions from SMS delivery
    const subscriptions = (subscriptionsRaw || []).filter((sub: any) => {
      if (!sub.muted_at) return true; // not muted
      if (sub.mute_until && new Date(sub.mute_until) <= new Date()) return true; // snooze expired
      return false;
    });

    console.log(`[DEBUG] Org ${orgId}: fetched ${subscriptionsRaw?.length ?? 0} sms-enabled subscriptions (${subscriptions.length} active after mute filter)`);
    if (subscriptions?.length) {
      console.log(`[DEBUG] Subscription details:`, (subscriptions as Subscription[]).map(s => ({ alert_def_id: s.alert_def_id, user_id: s.user_id, sms_enabled: s.sms_enabled })));
    }
    if (!subscriptions?.length) {
      console.log(`[DEBUG] Org ${orgId}: SKIP — no sms-enabled subscriptions, marking ${orgDefs.length} defs as evaluated`);
      definitionsEvaluated += orgDefs.length;
      continue;
    }

    // Group subscriptions by definition
    const subsByDef = new Map<string, Subscription[]>();
    for (const sub of subscriptions as Subscription[]) {
      const list = subsByDef.get(sub.alert_def_id) || [];
      list.push(sub);
      subsByDef.set(sub.alert_def_id, list);
    }

    // Fetch phone numbers from a_users
    const userIds = [...new Set((subscriptions as Subscription[]).map((s) => s.user_id))];
    const { data: userPhones, error: phonesErr } = await supabase
      .from("a_users")
      .select("user_id, phone_number")
      .in("user_id", userIds)
      .not("phone_number", "is", null);

    if (phonesErr) {
      console.error(`[ALERT-EVALUATE] Failed to fetch user phones for org ${orgId}:`, phonesErr);
      continue;
    }

    console.log(`[DEBUG] Org ${orgId}: fetched ${userPhones?.length ?? 0} user phones`);
    if (userPhones?.length) {
      console.log(`[DEBUG] Phone user_ids:`, (userPhones as UserPhone[]).map(u => u.user_id));
    }
    const phoneMap = new Map<string, string>();
    for (const u of (userPhones || []) as UserPhone[]) {
      phoneMap.set(u.user_id, u.phone_number);
    }

    // Fetch user notification prefs for quiet hours
    const { data: userPrefs, error: prefsErr } = await supabase
      .from("b_user_notification_prefs")
      .select("*")
      .in("user_id", userIds)
      .eq("sms_enabled", true);

    if (prefsErr) {
      console.error(`[ALERT-EVALUATE] Failed to fetch user prefs for org ${orgId}:`, prefsErr);
      continue;
    }

    console.log(`[DEBUG] Org ${orgId}: fetched ${userPrefs?.length ?? 0} user notification prefs (sms_enabled=true)`);
    if (userPrefs?.length) {
      console.log(`[DEBUG] UserPrefs user_ids:`, (userPrefs as UserNotifPrefs[]).map(p => p.user_id));
    }
    const prefsMap = new Map<string, UserNotifPrefs>();
    for (const pref of (userPrefs || []) as UserNotifPrefs[]) {
      prefsMap.set(pref.user_id, pref);
    }

    // 3. Evaluate each definition
    for (const def of orgDefs) {
      definitionsEvaluated++;
      console.log(`[DEBUG] Evaluating def "${def.name}" (id=${def.id})`);
      const defInstances = instancesByDef.get(def.id);
      if (!defInstances?.length) {
        console.log(`[DEBUG]   SKIP def ${def.id} — no matching instances in instancesByDef map`);
        continue;
      }
      console.log(`[DEBUG]   Found ${defInstances.length} instance(s) for def ${def.id}`);

      const defSubs = subsByDef.get(def.id);
      if (!defSubs?.length) {
        console.log(`[DEBUG]   SKIP def ${def.id} — no matching subscriptions in subsByDef map`);
        continue;
      }
      console.log(`[DEBUG]   Found ${defSubs.length} subscription(s) for def ${def.id}`);

      for (const instance of defInstances) {
        console.log(`[DEBUG]   Processing instance ${instance.id} (status=${instance.status}, alert_def_id=${instance.alert_def_id})`);
        for (const sub of defSubs) {
          console.log(`[DEBUG]     Checking sub ${sub.id} (user_id=${sub.user_id})`);
          const phone = phoneMap.get(sub.user_id);
          if (!phone) {
            console.log(`[DEBUG]     SKIP — no phone found for user ${sub.user_id}`);
            continue;
          }
          console.log(`[DEBUG]     Phone found for user ${sub.user_id}: ${phone}`);

          const prefs = prefsMap.get(sub.user_id);
          console.log(`[DEBUG]     User prefs found: ${!!prefs}, sms_enabled: ${prefs?.sms_enabled}`);

          // Respect quiet hours
          if (prefs && isInQuietHours(prefs)) {
            console.log(`[DEBUG]     SKIP — user ${sub.user_id} is in quiet hours`);
            continue;
          }

          // Respect cooldown: skip if notification sent in last 60 min for same instance + user
          const recentlySent = await wasRecentlySent(supabase, instance.id, sub.user_id);
          if (recentlySent) {
            console.log(`[DEBUG]     SKIP — cooldown: notification already sent in last 60min for instance ${instance.id} + user ${sub.user_id}`);
            continue;
          }
          console.log(`[DEBUG]     Passed all checks — queuing SMS notification`);

          // Generate title/message from definition + instance
          const notifTitle = def.name;
          const notifMessage = `Alert: ${def.name} — value ${instance.trigger_value ?? "N/A"} at ${instance.target_name ?? "unknown"}`;

          // Queue SMS notification
          const { error: insertErr } = await supabase
            .from("b_alert_notifications")
            .insert({
              channel: "sms",
              status: "pending",
              org_id: orgId,
              instance_id: instance.id,
              subscription_id: sub.id,
              recipient_user_id: sub.user_id,
              title: notifTitle,
              message: notifMessage,
              severity: instance.severity,
            });

          if (insertErr) {
            console.error(`[ALERT-EVALUATE] Failed to queue notification:`, insertErr);
          } else {
            notificationsQueued++;
            console.log(
              `[ALERT-EVALUATE] Queued SMS for user ${sub.user_id}: ${notifTitle}`
            );
          }
        }
      }
    }
  }

  const orgsChecked = byOrg.size;
  console.log(
    `[ALERT-EVALUATE] Done: ${orgsChecked} orgs, ${definitionsEvaluated} defs, ${notificationsQueued} queued`
  );

  return {
    orgs_checked: orgsChecked,
    definitions_evaluated: definitionsEvaluated,
    notifications_queued: notificationsQueued,
  };
}

function isInQuietHours(prefs: UserNotifPrefs): boolean {
  if (!prefs.quiet_start || !prefs.quiet_end) return false;

  const tz = prefs.timezone || "America/Chicago";

  let nowInTz: Date;
  try {
    const nowStr = new Date().toLocaleString("en-US", { timeZone: tz });
    nowInTz = new Date(nowStr);
  } catch {
    // Invalid timezone — don't block
    return false;
  }

  const nowMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();

  const [startH, startM] = prefs.quiet_start.split(":").map(Number);
  const [endH, endM] = prefs.quiet_end.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day range, e.g. 08:00 - 17:00
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  } else {
    // Overnight range, e.g. 22:00 - 07:00
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
}

async function wasRecentlySent(
  supabase: SupabaseClient,
  instanceId: number,
  userId: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("b_alert_notifications")
    .select("id")
    .eq("instance_id", instanceId)
    .eq("recipient_user_id", userId)
    .eq("status", "sent")
    .gte("created_at", oneHourAgo)
    .limit(1);

  if (error) {
    console.error("[ALERT-EVALUATE] Cooldown check error:", error);
    return false; // On error, allow sending
  }

  return (data?.length ?? 0) > 0;
}

export async function GET() { return handler(); }
export async function POST() { return handler(); }
