import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  } catch {
    return null;
  }
}

const THRESHOLD_KEYS = [
  "coil_freeze_temp_f",
  "delayed_response_min",
  "idle_heat_gain_f",
  "long_cycle_min",
  "short_cycle_count_1h",
  "filter_restriction_delta_t_max",
  "refrigerant_low_delta_t_min",
  "efficiency_ratio_min_pct",
  "compressor_current_threshold_a",
];

// GET: Fetch all anomaly config profiles for an org (+ globals)
export async function GET(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get("org_id");
    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

    const { data, error } = await supabase
      .from("b_anomaly_config_profiles")
      .select("*")
      .or(`org_id.eq.${orgId},is_global.eq.true`)
      .order("is_global", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ profiles: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Create a new anomaly config profile
export async function POST(req: NextRequest) {
  try {
    const userId = await getCallerUserId();
    const body = await req.json();
    const { org_id, profile_name } = body;

    if (!org_id || !profile_name?.trim()) {
      return NextResponse.json({ error: "org_id and profile_name required" }, { status: 400 });
    }

    const row: Record<string, any> = {
      org_id,
      profile_name: profile_name.trim(),
      is_global: false,
      scope: body.scope === "site" ? "site" : "org",
      created_by: userId,
    };

    for (const key of THRESHOLD_KEYS) {
      const val = body[key];
      row[key] = typeof val === "number" ? val : null;
    }

    const { data, error } = await supabase
      .from("b_anomaly_config_profiles")
      .insert(row)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ profile: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Delete a non-global profile owned by the org
export async function DELETE(req: NextRequest) {
  try {
    const profileId = req.nextUrl.searchParams.get("profile_id");
    const orgId = req.nextUrl.searchParams.get("org_id");

    if (!profileId || !orgId) {
      return NextResponse.json({ error: "profile_id and org_id required" }, { status: 400 });
    }

    // Check if it's a global profile
    const { data: existing } = await supabase
      .from("b_anomaly_config_profiles")
      .select("is_global, org_id")
      .eq("profile_id", profileId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (existing.is_global) {
      return NextResponse.json({ error: "Cannot delete a global profile" }, { status: 403 });
    }

    if (existing.org_id !== orgId) {
      return NextResponse.json({ error: "Profile does not belong to this organization" }, { status: 403 });
    }

    const { error } = await supabase
      .from("b_anomaly_config_profiles")
      .delete()
      .eq("profile_id", profileId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
