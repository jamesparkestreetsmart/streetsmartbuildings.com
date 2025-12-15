import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body?.email;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
    );

    const ip_address = req.headers.get("x-forwarded-for") || null;
    const user_agent = req.headers.get("user-agent") || null;

    const { error } = await supabase.from("z_marketing_leads").insert({
      email,
      source_page: body?.source_page ?? "landing",
      utm_campaign: body?.utm?.campaign ?? null,
      utm_medium: body?.utm?.medium ?? null,
      utm_source: body?.utm?.source ?? null,
      ip_address,
      user_agent
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Lead API parse error:", e);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
