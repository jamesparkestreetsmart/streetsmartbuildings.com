import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  let body;

  try {
    body = await req.json();
  } catch (err) {
    console.error("JSON parse error:", err);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body?.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ip_address = req.headers.get("x-forwarded-for") ?? null;
  const user_agent = req.headers.get("user-agent") ?? null;

  const payload = {
    email,
    source_page: body?.source_page ?? "landing",
    utm_campaign: body?.utm?.campaign ?? null,
    utm_medium: body?.utm?.medium ?? null,
    utm_source: body?.utm?.source ?? null,
    ip_address,
    user_agent,
  };

  console.log("Lead insert payload:", payload);

  const { data: leadRows, error } = await supabase
    .from("z_marketing_leads")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /* 🔽 LINK VIDEOS TO LEAD 🔽 */
  const { error: videoLinkError } = await supabase
    .from("z_marketing_lead_videos")
    .update({
      status: "linked",
      lead_id: leadRows.id,
    })
    .eq("lead_email", email)
    .in("status", ["uploaded", "pending"]);

  if (videoLinkError) {
    console.error("Video link error:", videoLinkError);
    // Intentionally do NOT fail the request
  }
  /* 🔼 END LINK 🔼 */

  return NextResponse.json({ success: true });
}
