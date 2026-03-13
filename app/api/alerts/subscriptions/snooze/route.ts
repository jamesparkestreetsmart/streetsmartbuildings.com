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

// PATCH: Snooze a subscription until a specific datetime
export async function PATCH(req: NextRequest) {
  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { subscription_id, snooze_until } = body;
  if (!subscription_id) return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  if (!snooze_until) return NextResponse.json({ error: "snooze_until required" }, { status: 400 });

  // Validate snooze_until is a future datetime
  const snoozeDate = new Date(snooze_until);
  if (isNaN(snoozeDate.getTime())) {
    return NextResponse.json({ error: "snooze_until must be a valid ISO8601 datetime" }, { status: 400 });
  }
  if (snoozeDate.getTime() <= Date.now()) {
    return NextResponse.json({ error: "snooze_until must be in the future" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("b_alert_subscriptions")
    .update({ muted_at: new Date().toISOString(), mute_until: snoozeDate.toISOString() })
    .eq("id", subscription_id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("[SUBSCRIPTIONS] SNOOZE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  return NextResponse.json({ subscription: data });
}
