export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GENERIC_PREFIXES = ["info@", "admin@", "support@", "hello@", "contact@", "sales@"];

function isGenericEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return GENERIC_PREFIXES.some((p) => lower.startsWith(p));
}

export async function POST(req: NextRequest) {
  try {
    const { target_type, segment_filter } = await req.json();

    if (target_type === "lead_filter") {
      const query: any = supabase
        .from("z_marketing_leads")
        .select("id, email, first_name, last_name, lead_status, unsubscribed, outreach_ok");

      const { data, error } = await (segment_filter?.field && segment_filter?.value
        ? query.eq(segment_filter.field, segment_filter.value)
        : query);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      let eligible = 0;
      let ineligible = 0;
      const sample: { name: string; email: string }[] = [];

      for (const lead of data || []) {
        const reason = getLeadIneligibleReason(lead);
        if (reason) {
          ineligible++;
        } else {
          eligible++;
          if (sample.length < 5) {
            sample.push({ name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email, email: lead.email });
          }
        }
      }

      return NextResponse.json({ eligible_count: eligible, ineligible_count: ineligible, sample });
    }

    if (target_type === "contact_filter") {
      const query: any = supabase
        .from("zz_contacts")
        .select("id, email, first_name, last_name, unsubscribed, outreach_ok, duplicate_of");

      const { data, error } = await (segment_filter?.field && segment_filter?.value
        ? query.eq(segment_filter.field, segment_filter.value)
        : query);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      let eligible = 0;
      let ineligible = 0;
      const sample: { name: string; email: string }[] = [];

      for (const contact of data || []) {
        const reason = getContactIneligibleReason(contact);
        if (reason) {
          ineligible++;
        } else {
          eligible++;
          if (sample.length < 5) {
            sample.push({ name: `${contact.first_name} ${contact.last_name}`, email: contact.email });
          }
        }
      }

      return NextResponse.json({ eligible_count: eligible, ineligible_count: ineligible, sample });
    }

    return NextResponse.json({ error: "Invalid target_type" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function getLeadIneligibleReason(lead: any): string | null {
  if (!lead.email) return "no_email";
  if (lead.unsubscribed === true) return "unsubscribed";
  if (lead.outreach_ok === false) return "outreach_not_ok";
  if (lead.lead_status === "dead") return "dead_lead";
  if (isGenericEmail(lead.email)) return "generic_email";
  return null;
}

function getContactIneligibleReason(contact: any): string | null {
  if (!contact.email) return "no_email";
  if (contact.unsubscribed === true) return "unsubscribed";
  if (contact.outreach_ok === false) return "outreach_not_ok";
  if (contact.duplicate_of) return "duplicate_contact";
  if (isGenericEmail(contact.email)) return "generic_email";
  return null;
}
