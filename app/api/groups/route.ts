import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole, getAuthUser } from "@/lib/auth/requireAdminRole";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: List groups for org with counts and details
// Requires owner or admin role
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const auth = await requireAdminRole(orgId);
  if (auth instanceof NextResponse) return auth;

  const { data: groups, error } = await supabase
    .from("b_user_groups")
    .select("*")
    .eq("org_id", orgId)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch members and sites for all groups
  const groupIds = (groups || []).map((g: any) => g.group_id);

  const [{ data: members }, { data: sites }] = await Promise.all([
    supabase
      .from("b_user_group_members")
      .select("group_id, user_id, a_users(user_id, email, first_name, last_name)")
      .in("group_id", groupIds.length ? groupIds : [""]),
    supabase
      .from("b_user_group_sites")
      .select("group_id, site_id, a_sites(site_id, site_name)")
      .in("group_id", groupIds.length ? groupIds : [""]),
  ]);

  const enriched = (groups || []).map((g: any) => {
    const groupMembers = (members || []).filter((m: any) => m.group_id === g.group_id);
    const groupSites = (sites || []).filter((s: any) => s.group_id === g.group_id);
    return {
      ...g,
      member_count: groupMembers.length,
      site_count: groupSites.length,
      members: groupMembers.map((m: any) => ({
        user_id: m.user_id,
        email: m.a_users?.email,
        first_name: m.a_users?.first_name,
        last_name: m.a_users?.last_name,
      })),
      sites: groupSites.map((s: any) => ({
        site_id: s.site_id,
        site_name: s.a_sites?.site_name,
      })),
    };
  });

  return NextResponse.json(enriched);
}

// POST: Create group with members + sites (transactional)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { org_id, name, alerts_enabled = true, user_ids = [], site_ids = [] } = body;

  if (!org_id || !name?.trim()) {
    return NextResponse.json({ error: "org_id and name required" }, { status: 400 });
  }

  const auth = await requireAdminRole(org_id);
  if (auth instanceof NextResponse) return auth;

  // Create group
  const { data: group, error: groupError } = await supabase
    .from("b_user_groups")
    .insert({ org_id, name: name.trim(), alerts_enabled })
    .select()
    .single();

  if (groupError) {
    if (groupError.code === "23505") {
      return NextResponse.json({ error: "A group with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  // Insert members and sites
  const memberRows = user_ids.map((uid: string) => ({ group_id: group.group_id, user_id: uid }));
  const siteRows = site_ids.map((sid: string) => ({ group_id: group.group_id, site_id: sid }));

  const errors: string[] = [];

  if (memberRows.length > 0) {
    const { error: memErr } = await supabase.from("b_user_group_members").insert(memberRows);
    if (memErr) errors.push(`Members: ${memErr.message}`);
  }

  if (siteRows.length > 0) {
    const { error: siteErr } = await supabase.from("b_user_group_sites").insert(siteRows);
    if (siteErr) errors.push(`Sites: ${siteErr.message}`);
  }

  if (errors.length > 0) {
    // Rollback: delete the group (cascade will clean up)
    await supabase.from("b_user_groups").delete().eq("group_id", group.group_id);
    return NextResponse.json({ error: "Failed to save group", details: errors }, { status: 500 });
  }

  return NextResponse.json(group, { status: 201 });
}
