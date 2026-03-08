// app/api/signup/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Anon client — used only for auth.signUp (respects auth layer)
function createSupabaseAuthClient() {
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

// Service role client — bypasses RLS for data operations during signup
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const orgCode = orgCodeRaw.trim().replace(/\s+/g, "").toUpperCase();

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

    // 1) Look up org by org_identifier (the 4-letter code)
    console.log("[signup] Looking up org_identifier:", JSON.stringify(orgCode), "length:", orgCode.length);
    const { data: org, error: orgError } = await supabaseAdmin
      .from("a_organizations")
      .select("org_id")
      .eq("org_identifier", orgCode)
      .single();

    if (orgError || !org) {
      console.error("[signup] Org lookup failed for code:", JSON.stringify(orgCode), "error:", orgError?.message, "code:", orgError?.code);
      return NextResponse.json(
        { error: "Invalid organization code." },
        { status: 400 }
      );
    }
    console.log("[signup] Found org:", org.org_id);

    const orgId = org.org_id;

    // 2) Check for invite: email match first, then domain match
    const emailDomain = email.split("@")[1];

    // Try exact email match first
    let { data: invite } = await supabaseAdmin
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
      const { data: domainInvite } = await supabaseAdmin
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
      // Check if there are any revoked/expired invites to give a better error message
      const { data: anyInvite } = await supabaseAdmin
        .from("a_org_invites")
        .select("status")
        .eq("org_id", orgId)
        .eq("invite_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anyInvite && (anyInvite.status === "revoked" || anyInvite.status === "expired")) {
        return NextResponse.json(
          { error: "This invite link has expired or been revoked. Please contact your administrator for a new invitation." },
          { status: 400 }
        );
      }

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

    // 3) Create Supabase Auth user (uses anon client for auth API)
    const supabaseAuth = createSupabaseAuthClient();
    const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.error("Auth signUp error:", authError);
      return NextResponse.json(
        { error: "Unable to create account. Email may already be in use." },
        { status: 400 }
      );
    }

    // Supabase returns a user with empty identities (anti-enumeration) when email already exists
    if (!authData?.user || (authData.user.identities && authData.user.identities.length === 0)) {
      console.error("Auth signUp: email already exists (empty identities)");
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in instead, or use a different email." },
        { status: 400 }
      );
    }

    const authUserId = authData.user.id as string;

    // 4) Insert into a_users (user profile - no org-specific data)
    const { error: userInsertError } = await supabaseAdmin
      .from("a_users")
      .insert({
        user_id: authUserId,
        first_name,
        last_name,
        email,
        phone_number,
        time_format,
        units,
        preferences: {},
      });

    if (userInsertError) {
      console.error("[signup] a_users insert error:", JSON.stringify(userInsertError));
      // If user already exists (from a previous partial signup), continue
      if (userInsertError.code === "23505") {
        console.log("[signup] a_users row already exists, continuing...");
      } else {
        return NextResponse.json(
          { error: `Failed to save user profile: ${userInsertError.message}` },
          { status: 500 }
        );
      }
    }

    // 5) Insert into a_orgs_users_memberships (org-specific role/access)
    const { error: membershipError } = await supabaseAdmin
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
      console.error("[signup] Membership insert error:", JSON.stringify(membershipError));
      if (membershipError.code === "23505") {
        console.log("[signup] Membership already exists, continuing...");
      } else {
        return NextResponse.json(
          { error: `Account created, but failed to link organization: ${membershipError.message}` },
          { status: 500 }
        );
      }
    }

    // 6) Fulfill the invite
    // For email invites: mark as fulfilled (person joined)
    // For domain invites: update usage count (domain invites serve multiple people)
    if (!isDomainInvite) {
      await supabaseAdmin
        .from("a_org_invites")
        .update({
          used_count: (invite.used_count ?? 0) + 1,
          status: "fulfilled",
        })
        .eq("invite_id", invite.invite_id);
    } else {
      // Domain invite stays active but bump usage count
      await supabaseAdmin
        .from("a_org_invites")
        .update({
          used_count: (invite.used_count ?? 0) + 1,
        })
        .eq("invite_id", invite.invite_id);
    }

    // Also fulfill any OTHER active email-specific invites for this user in this org
    // (e.g., if someone was invited by email AND matched a domain invite)
    await supabaseAdmin
      .from("a_org_invites")
      .update({ status: "fulfilled" })
      .eq("invite_email", email)
      .eq("org_id", orgId)
      .eq("status", "active");

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
