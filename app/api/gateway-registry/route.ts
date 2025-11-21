import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerSupabaseClient(); // ✔ NOT async

    const body = await req.json();

    const {
      site_id,
      gr_devices,
      gr_entities,
      gr_last_updated
    } = body;

    if (!site_id || !gr_devices || !Array.isArray(gr_devices)) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    // Store registry data
    const { error } = await (await supabase)
      .from("a_devices_gateway_registry")
      .upsert({
        site_id,
        gr_devices,
        gr_entities,
        gr_last_updated: gr_last_updated || new Date().toISOString(),
      });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Gateway Registry API error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
