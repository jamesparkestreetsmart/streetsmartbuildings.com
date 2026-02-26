import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function getCallerEmail(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.email || "system";
  } catch { return "system"; }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: List alert rules for org
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const { data: rules, error } = await supabase
    .from("b_alert_rules")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: rules || [] });
}

// POST: Create new alert rule
export async function POST(req: NextRequest) {
  const callerEmail = await getCallerEmail();
  const body = await req.json();
  const { org_id, name, trigger_type, trigger_conditions, scope_type, scope_ids, notify_channels, notify_users, cooldown_min, auto_resolve } = body;

  if (!org_id || !name || !trigger_type) {
    return NextResponse.json({ error: "org_id, name, and trigger_type required" }, { status: 400 });
  }

  const { data: rule, error } = await supabase
    .from("b_alert_rules")
    .insert({
      org_id,
      name,
      trigger_type: trigger_type || "anomaly_opened",
      trigger_conditions: trigger_conditions || {},
      scope_type: scope_type || "org",
      scope_ids: scope_ids || null,
      notify_channels: notify_channels || ["dashboard"],
      notify_users: notify_users || null,
      cooldown_min: cooldown_min ?? 60,
      auto_resolve: auto_resolve ?? true,
      created_by: callerEmail,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Activity log
  await supabase.from("b_records_log").insert({
    org_id,
    event_type: "alert_rule_created",
    message: `Alert rule created: ${name}`,
    created_by: callerEmail,
    details: { rule_id: rule?.id, trigger_type, channels: notify_channels },
  });

  return NextResponse.json({ rule });
}

// PATCH: Update alert rule
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Only allow updating specific fields
  const allowed = ["name", "trigger_conditions", "scope_type", "scope_ids", "notify_channels", "notify_users", "cooldown_min", "auto_resolve", "enabled"];
  const filtered: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  const { data: rule, error } = await supabase
    .from("b_alert_rules")
    .update(filtered)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule });
}

// DELETE: Remove alert rule
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("b_alert_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
