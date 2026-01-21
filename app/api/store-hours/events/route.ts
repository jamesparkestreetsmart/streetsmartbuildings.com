// app/api/store-hours/events/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const status = searchParams.get("status");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let query = supabase
    .from("view_store_hours_events")
    .select("*")
    .eq("site_id", site_id)
    .order("event_date", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const endOfNextYear = `${currentYear + 1}-12-31`;

  if (status === "upcoming") {
    query = query.gte("event_date", today).lte("event_date", endOfNextYear);
  }

  if (status === "past") {
    query = query.lt("event_date", today);
  }

  const { data, error } = await query;

  if (error) {
    console.error("events api error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
