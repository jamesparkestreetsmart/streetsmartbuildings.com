export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";
const GENERIC_PREFIXES = ["info@", "admin@", "support@", "hello@", "contact@", "sales@"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const recipientsFor = searchParams.get("recipients_for");

    if (recipientsFor) {
      // Fetch recipients for a specific campaign
      const { data: recipients, error } = await supabase
        .from("z_campaign_recipients")
        .select("id, campaign_id, lead_id, contact_id, email_normalized, is_eligible, ineligible_reason, status, added_by, enrolled_at")
        .eq("campaign_id", recipientsFor)
        .order("enrolled_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Fetch lead and contact names
      const leadIds = (recipients || []).filter((r: any) => r.lead_id).map((r: any) => r.lead_id);
      const contactIds = (recipients || []).filter((r: any) => r.contact_id).map((r: any) => r.contact_id);

      const [leadsRes, contactsRes] = await Promise.all([
        leadIds.length > 0 ? supabase.from("z_marketing_leads").select("id, first_name, last_name, email").in("id", leadIds) : { data: [] },
        contactIds.length > 0 ? supabase.from("zz_contacts").select("id, first_name, last_name, email").in("id", contactIds) : { data: [] },
      ]);

      const leadMap: Record<string, any> = {};
      for (const l of leadsRes.data || []) leadMap[l.id] = l;
      const contactMap: Record<string, any> = {};
      for (const c of contactsRes.data || []) contactMap[c.id] = c;

      const enriched = (recipients || []).map((r: any) => {
        const person = r.contact_id ? contactMap[r.contact_id] : r.lead_id ? leadMap[r.lead_id] : null;
        return {
          ...r,
          name: person ? [person.first_name, person.last_name].filter(Boolean).join(" ") : r.email_normalized,
          email: person?.email || r.email_normalized,
          type: r.contact_id ? "contact" : "lead",
        };
      });

      return NextResponse.json({ recipients: enriched });
    }

    // Normal list view
    const [campaignsRes, emailsRes] = await Promise.all([
      supabase
        .from("z_marketing_campaigns")
        .select("id, name, description, email_subject, email_body, segment_filter, delay_hours, trigger_type, target_type, is_active, created_at, last_audience_built_at, audience_built_by, recipient_count, max_delay_hours")
        .order("created_at", { ascending: false }),
      supabase
        .from("z_scheduled_emails")
        .select("id, lead_id, email_type, campaign_name, status, sent_at, send_at, cancelled_at, created_at")
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
    const adminEmail = await getCurrentUserEmail();
    const body = await req.json();
    const { name, description, email_subject, email_body, trigger_type, delay_hours, is_active, target_type, segment_filter, selected_recipients } = body;
    if (!name || !email_subject || !email_body || !trigger_type) {
      return NextResponse.json({ error: "name, email_subject, email_body, and trigger_type required" }, { status: 400 });
    }
    const { data: campaign, error } = await supabase
      .from("z_marketing_campaigns")
      .insert({
        name,
        description: description || null,
        email_subject,
        email_body,
        trigger_type,
        target_type: target_type || "manual_selection",
        segment_filter: segment_filter || null,
        delay_hours: delay_hours != null ? delay_hours : null,
        is_active: is_active !== false,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // For manual_selection, insert selected recipients with eligibility checks
    if ((target_type || "manual_selection") === "manual_selection" && Array.isArray(selected_recipients) && selected_recipients.length > 0) {
      const seenEmails = new Set<string>();
      const rows: any[] = [];

      for (const r of selected_recipients) {
        const email = r.email;
        if (!email) continue;
        const norm = email.toLowerCase().trim();
        if (seenEmails.has(norm)) continue;
        seenEmails.add(norm);

        let reason: string | null = null;
        if (r.unsubscribed === true) reason = "unsubscribed";
        else if (r.outreach_ok === false) reason = "outreach_not_ok";
        else if (r.lead_status === "dead") reason = "dead_lead";
        else if (r.duplicate_of) reason = "duplicate_contact";
        else if (GENERIC_PREFIXES.some((p) => norm.startsWith(p))) reason = "generic_email";

        rows.push({
          campaign_id: campaign.id,
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
        await supabase.from("z_campaign_recipients").insert(rows);
        const eligibleCount = rows.filter((r) => r.is_eligible).length;
        await supabase.from("z_marketing_campaigns").update({ recipient_count: eligibleCount }).eq("id", campaign.id);
      }
    }

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "campaign_create",
      source: "admin_ui",
      message: `Created campaign: ${name}`,
      metadata: { campaign_id: campaign.id },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ campaign });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const allowed = ["name", "description", "email_subject", "email_body", "trigger_type", "target_type", "segment_filter", "delay_hours", "is_active", "max_delay_hours"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) patch[key] = updates[key];
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    const { error } = await supabase.from("z_marketing_campaigns").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "campaign_edit",
      source: "admin_ui",
      message: `Updated campaign ${id}: ${Object.keys(patch).join(", ")}`,
      metadata: { campaign_id: id, fields: Object.keys(patch) },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
