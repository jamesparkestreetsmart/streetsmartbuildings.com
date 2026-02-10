import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

// POST /api/leads — create a new marketing lead (from landing page)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, first_name, source_page, industry } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Insert the lead
    const { data, error } = await supabase
      .from("z_marketing_leads")
      .insert({
        email,
        first_name: first_name || null,
        source_page: source_page || null,
        welcome_email_status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Lead insert error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create lead" },
        { status: 500 }
      );
    }

    // Log to activity
    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "marketing_lead_created",
      source: "landing_page",
      message: `New lead: ${email}${first_name ? ` (${first_name})` : ""}${industry ? ` — ${industry}` : ""}`,
      metadata: { lead_id: data.id, email, first_name, source_page, industry },
      created_by: email,
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ success: true, lead_id: data.id });
  } catch (err: any) {
    console.error("Failed to create lead:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create lead" },
      { status: 500 }
    );
  }
}