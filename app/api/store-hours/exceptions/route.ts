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
   POST — create/update rule + regenerate (NEW)
====================================================== */

export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    exception_id,
    site_id,
    name,
    is_closed,
    open_time,
    close_time,
    is_recurring,
    recurrence_rule,
    effective_from_date,
  } = body;

  if (!site_id || !name) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const { error: upsertErr } = await supabase
    .from("b_store_hours_exceptions")
    .upsert({
      exception_id: exception_id ?? undefined,
      site_id,
      name,
      is_closed,
      open_time,
      close_time,
      is_recurring,
      recurrence_rule,
      effective_from_date,
    });

  if (upsertErr) {
    console.error("upsert error:", upsertErr);
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { error: regenErr } = await supabase.rpc(
    "generate_store_hours_exception_occurrences",
    { days_ahead: 180 }
  );

  if (regenErr) {
    console.error("regen error:", regenErr);
    return NextResponse.json({ error: regenErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/* ======================================================
   DELETE — rule-based delete + regenerate (NEW)
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

  const { data: pastRows, error: pastErr } = await supabase
    .from("b_store_hours_exception_occurrences")
    .select("occurrence_id")
    .eq("exception_id", exception_id)
    .lt("occurrence_date", today)
    .limit(1);

  if (pastErr) {
    console.error("past check error:", pastErr);
    return NextResponse.json({ error: pastErr.message }, { status: 500 });
  }

  const { data: rule, error: ruleErr } = await supabase
    .from("b_store_hours_exceptions")
    .select("is_recurring")
    .eq("exception_id", exception_id)
    .single();

  if (ruleErr) {
    console.error("rule load error:", ruleErr);
    return NextResponse.json({ error: ruleErr.message }, { status: 500 });
  }

  if (!rule.is_recurring && pastRows.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete past one-time exception" },
      { status: 400 }
    );
  }

  const { error: delRuleErr } = await supabase
    .from("b_store_hours_exceptions")
    .delete()
    .eq("exception_id", exception_id);

  if (delRuleErr) {
    console.error("rule delete error:", delRuleErr);
    return NextResponse.json({ error: delRuleErr.message }, { status: 500 });
  }

  const { error: regenErr } = await supabase.rpc(
    "generate_store_hours_exception_occurrences",
    { days_ahead: 180 }
  );

  if (regenErr) {
    console.error("regen error:", regenErr);
    return NextResponse.json({ error: regenErr.message }, { status: 500 });
  }

  console.log("Deleted exception rule:", exception_id);

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
