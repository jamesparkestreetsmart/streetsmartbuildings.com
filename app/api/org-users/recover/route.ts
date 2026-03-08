// app/api/org-users/recover/route.ts
// Recovers orphaned signups: users who have a_users records but no membership

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

    // Find a_users records for these invite emails
    const { data: existingUsers } = await supabase
      .from("a_users")
      .select("user_id, email, first_name, last_name, phone_number")
      .in("email", invite_emails.map((e: string) => e.toLowerCase()));

    if (!existingUsers || existingUsers.length === 0) {
      return NextResponse.json({ recovered: 0 });
    }

    // Find the corresponding active invites
    const { data: invites } = await supabase
      .from("a_org_invites")
      .select("*")
      .eq("org_id", org_id)
      .eq("status", "active")
      .in("invite_email", existingUsers.map((u) => u.email));

    if (!invites || invites.length === 0) {
      return NextResponse.json({ recovered: 0 });
    }

    let recovered = 0;

    for (const user of existingUsers) {
      const inv = invites.find(
        (i) => (i.invite_email || "").toLowerCase() === (user.email || "").toLowerCase()
      );
      if (!inv) continue;

      // Create the missing membership
      const { error: memErr } = await supabase
        .from("a_orgs_users_memberships")
        .insert({
          user_id: user.user_id,
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
      }
    }

    return NextResponse.json({ recovered });
  } catch (err: any) {
    console.error("[recover] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
