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
  if (auth instanceof NextResponse) return { error: auth };
  const { userId, email } = auth;

  const { data: membership } = await supabase
    .from("a_orgs_users_memberships")
    .select("org_id, a_organizations!inner(org_identifier, parent_org_id)")
    .eq("user_id", userId);

  const isSSB = membership?.some(
    (m: any) => m.a_organizations?.org_identifier === "SSB1" && !m.a_organizations?.parent_org_id
  );

  if (!isSSB) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId, email };
}

export async function GET(req: NextRequest) {
  const auth = await requireSSB();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const issue_type = searchParams.get("issue_type");

  let query = supabase
    .from("c_platform_issues")
    .select("*")
    .eq("org_id", SSB_ORG_ID)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (severity) query = query.eq("severity", severity);
  if (issue_type) query = query.eq("issue_type", issue_type);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireSSB();
  if ("error" in auth) return auth.error;
  const { email } = auth;

  const body = await req.json();

  const insertPayload = { ...body, org_id: SSB_ORG_ID };

  const { data, error } = await supabase
    .from("c_platform_issues")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("[platform-issues] POST error:", {
      message: error.message, code: error.code, details: error.details, hint: error.hint,
      payload: JSON.stringify(insertPayload),
    });
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details, hint: error.hint },
      { status: 500 }
    );
  }

  await supabase.from("b_records_log").insert({
    org_id: SSB_ORG_ID,
    event_type: "platform_issue_created",
    event_date: new Date().toISOString().split("T")[0],
    message: "Created platform issue: " + (body.title || data.title),
    source: "admin_tracking",
    created_by: email,
  });

  return NextResponse.json(data, { status: 201 });
}
