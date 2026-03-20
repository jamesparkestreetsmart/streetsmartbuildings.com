export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const [dealsRes, companiesRes, contactsRes, orgsRes] = await Promise.all([
      supabase
        .from("zz_deals")
        .select("id, lead_id, primary_contact_id, org_id, company_id, name, stage, value_estimate, close_probability, projected_sites, next_step, next_step_date, owner, lost_reason, notes, closed_at, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("zz_companies")
        .select("id, name"),
      supabase
        .from("zz_contacts")
        .select("id, first_name, last_name"),
      supabase
        .from("a_organizations")
        .select("org_id, org_name"),
    ]);

    if (dealsRes.error) return NextResponse.json({ error: dealsRes.error.message }, { status: 500 });

    const companyMap: Record<string, string> = {};
    for (const c of companiesRes.data || []) companyMap[c.id] = c.name;

    const contactMap: Record<string, string> = {};
    for (const c of contactsRes.data || []) contactMap[c.id] = `${c.first_name} ${c.last_name}`;

    const orgMap: Record<string, string> = {};
    for (const o of orgsRes.data || []) orgMap[o.org_id] = o.org_name;

    const deals = (dealsRes.data || []).map((d: any) => ({
      ...d,
      company_name: d.company_id ? companyMap[d.company_id] || null : null,
      contact_name: d.primary_contact_id ? contactMap[d.primary_contact_id] || null : null,
      org_name: d.org_id ? orgMap[d.org_id] || null : null,
    }));

    return NextResponse.json({ deals });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
