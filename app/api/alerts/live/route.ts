import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth/requireAdminRole";
import { getUserAlertSiteScope } from "@/lib/user-scope";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Server-side scoped live alerts
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;

  const scope = await getUserAlertSiteScope(auth.userId, orgId);

  // Query 1: anomaly events from the view
  let anomalyQuery = supabase
    .from("view_live_alerts")
    .select("*")
    .eq("org_id", orgId)
    .order("start", { ascending: false });

  if (scope !== "all") {
    if (scope.length === 0) {
      return NextResponse.json({ anomalies: [], instances: [] });
    }
    anomalyQuery = anomalyQuery.in("site_id", scope);
  }

  // Query 2: alert instances
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  let instanceQuery = supabase
    .from("b_alert_instances")
    .select("*, b_alert_definitions(name, severity, sensor_role)")
    .eq("org_id", orgId)
    .or(`status.eq.active,fired_at.gte.${cutoff}`)
    .order("fired_at", { ascending: false });

  // Note: b_alert_instances may not have a direct site_id column.
  // Scope filtering for instances is applied client-side on context.site_id
  // since the site_id is stored in the JSONB context column.

  const [anomalyResult, instanceResult] = await Promise.all([
    anomalyQuery,
    instanceQuery,
  ]);

  // For instances, filter server-side by context.site_id if scoped
  let instances = instanceResult.data || [];
  if (scope !== "all") {
    const scopeSet = new Set(scope);
    instances = instances.filter(
      (i: any) => i.context?.site_id && scopeSet.has(i.context.site_id)
    );
  }

  return NextResponse.json({
    anomalies: anomalyResult.data || [],
    instances,
  });
}
