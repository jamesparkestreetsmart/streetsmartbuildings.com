import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* ======================================================
   Types
====================================================== */

interface ExceptionOccurrenceRow {
  occurrence_id: string;
  exception_id: string;
  site_id: string;
  name: string;
  occurrence_date: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  source_rule: any;
}

/* ======================================================
   Helpers
====================================================== */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );
}

/* ======================================================
   GET — occurrences only (single source of truth)
====================================================== */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
  }

  const supabase = getSupabase();
  const today = todayStr();

  const { data, error } = await supabase
    .from("b_store_hours_exception_occurrences")
    .select(`
      occurrence_id,
      exception_id,
      site_id,
      name,
      occurrence_date,
      open_time,
      close_time,
      is_closed,
      source_rule
    `)
    .eq("site_id", site_id)
    .order("occurrence_date", { ascending: true })
    .returns<ExceptionOccurrenceRow[]>();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const past: any[] = [];
  const future: any[] = [];

  for (const r of data ?? []) {
    const row = {
      occurrence_id: r.occurrence_id,
      exception_id: r.exception_id,
      site_id: r.site_id,
      name: r.name,
      date: r.occurrence_date,
      open_time: r.open_time,
      close_time: r.close_time,
      is_closed: r.is_closed,
      is_recurring: r.source_rule?.is_recurring ?? false,
      source_rule: r.source_rule ?? null,
    };

    if (r.occurrence_date < today) past.push(row);
    else future.push(row);
  }

  return NextResponse.json({ past, future });
}

/* ======================================================
   DELETE — safe delete (future only)
====================================================== */

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exception_id = searchParams.get("exception_id");

  if (!exception_id) {
    return NextResponse.json(
      { error: "Missing exception_id" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const today = todayStr();

  /* ------------------------------------------------
     Delete rule only if allowed
     - recurring OR no past occurrences
  ------------------------------------------------ */

  const { data: deletedRules, error: delRuleErr } = await supabase
    .from("b_store_hours_exceptions")
    .delete()
    .eq("exception_id", exception_id)
    .or(`
      is_recurring.eq.true,
      exception_id.not.in.(
        select exception_id
        from b_store_hours_exception_occurrences
        where occurrence_date < '${today}'
      )
    `)
    .select("exception_id");

  if (delRuleErr) {
    console.error(delRuleErr);
    return NextResponse.json({ error: delRuleErr.message }, { status: 500 });
  }

  if (!deletedRules || deletedRules.length === 0) {
    return NextResponse.json(
      { error: "Cannot delete past one-time exception" },
      { status: 400 }
    );
  }

  /* ------------------------------------------------
     Delete future occurrences
  ------------------------------------------------ */

  const { error: delOccErr } = await supabase
    .from("b_store_hours_exception_occurrences")
    .delete()
    .eq("exception_id", exception_id)
    .gte("occurrence_date", today);

  if (delOccErr) {
    console.error(delOccErr);
    return NextResponse.json({ error: delOccErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
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
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }
  );
}
