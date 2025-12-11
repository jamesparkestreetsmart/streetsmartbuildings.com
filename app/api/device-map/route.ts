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


  const { data: existingDevice } = await supabase
    .from("a_devices")
    .select("device_id, equipment_id, org_id")
    .eq("site_id", site_id)
    .eq("ha_device_id", ha_device_id)
    .maybeSingle();

  const previousId = existingDevice?.equipment_id ?? null;
  const newId = equipment_id ?? null;

  await supabase
    .from("a_devices")
    .update({ equipment_id: newId })
    .eq("site_id", site_id)
    .eq("ha_device_id", ha_device_id);

  if (!existingDevice || previousId === newId) {
    return NextResponse.json({ success: true });
  }

  const records = [];

  if (previousId) {
    records.push({
      org_id: existingDevice.org_id,
      site_id,
      equipment_id: previousId,
      device_id: existingDevice.device_id,
      event_type: "configuration",
      source: "system",
      message: "Device unmapped from equipment",
      metadata: {
        ha_device_id,
        previous_equipment_id: previousId,
        new_equipment_id: newId,
        user_note: note ?? null,
      },
      created_by: "system",
    });
  }

  if (newId) {
    records.push({
      org_id: existingDevice.org_id,
      site_id,
      equipment_id: newId,
      device_id: existingDevice.device_id,
      event_type: "configuration",
      source: "system",
      message: note
        ? `Device mapped to equipment — NOTE: ${note}`
        : "Device mapped to equipment",
      metadata: {
        ha_device_id,
        previous_equipment_id: previousId,
        new_equipment_id: newId,
        user_note: note ?? null,
      },
      created_by: "system",
    });
  }

  await supabase.from("b_records_log").insert(records);

  return NextResponse.json({ success: true });
}
