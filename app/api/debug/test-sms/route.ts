// ⚠️ DELETE THIS ROUTE after confirming Twilio credentials work.
// One-time test endpoint — SSB1 admin only.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth/requireAdminRole";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

async function requireSSB() {
  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return null;
  const { userId } = auth;

  const { data: membership } = await supabase
    .from("a_orgs_users_memberships")
    .select("org_id, a_organizations!inner(org_identifier, parent_org_id)")
    .eq("user_id", userId);

  const isSSB = membership?.some(
    (m: any) => m.a_organizations?.org_identifier === "SSB1" && !m.a_organizations?.parent_org_id
  );

  return isSSB ? auth : null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSSB();
    if (!auth) {
      return NextResponse.json({ error: "Forbidden — SSB1 admin only" }, { status: 403 });
    }

    const body = await req.json();
    const { phone_number, message } = body;

    if (!phone_number || typeof phone_number !== "string") {
      return NextResponse.json({ error: "phone_number is required (E.164 format)" }, { status: 400 });
    }

    if (!phone_number.startsWith("+")) {
      return NextResponse.json({ error: "phone_number must be E.164 format (starts with +)" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured" }, { status: 500 });
    }

    if (!messagingServiceSid) {
      return NextResponse.json({ error: "TWILIO_MESSAGING_SERVICE_SID not configured" }, { status: 500 });
    }

    const smsBody = message || "[Eagle Eyes] Test SMS — Twilio credentials verified successfully.";

    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);

    const result = await client.messages.create({
      body: smsBody,
      messagingServiceSid,
      to: phone_number,
    });

    // Mask phone for logging
    const masked = phone_number.slice(0, phone_number.length - 7) + "*******";
    console.log(`[test-sms] Sent to ${masked} — SID: ${result.sid}`);

    return NextResponse.json({
      success: true,
      sid: result.sid,
      to: masked,
      status: result.status,
    });
  } catch (err: any) {
    console.error("[test-sms] Error:", err);
    return NextResponse.json({
      success: false,
      error: err.message || "SMS send failed",
      code: err.code || null,
    }, { status: 500 });
  }
}
