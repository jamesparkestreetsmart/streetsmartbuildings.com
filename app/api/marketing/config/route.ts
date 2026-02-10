import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

// GET /api/marketing/config — fetch all marketing config
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("z_marketing_config")
      .select("key, value, updated_at")
      .order("key");

    if (error) throw error;

    // Convert rows to a keyed object for easy consumption
    const config: Record<string, string> = {};
    data?.forEach((row) => {
      config[row.key] = row.value;
    });

    return NextResponse.json({ config });
  } catch (err: any) {
    console.error("Failed to fetch config:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch config" },
      { status: 500 }
    );
  }
}

// PUT /api/marketing/config — update one or more config keys
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { updates, updated_by } = body as { updates: Record<string, string>; updated_by?: string };

    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "Request body must include 'updates' object" },
        { status: 400 }
      );
    }

    const allowedKeys = [
      "welcome_email_delay_hours",
      "welcome_email_subject",
      "welcome_email_body",
    ];

    // Fetch current values for diff
    const { data: currentConfig } = await supabase
      .from("z_marketing_config")
      .select("key, value")
      .in("key", allowedKeys);

    const currentValues: Record<string, string> = {};
    currentConfig?.forEach((row) => {
      currentValues[row.key] = row.value;
    });

    const results: Record<string, string> = {};
    const changes: Record<string, { from: string; to: string }> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) {
        results[key] = "skipped (not an allowed key)";
        continue;
      }

      // Validate delay_hours is a positive integer
      if (key === "welcome_email_delay_hours") {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > 720) {
          results[key] = "invalid (must be 1-720 hours)";
          continue;
        }
      }

      const { error } = await supabase
        .from("z_marketing_config")
        .upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );

      if (error) {
        results[key] = `error: ${error.message}`;
      } else {
        results[key] = "updated";

        // Track if value actually changed
        if (currentValues[key] !== value) {
          changes[key] = { from: currentValues[key] || "", to: value };
        }
      }
    }

    // Log changes to audit log
    if (Object.keys(changes).length > 0) {
      const changedKeys = Object.keys(changes);
      // Summarize — don't log full body text in message
      const summary = changedKeys.map((k) => {
        if (k === "welcome_email_body") return "email body";
        if (k === "welcome_email_subject") return "email subject";
        if (k === "welcome_email_delay_hours") return `delay → ${changes[k].to}h`;
        return k;
      }).join(", ");

      await supabase.from("b_records_log").insert({
        org_id: SSB_ORG_ID,
        event_type: "marketing_config_update",
        source: "admin_ui",
        message: `Updated config: ${summary}`,
        metadata: { changes },
        created_by: updated_by || "admin",
        event_date: new Date().toISOString().split("T")[0],
      });
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("Failed to update config:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update config" },
      { status: 500 }
    );
  }
}