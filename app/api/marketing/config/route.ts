import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { updates } = body as { updates: Record<string, string> };

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

    const results: Record<string, string> = {};

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
      }
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