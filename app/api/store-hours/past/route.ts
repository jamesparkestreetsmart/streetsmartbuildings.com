import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { siteLocalDate } from "@/lib/utils/site-date";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Look up site timezone so date boundaries use site-local date, not UTC
  const { data: siteInfo } = await supabase
    .from("a_sites")
    .select("timezone")
    .eq("site_id", site_id)
    .single();
  const tz = siteInfo?.timezone || "America/Chicago";

  // Calculate date boundaries in site-local time
  const todayStr = siteLocalDate(new Date(), tz);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayLocal = new Date(ty, tm - 1, td);

  const lastYearStart = new Date(ty - 1, 0, 1); // Jan 1 of last year
  const lastYearStartStr = siteLocalDate(lastYearStart, tz);

  // 7 days ago for base hours cutoff
  const sevenDaysAgo = new Date(todayLocal);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = siteLocalDate(sevenDaysAgo, tz);

  // Fetch all past events from this year and last year
  const { data, error } = await supabase
    .from("view_store_hours_manifest")
    .select("*")
    .eq("site_id", site_id)
    .gte("manifest_date", lastYearStartStr)
    .lte("manifest_date", todayStr)
    .order("manifest_date", { ascending: false })
    .limit(500);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter: show actual events (with event_id) from this year/last year
  // OR show base hours (no event_id) only from last 7 days
  const filtered = (data ?? []).filter((row: any) => {
    const isEvent = !!row.event_id;
    const isWithin7Days = row.manifest_date >= sevenDaysAgoStr;

    // Keep if it's an actual event OR if it's base hours within last 7 days
    return isEvent || isWithin7Days;
  });

  return NextResponse.json({ rows: filtered });
}
