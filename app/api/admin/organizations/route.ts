import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/organizations — fetch all orgs + eligible leads for linking
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("a_organizations")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Fetch leads eligible for org creation: have org name + projected sites, no org_id yet
    const { data: eligibleLeads } = await supabase
      .from("z_marketing_leads")
      .select("id, email, first_name, organization_name, projected_sites")
      .not("organization_name", "is", null)
      .not("projected_sites", "is", null)
      .is("org_id", null)
      .order("organization_name");

    return NextResponse.json({
      organizations: data,
      eligibleLeads: eligibleLeads || [],
    });
  } catch (err: any) {
    console.error("Failed to fetch orgs:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

// POST /api/admin/organizations — create new org, optionally linked to a lead
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { org_name, org_identifier, owner_email, owner_first_name, owner_last_name, lead_id } = body;

    if (!org_name || !org_identifier) {
      return NextResponse.json(
        { error: "org_name and org_identifier are required" },
        { status: 400 }
      );
    }

    // Create the org
    const { data, error } = await supabase
      .from("a_organizations")
      .insert({
        org_name,
        org_identifier: org_identifier.toUpperCase(),
        owner_email: owner_email || null,
        owner_first_name: owner_first_name || null,
        owner_last_name: owner_last_name || null,
        billing_country: "US",
        marketing_lead_id: lead_id || null,
      })
      .select()
      .single();

    if (error) throw error;

    // If created from a lead, link the lead back to the org
    if (lead_id && data?.org_id) {
      await supabase
        .from("z_marketing_leads")
        .update({ org_id: data.org_id })
        .eq("id", lead_id);
    }

    // Log to SSB org activity
    const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";
    const today = new Date().toISOString().split("T")[0];

    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "marketing_org_created",
      source: "admin_ui",
      message: `Created organization ${org_name} (${org_identifier.toUpperCase()})${lead_id ? " from marketing lead" : ""}`,
      metadata: {
        new_org_id: data.org_id,
        org_name,
        org_identifier: org_identifier.toUpperCase(),
        lead_id: lead_id || null,
      },
      created_by: owner_email || "admin",
      event_date: today,
    });

    // Log to the new org's activity (shows on their My Journey)
    await supabase.from("b_records_log").insert({
      org_id: data.org_id,
      event_type: "org_created",
      source: "admin_ui",
      message: `Organization created — welcome to Eagle Eyes`,
      metadata: {
        org_name,
        org_identifier: org_identifier.toUpperCase(),
        created_from_lead: !!lead_id,
      },
      created_by: "Eagle Eyes Team",
      event_date: today,
    });

    return NextResponse.json({ organization: data });
  } catch (err: any) {
    console.error("Failed to create org:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create organization" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/organizations — update an org
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { org_id, updates } = body;

    if (!org_id || !updates) {
      return NextResponse.json(
        { error: "org_id and updates are required" },
        { status: 400 }
      );
    }

    const allowedFields = [
      "org_name",
      "org_identifier",
      "owner_email",
      "owner_first_name",
      "owner_last_name",
      "billing_street",
      "billing_city",
      "billing_state",
      "billing_postal_code",
      "billing_country",
    ];

    const safeUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        safeUpdates[key] = value || null;
      }
    }

    safeUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("a_organizations")
      .update(safeUpdates)
      .eq("org_id", org_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ organization: data });
  } catch (err: any) {
    console.error("Failed to update org:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update organization" },
      { status: 500 }
    );
  }
}