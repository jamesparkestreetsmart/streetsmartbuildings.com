import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autoLinkProfile } from "@/lib/thermostat/auto-link-profile";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { profile_id } = body;

    if (!profile_id) {
      return NextResponse.json({ error: "profile_id required" }, { status: 400 });
    }

    const { data: profile, error } = await supabase
      .from("b_thermostat_profiles")
      .select("*")
      .eq("profile_id", profile_id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const targetZoneTypes: string[] = profile.target_zone_types || [];
    if (targetZoneTypes.length === 0) {
      return NextResponse.json({ linked: 0, skipped: 0, conflicts: [] });
    }

    const result = await autoLinkProfile(
      supabase,
      profile_id,
      profile.org_id,
      profile.scope || "org",
      profile.site_id || null,
      targetZoneTypes,
      profile.is_global || false
    );

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[re-apply] error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
