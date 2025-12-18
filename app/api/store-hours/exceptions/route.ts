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
  | { type: "fixed_date"; month: number; day: number }
  | { type: "nth_weekday"; month: number; weekday: Weekday; occurrence: number }
  | { type: "single"; date: string };

interface DBException {
  exception_id: string;
  site_id: string;
  name: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  is_recurring: boolean;
  exception_date: string | null;
  recurrence_rule: RecurrenceRule | null;
  effective_from_date: string;
}

/* ======================================================
   Date helpers
====================================================== */

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  occurrence: number
): Date | null {
  const first = new Date(year, month - 1, 1);
  const offset =
    (7 + WEEKDAY_INDEX[weekday] - first.getDay()) % 7;
  const day = 1 + offset + (occurrence - 1) * 7;
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 ? d : null;
}

function expandException(
  ex: DBException,
  year: number
): Date[] {
  if (!ex.is_recurring && ex.exception_date) {
    return [new Date(ex.exception_date)];
  }

  if (!ex.recurrence_rule) return [];

  const rule = ex.recurrence_rule;

  if (rule.type === "fixed_date") {
    return [new Date(year, rule.month - 1, rule.day)];
  }

  if (rule.type === "nth_weekday") {
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
   GET — fetch + project exceptions
====================================================== */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json(
      { error: "Missing site_id" },
      { status: 400 }
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );

  const { data, error } = await supabase
    .from("b_store_hours_exceptions")
    .select("*")
    .eq("site_id", site_id);

  if (error) {
    console.error("GET exceptions error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  const exceptions = data as DBException[];

  const today = new Date();
  const currentYear = today.getFullYear();
  const nextYear = currentYear + 1;
  const lastYear = currentYear - 1;

  function project(year: number) {
    return exceptions.flatMap((ex) =>
      expandException(ex, year)
        .filter(
          (d) => d >= new Date(ex.effective_from_date)
        )
        .map((d) => ({
          ...ex,
          occurrence_date: d.toISOString().slice(0, 10),
          ui_state: {
            is_past: d < today,
            is_future: d >= today,
            year,
          },
        }))
    );
  }

  const lastYearOccurrences = project(lastYear);
  const thisYearOccurrences = project(currentYear);
  const nextYearOccurrences = project(nextYear);

  const past = [
    ...lastYearOccurrences,
    ...thisYearOccurrences.filter((e) => e.ui_state.is_past),
  ];

  const future = [
    ...thisYearOccurrences.filter((e) => e.ui_state.is_future),
    ...nextYearOccurrences,
  ];

  return NextResponse.json({
    past,
    future,
    meta: {
      current_year: currentYear,
      next_year: nextYear,
    },
  });
}

/* ======================================================
   OPTIONS — REQUIRED FOR BROWSER POST
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
   POST — unchanged (your existing logic)
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

    const payload = {
      site_id,
      name,
      is_closed,
      open_time,
      close_time,
      is_recurring,
      exception_date: is_recurring ? null : exception_date,
      recurrence_rule: is_recurring
        ? recurrence_rule
        : { type: "single", date: exception_date },
      effective_from_date,
    };

    const { error } = await supabase
      .from("b_store_hours_exceptions")
      .insert(payload);

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
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

export{};