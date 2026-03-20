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
    const [activitiesRes, contactsRes, dealsRes] = await Promise.all([
      supabase
        .from("zz_activities")
        .select("id, deal_id, contact_id, lead_id, type, subject, notes, outcome, activity_date, owner, created_at")
        .order("activity_date", { ascending: false }),
      supabase
        .from("zz_contacts")
        .select("id, first_name, last_name"),
      supabase
        .from("zz_deals")
        .select("id, name"),
    ]);

    if (activitiesRes.error) return NextResponse.json({ error: activitiesRes.error.message }, { status: 500 });

    const contactMap: Record<string, string> = {};
    for (const c of contactsRes.data || []) contactMap[c.id] = `${c.first_name} ${c.last_name}`;

    const dealMap: Record<string, string> = {};
    for (const d of dealsRes.data || []) dealMap[d.id] = d.name;

    const activities = (activitiesRes.data || []).map((a: any) => ({
      ...a,
      contact_name: a.contact_id ? contactMap[a.contact_id] || null : null,
      deal_name: a.deal_id ? dealMap[a.deal_id] || null : null,
    }));

    return NextResponse.json({ activities });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    const body = await req.json();
    const { type, activity_date, deal_id, contact_id, lead_id, subject, notes, outcome, owner } = body;
    if (!type || !activity_date) return NextResponse.json({ error: "type and activity_date required" }, { status: 400 });
    const { data, error } = await supabase
      .from("zz_activities")
      .insert({ type, activity_date, deal_id: deal_id || null, contact_id: contact_id || null, lead_id: lead_id || null, subject: subject || null, notes: notes || null, outcome: outcome || null, owner: owner || null })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "activity_create",
      source: "admin_ui",
      message: `Created activity: ${type} ${subject || ""}`.trim(),
      metadata: { activity_id: data.id },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ activity: data });
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
    const allowed = ["type", "activity_date", "deal_id", "contact_id", "lead_id", "subject", "notes", "outcome", "owner"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) patch[key] = updates[key];
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    const { error } = await supabase.from("zz_activities").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "activity_edit",
      source: "admin_ui",
      message: `Updated activity ${id}: ${Object.keys(patch).join(", ")}`,
      metadata: { activity_id: id, fields: Object.keys(patch) },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
