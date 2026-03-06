import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getCallerInfo(): Promise<{ email: string; userId: string | null }> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return { email: user?.email || "system", userId: user?.id || null };
  } catch { return { email: "system", userId: null }; }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: List alert definitions for org, with active instance counts,
// org-wide subscriber counts, and current user's subscription status
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const { userId } = await getCallerInfo();

  const { data: definitions, error } = await supabase
    .from("b_alert_definitions")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const defIds = (definitions || []).map((d: any) => d.id);
  let instanceCounts: Record<string, number> = {};
  let subscriberCounts: Record<string, number> = {};
  let userSubs: Record<string, any> = {};

  if (defIds.length > 0) {
    // Active instance counts
    const { data: instances } = await supabase
      .from("b_alert_instances")
      .select("alert_def_id")
      .in("alert_def_id", defIds)
      .eq("status", "active");

    for (const inst of instances || []) {
      instanceCounts[inst.alert_def_id] = (instanceCounts[inst.alert_def_id] || 0) + 1;
    }

    // Org-wide subscriber counts (single aggregated query)
    const { data: allSubs } = await supabase
      .from("b_alert_subscriptions")
      .select("alert_def_id, user_id")
      .in("alert_def_id", defIds)
      .eq("enabled", true);

    for (const sub of allSubs || []) {
      subscriberCounts[sub.alert_def_id] = (subscriberCounts[sub.alert_def_id] || 0) + 1;
    }

    // Current user's subscription per definition
    if (userId) {
      const { data: mySubs } = await supabase
        .from("b_alert_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .in("alert_def_id", defIds);

      for (const sub of mySubs || []) {
        userSubs[sub.alert_def_id] = sub;
      }
    }
  }

  // Get total site count for org (for "All sites (N)" display)
  const { count: totalSites } = await supabase
    .from("a_sites")
    .select("site_id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const enriched = (definitions || []).map((d: any) => ({
    ...d,
    active_instances: instanceCounts[d.id] || 0,
    subscriber_count: subscriberCounts[d.id] || 0,
    my_subscription: userSubs[d.id] || null,
  }));

  return NextResponse.json({ definitions: enriched, total_sites: totalSites || 0 });
}

// POST: Create new alert definition
export async function POST(req: NextRequest) {
  const { email: callerEmail } = await getCallerInfo();
  const body = await req.json();

  const {
    org_id, name, description, severity, entity_type, entity_id,
    derived_metric, anomaly_type, condition_type, threshold_value,
    target_value, target_value_type, stale_minutes, delta_value,
    delta_direction, window_minutes, sustain_minutes, resolved_dead_time_minutes,
    scope_level, scope_mode, scope_ids, eval_path, equipment_type, sensor_role,
  } = body;

  if (!org_id || !name || !entity_type || !condition_type) {
    return NextResponse.json(
      { error: "org_id, name, entity_type, and condition_type required" },
      { status: 400 }
    );
  }

  const { data: definition, error } = await supabase
    .from("b_alert_definitions")
    .insert({
      org_id,
      name,
      description: description || null,
      severity: severity || "warning",
      entity_type,
      entity_id: entity_id || null,
      derived_metric: derived_metric || null,
      anomaly_type: anomaly_type || null,
      condition_type,
      threshold_value: threshold_value ?? null,
      target_value: target_value ?? null,
      target_value_type: target_value_type || "string",
      stale_minutes: stale_minutes ?? null,
      delta_value: delta_value ?? null,
      delta_direction: delta_direction || "any",
      window_minutes: window_minutes ?? null,
      sustain_minutes: sustain_minutes ?? 0,
      resolved_dead_time_minutes: resolved_dead_time_minutes ?? 0,
      scope_level: scope_level || "org",
      scope_mode: scope_mode || "all",
      scope_ids: scope_ids || null,
      eval_path: eval_path || "auto",
      equipment_type: equipment_type || null,
      sensor_role: sensor_role || null,
      created_by: callerEmail,
    })
    .select()
    .single();

  if (error) {
    console.error("[ALERT RULES POST]", JSON.stringify(error, null, 2));
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Activity log
  await supabase.from("b_records_log").insert({
    org_id,
    event_type: "alert_definition_created",
    message: `Alert definition created: ${name}`,
    created_by: callerEmail,
    details: { definition_id: definition?.id, entity_type, condition_type, severity },
  });

  return NextResponse.json({ definition });
}

// PATCH: Update alert definition
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = [
    "name", "description", "severity", "entity_type", "entity_id",
    "derived_metric", "anomaly_type", "condition_type", "threshold_value",
    "target_value", "target_value_type", "stale_minutes", "delta_value",
    "delta_direction", "window_minutes", "sustain_minutes", "resolved_dead_time_minutes",
    "scope_level", "scope_mode", "scope_ids", "eval_path", "equipment_type", "sensor_role", "enabled",
  ];
  const filtered: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  const { data: definition, error } = await supabase
    .from("b_alert_definitions")
    .update(filtered)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ definition });
}

// DELETE: Remove alert definition (cascades eval_state + subscriptions via FK)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("b_alert_definitions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
