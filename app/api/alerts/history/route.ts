import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth/requireAdminRole";
import { getUserAlertSiteScope } from "@/lib/user-scope";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Server-side scoped alert history
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;

  const scope = await getUserAlertSiteScope(auth.userId, orgId);

  let query = supabase
    .from("view_alert_history")
    .select("*")
    .eq("org_id", orgId)
    .gte("start", start)
    .lte("start", end)
    .order("start", { ascending: false });

  if (scope !== "all") {
    if (scope.length === 0) {
      return NextResponse.json([]);
    }
    query = query.in("site_id", scope);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}
