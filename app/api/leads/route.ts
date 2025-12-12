import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { email, source_page, utm } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
    );

    const ip_address = req.headers.get("x-forwarded-for") || null;
    const user_agent = req.headers.get("user-agent") || null;

    const { error } = await supabase.from("z_marketing_leads").insert({
      email,
      source_page,
      utm_campaign: utm?.campaign || null,
      utm_medium: utm?.medium || null,
      utm_source: utm?.source || null,
      ip_address,
      user_agent
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
