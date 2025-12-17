import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* ======================================================
   Types
====================================================== */

type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type RecurrenceRule =
  | { month: number; day: number }
  | { month: number; weekday: Weekday; occurrence: number }
  | { interval_months: number; anchor_date: string };

type ExceptionOccurrence = {
  exception_id: string;
  name: string;
  resolved_date: string;
  day_of_week: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  source_rule: {
    is_recurring: boolean;
    recurrence_rule: RecurrenceRule | null;
    effective_from_date: string;
  };
  ui_state: {
    is_past: boolean;
    is_editable: boolean;
    requires_forward_only_edit: boolean;
  };
};

/* ======================================================
   Date helpers
====================================================== */

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  occurrence: number
): Date | null {
  const target = WEEKDAY_INDEX[weekday];
  let count = 0;

  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getMonth() !== month - 1) break;
    if (date.getDay() === target) {
      count++;
      if (count === occurrence) return date;
    }
  }
  return null;
}

function expandExceptionIntoOccurrences(ex: any, year: number): Date[] {
  if (!ex.is_recurring) {
    const d = new Date(ex.exception_date);
    return d.getFullYear() === year ? [d] : [];
  }

  if (!ex.recurrence_rule) {
    const base = new Date(ex.exception_date);
    return [new Date(year, base.getMonth(), base.getDate())];
  }

  const rule = ex.recurrence_rule as RecurrenceRule;

  if ("interval_months" in rule) {
    const results: Date[] = [];
    let current = new Date(rule.anchor_date);

    while (current.getFullYear() < year) {
      current.setMonth(current.getMonth() + rule.interval_months);
    }

    while (current.getFullYear() === year) {
      results.push(new Date(current));
      current.setMonth(current.getMonth() + rule.interval_months);
    }

    return results;
  }

  if ("day" in rule) {
    return [new Date(year, rule.month - 1, rule.day)];
  }

  if ("weekday" in rule) {
    const d = nthWeekdayOfMonth(
      year,
      rule.month,
      rule.weekday,
      rule.occurrence
    );
    return d ? [d] : [];
  }

  return [];
}

/* ======================================================
   OPTIONS — REQUIRED FOR BROWSER POST (FIXES 405)
====================================================== */

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }
  );
}

/* ======================================================
   GET handler
====================================================== */

export async function GET(req: NextRequest) {
  try {
    const site_id = req.nextUrl.searchParams.get("site_id");
    if (!site_id) {
      return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { get: () => undefined } }
    );

    const { data: exceptions, error } = await supabase
      .from("b_store_hours_exceptions")
      .select("*")
      .eq("site_id", site_id);

    if (error) throw error;

    const today = new Date();
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const currentYear = today.getFullYear();
    const lastYear = currentYear - 1;

    const project = (year: number): ExceptionOccurrence[] =>
      (exceptions ?? []).flatMap((ex) =>
        expandExceptionIntoOccurrences(ex, year)
          .filter((d) => d >= new Date(ex.effective_from_date))
          .map((date) => {
            const isPast = date < todayMidnight;
            return {
              exception_id: ex.exception_id,
              name: ex.name,
              resolved_date: date.toISOString().slice(0, 10),
              day_of_week: date.toLocaleDateString("en-US", {
                weekday: "long",
              }),
              open_time: ex.open_time,
              close_time: ex.close_time,
              is_closed: ex.is_closed,
              source_rule: {
                is_recurring: ex.is_recurring,
                recurrence_rule: ex.recurrence_rule ?? null,
                effective_from_date: ex.effective_from_date,
              },
              ui_state: {
                is_past: isPast,
                is_editable: !isPast,
                requires_forward_only_edit: ex.is_recurring && !isPast,
              },
            };
          })
      );

    return NextResponse.json({
      this_year: { year: currentYear, exceptions: project(currentYear) },
      last_year: { year: lastYear, exceptions: project(lastYear) },
    });
  } catch (err: any) {
    console.error("Exceptions API error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}

/* ======================================================
   POST handler — create exception
====================================================== */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      site_id,
      name,
      is_closed,
      open_time,
      close_time,
      is_recurring,
      exception_date,
      recurrence_rule,
      effective_from_date,
    } = body;

    if (!site_id) {
      return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json(
        { error: "Missing exception name" },
        { status: 400 }
      );
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { get: () => undefined } }
    );

    const { error } = await supabase
      .from("b_store_hours_exceptions")
      .insert({
        site_id,
        name,
        is_closed,
        open_time,
        close_time,
        is_recurring,
        exception_date: is_recurring ? null : exception_date,
        recurrence_rule: is_recurring ? recurrence_rule : null,
        effective_from_date,
      });

    if (error) {
      console.error("Insert exception error:", error);
      return NextResponse.json(
        { error: "Failed to create exception" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("POST /exceptions error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
