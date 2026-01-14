import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { get: () => undefined } }
  );
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    occurrence_id,
    occurrence_date,
    open_time,
    close_time,
    is_closed,
    name,
  } = body;

  if (!occurrence_id || !occurrence_date) {
    return NextResponse.json(
      { error: "Missing occurrence_id or occurrence_date" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("b_store_hours_exception_occurrences")
    .update({
      occurrence_date,
      open_time,
      close_time,
      is_closed,
      name,
    })
    .eq("occurrence_id", occurrence_id);

  if (error) {
    console.error("update occurrence error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
