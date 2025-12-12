// app/api/org-users/invite/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function createSupabaseServerClient() {
  const cookieStorePromise = cookies(); // <-- NOT awaited yet

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const cookieStore = await cookieStorePromise;
          return cookieStore.get(name)?.value;
        },
        async set(name: string, value: string, options: any) {
          const cookieStore = await cookieStorePromise;
          cookieStore.set({ name, value, ...options });
        },
        async remove(name: string, options: any) {
          const cookieStore = await cookieStorePromise;
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}


export async function POST(req: Request) {
  try {
    const body = await req.json();
    const emailRaw = body?.email;
    const orgId = body?.orgId;

    if (!emailRaw || !orgId) {
      return NextResponse.json(
        { error: "Missing email or orgId." },
        { status: 400 }
      );
    }

    const email = String(emailRaw).trim().toLowerCase();
    const supabase = createSupabaseServerClient();

    // 1) Load org to get org_identifier (4-letter code)
    const { data: org, error: orgError } = await supabase
      .from("a_organizations")
      .select("org_id, org_identifier")
      .eq("org_id", orgId)
      .single();

    if (orgError || !org) {
      console.error("Org lookup error:", orgError);
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 400 }
      );
    }

    if (!org.org_identifier) {
      return NextResponse.json(
        { error: "Organization identifier not configured." },
        { status: 400 }
      );
    }

    const orgIdentifier = org.org_identifier as string;

    // 2) Check if user already exists in a_users
    const { data: existingUser, error: userError } = await supabase
      .from("a_users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      console.error("User lookup error:", userError);
      return NextResponse.json(
        { error: "Failed to look up user." },
        { status: 500 }
      );
    }

    // 👉 Case A: Existing user → ensure membership
    if (existingUser) {
      const userId = existingUser.user_id as string;

      // Check if membership already exists
      const { data: existingMembership, error: membershipError } =
        await supabase
          .from("library_users_org_memberships")
          .select("*")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .maybeSingle();

      if (membershipError) {
        console.error("Membership lookup error:", membershipError);
        return NextResponse.json(
          { error: "Failed to check membership." },
          { status: 500 }
        );
      }

      if (existingMembership) {
        return NextResponse.json({
          ok: true,
          type: "already_member",
          message: "User is already a member of this organization.",
        });
      }

      // Insert membership using existing user's role/permissions or defaults
      const role = existingUser.role ?? "member";
      const permissions = existingUser.permissions ?? "viewer";

      const { error: insertMembershipError } = await supabase
        .from("library_users_org_memberships")
        .insert({
          user_id: userId,
          org_id: orgId,
          role,
          permissions,
        });

      if (insertMembershipError) {
        console.error("Insert membership error:", insertMembershipError);
        return NextResponse.json(
          { error: "Failed to add existing user to organization." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        type: "existing_user_added",
        message: "Existing user has been added to this organization.",
      });
    }

    // 👉 Case B: New user → create/ensure invite row
    const { data: activeInvite, error: inviteLookupError } = await supabase
      .from("a_org_invites")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "active")
      .eq("invite_email", email)
      .eq("org_identifier", orgIdentifier)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (inviteLookupError) {
      console.error("Invite lookup error:", inviteLookupError);
      return NextResponse.json(
        { error: "Failed to check existing invites." },
        { status: 500 }
      );
    }

    if (activeInvite) {
      return NextResponse.json({
        ok: true,
        type: "invite_exists",
        message:
          "An active invite already exists for this email. Ask the user to sign up with the org code.",
      });
    }

    const { error: insertInviteError } = await supabase
      .from("a_org_invites")
      .insert({
        org_id: orgId,
        invite_email: email,
        email_domain: null,
        label: "Direct invite from Settings",
        default_role: "user",
        default_permissions: "viewer",
        default_time_format: "12h",
        default_units: "imperial",
        org_identifier: orgIdentifier,
        status: "active",
        max_uses: 1,
      });

    if (insertInviteError) {
      console.error("Insert invite error:", insertInviteError);
      return NextResponse.json(
        { error: "Failed to create invite." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      type: "invite_created",
      message:
        "Invite created. Ask the user to sign up using their email and org code.",
    });
  } catch (err) {
    console.error("Unhandled invite error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
