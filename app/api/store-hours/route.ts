// file: app/api/store-hours/route.ts

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { site_id, org_id, changed_by, rows } = body;

    if (
      !site_id ||
      !org_id ||
      !changed_by ||
      !Array.isArray(rows)
    ) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    /**
     * Server-authoritative Supabase client
     * Cookies intentionally disabled
     */
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get() {
            return undefined;
          },
        },
      }
    );

    for (const row of rows) {
      const {
        store_hours_id,
        day_of_week,
        open_time,
        close_time,
        is_closed,
      } = row;

      /**
       * Fetch existing row for diffing
       */
      const { data: existing, error: fetchError } = await supabase
        .from("b_store_hours")
        .select("open_time, close_time, is_closed")
        .eq("store_hours_id", store_hours_id)
        .single();

      if (fetchError || !existing) {
        throw fetchError ?? new Error("Store hours row not found");
      }

      /**
       * Update canonical table
       */
      const { error: updateError } = await supabase
        .from("b_store_hours")
        .update({
          open_time,
          close_time,
          is_closed,
          updated_at: new Date().toISOString(),
        })
        .eq("store_hours_id", store_hours_id);

      if (updateError) {
        throw updateError;
      }

      /**
       * Audit log
       */
      await supabase.from("b_store_hours_change_log").insert({
        store_hours_id,
        site_id,
        org_id,
        day_of_week,

        open_time_old: existing.open_time,
        open_time_new: open_time,

        close_time_old: existing.close_time,
        close_time_new: close_time,

        is_closed_old: existing.is_closed,
        is_closed_new: is_closed,

        action: "update",
        changed_by,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Store hours API error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
