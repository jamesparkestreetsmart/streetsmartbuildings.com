import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get user's org memberships
    const { data: memberships, error: memError } = await supabase
      .from("a_orgs_users_memberships")
      .select("org_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (memError) throw memError;

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ organizations: [] });
    }

    const orgIds = memberships.map((m) => m.org_id);

    // Get org details
    const { data: orgs, error: orgError } = await supabase
      .from("a_organizations")
      .select("org_id, org_name, org_identifier")
      .in("org_id", orgIds)
      .order("org_name");

    if (orgError) throw orgError;

    return NextResponse.json({ organizations: orgs || [] });
  } catch (err: any) {
    console.error("Failed to fetch user orgs:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}