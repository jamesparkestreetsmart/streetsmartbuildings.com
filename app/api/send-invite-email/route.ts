// app/api/send-invite-email/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendInviteEmail, sendReminderEmail } from "@/lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, orgId, isReminder, invitedByUserId } = body;

    if (!email || !orgId) {
      return NextResponse.json(
        { error: "Missing email or orgId" },
        { status: 400 }
      );
    }

    // Get org details
    const { data: org, error: orgError } = await supabase
      .from("a_organizations")
      .select("org_name, org_identifier")
      .eq("org_id", orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Get inviter's name if provided
    let invitedByName: string | undefined;
    if (invitedByUserId) {
      const { data: inviter } = await supabase
        .from("a_users")
        .select("first_name, last_name")
        .eq("user_id", invitedByUserId)
        .single();

      if (inviter) {
        invitedByName = `${inviter.first_name} ${inviter.last_name}`.trim();
      }
    }

    // Send the appropriate email
    let result;
    if (isReminder) {
      result = await sendReminderEmail({
        to: email,
        orgName: org.org_name,
        orgCode: org.org_identifier,
      });
    } else {
      result = await sendInviteEmail({
        to: email,
        orgName: org.org_name,
        orgCode: org.org_identifier,
        invitedByName,
      });
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send invite email error:", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}