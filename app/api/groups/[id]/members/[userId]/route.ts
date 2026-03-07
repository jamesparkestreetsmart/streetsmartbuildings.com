import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DELETE: Remove member from group
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params;

  const { data: group } = await supabase
    .from("b_user_groups")
    .select("org_id")
    .eq("group_id", id)
    .single();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const auth = await requireAdminRole(group.org_id);
  if (auth instanceof NextResponse) return auth;

  const { error } = await supabase
    .from("b_user_group_members")
    .delete()
    .eq("group_id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
