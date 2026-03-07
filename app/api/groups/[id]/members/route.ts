import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getGroupOrgId(groupId: string): Promise<string | null> {
  const { data } = await supabase
    .from("b_user_groups")
    .select("org_id")
    .eq("group_id", groupId)
    .single();
  return data?.org_id ?? null;
}

// POST: Add member to group
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orgId = await getGroupOrgId(id);
  if (!orgId) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const auth = await requireAdminRole(orgId);
  if (auth instanceof NextResponse) return auth;

  const { user_id } = await req.json();
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const { error } = await supabase
    .from("b_user_group_members")
    .insert({ group_id: id, user_id });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Already a member" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true }, { status: 201 });
}
