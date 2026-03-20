export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const adminEmail = await getCurrentUserEmail();

    // Fetch campaign
    const { data: campaign, error: campErr } = await supabase
      .from("z_marketing_campaigns")
      .select("id, name, email_subject, email_body, delay_hours, is_active")
      .eq("id", id)
      .single();

    if (campErr || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (!campaign.is_active) return NextResponse.json({ error: "Campaign is not active" }, { status: 400 });

    // Fetch eligible pending recipients
    const { data: recipients, error: recErr } = await supabase
      .from("z_campaign_recipients")
      .select("id, lead_id, contact_id")
      .eq("campaign_id", id)
      .eq("is_eligible", true)
      .eq("status", "pending");

    if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
    if (!recipients || recipients.length === 0) return NextResponse.json({ error: "No eligible pending recipients" }, { status: 400 });

    // Calculate send_at
    const delayMs = (campaign.delay_hours || 0) * 3600000;
    const sendAt = new Date(Date.now() + delayMs).toISOString();

    // Create scheduled email rows
    const emailRows = recipients.map((r: any) => ({
      lead_id: r.lead_id || null,
      contact_id: r.contact_id || null,
      send_at: sendAt,
      status: "pending",
      email_type: "campaign",
      campaign_name: campaign.name,
      campaign_subject: campaign.email_subject,
      campaign_body: campaign.email_body,
    }));

    const { error: insertErr } = await supabase.from("z_scheduled_emails").insert(emailRows);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Update recipient status to sent
    const recipientIds = recipients.map((r: any) => r.id);
    await supabase
      .from("z_campaign_recipients")
      .update({ status: "sent" })
      .in("id", recipientIds);

    // Audit log
    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "campaign_send",
      source: "admin_ui",
      message: `Queued ${recipients.length} emails for campaign: ${campaign.name}`,
      metadata: { campaign_id: id, campaign_name: campaign.name, queued: recipients.length },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ queued: recipients.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
