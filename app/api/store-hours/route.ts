// file: app/api/store-hours/route.ts

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
    console.log("Store hours API version: 2025-12-16-org-fix")
    try {
    const body = await req.json();
    const { site_id, changed_by, rows } = body;

    // -------------------------------
    // Basic payload validation
    // -------------------------------
    if (
      typeof site_id !== "string" ||
      typeof changed_by !== "string" ||
      !Array.isArray(rows)
    ) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    /**
     * Server-authoritative Supabase client
     * Uses service role, no cookies, no auth session
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

    // -------------------------------
    // Derive org_id from site (trusted)
    // -------------------------------
    const { data: site, error: siteError } = await supabase
      .from("a_sites")
      .select("org_id")
      .eq("site_id", site_id)
      .single();

    if (siteError || !site) {
      return NextResponse.json(
        { error: "Unable to resolve org for site" },
        { status: 400 }
      );
    }

    const org_id = site.org_id;

    // Get site timezone for date logging
    const { data: siteInfo } = await supabase
      .from("a_sites")
      .select("timezone")
      .eq("site_id", site_id)
      .single();
    const tz = siteInfo?.timezone || "America/Chicago";

    // -------------------------------
    // Verify the caller is a valid auth user
    // (Service role handles DB access; org scoping is enforced
    //  by deriving org_id from the site above.)
    // -------------------------------
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(changed_by);
    if (authError || !authUser?.user) {
      console.error("[store-hours] Auth check failed for changed_by:", changed_by, authError?.message);
      return NextResponse.json(
        { error: "Forbidden — user not found" },
        { status: 403 }
      );
    }

    // -------------------------------
    // Process store hours updates
    // -------------------------------
    for (const row of rows) {
      const {
        store_hours_id,
        day_of_week,
        open_time,
        close_time,
        is_closed,
      } = row;

      if (!store_hours_id || !day_of_week) {
        throw new Error("Invalid row payload");
      }

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
       * Detect real change
       */
      const hasChange =
        existing.open_time !== open_time ||
        existing.close_time !== close_time ||
        existing.is_closed !== is_closed;

      // Skip unchanged rows
      if (!hasChange) {
        continue;
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
       * Audit log (source of truth)
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
        changed_by, // a_users.id
      });

      // Activity log entry
      const userEmail = authUser.user.email || "system";
      const localDate = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      await supabase.from("b_records_log").insert({
        site_id,
        org_id,
        event_type: "store_hours_updated",
        event_date: localDate,
        message: `${day_of_week} ${is_closed ? "set to Closed" : `updated: ${open_time} – ${close_time}`}`,
        source: "store_hours",
        created_by: userEmail,
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
