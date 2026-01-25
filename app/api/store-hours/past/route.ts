import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

  // Calculate date boundaries
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const lastYearStart = new Date(today.getFullYear() - 1, 0, 1); // Jan 1 of last year
  const lastYearStartStr = lastYearStart.toISOString().split("T")[0];

  // 7 days ago for base hours cutoff
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

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

  // Filter: show actual events (with exception_id) from this year/last year
  // OR show base hours (no exception_id) only from last 7 days
  const filtered = (data ?? []).filter((row: any) => {
    // Check for truthy exception_id (handles both null and undefined)
    const hasException = !!row.exception_id;
    const isWithin7Days = row.manifest_date >= sevenDaysAgoStr;

    // Keep if it's an actual event OR if it's base hours within last 7 days
    return hasException || isWithin7Days;
  });

  return NextResponse.json({ rows: filtered });
}
