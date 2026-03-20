export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const [campaignsRes, emailsRes] = await Promise.all([
      supabase
        .from("z_marketing_campaigns")
        .select("id, name, description, email_subject, email_body, segment_filter, delay_hours, trigger_type, is_active, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("z_scheduled_emails")
        .select("id, lead_id, email_type, campaign_name, status, sent_at, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (campaignsRes.error) return NextResponse.json({ error: campaignsRes.error.message }, { status: 500 });
    if (emailsRes.error) return NextResponse.json({ error: emailsRes.error.message }, { status: 500 });

    return NextResponse.json({
      campaigns: campaignsRes.data,
      emails: emailsRes.data,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, email_subject, email_body, trigger_type, delay_hours, is_active } = body;
    if (!name || !email_subject || !email_body || !trigger_type) {
      return NextResponse.json({ error: "name, email_subject, email_body, and trigger_type required" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("z_marketing_campaigns")
      .insert({
        name,
        description: description || null,
        email_subject,
        email_body,
        trigger_type,
        delay_hours: delay_hours != null ? delay_hours : null,
        is_active: is_active !== false,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ campaign: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
