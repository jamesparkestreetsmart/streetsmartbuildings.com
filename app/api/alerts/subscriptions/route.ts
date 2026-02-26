import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getCallerUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id || null;
  } catch { return null; }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Returns all definitions with current user's subscription status
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Get all definitions for this org
  const { data: definitions, error: defErr } = await supabase
    .from("b_alert_definitions")
    .select("*")
    .eq("org_id", orgId)
    .eq("enabled", true)
    .order("name");

  if (defErr) return NextResponse.json({ error: defErr.message }, { status: 500 });

  // Get current user's subscriptions
  const defIds = (definitions || []).map((d: any) => d.id);
  let userSubs: Record<string, any> = {};

  if (defIds.length > 0) {
    const { data: subs } = await supabase
      .from("b_alert_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .in("alert_def_id", defIds);

    for (const sub of subs || []) {
      userSubs[sub.alert_def_id] = sub;
    }
  }

  // Get active instance counts
  let instanceCounts: Record<string, number> = {};
  if (defIds.length > 0) {
    const { data: instances } = await supabase
      .from("b_alert_instances")
      .select("alert_def_id")
      .in("alert_def_id", defIds)
      .eq("status", "active");

    for (const inst of instances || []) {
      instanceCounts[inst.alert_def_id] = (instanceCounts[inst.alert_def_id] || 0) + 1;
    }
  }

  const enriched = (definitions || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    severity: d.severity,
    entity_type: d.entity_type,
    condition_type: d.condition_type,
    threshold_value: d.threshold_value,
    active_instances: instanceCounts[d.id] || 0,
    subscription: userSubs[d.id] || null,
  }));

  return NextResponse.json({ definitions: enriched });
}

// POST: Subscribe to an alert definition (or update existing)
export async function POST(req: NextRequest) {
  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const {
    alert_def_id, dashboard_enabled, email_enabled, sms_enabled,
    repeat_enabled, repeat_interval_min, max_repeats,
    send_resolved, quiet_hours_override, quiet_start, quiet_end, timezone,
  } = body;

  if (!alert_def_id) {
    return NextResponse.json({ error: "alert_def_id required" }, { status: 400 });
  }

  const { data: subscription, error } = await supabase
    .from("b_alert_subscriptions")
    .upsert(
      {
        user_id: userId,
        alert_def_id,
        dashboard_enabled: dashboard_enabled ?? true,
        email_enabled: email_enabled ?? false,
        sms_enabled: sms_enabled ?? false,
        repeat_enabled: repeat_enabled ?? false,
        repeat_interval_min: repeat_interval_min ?? 60,
        max_repeats: max_repeats ?? null,
        send_resolved: send_resolved ?? true,
        quiet_hours_override: quiet_hours_override ?? false,
        quiet_start: quiet_start ?? null,
        quiet_end: quiet_end ?? null,
        timezone: timezone ?? "America/Chicago",
        enabled: true,
      },
      { onConflict: "user_id,alert_def_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription });
}

// DELETE: Unsubscribe
export async function DELETE(req: NextRequest) {
  const subscriptionId = req.nextUrl.searchParams.get("subscription_id");
  if (!subscriptionId) return NextResponse.json({ error: "subscription_id required" }, { status: 400 });

  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await supabase
    .from("b_alert_subscriptions")
    .delete()
    .eq("id", subscriptionId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
