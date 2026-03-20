export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
