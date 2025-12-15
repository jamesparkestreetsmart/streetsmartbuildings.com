import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { site_id, rows } = await req.json();

    if (!site_id || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    for (const row of rows) {
      // Update canonical table
      const { error: updateError } = await supabase
        .from("b_store_hours")
        .update({
          is_closed: row.is_closed,
          open_time: row.open_time,
          close_time: row.close_time,
        })
        .eq("store_hours_id", row.store_hours_id);

      if (updateError) throw updateError;

      // Audit log (this is what RLS was blocking before)
      const { error: logError } = await supabase
        .from("b_store_hours_change_log")
        .insert({
          site_id,
          day_of_week: row.day_of_week,
          open_time: row.open_time,
          close_time: row.close_time,
          is_closed: row.is_closed,
        });

      if (logError) throw logError;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Store hours save error:", e);
    return NextResponse.json(
      { error: e.message || "Server error" },
      { status: 500 }
    );
  }
}
