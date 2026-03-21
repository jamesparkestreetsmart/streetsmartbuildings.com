export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

export async function POST(req: NextRequest) {
  try {
    const { campaign_name } = await req.json();
    if (!campaign_name) return NextResponse.json({ error: "campaign_name required" }, { status: 400 });

    const adminEmail = await getCurrentUserEmail();

    // Find all pending emails for this campaign that haven't passed send time
    const { data: pending, error: fetchErr } = await supabase
      .from("z_scheduled_emails")
      .select("id")
      .eq("campaign_name", campaign_name)
      .eq("status", "pending")
      .gt("send_at", new Date().toISOString());

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!pending || pending.length === 0) return NextResponse.json({ cancelled: 0 });

    const ids = pending.map((r: any) => r.id);

    const { error: updateErr } = await supabase
      .from("z_scheduled_emails")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminEmail || "admin",
      })
      .in("id", ids);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "scheduled_email_cancel",
      source: "admin_ui",
      message: `Batch cancelled ${ids.length} pending emails for campaign: ${campaign_name}`,
      metadata: { campaign_name, cancelled_count: ids.length },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ cancelled: ids.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
