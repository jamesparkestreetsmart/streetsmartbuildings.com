export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GENERIC_PREFIXES = ["info@", "admin@", "support@", "hello@", "contact@", "sales@"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    // Get admin email server-side
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch lead
    const { data: lead, error: leadErr } = await supabase
      .from("z_marketing_leads")
      .select("id, first_name, last_name, email, organization_name, title, phone, role_type, linkedin_url, industry, source_type, promotion_state, matched_contact_id")
      .eq("id", id)
      .single();

    if (leadErr || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    // 1. Check eligibility
    if (!lead.first_name || !lead.last_name || !lead.email || !lead.organization_name || !lead.title) {
      return NextResponse.json({ error: "Lead missing required fields (first_name, last_name, email, organization_name, title)" }, { status: 400 });
    }

    // 2. Already promoted
    if (lead.promotion_state === "promoted") {
      return NextResponse.json({ error: "Lead already promoted" }, { status: 400 });
    }

    // 3. Generic inbox check
    const emailLower = lead.email.toLowerCase();
    for (const prefix of GENERIC_PREFIXES) {
      if (emailLower.startsWith(prefix)) {
        return NextResponse.json({ blocked: true, reason: "generic_email" }, { status: 200 });
      }
    }

    // 4. Hard duplicate check
    const { data: exactMatch } = await supabase
      .from("zz_contacts")
      .select("id, first_name, last_name, email")
      .ilike("email", lead.email)
      .limit(1)
      .single();

    if (exactMatch) {
      await supabase
        .from("z_marketing_leads")
        .update({ promotion_state: "duplicate_review", matched_contact_id: exactMatch.id })
        .eq("id", id);
      return NextResponse.json({ duplicate: true, existing_contact_id: exactMatch.id });
    }

    // 5. Soft warning check (same org + similar name, case-insensitive)
    if (!force) {
      const { data: softMatches } = await supabase
        .from("zz_contacts")
        .select("id, first_name, last_name, email, organization_name")
        .ilike("organization_name", lead.organization_name);

      if (softMatches && softMatches.length > 0) {
        const similar = softMatches.filter((c: any) =>
          c.first_name?.toLowerCase() === lead.first_name?.toLowerCase() ||
          c.last_name?.toLowerCase() === lead.last_name?.toLowerCase()
        );
        if (similar.length > 0) {
          return NextResponse.json({ soft_warning: true, similar_contacts: similar });
        }
      }
    }

    // 7. Create contact
    const { data: newContact, error: insertErr } = await supabase
      .from("zz_contacts")
      .insert({
        lead_id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        phone: lead.phone || null,
        title: lead.title,
        role_type: lead.role_type || "unknown",
        linkedin_url: lead.linkedin_url || null,
        organization_name: lead.organization_name,
        industry: lead.industry || null,
        source_type: lead.source_type || "manual",
      })
      .select()
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Update lead
    await supabase
      .from("z_marketing_leads")
      .update({
        contact_id: newContact.id,
        promotion_state: "promoted",
        promoted_at: new Date().toISOString(),
        promoted_by: adminEmail,
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, contact: newContact });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
