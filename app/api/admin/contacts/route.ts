export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { first_name, last_name, email, title, source_type, phone, role_type, linkedin_url, organization_name, industry, assigned_to, notes, company_id, duplicate_of } = body;
    if (!first_name || !last_name || !title || !source_type) return NextResponse.json({ error: "first_name, last_name, title, source_type required" }, { status: 400 });
    const { data, error } = await supabase
      .from("zz_contacts")
      .insert({ first_name, last_name, email: email || null, title, source_type, phone: phone || null, role_type: role_type || null, linkedin_url: linkedin_url || null, organization_name: organization_name || null, industry: industry || null, assigned_to: assigned_to || null, notes: notes || null, company_id: company_id || null, duplicate_of: duplicate_of || null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const allowed = ["first_name", "last_name", "email", "title", "source_type", "phone", "role_type", "linkedin_url", "organization_name", "industry", "assigned_to", "notes", "company_id", "duplicate_of"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) patch[key] = updates[key];
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    const { error } = await supabase.from("zz_contacts").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
