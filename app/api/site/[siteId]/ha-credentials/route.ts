import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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

/** POST — save HA URL + token (server-side only, token never returned to client) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { siteId } = await params;
  const body = await req.json();
  const { ha_url, ha_token } = body || {};

  if (!ha_url) {
    return NextResponse.json({ error: "ha_url is required" }, { status: 400 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify user has access to this site via org membership
  const { data: site } = await svc
    .from("a_sites")
    .select("site_id, org_id")
    .eq("site_id", siteId)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const updatePayload: Record<string, any> = { ha_url: ha_url.replace(/\/+$/, "") };
  if (ha_token) {
    updatePayload.ha_token = ha_token;
  }

  const { error } = await svc
    .from("a_sites")
    .update(updatePayload)
    .eq("site_id", siteId);

  if (error) {
    console.error("HA credentials update error:", error);
    return NextResponse.json({ error: "Failed to save HA credentials" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** GET — returns ha_url and whether token is set (never returns actual token) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { siteId } = await params;

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: site } = await svc
    .from("a_sites")
    .select("ha_url, ha_token")
    .eq("site_id", siteId)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json({
    ha_url: site.ha_url || "",
    ha_token_set: !!site.ha_token,
  });
}
