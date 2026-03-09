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

  // Enrich rows with exception data from b_store_hours_events.
  // The manifest view may not include event_id, so we check events directly.
  const manifestDates = [...new Set((data ?? []).map((r: any) => r.manifest_date))];
  const eventsByDate = new Map<string, any>();

  if (manifestDates.length > 0) {
    const { data: events } = await supabase
      .from("b_store_hours_events")
      .select("event_id, event_date, event_name, event_type, is_closed, open_time, close_time")
      .eq("site_id", site_id)
      .in("event_date", manifestDates);

    for (const evt of events ?? []) {
      // If multiple events on same date, closed takes precedence
      const existing = eventsByDate.get(evt.event_date);
      if (!existing || (evt.is_closed && !existing.is_closed)) {
        eventsByDate.set(evt.event_date, evt);
      }
    }
  }

  // Filter: show actual events from this year/last year
  // OR show base hours (no event) only from last 7 days
  const filtered = (data ?? [])
    .map((row: any) => {
      const evt = eventsByDate.get(row.manifest_date);
      if (evt) {
        // Enrich with exception data
        return {
          ...row,
          event_id: evt.event_id,
          event_type: evt.event_type || row.event_type,
          manifest_name: evt.event_name || row.manifest_name,
          is_closed: evt.is_closed,
          open_time: evt.is_closed ? null : (evt.open_time || row.open_time),
          close_time: evt.is_closed ? null : (evt.close_time || row.close_time),
        };
      }
      return row;
    })
    .filter((row: any) => {
      const isEvent = !!row.event_id;
      const isWithin7Days = row.manifest_date >= sevenDaysAgoStr;

      // Keep if it's an actual event OR if it's base hours within last 7 days
      return isEvent || isWithin7Days;
    });

  return NextResponse.json({ rows: filtered });
}
