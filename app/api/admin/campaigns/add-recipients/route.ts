export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GENERIC_PREFIXES = ["info@", "admin@", "support@", "hello@", "contact@", "sales@"];

export async function POST(req: NextRequest) {
  try {
    const { campaign_id, recipients } = await req.json();

    if (!campaign_id || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: "campaign_id and recipients array required" }, { status: 400 });
    }

    // Get existing recipient emails for this campaign to avoid duplicates
    const { data: existing } = await supabase
      .from("z_campaign_recipients")
      .select("email_normalized")
      .eq("campaign_id", campaign_id);

    const existingEmails = new Set((existing || []).map((r: any) => r.email_normalized).filter(Boolean));
    const seenEmails = new Set<string>();
    const rows: any[] = [];

    for (const r of recipients) {
      const email = r.email;
      if (!email) continue;
      const norm = email.toLowerCase().trim();
      if (seenEmails.has(norm) || existingEmails.has(norm)) continue;
      seenEmails.add(norm);

      let reason: string | null = null;
      if (r.unsubscribed === true) reason = "unsubscribed";
      else if (r.outreach_ok === false) reason = "outreach_not_ok";
      else if (r.lead_status === "dead") reason = "dead_lead";
      else if (r.duplicate_of) reason = "duplicate_contact";
      else if (GENERIC_PREFIXES.some((p) => norm.startsWith(p))) reason = "generic_email";

      rows.push({
        campaign_id,
        lead_id: r.lead_id || null,
        contact_id: r.contact_id || null,
        email_normalized: norm,
        is_eligible: !reason,
        ineligible_reason: reason,
        status: "pending",
        added_by: "manual",
        enrolled_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("z_campaign_recipients").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update recipient count on campaign
    const { count } = await supabase
      .from("z_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("is_eligible", true);

    await supabase
      .from("z_marketing_campaigns")
      .update({ recipient_count: count || 0 })
      .eq("id", campaign_id);

    return NextResponse.json({ added: rows.filter((r) => r.is_eligible).length, total: rows.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
