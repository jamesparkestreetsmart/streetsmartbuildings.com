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

// PUT: Update group (transactional: replace members + sites)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orgId = await getGroupOrgId(id);
  if (!orgId) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const auth = await requireAdminRole(orgId);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { name, alerts_enabled, user_ids, site_ids } = body;

  // Update group fields
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (alerts_enabled !== undefined) updates.alerts_enabled = alerts_enabled;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("b_user_groups")
      .update(updates)
      .eq("group_id", id);
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A group with this name already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Replace members if provided
  if (Array.isArray(user_ids)) {
    await supabase.from("b_user_group_members").delete().eq("group_id", id);
    if (user_ids.length > 0) {
      const rows = user_ids.map((uid: string) => ({ group_id: id, user_id: uid }));
      const { error } = await supabase.from("b_user_group_members").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Replace sites if provided
  if (Array.isArray(site_ids)) {
    await supabase.from("b_user_group_sites").delete().eq("group_id", id);
    if (site_ids.length > 0) {
      const rows = site_ids.map((sid: string) => ({ group_id: id, site_id: sid }));
      const { error } = await supabase.from("b_user_group_sites").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE: Delete group (cascade handles cleanup)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orgId = await getGroupOrgId(id);
  if (!orgId) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const auth = await requireAdminRole(orgId);
  if (auth instanceof NextResponse) return auth;

  const { error } = await supabase
    .from("b_user_groups")
    .delete()
    .eq("group_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
