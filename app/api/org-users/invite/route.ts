import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Admin client – uses SERVICE_ROLE for server-side DB writes
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // set in Vercel / .env, NEVER exposed to client
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawEmail: string = body.email;
    const orgId: string = body.orgId;
    const createdBy: string | null = body.createdBy ?? null; // optional, can be current user's user_id

    if (!rawEmail || !orgId) {
      return NextResponse.json(
        { error: "Missing email or orgId" },
        { status: 400 }
      );
    }

    const email = rawEmail.trim().toLowerCase();

    // 1) Check if user already exists in a_users
    const { data: existingUser, error: userError } = await supabaseAdmin
      .from("a_users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      console.error("Error checking a_users:", userError);
      return NextResponse.json(
        { error: "Failed to look up user" },
        { status: 500 }
      );
    }

    if (existingUser) {
      // 2) If they exist, create membership if it doesn't already exist
      const { data: existingMembership, error: membershipError } =
        await supabaseAdmin
          .from("library_users_org_memberships")
          .select("membership_id")
          .eq("user_id", existingUser.user_id)
          .eq("org_id", orgId)
          .maybeSingle();

      if (membershipError) {
        console.error("Error checking membership:", membershipError);
        return NextResponse.json(
          { error: "Failed to check membership" },
          { status: 500 }
        );
      }

      if (existingMembership) {
        return NextResponse.json(
          {
            status: "already_member",
            message: "User is already a member of this organization.",
          },
          { status: 200 }
        );
      }

      const { error: insertMembershipError } = await supabaseAdmin
        .from("library_users_org_memberships")
        .insert({
          user_id: existingUser.user_id,
          org_id: orgId,
          role: existingUser.role ?? "user",
          permissions: existingUser.permissions ?? "viewer",
          status: "active",
          created_by: createdBy,
        });

      if (insertMembershipError) {
        console.error("Error inserting membership:", insertMembershipError);
        return NextResponse.json(
          { error: "Failed to add user to organization" },
          { status: 500 }
        );
      }

      // TODO: send “Welcome to {Org}” email here if you want
      return NextResponse.json(
        {
          status: "added_existing_user",
          message: "Existing user added to organization.",
        },
        { status: 200 }
      );
    }

    // 3) If user does NOT exist -> create invite in a_org_invites
    //    Use org defaults + your four-letter org_identifier

    const { data: orgRow, error: orgError } = await supabaseAdmin
      .from("a_organizations")
      .select("org_identifier")
      .eq("org_id", orgId)
      .single();

    if (orgError || !orgRow) {
      console.error("Error getting organization:", orgError);
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 500 }
      );
    }

    const orgIdentifier = (orgRow.org_identifier || "").toUpperCase();

    const { error: inviteError } = await supabaseAdmin
      .from("a_org_invites")
      .insert({
        org_id: orgId,
        invite_email: email,
        email_domain: null,
        label: "Direct invite from Settings",
        default_role: "user", // you can later make this configurable
        default_permissions: "viewer",
        default_time_format: "12h",
        default_units: "imperial",
        org_identifier: orgIdentifier,
        status: "active",
        max_uses: 1,
      });

    if (inviteError) {
      console.error("Error creating invite:", inviteError);
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 }
      );
    }

    // TODO: send “You’ve been invited to {Org} – sign up at streetsmartbuildings.com/signup” email

    return NextResponse.json(
      {
        status: "invite_created",
        message:
          "Invite created. When this email signs up with the correct org code, they’ll be onboarded automatically.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unexpected error in /api/org-users/invite:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
