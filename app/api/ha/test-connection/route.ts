import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { checkHAConnection } from "@/lib/ha-push";

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

/** GET ?siteId=X — test HA connectivity using stored credentials */
export async function GET(req: NextRequest) {
  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: site } = await svc
    .from("a_sites")
    .select("ha_url, ha_token")
    .eq("site_id", siteId)
    .single();

  if (!site?.ha_url || !site?.ha_token) {
    return NextResponse.json({ connected: false, reason: "HA URL or token not configured" });
  }

  const connected = await checkHAConnection(site.ha_url, site.ha_token);
  return NextResponse.json({ connected });
}
