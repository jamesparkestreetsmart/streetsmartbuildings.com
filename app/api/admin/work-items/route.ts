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
  const work_type = searchParams.get("work_type");
  const area = searchParams.get("area");
  const sprint = searchParams.get("sprint");

  let query = supabase
    .from("work_items")
    .select("*")
    .eq("org_id", SSB_ORG_ID)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (work_type) query = query.eq("work_type", work_type);
  if (area) query = query.eq("area", area);
  if (sprint) query = query.eq("sprint", sprint);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireSSB();
  if ("error" in auth) return auth.error;
  const { email } = auth;

  const body = await req.json();

  const { data, error } = await supabase
    .from("work_items")
    .insert({ ...body, org_id: SSB_ORG_ID })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("b_records_log").insert({
    org_id: SSB_ORG_ID,
    event_type: "work_item_created",
    event_date: new Date().toISOString().split("T")[0],
    message: "Created work item: " + (body.title || data.title),
    source: "admin_tracking",
    created_by: email,
  });

  return NextResponse.json(data, { status: 201 });
}
