import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

type FixedDateRule = {
  type: "fixed_date";
  month: number; // 1-12
  day: number;   // 1-31
};

type SingleRule = {
  type: "single";
  date: string; // YYYY-MM-DD
};

function toISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayName(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "long" });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );

  const { data: rows, error } = await supabase
    .from("b_store_hours_exceptions")
    .select("*")
    .eq("site_id", site_id);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date();
  const thisYear = today.getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];

  const occurrences: any[] = [];

  for (const row of rows) {
    // ONE-TIME
    if (!row.is_recurring && row.exception_date) {
      const d = new Date(row.exception_date);
      occurrences.push({
        exception_id: row.exception_id,
        name: row.name,
        resolved_date: toISO(d),
        day_of_week: dayName(d),
        open_time: row.open_time,
        close_time: row.close_time,
        is_closed: row.is_closed,
        source_rule: { is_recurring: false },
        ui_state: { is_past: d < today },
      });
      continue;
    }

    // RECURRING (fixed_date)
    const rule = row.recurrence_rule as FixedDateRule | null;
    if (!rule || rule.type !== "fixed_date") continue;

    for (const year of years) {
      const d = new Date(year, rule.month - 1, rule.day);
      if (d < new Date(row.effective_from_date)) continue;

      occurrences.push({
        exception_id: row.exception_id,
        name: row.name,
        resolved_date: toISO(d),
        day_of_week: dayName(d),
        open_time: row.open_time,
        close_time: row.close_time,
        is_closed: row.is_closed,
        source_rule: { is_recurring: true },
        ui_state: { is_past: d < today },
      });
    }
  }

  return NextResponse.json({
    past: occurrences.filter(o => o.ui_state.is_past),
    upcoming: occurrences.filter(o => !o.ui_state.is_past),
  });
}
export {};