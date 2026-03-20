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

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    const body = await req.json();
    const { name, stage, company_id, primary_contact_id, org_id, lead_id, value_estimate, close_probability, projected_sites, next_step, next_step_date, owner, lost_reason, notes } = body;
    if (!name || !stage) return NextResponse.json({ error: "name and stage required" }, { status: 400 });
    const { data, error } = await supabase
      .from("zz_deals")
      .insert({ name, stage, company_id: company_id || null, primary_contact_id: primary_contact_id || null, org_id: org_id || null, lead_id: lead_id || null, value_estimate: value_estimate || null, close_probability: close_probability != null ? close_probability : null, projected_sites: projected_sites || null, next_step: next_step || null, next_step_date: next_step_date || null, owner: owner || null, lost_reason: lost_reason || null, notes: notes || null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "deal_create",
      source: "admin_ui",
      message: `Created deal: ${name}`,
      metadata: { deal_id: data.id },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ deal: data });
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
    const allowed = ["name", "stage", "company_id", "primary_contact_id", "org_id", "lead_id", "value_estimate", "close_probability", "projected_sites", "next_step", "next_step_date", "owner", "lost_reason", "notes", "closed_at"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) patch[key] = updates[key];
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    const { error } = await supabase.from("zz_deals").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "deal_edit",
      source: "admin_ui",
      message: `Updated deal ${id}: ${Object.keys(patch).join(", ")}`,
      metadata: { deal_id: id, fields: Object.keys(patch) },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
