import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { site_id, ha_device_id, equipment_id, note } = body;

  if (!site_id || !ha_device_id) {
    return NextResponse.json(
      { error: "Missing site_id or ha_device_id" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  /**
   * 1️⃣ Fetch existing device (to check previous mapping)
   */
  const { data: existingDevice } = await supabase
    .from("a_devices")
    .select("device_id, equipment_id, org_id")
    .eq("site_id", site_id)
    .eq("ha_device_id", ha_device_id)
    .maybeSingle();

  const previousId = existingDevice?.equipment_id ?? null;
  const newId = equipment_id ?? null;

  /**
   * 2️⃣ Update device mapping (even if unchanged – harmless)
   */
  const { error: updateError } = await supabase
    .from("a_devices")
    .update({ equipment_id: newId })
    .eq("site_id", site_id)
    .eq("ha_device_id", ha_device_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  /**
   * 3️⃣ Only write log if mapping actually changed
   */
  const mappingChanged = previousId !== newId;

  if (existingDevice && mappingChanged) {
    const baseMessage = newId
      ? "Device mapped to equipment"
      : "Device unmapped from equipment";

    const finalMessage = note
      ? `${baseMessage} — NOTE: ${note}`
      : baseMessage;

    await supabase.from("b_records_log").insert({
      org_id: existingDevice.org_id ?? null,
      site_id,
      equipment_id: newId,
      device_id: existingDevice.device_id,
      event_type: "configuration",
      source: "system",
      message: finalMessage,
      metadata: {
        ha_device_id,
        previous_equipment_id: previousId,
        new_equipment_id: newId,
        user_note: note ?? null
      },
      created_by: "system",
    });
  }

  return NextResponse.json({ success: true });
}
