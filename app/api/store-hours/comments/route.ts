import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const site_id = req.nextUrl.searchParams.get("site_id");
  const date = req.nextUrl.searchParams.get("date");

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  let query = supabase
    .from("b_records_log")
    .select("id, message, event_date, created_at, created_by")
    .eq("site_id", site_id)
    .eq("event_type", "store_hours_event_comment")
    .order("created_at", { ascending: false })
    .limit(500);

  if (date) {
    query = query.eq("event_date", date);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { site_id, date, message, created_by } = body;

  if (!site_id || !date || !message?.trim()) {
    return NextResponse.json(
      { error: "site_id, date, and message required" },
      { status: 400 }
    );
  }

  // Look up org_id from site
  const { data: site } = await supabase
    .from("a_sites")
    .select("org_id")
    .eq("site_id", site_id)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("b_records_log")
    .insert({
      org_id: site.org_id,
      site_id,
      event_type: "store_hours_event_comment",
      source: "store_hours_ui",
      message: message.trim(),
      event_date: date,
      created_by: created_by || "system",
      metadata: {},
    })
    .select("id, message, event_date, created_at, created_by")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comment: data }, { status: 201 });
}
