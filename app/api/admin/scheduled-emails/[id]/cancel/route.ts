export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const adminEmail = await getCurrentUserEmail();

    // Fetch the scheduled email
    const { data: email, error: fetchErr } = await supabase
      .from("z_scheduled_emails")
      .select("id, status, send_at")
      .eq("id", id)
      .single();

    if (fetchErr || !email) return NextResponse.json({ error: "Scheduled email not found" }, { status: 404 });

    if (email.status !== "pending") {
      return NextResponse.json({ error: `Cannot cancel — status is ${email.status}` }, { status: 400 });
    }

    if (new Date(email.send_at) <= new Date()) {
      return NextResponse.json({ error: "Cannot cancel — send time has already passed" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("z_scheduled_emails")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminEmail || "admin",
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ email: updated });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
