import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { hvac_zone_id } = body;

    if (!hvac_zone_id) {
      return NextResponse.json(
        { error: "hvac_zone_id required" },
        { status: 400 }
      );
    }

    const update: Record<string, any> = {};

    if (body.buffer_degrees !== undefined)
      update.smart_start_buffer_degrees = body.buffer_degrees;
    if (body.humidity_multiplier !== undefined)
      update.smart_start_humidity_multiplier = body.humidity_multiplier;
    if (body.min_lead_minutes !== undefined)
      update.smart_start_min_lead_minutes = body.min_lead_minutes;
    if (body.max_lead_minutes !== undefined)
      update.smart_start_max_lead_minutes = body.max_lead_minutes;
    if (body.rate_override !== undefined)
      update.smart_start_rate_override = body.rate_override;

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("a_hvac_zones")
      .update(update)
      .eq("hvac_zone_id", hvac_zone_id);

    if (error) {
      console.error("[hvac-zone/smart-start] Update failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[hvac-zone/smart-start] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
