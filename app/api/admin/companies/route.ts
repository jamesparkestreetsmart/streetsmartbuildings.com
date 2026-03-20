export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const [companiesRes, contactCountsRes, dealCountsRes, orgsRes] = await Promise.all([
      supabase
        .from("zz_companies")
        .select("id, name, website, industry, hq_location, hq_state, estimated_sites, status, org_id, source, assigned_to, notes, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("zz_contacts")
        .select("company_id"),
      supabase
        .from("zz_deals")
        .select("company_id"),
      supabase
        .from("a_organizations")
        .select("org_id, org_name"),
    ]);

    if (companiesRes.error) return NextResponse.json({ error: companiesRes.error.message }, { status: 500 });

    // Build contact counts
    const contactCounts: Record<string, number> = {};
    for (const c of contactCountsRes.data || []) {
      if (c.company_id) contactCounts[c.company_id] = (contactCounts[c.company_id] || 0) + 1;
    }

    // Build deal counts
    const dealCounts: Record<string, number> = {};
    for (const d of dealCountsRes.data || []) {
      if (d.company_id) dealCounts[d.company_id] = (dealCounts[d.company_id] || 0) + 1;
    }

    // Build org name map
    const orgMap: Record<string, string> = {};
    for (const o of orgsRes.data || []) {
      orgMap[o.org_id] = o.org_name;
    }

    const companies = (companiesRes.data || []).map((c: any) => ({
      ...c,
      contact_count: contactCounts[c.id] || 0,
      deal_count: dealCounts[c.id] || 0,
      org_name: c.org_id ? orgMap[c.org_id] || null : null,
    }));

    return NextResponse.json({ companies });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
