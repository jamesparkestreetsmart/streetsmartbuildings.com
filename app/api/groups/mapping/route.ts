import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Retrieve saved mapping for org (owner/admin only)
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const auth = await requireAdminRole(orgId);
  if (auth instanceof NextResponse) return auth;

  const { data } = await supabase
    .from("b_org_excel_mappings")
    .select("*")
    .eq("org_id", orgId)
    .single();

  return NextResponse.json(data || { mapping: {}, sample_headers: [] });
}

// POST: Save mapping for org (owner/admin only)
export async function POST(req: NextRequest) {
  const { org_id, mapping, sample_headers } = await req.json();
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const auth = await requireAdminRole(org_id);
  if (auth instanceof NextResponse) return auth;

  const { error } = await supabase
    .from("b_org_excel_mappings")
    .upsert(
      {
        org_id,
        mapping: mapping || {},
        sample_headers: sample_headers || [],
        last_trained_at: new Date().toISOString(),
      },
      { onConflict: "org_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
