import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Allowed fields that can be updated via this endpoint
const ALLOWED_FIELDS = new Set([
  "default_lux_sensitivity",
  "employee_pre_open_minutes",
  "customer_pre_open_minutes",
  "post_close_minutes",
]);

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { site_id, ...fields } = body;

  if (!site_id) {
    return NextResponse.json(
      { error: "site_id required" },
      { status: 400 }
    );
  }

  // Filter to only allowed fields
  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(key)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("a_sites")
    .update(updates)
    .eq("site_id", site_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: updates });
}
