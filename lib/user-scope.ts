import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Determine which sites a user can access within an org.
 *
 * Bypass roles (see all): owner (by email match) and admin only.
 * Everyone else — including program_manager — is group-filtered.
 * No group assignments = empty array = empty state (intentional).
 */
export async function getUserSiteScope(
  userId: string,
  orgId: string
): Promise<"all" | string[]> {
  // Step 1: Check if user is the org owner (by email match)
  const [{ data: org }, { data: user }] = await Promise.all([
    supabase
      .from("a_organizations")
      .select("owner_email")
      .eq("org_id", orgId)
      .single(),
    supabase.from("a_users").select("email").eq("user_id", userId).single(),
  ]);

  if (
    org?.owner_email &&
    user?.email &&
    org.owner_email.toLowerCase() === user.email.toLowerCase()
  ) {
    return "all";
  }

  // Step 2: Check if user has admin role (only admin bypasses, not program_manager)
  const { data: membership } = await supabase
    .from("a_orgs_users_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();

  if (membership?.role === "admin") {
    return "all";
  }

  // Step 3: Everyone else — return their group-scoped site_ids
  // Returns [] if no groups assigned — this is correct, means empty state
  const { data: groupMembers } = await supabase
    .from("b_user_group_members")
    .select("group_id")
    .eq("user_id", userId);

  if (!groupMembers || groupMembers.length === 0) {
    return [];
  }

  const groupIds = groupMembers.map((gm) => gm.group_id);

  const { data: orgGroups } = await supabase
    .from("b_user_groups")
    .select("group_id")
    .in("group_id", groupIds)
    .eq("org_id", orgId);

  if (!orgGroups || orgGroups.length === 0) {
    return [];
  }

  const orgGroupIds = orgGroups.map((g) => g.group_id);

  const { data: groupSites } = await supabase
    .from("b_user_group_sites")
    .select("site_id")
    .in("group_id", orgGroupIds);

  return [...new Set(groupSites?.map((gs) => gs.site_id) ?? [])];
}

/**
 * Same as getUserSiteScope but only includes sites from groups
 * where alerts_enabled = true.
 *
 * Bypass roles: owner and admin only.
 */
export async function getUserAlertSiteScope(
  userId: string,
  orgId: string
): Promise<"all" | string[]> {
  // Steps 1-2: identical bypass checks
  const [{ data: org }, { data: user }] = await Promise.all([
    supabase
      .from("a_organizations")
      .select("owner_email")
      .eq("org_id", orgId)
      .single(),
    supabase.from("a_users").select("email").eq("user_id", userId).single(),
  ]);

  if (
    org?.owner_email &&
    user?.email &&
    org.owner_email.toLowerCase() === user.email.toLowerCase()
  ) {
    return "all";
  }

  const { data: membership } = await supabase
    .from("a_orgs_users_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();

  if (membership?.role === "admin") {
    return "all";
  }

  // Step 3: Group-scoped sites with alerts_enabled filter
  const { data: groupMembers } = await supabase
    .from("b_user_group_members")
    .select("group_id")
    .eq("user_id", userId);

  if (!groupMembers || groupMembers.length === 0) {
    return [];
  }

  const groupIds = groupMembers.map((gm) => gm.group_id);

  const { data: orgGroups } = await supabase
    .from("b_user_groups")
    .select("group_id")
    .in("group_id", groupIds)
    .eq("org_id", orgId)
    .eq("alerts_enabled", true);

  if (!orgGroups || orgGroups.length === 0) {
    return [];
  }

  const orgGroupIds = orgGroups.map((g) => g.group_id);

  const { data: groupSites } = await supabase
    .from("b_user_group_sites")
    .select("site_id")
    .in("group_id", orgGroupIds);

  return [...new Set(groupSites?.map((gs) => gs.site_id) ?? [])];
}
