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

    // -------------------------------
    // Enforce org membership / permission
    // -------------------------------
    const { data: membership } = await supabase
      .from("library_users_org_memberships")
      .select("role")
      .eq("user_id", changed_by)
      .eq("org_id", org_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Optional: tighten roles later
    // if (!["admin", "editor"].includes(membership.role)) {
    //   return NextResponse.json(
    //     { error: "Insufficient permissions" },
    //     { status: 403 }
    //   );
    // }

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
