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
    const { email, first_name, source_page, industry, utm_source, utm_medium, utm_campaign } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Extract request metadata
    const user_agent = request.headers.get("user-agent") || null;
    const ip_address =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;

    // Insert the lead
    const { data, error } = await supabase
      .from("z_marketing_leads")
      .insert({
        email,
        first_name: first_name || null,
        source_page: source_page || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        user_agent,
        ip_address,
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

// PATCH /api/leads — update a lead's fields and log the change
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, first_name, organization_name, projected_sites, updated_by } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing lead id" }, { status: 400 });
    }

    // Fetch current values for diff
    const { data: before } = await supabase
      .from("z_marketing_leads")
      .select("first_name, organization_name, projected_sites, email")
      .eq("id", id)
      .single();

    // Update the lead
    const { error } = await supabase
      .from("z_marketing_leads")
      .update({
        first_name,
        organization_name,
        projected_sites,
      })
      .eq("id", id);

    if (error) throw error;

    // Build change details for the log
    const changes: Record<string, { from: any; to: any }> = {};
    if (before) {
      if (before.first_name !== first_name) {
        changes.first_name = { from: before.first_name, to: first_name };
      }
      if (before.organization_name !== organization_name) {
        changes.organization_name = { from: before.organization_name, to: organization_name };
      }
      if (before.projected_sites !== projected_sites) {
        changes.projected_sites = { from: before.projected_sites, to: projected_sites };
      }
    }

    // Only log if something actually changed
    if (Object.keys(changes).length > 0) {
      const changedFields = Object.keys(changes).join(", ");
      await supabase.from("b_records_log").insert({
        org_id: SSB_ORG_ID,
        event_type: "marketing_lead_edit",
        source: "admin_ui",
        message: `Updated lead ${before?.email || id}: ${changedFields}`,
        metadata: { lead_id: id, email: before?.email, changes },
        created_by: updated_by || "admin",
        event_date: new Date().toISOString().split("T")[0],
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to update lead:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update lead" },
      { status: 500 }
    );
  }
}