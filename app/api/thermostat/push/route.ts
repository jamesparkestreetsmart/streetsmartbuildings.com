// app/api/thermostat/push/route.ts
// POST endpoint that executes the full HA thermostat push flow

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { executePushForSite } from "@/lib/ha-push";

async function getCallerEmail(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.email || "system";
  } catch { return "system"; }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { site_id, hvac_zone_id, trigger = "manual" } = body;

    if (!site_id) {
      return NextResponse.json({ error: "site_id required" }, { status: 400 });
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

    console.log(`[thermostat/push] Starting push for site ${site_id}, trigger: ${trigger}, caller: ${callerEmail}`);

    const results = await executePushForSite(supabase, site_id, trigger, undefined, callerEmail);

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
