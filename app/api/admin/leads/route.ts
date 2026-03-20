export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    const body = await req.json();

    // Bulk import mode
    if (body.bulk === true && Array.isArray(body.rows)) {
      // Fetch existing emails for dedup
      const { data: existing } = await supabase
        .from("z_marketing_leads")
        .select("email");
      const existingEmails = new Set(
        (existing || []).map((e: any) => e.email?.toLowerCase().trim()).filter(Boolean)
      );

      const toInsert: any[] = [];
      let skipped = 0;

      for (const row of body.rows) {
        if (row.email) {
          const norm = row.email.toLowerCase().trim();
          if (existingEmails.has(norm)) {
            skipped++;
            continue;
          }
          existingEmails.add(norm);
        }

        toInsert.push({
          email: row.email || null,
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          organization_name: row.organization_name || null,
          projected_sites: row.projected_sites ? parseInt(String(row.projected_sites), 10) : null,
          title: row.title || null,
          phone: row.phone || null,
          industry: row.industry || null,
          notes: row.notes || null,
          source_type: "import",
          lead_status: "new",
          promotion_state: "none",
          welcome_email_status: "not_applicable",
        });
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("z_marketing_leads").insert(toInsert);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await supabase.from("b_records_log").insert({
        org_id: SSB_ORG_ID,
        event_type: "lead_import",
        source: "admin_ui",
        message: `Imported ${toInsert.length} leads · ${skipped} skipped`,
        metadata: { imported: toInsert.length, skipped },
        created_by: adminEmail || "admin",
        event_date: new Date().toISOString().split("T")[0],
      });

      return NextResponse.json({ imported: toInsert.length, skipped });
    }

    // Single lead creation
    const { email, first_name, last_name, organization_name, projected_sites, title, phone, industry, source_type, lead_status, assigned_to, notes, website, linkedin_url, role_type } = body;

    if (!source_type) return NextResponse.json({ error: "source_type required" }, { status: 400 });

    const { data, error } = await supabase
      .from("z_marketing_leads")
      .insert({
        email: email || null,
        first_name: first_name || null,
        last_name: last_name || null,
        organization_name: organization_name || null,
        projected_sites: projected_sites ? parseInt(String(projected_sites), 10) : null,
        title: title || null,
        phone: phone || null,
        industry: industry || null,
        source_type,
        lead_status: lead_status || "new",
        assigned_to: assigned_to || null,
        notes: notes || null,
        website: website || null,
        linkedin_url: linkedin_url || null,
        role_type: role_type || null,
        promotion_state: "none",
        welcome_email_status: "not_applicable",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "lead_create",
      source: "admin_ui",
      message: `Created lead: ${first_name} ${last_name} (${email || "no email"})`,
      metadata: { lead_id: data.id },
      created_by: adminEmail || "admin",
      event_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({ lead: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
