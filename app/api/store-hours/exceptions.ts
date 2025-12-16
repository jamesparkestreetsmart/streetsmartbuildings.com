// file: app/api/store-hours/exceptions/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* -----------------------------
   Date helpers
----------------------------- */

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

/**
 * Recurrence rule shapes
 */
type FixedDateRule = {
  month: number;
  day: number;
};

type NthWeekdayRule = {
  month: number;
  weekday: Weekday;
  occurrence: number;
};

type LastWeekdayRule = {
  month: number;
  weekday: Weekday;
};

type RecurrenceRule =
  | FixedDateRule
  | NthWeekdayRule
  | LastWeekdayRule;

type RecurrenceType =
  | "fixed_date"
  | "nth_weekday_of_month"
  | "last_weekday_of_month";

function resolveExceptionDate(
  recurrenceType: RecurrenceType,
  rule: RecurrenceRule,
  year: number
): Date {
  if (recurrenceType === "fixed_date") {
    if (!("day" in rule)) {
      throw new Error("Invalid fixed_date rule");
    }
    return new Date(year, rule.month - 1, rule.day);
  }

  if (recurrenceType === "nth_weekday_of_month") {
    if (!("weekday" in rule) || !("occurrence" in rule)) {
      throw new Error("Invalid nth_weekday_of_month rule");
    }

    const target = WEEKDAY_INDEX[rule.weekday];
    let count = 0;

    for (let d = 1; d <= 31; d++) {
      const date = new Date(year, rule.month - 1, d);
      if (date.getMonth() !== rule.month - 1) break;

      if (date.getDay() === target) {
        count++;
        if (count === rule.occurrence) return date;
      }
    }
  }

  if (recurrenceType === "last_weekday_of_month") {
    if (!("weekday" in rule)) {
      throw new Error("Invalid last_weekday_of_month rule");
    }

    const target = WEEKDAY_INDEX[rule.weekday];
    let last: Date | null = null;

    for (let d = 1; d <= 31; d++) {
      const date = new Date(year, rule.month - 1, d);
      if (date.getMonth() !== rule.month - 1) break;

      if (date.getDay() === target) last = date;
    }

    if (last) return last;
  }

  throw new Error("Unable to resolve exception date");
}

/* -----------------------------
   GET handler
----------------------------- */

export async function GET(req: NextRequest) {
  try {
    const site_id = req.nextUrl.searchParams.get("site_id");
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

    const { data: site } = await supabase
      .from("a_sites")
      .select("org_id")
      .eq("site_id", site_id)
      .single();

    if (!site) {
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentYear = today.getFullYear();
    const lastYear = currentYear - 1;

    const { data: exceptions } = await supabase
      .from("b_store_hours_exceptions")
      .select("*")
      .eq("site_id", site_id);

    function project(year: number) {
      return (exceptions ?? [])
        .map((ex) => {
          let resolvedDate: Date | null = null;

          if (ex.is_recurring) {
            resolvedDate = resolveExceptionDate(
              ex.recurrence_type as RecurrenceType,
              ex.recurrence_rule as RecurrenceRule,
              year
            );
          } else {
            const d = new Date(ex.exception_date);
            if (d.getFullYear() !== year) return null;
            resolvedDate = d;
          }

          // 🔐 REQUIRED NARROWING
          if (!resolvedDate) return null;

          // 🔑 Forward-only rule enforcement
          if (resolvedDate < new Date(ex.effective_from_date)) {
            return null;
          }

          const isPast = resolvedDate < today;

          return {
            exception_id: ex.exception_id,
            name: ex.name,
            resolved_date: resolvedDate.toISOString().slice(0, 10),
            day_of_week: resolvedDate.toLocaleDateString("en-US", {
              weekday: "long",
            }),

            status: ex.is_closed ? "closed" : "special_hours",
            open_time: ex.open_time,
            close_time: ex.close_time,

            is_recurring: ex.is_recurring,
            recurrence_type: ex.recurrence_type ?? null,
            source_year: year,

            ui_state: {
              is_past: isPast,
              is_editable: !isPast,
              is_deletable: !isPast && !ex.is_recurring,
              requires_forward_only_edit: !isPast && ex.is_recurring,
            },
          };
        })
        .filter(Boolean);
    }

    const { data: changeLog } = await supabase
      .from("b_store_hours_change_log")
      .select("log_id, changed_at, action, changed_by")
      .eq("site_id", site_id)
      .order("changed_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      meta: {
        site_id,
        generated_at: new Date().toISOString(),
      },
      this_year: {
        year: currentYear,
        exceptions: project(currentYear),
      },
      last_year: {
        year: lastYear,
        exceptions: project(lastYear),
      },
      change_log: {
        limit: 20,
        rows: changeLog ?? [],
      },
    });
  } catch (err: any) {
    console.error("Exceptions API error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
