import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface SignupRequestBody {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  org_code: string;
  time_format: "12h" | "24h";
  units: "imperial" | "metric";
}

interface OrgInvite {
  invite_id: string;
  org_id: string;
  invite_email: string | null;
  email_domain: string | null;
  label: string | null;
  default_role: string | null;
  default_permissions: string | null;
  default_time_format: string | null;
  default_units: string | null;
  org_identifier: string;
  status: "active" | "inactive";
  max_uses: number | null;
  used_count: number;
  created_at: string;
  expires_at: string | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignupRequestBody;

    const {
      first_name,
      last_name,
      email,
      password,
      org_code,
      time_format,
      units,
    } = body;

    // Basic validation
    if (
      !first_name?.trim() ||
      !last_name?.trim() ||
      !email?.trim() ||
      !password?.trim() ||
      !org_code?.trim()
    ) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const emailLower = email.trim().toLowerCase();
    const orgCodeUpper = org_code.trim().toUpperCase();
    const emailDomain = emailLower.split("@")[1];

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

    // 1) Make sure this email is not already a user
    const { data: existingUser, error: existingUserError } = await supabase
      .from("a_users")
      .select("user_id")
      .eq("email", emailLower)
      .maybeSingle();

    if (existingUserError) {
      console.error("Error checking existing user:", existingUserError);
      return NextResponse.json(
        { error: "Server error checking existing users." },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "This email already has an account. Please log in instead of signing up.",
        },
        { status: 400 }
      );
    }

    // 2) Look up active org_invites that match org_identifier
    const { data: invites, error: invitesError } = await supabase
      .from("a_org_invites")
      .select("*")
      .eq("status", "active")
      .eq("org_identifier", orgCodeUpper);

    if (invitesError) {
      console.error("Error fetching org invites:", invitesError);
      return NextResponse.json(
        { error: "Server error looking up organization invites." },
        { status: 500 }
      );
    }

    if (!invites || invites.length === 0) {
      return NextResponse.json(
        {
          error:
            "No active enrollment found for this organization code. Please contact your program lead.",
        },
        { status: 400 }
      );
    }

    // 3) Filter invites by email / domain match
    const matchingInvites = (invites as OrgInvite[]).filter((inv) => {
      // Specific email match
      if (inv.invite_email) {
        if (inv.invite_email.toLowerCase() === emailLower) {
          return true;
        }
      }

      // Domain match
      if (inv.email_domain && emailDomain) {
        if (emailDomain.toLowerCase() === inv.email_domain.toLowerCase()) {
          return true;
        }
      }

      return false;
    });

    if (!matchingInvites.length) {
      return NextResponse.json(
        {
          error:
            "This email is not registered for this organization's enrollment. Please check your email and org code.",
        },
        { status: 400 }
      );
    }

    // 4) Pick most recent matching invite
    const validInvite = matchingInvites.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    // Optional: if max_uses is set, enforce it
    if (
      validInvite.max_uses !== null &&
      validInvite.used_count >= validInvite.max_uses
    ) {
      return NextResponse.json(
        {
          error:
            "This enrollment link has reached its maximum number of signups. Please contact your program lead.",
        },
        { status: 400 }
      );
    }

    // Optional: if expires_at is set, enforce that too
    if (validInvite.expires_at) {
      const now = new Date();
      const expiresAt = new Date(validInvite.expires_at);
      if (now > expiresAt) {
        return NextResponse.json(
          {
            error:
              "This enrollment period has expired. Please contact your program lead.",
          },
          { status: 400 }
        );
      }
    }

    // 5) Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: emailLower,
      password,
    });

    if (authError || !authData.user) {
      console.error("Supabase Auth signUp error:", authError);
      return NextResponse.json(
        { error: "Unable to create account. Please try again." },
        { status: 400 }
      );
    }

    const authUserId = authData.user.id;

    // 6) Insert into a_users
    const { error: userInsertError } = await supabase.from("a_users").insert({
      user_id: authUserId,
      org_id: validInvite.org_id,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: emailLower,
      phone_number: null,
      role: validInvite.default_role ?? "user",
      permissions: validInvite.default_permissions ?? "viewer",
      status: "active",
      time_format,
      units,
      last_activity_at: null,
      created_at: new Date().toISOString(),
    });

    if (userInsertError) {
      console.error("Error inserting into a_users:", userInsertError);
      return NextResponse.json(
        { error: "Account created in auth but failed to save profile." },
        { status: 500 }
      );
    }

    // 7) Update invite used_count (but keep status = 'active' unless you choose otherwise)
    const newUsedCount = validInvite.used_count + 1;
    const updates: Partial<OrgInvite> = {
      used_count: newUsedCount,
    };

    if (
      validInvite.max_uses !== null &&
      newUsedCount >= validInvite.max_uses
    ) {
      // If you've configured max_uses, we can auto-close enrollment
      updates.status = "inactive" as any;
    }

    await supabase
      .from("a_org_invites")
      .update(updates)
      .eq("invite_id", validInvite.invite_id);

    // 8) Done
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected signup error:", err);
    return NextResponse.json(
      { error: "Unexpected server error. Please try again." },
      { status: 500 }
    );
  }
}
