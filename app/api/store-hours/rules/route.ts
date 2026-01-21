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
      .from("b_store_hours_exceptions_rules")
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
      is_closed,
      open_time,
      close_time,
      recurrence_rule,
      effective_from_date,
    } = body;

    if (!site_id || !name || !recurrence_rule || !effective_from_date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from("b_store_hours_exceptions_rules")   // ✅ correct table
      .insert({
        site_id,
        name,
        is_closed,
        open_time,
        close_time,
        recurrence_rule,
        effective_from_date,
      });

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
