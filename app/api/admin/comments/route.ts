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
  const issue_id = searchParams.get("issue_id");
  const work_item_id = searchParams.get("work_item_id");
  const learning_id = searchParams.get("learning_id");

  let query = supabase
    .from("comments")
    .select("*")
    .eq("org_id", SSB_ORG_ID)
    .order("created_at", { ascending: false });

  if (issue_id) query = query.eq("issue_id", issue_id);
  if (work_item_id) query = query.eq("work_item_id", work_item_id);
  if (learning_id) query = query.eq("learning_id", learning_id);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireSSB();
  if ("error" in auth) return auth.error;
  const { userId, email } = auth;

  const body = await req.json();

  const parentFields = [body.issue_id, body.work_item_id, body.learning_id].filter(Boolean);
  if (parentFields.length !== 1) {
    return NextResponse.json(
      { error: "Exactly one of issue_id, work_item_id, or learning_id must be provided" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({ ...body, org_id: SSB_ORG_ID, author_user_id: userId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("b_records_log").insert({
    org_id: SSB_ORG_ID,
    event_type: "comment_created",
    event_date: new Date().toISOString().split("T")[0],
    message: "Created comment on " +
      (body.issue_id ? "issue " + body.issue_id :
       body.work_item_id ? "work item " + body.work_item_id :
       "learning " + body.learning_id),
    source: "admin_tracking",
    created_by: email,
  });

  return NextResponse.json(data, { status: 201 });
}
