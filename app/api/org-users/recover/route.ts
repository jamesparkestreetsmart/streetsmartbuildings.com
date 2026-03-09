// app/api/org-users/recover/route.ts
// Recovers orphaned signups: auth users who may be missing a_users and/or membership records

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { org_id, invite_emails } = await req.json();

    if (!org_id || !Array.isArray(invite_emails) || invite_emails.length === 0) {
      return NextResponse.json({ recovered: 0 });
    }

    const normalizedEmails = invite_emails.map((e: string) => e.toLowerCase().trim());

    // Find the corresponding active invites
    const { data: invites } = await supabase
      .from("a_org_invites")
      .select("*")
      .eq("org_id", org_id)
      .eq("status", "active")
      .in("invite_email", normalizedEmails);

    if (!invites || invites.length === 0) {
      return NextResponse.json({ recovered: 0 });
    }

    // Check Supabase Auth for these emails
    const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUsers = authList?.users || [];

    let recovered = 0;

    for (const inv of invites) {
      const email = (inv.invite_email || "").toLowerCase();
      const authUser = authUsers.find((u) => (u.email || "").toLowerCase() === email);
      if (!authUser) continue; // No auth user — genuinely hasn't signed up

      // Ensure a_users record exists
      const { data: existingProfile } = await supabase
        .from("a_users")
        .select("user_id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!existingProfile) {
        // Create the missing a_users record from auth metadata
        const meta = authUser.user_metadata || {};
        await supabase.from("a_users").insert({
          user_id: authUser.id,
          first_name: meta.first_name || "",
          last_name: meta.last_name || "",
          email,
          phone_number: meta.phone_number || null,
          time_format: meta.time_format || "12h",
          units: meta.units || "imperial",
          preferences: {},
        });
        console.log("[recover] Created missing a_users for:", email);
      }

      // Ensure membership exists
      const { error: memErr } = await supabase
        .from("a_orgs_users_memberships")
        .insert({
          user_id: authUser.id,
          org_id,
          role: inv.default_role ?? "viewer",
          job_title: inv.default_job_title ?? null,
          capability_preset: inv.default_capability_preset ?? "read_only",
          status: "active",
        });

      if (!memErr || memErr.code === "23505") {
        // Fulfill the invite
        await supabase
          .from("a_org_invites")
          .update({ status: "fulfilled", used_count: (inv.used_count ?? 0) + 1 })
          .eq("invite_id", inv.invite_id);
        recovered++;
        console.log("[recover] Recovered:", email);
      } else {
        console.error("[recover] Membership insert failed for:", email, memErr);
      }
    }

    return NextResponse.json({ recovered });
  } catch (err: any) {
    console.error("[recover] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
