export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

export async function GET() {
  try {
    const [companiesRes, contactCountsRes, dealCountsRes, orgsRes, industriesRes] = await Promise.all([
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
      supabase
        .from("library_industries")
        .select("name")
        .order("name"),
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

    const industries = (industriesRes.data || []).map((i: any) => i.name);

    return NextResponse.json({ companies, industries });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    const body = await req.json();
    const { name, status, website, industry, hq_location, hq_state, estimated_sites, source, assigned_to, notes, org_id } = body;
    if (!name || !status) return NextResponse.json({ error: "name and status required" }, { status: 400 });
    const { data, error } = await supabase
      .from("zz_companies")
      .insert({ name, status, website: website || null, industry: industry || null, hq_location: hq_location || null, hq_state: hq_state || null, estimated_sites: estimated_sites || null, source: source || null, assigned_to: assigned_to || null, notes: notes || null, org_id: org_id || null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "company_create",
      source: "admin_ui",
      message: `Created company: ${name}`,
      metadata: { company_id: data.id },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ company: data });
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
    const allowed = ["name", "status", "website", "industry", "hq_location", "hq_state", "estimated_sites", "source", "assigned_to", "notes", "org_id"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) patch[key] = updates[key];
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    const { error } = await supabase.from("zz_companies").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "company_edit",
      source: "admin_ui",
      message: `Updated company ${id}: ${Object.keys(patch).join(", ")}`,
      metadata: { company_id: id, fields: Object.keys(patch) },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
