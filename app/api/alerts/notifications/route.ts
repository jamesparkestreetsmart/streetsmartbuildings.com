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

// GET: Fetch dashboard notifications for current user
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const userId = await getCallerUserId();

  // Fetch notifications: user-specific OR org-wide (subscription_id = null)
  let query = supabase
    .from("b_alert_notifications")
    .select("*")
    .eq("org_id", orgId)
    .eq("channel", "dashboard")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));

  if (userId) {
    // Show notifications for this user OR org-wide ones (no specific recipient)
    query = query.or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`);
  }

  const { data: notifications, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count unread
  let countQuery = supabase
    .from("b_alert_notifications")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("channel", "dashboard")
    .in("status", ["pending", "sent"]);

  if (userId) {
    countQuery = countQuery.or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`);
  }

  const { count } = await countQuery;

  return NextResponse.json({
    notifications: notifications || [],
    unread_count: count || 0,
  });
}

// PATCH: Mark notification as read
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, action } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, any> = {};

  if (action === "read") {
    updates.status = "read";
    updates.read_at = new Date().toISOString();
  } else if (action === "dismiss") {
    updates.status = "dismissed";
    updates.read_at = updates.read_at || new Date().toISOString();
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
