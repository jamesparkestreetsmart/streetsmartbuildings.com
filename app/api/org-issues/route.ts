import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth/requireAdminRole";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/org-issues
 * Returns issues the authenticated user is authorized to see.
 * Query params: scope, status, org_id
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const params = req.nextUrl.searchParams;
  const orgIdFilter = params.get("org_id");
  const scopeFilter = params.get("scope");
  const statusFilter = params.get("status"); // comma-separated

  // Determine if user is SSB admin (service provider)
  const { data: membership } = await supabase
    .from("a_orgs_users_memberships")
    .select("org_id, a_organizations!inner(org_identifier, parent_org_id)")
    .eq("user_id", userId);

  const isSSB = membership?.some(
    (m: any) => m.a_organizations?.org_identifier === "SSB1" && !m.a_organizations?.parent_org_id
  );

  // Build query
  let query = supabase
    .from("c_org_issues")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  // SSB admin sees all; org members see only their org + platform issues
  if (!isSSB) {
    const userOrgIds = membership?.map((m: any) => m.org_id) || [];
    // Show platform-level (org_id is null) + issues for user's orgs
    query = query.or(`org_id.is.null,org_id.in.(${userOrgIds.join(",")})`);
  }

  // Apply filters
  if (orgIdFilter) {
    query = query.eq("org_id", orgIdFilter);
  }
  if (scopeFilter) {
    query = query.eq("scope", scopeFilter);
  }
  if (statusFilter) {
    const statuses = statusFilter.split(",").map((s) => s.trim());
    query = query.in("status", statuses);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
