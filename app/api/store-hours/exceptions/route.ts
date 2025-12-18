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
  | { type: "single"; date: string }
  | { type: "unknown_recurring" };

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

      // 🔥 THIS IS THE IMPORTANT CHANGE
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
