import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/requireAdminRole";
import { getUserSiteScope } from "@/lib/user-scope";

export const dynamic = "force-dynamic";

// GET: Check if current user has access to a specific site
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const siteId = req.nextUrl.searchParams.get("site_id");

  if (!orgId || !siteId) {
    return NextResponse.json({ error: "org_id and site_id required" }, { status: 400 });
  }

  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;

  const scope = await getUserSiteScope(auth.userId, orgId);

  if (scope === "all" || scope.includes(siteId)) {
    return NextResponse.json({ allowed: true });
  }

  console.log(`[scope] Access denied: user=${auth.userId} site=${siteId} org=${orgId}`);
  return NextResponse.json({ allowed: false }, { status: 403 });
}
