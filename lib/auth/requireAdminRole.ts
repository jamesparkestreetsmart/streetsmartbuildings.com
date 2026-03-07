import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Authenticate the caller and verify they are an org owner or admin.
 * Only owner (by email match) and admin (by role) can manage groups.
 * Program managers and all other roles are denied.
 *
 * Returns the authenticated user info, or a 401/403 NextResponse.
 */
export async function requireAdminRole(
  orgId: string
): Promise<{ userId: string; email: string } | NextResponse> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check org owner by email match
  const { data: org } = await svc
    .from("a_organizations")
    .select("owner_email")
    .eq("org_id", orgId)
    .single();

  const isOwner =
    org?.owner_email &&
    user.email?.toLowerCase() === org.owner_email.toLowerCase();

  if (isOwner) {
    return { userId: user.id, email: user.email || "" };
  }

  // Check admin role (only admin, not program_manager)
  const { data: membership } = await svc
    .from("a_orgs_users_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (membership?.role !== "admin") {
    console.log(`[auth] Denied group management: user=${user.id} role=${membership?.role} org=${orgId}`);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: user.id, email: user.email || "" };
}

/**
 * Get the authenticated user from cookies.
 * Returns user info or a 401 NextResponse.
 */
export async function getAuthUser(): Promise<
  { userId: string; email: string } | NextResponse
> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: user.id, email: user.email || "" };
}
