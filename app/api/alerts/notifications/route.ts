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

// GET: Fetch notifications (with status filter)
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const status = req.nextUrl.searchParams.get("status"); // 'active', 'all'
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  let query = supabase
    .from("b_alert_notifications")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data: notifications, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also get count of active notifications for badge
  const { count } = await supabase
    .from("b_alert_notifications")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "active");

  return NextResponse.json({
    notifications: notifications || [],
    active_count: count || 0,
  });
}

// PATCH: Acknowledge or dismiss a notification
export async function PATCH(req: NextRequest) {
  const callerEmail = await getCallerEmail();
  const body = await req.json();
  const { id, action } = body; // action: 'acknowledge', 'dismiss', 'resolve'

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const updates: Record<string, any> = {};

  if (action === "acknowledge") {
    updates.status = "acknowledged";
    updates.acknowledged_by = callerEmail;
    updates.acknowledged_at = new Date().toISOString();
  } else if (action === "dismiss") {
    updates.status = "dismissed";
    updates.acknowledged_by = callerEmail;
    updates.acknowledged_at = new Date().toISOString();
  } else if (action === "resolve") {
    updates.status = "resolved";
    updates.resolved_at = new Date().toISOString();
  }

  const { data: notif, error } = await supabase
    .from("b_alert_notifications")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notification: notif });
}
