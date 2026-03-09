// app/api/thermostat/push/route.ts
// POST endpoint that executes the full HA thermostat push flow

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executePushForSite } from "@/lib/ha-push";
import { getAuthUser } from "@/lib/auth/requireAdminRole";
import { getUserSiteScope } from "@/lib/user-scope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { site_id, hvac_zone_id, trigger = "manual" } = body;

    if (!site_id) {
      return NextResponse.json({ error: "site_id required" }, { status: 400 });
    }

    // Verify user has access to this site
    const { data: siteInfo } = await supabase.from("a_sites").select("org_id").eq("site_id", site_id).single();
    if (siteInfo?.org_id) {
      const scope = await getUserSiteScope(auth.userId, siteInfo.org_id);
      if (scope !== "all" && !scope.includes(site_id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Validate HA connection is configured
    const haUrl = process.env.HA_URL;
    const haToken = process.env.HA_LONG_LIVED_TOKEN;

    if (!haUrl || !haToken) {
      return NextResponse.json(
        { error: "HA connection not configured", ha_configured: false },
        { status: 200 }
      );
    }

    console.log(`[thermostat/push] Starting push for site ${site_id}${hvac_zone_id ? ` zone ${hvac_zone_id}` : ""}, trigger: ${trigger}, caller: ${auth.email}`);

    const results = await executePushForSite(supabase, site_id, trigger, undefined, auth.email, hvac_zone_id || undefined);

    if (!results.ha_connected) {
      return NextResponse.json(
        {
          error: "HA unreachable",
          ha_connected: false,
          results: results.results,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(results);
  } catch (err: any) {
    console.error("[thermostat/push] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
