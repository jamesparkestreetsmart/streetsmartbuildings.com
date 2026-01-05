import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  let body;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("z_marketing_lead_videos")
    .update({ status: "uploaded" })
    .eq("lead_email", email)
    .eq("status", "pending");

  if (error) {
    console.error("Confirm upload error:", error);
    return NextResponse.json({ error: "Failed to confirm uploads" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
