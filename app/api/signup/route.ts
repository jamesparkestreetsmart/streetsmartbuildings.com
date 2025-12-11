import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { full_name, email, password } = await req.json();

  const supabase = createRouteHandlerClient({ cookies });

  // Split name → first + last
  const parts = full_name.trim().split(" ");
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ") || "";

  // 1. Check if the email is allowed
  const { data: invites, error: inviteError } = await supabase
    .from("a_org_invites")
    .select("*")
    .eq("status", "pending")
    .ilike("email", email);

  if (inviteError) {
    console.error(inviteError);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }

  if (!invites || invites.length === 0) {
    return NextResponse.json(
      { error: "This email is not registered with an organization" },
      { status: 400 }
    );
  }

  // Use most recent invite
  const invite = invites.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];

  // 2. Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    console.error(authError);
    return NextResponse.json(
      { error: "Unable to create account" },
      { status: 400 }
    );
  }

  const authUserId = authData.user.id;

  // 3. Insert into a_users matching the legacy structure
  const { error: userInsertError } = await supabase.from("a_users").insert({
    user_id: authUserId,
    org_id: invite.org_id,
    first_name,
    last_name,
    email,
    phone_number: null,
    role: invite.role, // from invite table
    permissions: "viewer", // default
    status: "active",
    time_format: "12h", // new field
  });

  if (userInsertError) {
    console.error(userInsertError);
    return NextResponse.json(
      { error: "Failed to save user profile" },
      { status: 500 }
    );
  }

  // 4. Mark invite as used
  await supabase
    .from("a_org_invites")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("invite_id", invite.invite_id);

  return NextResponse.json({ success: true });
}
