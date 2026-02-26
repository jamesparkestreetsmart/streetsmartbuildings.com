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

// GET: Fetch alert instances (active or all)
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const status = req.nextUrl.searchParams.get("status") || "active";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  let query = supabase
    .from("b_alert_instances")
    .select("*, b_alert_definitions(name, severity, entity_type, condition_type, threshold_value)")
    .eq("org_id", orgId)
    .order("fired_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (status === "active") {
    query = query.eq("status", "active");
  } else if (status === "resolved") {
    query = query.eq("status", "resolved");
  }
  // status=all returns everything

  const { data: instances, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ instances: instances || [] });
}

// PATCH: Acknowledge an instance
export async function PATCH(req: NextRequest) {
  const callerEmail = await getCallerEmail();
  const body = await req.json();
  const { id, action, ack_note } = body;

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const updates: Record<string, any> = {};

  if (action === "acknowledge") {
    updates.acknowledged_by = callerEmail;
    updates.acknowledged_at = new Date().toISOString();
    if (ack_note) updates.ack_note = ack_note;
  } else if (action === "resolve") {
    updates.status = "resolved";
    updates.resolved_at = new Date().toISOString();
  }

  const { data: instance, error } = await supabase
    .from("b_alert_instances")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ instance });
}
