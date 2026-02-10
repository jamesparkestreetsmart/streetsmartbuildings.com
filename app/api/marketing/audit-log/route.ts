import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

// GET /api/marketing/audit-log — fetch recent marketing events from b_records_log
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("b_records_log")
      .select("id, event_type, source, message, metadata, created_by, created_at")
      .eq("org_id", SSB_ORG_ID)
      .in("event_type", [
        "marketing_lead_edit",
        "marketing_config_update",
        "marketing_email_sent",
        "marketing_email_failed",
        "marketing_org_created",
      ])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ logs: data || [] });
  } catch (err: any) {
    console.error("Failed to fetch audit log:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch audit log" },
      { status: 500 }
    );
  }
}