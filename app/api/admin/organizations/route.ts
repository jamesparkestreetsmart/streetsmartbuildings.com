import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/organizations — fetch all orgs
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("a_organizations")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ organizations: data });
  } catch (err: any) {
    console.error("Failed to fetch orgs:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

// POST /api/admin/organizations — create new org
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { org_name, org_identifier, owner_email, owner_first_name, owner_last_name } = body;

    if (!org_name || !org_identifier) {
      return NextResponse.json(
        { error: "org_name and org_identifier are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("a_organizations")
      .insert({
        org_name,
        org_identifier: org_identifier.toUpperCase(),
        owner_email: owner_email || null,
        owner_first_name: owner_first_name || null,
        owner_last_name: owner_last_name || null,
        billing_country: "US",
      })
      .select()
      .single();

    if (error) throw error;

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

    // Only allow specific fields to be updated
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
