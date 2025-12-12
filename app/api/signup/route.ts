// app/api/signup/route.ts

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

    const first_name = String(body?.first_name ?? "").trim();
    const last_name = String(body?.last_name ?? "").trim();
    const emailRaw = String(body?.email ?? "");
    const password = String(body?.password ?? "");
    const orgCodeRaw = String(body?.org_code ?? "");
    const time_format = String(body?.time_format ?? "12h");
    const units = String(body?.units ?? "imperial");

    const email = emailRaw.trim().toLowerCase();
    const orgCode = orgCodeRaw.trim().toUpperCase();

    if (!first_name || !last_name || !email || !password || !orgCode) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    // 1) Validate invite: must be active and match email + org code
    const { data: invites, error: inviteError } = await supabase
      .from("a_org_invites")
      .select("*")
      .eq("status", "active")
      .eq("org_identifier", orgCode)
      .eq("invite_email", email);

    if (inviteError) {
      console.error("Invite lookup error:", inviteError);
      return NextResponse.json(
        { error: "Failed to validate invite." },
        { status: 500 }
      );
    }

    if (!invites || invites.length === 0) {
      return NextResponse.json(
        {
          error:
            "No active invite found for this email and organization code. Please contact your project lead.",
        },
        { status: 400 }
      );
    }

    // Use most recent invite if multiple
    const invite = invites.sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    const orgId = invite.org_id as string;
    const defaultRole = invite.default_role ?? "user";
    const defaultPermissions = invite.default_permissions ?? "viewer";
    const defaultTimeFormat = time_format || invite.default_time_format || "12h";
    const defaultUnits = units || invite.default_units || "imperial";

    // 2) Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData?.user) {
      console.error("Auth signUp error:", authError);
      return NextResponse.json(
        { error: "Unable to create account. Email may already be in use." },
        { status: 400 }
      );
    }

    const authUserId = authData.user.id as string;

    // 3) Insert into a_users
    const { error: userInsertError } = await supabase
      .from("a_users")
      .insert({
        user_id: authUserId,
        org_id: orgId,
        first_name,
        last_name,
        email,
        phone_number: null,
        role: defaultRole,
        permissions: defaultPermissions,
        status: "active",
        last_activity_at: new Date().toISOString(),
        time_format: defaultTimeFormat,
        units: defaultUnits,
      });

    if (userInsertError) {
      console.error("a_users insert error:", userInsertError);
      return NextResponse.json(
        { error: "Failed to save user profile." },
        { status: 500 }
      );
    }

    // 4) Insert into library_users_org_memberships
    const { error: membershipError } = await supabase
      .from("library_users_org_memberships")
      .insert({
        user_id: authUserId,
        org_id: orgId,
        role: defaultRole,
        permissions: defaultPermissions,
      });

    if (membershipError) {
      console.error("Membership insert error:", membershipError);
      // Not fatal to login, but we surface it so you can fix quickly
      return NextResponse.json(
        { error: "Account created, but failed to link organization." },
        { status: 500 }
      );
    }

    // 5) Update invite usage
    const newUsedCount = (invite.used_count ?? 0) + 1;
    let newStatus = invite.status;
    if (invite.max_uses && newUsedCount >= invite.max_uses) {
      newStatus = "inactive";
    }

    await supabase
      .from("a_org_invites")
      .update({
        used_count: newUsedCount,
        status: newStatus,
      })
      .eq("invite_id", invite.invite_id);

    // At this point, Supabase has set the auth cookie for this user.
    // The frontend will redirect them to /live.
    return NextResponse.json({
      success: true,
      redirectTo: "/live",
    });
  } catch (err) {
    console.error("Unhandled signup error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
