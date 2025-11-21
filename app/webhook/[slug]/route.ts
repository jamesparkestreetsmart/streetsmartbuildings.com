// app/webhook/[slug]/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await createRouteHandlerSupabaseClient();

    const slug = params.slug; // e.g., PARK-0024
    const body = await req.json();

    console.log("Incoming webhook for:", slug);
    console.log("Payload:", body);

    // Look up the site_id from slug
    const { data: site, error: lookupError } = await supabase
      .from("a_sites")
      .select("site_id")
      .eq("site_slug", slug)
      .single();

    if (lookupError || !site) {
      return NextResponse.json(
        { error: "Invalid slug" },
        { status: 404 }
      );
    }

    const { site_id } = site;

    // Now store registry data exactly like gateway-registry API
    const { gr_devices, gr_entities, gr_last_updated } = body;

    const { error } = await supabase
      .from("a_devices_gateway_registry")
      .upsert({
        site_id,
        gr_devices,
        gr_entities,
        gr_last_updated:
          gr_last_updated || new Date().toISOString(),
      });

    if (error) {
      console.error("DB error:", error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
