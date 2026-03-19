export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("z_inbox_triage")
      .select(
        "triage_id, gmail_message_id, sender_email, sender_name, subject, snippet, received_at, is_unread, assigned_to, next_steps, next_event_date, status"
      )
      .order("received_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { triage_id, ...updates } = body;

    if (!triage_id) {
      return NextResponse.json({ error: "triage_id required" }, { status: 400 });
    }

    const allowed = ["assigned_to", "next_steps", "next_event_date", "status"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) {
        patch[key] = updates[key];
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("z_inbox_triage")
      .update(patch)
      .eq("triage_id", triage_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
