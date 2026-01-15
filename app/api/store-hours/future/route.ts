import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("view_store_hours_future")
    .select("*")
    .eq("site_id", site_id)
    .order("target_date", { ascending: true });

  if (error) {
    console.error("future fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
