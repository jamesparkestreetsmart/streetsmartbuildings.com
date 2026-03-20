export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GENERIC_PREFIXES = ["info@", "admin@", "support@", "hello@", "contact@", "sales@"];

function isGenericEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return GENERIC_PREFIXES.some((p) => lower.startsWith(p));
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const adminEmail = await getCurrentUserEmail();

    // Fetch campaign
    const { data: campaign, error: campErr } = await supabase
      .from("z_marketing_campaigns")
      .select("id, target_type, segment_filter")
      .eq("id", id)
      .single();

    if (campErr || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    // Delete existing auto_filter recipients for idempotent rebuild
    await supabase
      .from("z_campaign_recipients")
      .delete()
      .eq("campaign_id", id)
      .eq("added_by", "auto_filter");

    // Fetch existing manual recipients to get their normalized emails (for dedup)
    const { data: existingManual } = await supabase
      .from("z_campaign_recipients")
      .select("email_normalized")
      .eq("campaign_id", id)
      .eq("added_by", "manual");

    const existingEmails = new Set((existingManual || []).map((r: any) => r.email_normalized).filter(Boolean));

    // Collect all people
    interface Candidate {
      lead_id: string | null;
      contact_id: string | null;
      email: string;
      email_normalized: string;
      is_eligible: boolean;
      ineligible_reason: string | null;
    }

    const candidates: Candidate[] = [];
    const seenEmails = new Set<string>();

    // For contact_filter or lead_filter, fetch the relevant data
    if (campaign.target_type === "lead_filter" || campaign.target_type === "contact_filter") {
      // Always fetch contacts first (they take priority in dedup)
      if (campaign.target_type === "contact_filter") {
        const sf = campaign.segment_filter as any;
        const query: any = supabase
          .from("zz_contacts")
          .select("id, email, first_name, last_name, unsubscribed, outreach_ok, duplicate_of");

        const { data: contacts } = await (sf?.field && sf?.value ? query.eq(sf.field, sf.value) : query);
        for (const c of contacts || []) {
          if (!c.email) continue;
          const norm = normalizeEmail(c.email);
          if (seenEmails.has(norm) || existingEmails.has(norm)) continue;
          seenEmails.add(norm);

          let reason: string | null = null;
          if (c.unsubscribed === true) reason = "unsubscribed";
          else if (c.outreach_ok === false) reason = "outreach_not_ok";
          else if (c.duplicate_of) reason = "duplicate_contact";
          else if (isGenericEmail(c.email)) reason = "generic_email";

          candidates.push({
            lead_id: null,
            contact_id: c.id,
            email: c.email,
            email_normalized: norm,
            is_eligible: !reason,
            ineligible_reason: reason,
          });
        }
      }

      if (campaign.target_type === "lead_filter") {
        // Fetch all contacts first to build email set for dedup (prefer contacts)
        const { data: allContacts } = await supabase
          .from("zz_contacts")
          .select("email");
        const contactEmails = new Set((allContacts || []).map((c: any) => c.email ? normalizeEmail(c.email) : ""));

        const sf2 = campaign.segment_filter as any;
        const leadQuery: any = supabase
          .from("z_marketing_leads")
          .select("id, email, first_name, last_name, lead_status, unsubscribed, outreach_ok");

        const { data: leads } = await (sf2?.field && sf2?.value ? leadQuery.eq(sf2.field, sf2.value) : leadQuery);
        for (const l of leads || []) {
          if (!l.email) continue;
          const norm = normalizeEmail(l.email);
          // Skip if contact exists with same email (prefer contact)
          if (contactEmails.has(norm)) continue;
          if (seenEmails.has(norm) || existingEmails.has(norm)) continue;
          seenEmails.add(norm);

          let reason: string | null = null;
          if (l.unsubscribed === true) reason = "unsubscribed";
          else if (l.outreach_ok === false) reason = "outreach_not_ok";
          else if (l.lead_status === "dead") reason = "dead_lead";
          else if (isGenericEmail(l.email)) reason = "generic_email";

          candidates.push({
            lead_id: l.id,
            contact_id: null,
            email: l.email,
            email_normalized: norm,
            is_eligible: !reason,
            ineligible_reason: reason,
          });
        }
      }
    }

    // Insert recipients
    let added = 0;
    let skippedIneligible = 0;
    let skippedDuplicate = 0;

    if (candidates.length > 0) {
      const rows = candidates.map((c) => ({
        campaign_id: id,
        lead_id: c.lead_id,
        contact_id: c.contact_id,
        email_normalized: c.email_normalized,
        is_eligible: c.is_eligible,
        ineligible_reason: c.ineligible_reason,
        status: "pending",
        added_by: "auto_filter",
        enrolled_at: new Date().toISOString(),
      }));

      const { error: insertErr } = await supabase
        .from("z_campaign_recipients")
        .insert(rows);

      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

      added = candidates.filter((c) => c.is_eligible).length;
      skippedIneligible = candidates.filter((c) => !c.is_eligible).length;
    }

    // Count total eligible recipients (manual + auto)
    const { count } = await supabase
      .from("z_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("is_eligible", true);

    // Update campaign
    await supabase
      .from("z_marketing_campaigns")
      .update({
        last_audience_built_at: new Date().toISOString(),
        audience_built_by: adminEmail || "admin",
        recipient_count: count || 0,
      })
      .eq("id", id);

    return NextResponse.json({ added, skipped_ineligible: skippedIneligible, skipped_duplicate: skippedDuplicate });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
