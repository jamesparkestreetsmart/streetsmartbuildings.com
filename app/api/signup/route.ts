// app/api/signup/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function createSupabaseServerClient() {
  const cookieStorePromise = cookies();

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
    const phone_number = String(body?.phone_number ?? "").trim() || null;
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

    // 1) Look up org by org_identifier (the 4-letter code)
    const { data: org, error: orgError } = await supabase
      .from("a_organizations")
      .select("org_id")
      .eq("org_identifier", orgCode)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Invalid organization code." },
        { status: 400 }
      );
    }

    const orgId = org.org_id;

    // 2) Check for invite: email match first, then domain match
    const emailDomain = email.split("@")[1];

    // Try exact email match first
    let { data: invite } = await supabase
      .from("a_org_invites")
      .select("*")
      .eq("status", "active")
      .eq("org_id", orgId)
      .eq("invite_email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let isDomainInvite = false;

    // If no email match, try domain match
    if (!invite) {
      const { data: domainInvite } = await supabase
        .from("a_org_invites")
        .select("*")
        .eq("status", "active")
        .eq("org_id", orgId)
        .eq("email_domain", emailDomain)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (domainInvite) {
        invite = domainInvite;
        isDomainInvite = true;
      }
    }

    if (!invite) {
      return NextResponse.json(
        {
          error:
            "No active invite found for this email and organization code. Please contact your Program Manager.",
        },
        { status: 400 }
      );
    }

    // Determine membership defaults
    // For email invites: use the values from the invite
    // For domain invites: use viewer/analyst/read_only defaults
    const membershipRole = isDomainInvite ? "viewer" : (invite.default_role ?? "viewer");
    const membershipJobTitle = isDomainInvite ? "analyst" : (invite.default_job_title ?? null);
    const membershipCapabilityPreset = isDomainInvite ? "read_only" : (invite.default_capability_preset ?? "read_only");

    // 3) Create Supabase Auth user
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

    // 4) Insert into a_users (user profile - no org-specific data)
    const { error: userInsertError } = await supabase
      .from("a_users")
      .insert({
        user_id: authUserId,
        first_name,
        last_name,
        email,
        phone_number,
        time_format,
        units,
        preferences: "{}",
      });

    if (userInsertError) {
      console.error("a_users insert error:", userInsertError);
      return NextResponse.json(
        { error: "Failed to save user profile." },
        { status: 500 }
      );
    }

    // 5) Insert into a_orgs_users_memberships (org-specific role/access)
    const { error: membershipError } = await supabase
      .from("a_orgs_users_memberships")
      .insert({
        user_id: authUserId,
        org_id: orgId,
        role: membershipRole,
        job_title: membershipJobTitle,
        capability_preset: membershipCapabilityPreset,
        status: "active",
      });

    if (membershipError) {
      console.error("Membership insert error:", membershipError);
      return NextResponse.json(
        { error: "Account created, but failed to link organization." },
        { status: 500 }
      );
    }

    // 6) Update invite usage (only for email invites, not domain invites)
    if (!isDomainInvite) {
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
    }

    // Note: The membership INSERT trigger automatically logs the "user_joined" event

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
