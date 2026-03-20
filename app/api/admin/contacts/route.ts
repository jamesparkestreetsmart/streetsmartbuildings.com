export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const [contactsRes, companiesRes] = await Promise.all([
      supabase
        .from("zz_contacts")
        .select("id, lead_id, first_name, last_name, email, phone, title, role_type, linkedin_url, organization_name, industry, source_type, assigned_to, notes, duplicate_of, company_id, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("zz_companies")
        .select("id, name"),
    ]);

    if (contactsRes.error) return NextResponse.json({ error: contactsRes.error.message }, { status: 500 });

    // Build company name map
    const companyMap: Record<string, string> = {};
    for (const c of companiesRes.data || []) {
      companyMap[c.id] = c.name;
    }

    const contacts = (contactsRes.data || []).map((c: any) => ({
      ...c,
      company_name: c.company_id ? companyMap[c.company_id] || null : null,
    }));

    return NextResponse.json({ contacts });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
