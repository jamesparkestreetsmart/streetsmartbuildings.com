import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );
}

/* ======================================================
   GET – list rules for a site
====================================================== */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const site_id = searchParams.get("site_id");

    if (!site_id) {
      return NextResponse.json(
        { error: "Missing site_id" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("b_store_hours_exception_rules")
      .select("*")
      .eq("site_id", site_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("rules fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });

  } catch (err: any) {
    console.error("rules route crashed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ======================================================
   POST – create new exception rule
====================================================== */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      site_id,
      name,
      event_type,
      rule_type,
      effective_from_date,
      effective_to_date,
      // Standard hours (for most rule types)
      is_closed,
      open_time,
      close_time,
      // Date range daily - three time slots
      start_day_open,
      start_day_close,
      middle_days_closed,
      middle_days_open,
      middle_days_close,
      end_day_open,
      end_day_close,
      // Rule-specific parameters
      date,
      month,
      day,
      weekday,
      nth,
      days,
      interval,
      unit,
      start_date,
    } = body;

    if (!site_id || !name || !event_type || !rule_type || !effective_from_date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // date_range_daily requires effective_to_date
    if (rule_type === "date_range_daily" && !effective_to_date) {
      return NextResponse.json(
        { error: "effective_to_date is required for date_range_daily" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Build insert object based on rule type
    const insertData: Record<string, any> = {
      site_id,
      name,
      event_type,
      rule_type,
      effective_from_date,
      effective_to_date,
    };

    if (rule_type === "date_range_daily") {
      // Hotel-style three time slots
      insertData.start_day_open = start_day_open;
      insertData.start_day_close = start_day_close;
      insertData.middle_days_closed = middle_days_closed;
      insertData.middle_days_open = middle_days_open;
      insertData.middle_days_close = middle_days_close;
      insertData.end_day_open = end_day_open;
      insertData.end_day_close = end_day_close;
    } else {
      // Standard hours
      insertData.is_closed = is_closed;
      insertData.open_time = open_time;
      insertData.close_time = close_time;
    }

    // Add rule-specific parameters
    switch (rule_type) {
      case "single_date":
        if (date !== undefined) insertData.date = date;
        break;
      case "fixed_yearly":
        if (month !== undefined) insertData.month = month;
        if (day !== undefined) insertData.day = day;
        break;
      case "nth_weekday":
        if (month !== undefined) insertData.month = month;
        if (weekday !== undefined) insertData.weekday = weekday;
        if (nth !== undefined) insertData.nth = nth;
        break;
      case "weekly_days":
        if (days !== undefined) insertData.days = days;
        break;
      case "interval":
        if (interval !== undefined) insertData.interval = interval;
        if (unit !== undefined) insertData.unit = unit;
        if (start_date !== undefined) insertData.start_date = start_date;
        break;
    }

    const { error } = await supabase
      .from("b_store_hours_exception_rules")
      .insert(insertData);

    if (error) {
      console.error("rules insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error("rules POST crashed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
