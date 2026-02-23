import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { equipment_id, on_offset_minutes, off_offset_minutes, lux_sensitivity } = body;

    if (!equipment_id) {
      return NextResponse.json({ error: "equipment_id required" }, { status: 400 });
    }

    const update: Record<string, any> = {};
    if (on_offset_minutes !== undefined) update.on_offset_minutes = on_offset_minutes;
    if (off_offset_minutes !== undefined) update.off_offset_minutes = off_offset_minutes;
    if (lux_sensitivity !== undefined) update.lux_sensitivity = lux_sensitivity;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("a_equipments")
      .update(update)
      .eq("equipment_id", equipment_id);

    if (error) {
      console.error("[equipment/offset] Update failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[equipment/offset] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
