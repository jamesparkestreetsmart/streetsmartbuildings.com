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

function expandException(ex: DBException, year: number): Date[] {
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

  if (rule.type === "single") {
    return [new Date(rule.date)];
  }

  return [];
}

function formatDayOfWeek(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

/* ======================================================
   GET — fetch + project exceptions
====================================================== */

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

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  /* --------------------------------------------------
     Load rule definitions
  -------------------------------------------------- */

  const { data: rules, error: ruleError } = await supabase
    .from("b_store_hours_exceptions")
    .select("*")
    .eq("site_id", site_id);

  if (ruleError) {
    console.error(ruleError);
    return NextResponse.json({ error: ruleError.message }, { status: 500 });
  }

  /* --------------------------------------------------
     Load ledger (past + overrides)
  -------------------------------------------------- */

  const { data: ledger, error: ledgerError } = await supabase
    .from("b_store_hours_exception_occurrences")
    .select("*")
    .eq("site_id", site_id);

  if (ledgerError) {
    console.error(ledgerError);
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  const ledgerMap = new Map<string, any>();

  for (const row of ledger ?? []) {
    const key = `${row.exception_id}:${row.occurrence_date}`;
    ledgerMap.set(key, row);
  }

  /* --------------------------------------------------
     Expand future occurrences from rules
  -------------------------------------------------- */

  const currentYear = today.getFullYear();
  const years = [currentYear, currentYear + 1];

  const generated: any[] = [];

  for (const rule of rules ?? []) {
    for (const year of years) {
      const dates = expandException(rule as any, year);

      for (const d of dates) {
        const dateStr = d.toISOString().slice(0, 10);

        if (dateStr < rule.effective_from_date) continue;
        if (dateStr < todayStr) continue;

        const key = `${rule.exception_id}:${dateStr}`;
        const override = ledgerMap.get(key);

        if (override) {
          generated.push({
            exception_id: override.exception_id,
            site_id: override.site_id,
            name: override.name,
            date: override.occurrence_date,
            open_time: override.open_time,
            close_time: override.close_time,
            is_closed: override.is_closed,
            is_recurring: override.source_rule?.is_recurring ?? true,
            is_override: true,
          });
        } else {
          generated.push({
            exception_id: rule.exception_id,
            site_id: rule.site_id,
            name: rule.name,
            date: dateStr,
            open_time: rule.open_time,
            close_time: rule.close_time,
            is_closed: rule.is_closed,
            is_recurring: rule.is_recurring,
            is_override: false,
          });
        }
      }
    }
  }

  /* --------------------------------------------------
     Materialize missing past occurrences (lazy freeze)
  -------------------------------------------------- */

  const inserts: any[] = [];

  for (const rule of rules ?? []) {
    const dates = expandException(rule as any, currentYear - 1).concat(
      expandException(rule as any, currentYear)
    );

    for (const d of dates) {
      const dateStr = d.toISOString().slice(0, 10);
      const key = `${rule.exception_id}:${dateStr}`;

      if (dateStr >= todayStr) continue;
      if (dateStr < rule.effective_from_date) continue;
      if (ledgerMap.has(key)) continue;

      inserts.push({
        exception_id: rule.exception_id,
        site_id: rule.site_id,
        occurrence_date: dateStr,
        name: rule.name,
        open_time: rule.open_time,
        close_time: rule.close_time,
        is_closed: rule.is_closed,
        source_rule: {
          exception_id: rule.exception_id,
          is_recurring: rule.is_recurring,
          recurrence_rule: rule.recurrence_rule,
          name: rule.name,
        },
      });
    }
  }

  if (inserts.length > 0) {
    await supabase.from("b_store_hours_exception_occurrences").insert(inserts);
  }

  /* --------------------------------------------------
     Build past from ledger
  -------------------------------------------------- */

  const past = (ledger ?? [])
    .filter((r) => r.occurrence_date < todayStr)
    .map((r) => ({
      exception_id: r.exception_id,
      site_id: r.site_id,
      name: r.name,
      date: r.occurrence_date,
      open_time: r.open_time,
      close_time: r.close_time,
      is_closed: r.is_closed,
      is_recurring: r.source_rule?.is_recurring ?? true,
      is_override: true,
    }));

  const all = [...past, ...generated].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return NextResponse.json({
    occurrences: all,
  });
}



/* ======================================================
   OPTIONS
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
   POST — unchanged
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

    if (!site_id || !name) {
      return NextResponse.json(
        { error: "Missing required fields" },
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
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
