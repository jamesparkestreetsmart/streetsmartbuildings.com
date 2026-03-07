import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getUserSiteScope } from "@/lib/user-scope";

export const dynamic = "force-dynamic";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  // Authenticate caller
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = await getUserSiteScope(user.id, orgId);

  // Determine cause for UI display
  let cause: "bypassed" | "scoped" | "no_memberships" | "no_sites_linked";

  if (scope === "all") {
    cause = "bypassed";
  } else if (scope.length > 0) {
    cause = "scoped";
  } else {
    // Empty scope — determine why
    const { data: groups } = await svc
      .from("b_user_group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .limit(1);

    if (!groups || groups.length === 0) {
      cause = "no_memberships";
      console.log(`[scope] User ${user.id} has no group memberships for org ${orgId}`);
    } else {
      cause = "no_sites_linked";
      console.log(`[scope] User ${user.id} has groups but no sites linked for org ${orgId}`);
    }
  }

  return NextResponse.json({ scope, cause });
}
