import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* ======================================================
   Helpers
====================================================== */

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );
}

/* ======================================================
   GET — list rules for site
====================================================== */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("b_store_hours_exceptions_future")
    .select("*")
    .eq("site_id", site_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
}

/* ======================================================
   POST — create or update rule
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

  const { error } = await supabase
    .from("b_store_hours_exceptions_future")
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

  if (error) {
    console.error("upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/* ======================================================
   DELETE — delete rule
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

  const { error } = await supabase
    .from("b_store_hours_exceptions_future")
    .delete()
    .eq("exception_id", exception_id);

  if (error) {
    console.error("delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
