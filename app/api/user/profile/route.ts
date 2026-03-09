import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth/requireAdminRole";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    const payload: Record<string, any> = {};
    if (body.first_name !== undefined) payload.first_name = String(body.first_name).trim();
    if (body.last_name !== undefined) payload.last_name = String(body.last_name).trim();
    if (body.phone_number !== undefined) payload.phone_number = body.phone_number ? String(body.phone_number).trim() : null;
    if (body.time_format !== undefined) payload.time_format = String(body.time_format);
    if (body.units !== undefined) payload.units = String(body.units);

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { error } = await supabase
      .from("a_users")
      .update(payload)
      .eq("user_id", auth.userId);

    if (error) {
      console.error("[api/user/profile] Update error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[api/user/profile] Unhandled error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
