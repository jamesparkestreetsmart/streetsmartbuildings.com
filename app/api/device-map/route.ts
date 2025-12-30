// app/api/device-map/route.ts

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

  const {
    site_id,
    org_id,
    device_id,
    ha_device_id, // may be null for UNMAP
  } = body;

  if (!site_id || !org_id || !device_id) {
    return NextResponse.json(
      { error: "Missing site_id, org_id, or device_id" },
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

  /* ======================================================
     Load current device state
  ====================================================== */
  const { data: targetDevice, error: loadError } = await supabase
    .from("a_devices")
    .select(
      "device_id, device_name, equipment_id, ha_device_id"
    )
    .eq("device_id", device_id)
    .eq("site_id", site_id)
    .single();

  if (loadError || !targetDevice) {
    return NextResponse.json(
      { error: "Device not found" },
      { status: 404 }
    );
  }

  const previousHaId = targetDevice.ha_device_id ?? null;
  const nextHaId = ha_device_id ?? null;

  /* ======================================================
     If mapping HA device, ensure 1:1 by clearing any prior
  ====================================================== */
  let remappedFromDeviceId: string | null = null;
  let remappedFromDeviceName: string | null = null;

  if (nextHaId) {
    const { data: existingBinding } = await supabase
      .from("a_devices")
      .select("device_id, device_name")
      .eq("site_id", site_id)
      .eq("ha_device_id", nextHaId)
      .maybeSingle();

    if (
      existingBinding &&
      existingBinding.device_id !== device_id
    ) {
      remappedFromDeviceId = existingBinding.device_id;
      remappedFromDeviceName = existingBinding.device_name;

      // Clear previous binding
      await supabase
        .from("a_devices")
        .update({ ha_device_id: null })
        .eq("device_id", existingBinding.device_id);
    }
  }

  /* ======================================================
     Update target device
  ====================================================== */
  await supabase
    .from("a_devices")
    .update({ ha_device_id: nextHaId })
    .eq("device_id", device_id);

  /* ======================================================
     Write audit log
  ====================================================== */
  let message = "";
  let metadata: Record<string, any> = {};

  if (!previousHaId && nextHaId) {
    // MAP
    message = "HA device mapped to business device";
    metadata = {
      device_name: targetDevice.device_name,
    };
  } else if (previousHaId && !nextHaId) {
    // UNMAP
    message = "HA device unmapped from business device";
    metadata = {
      device_name: targetDevice.device_name,
    };
  } else if (previousHaId && nextHaId && previousHaId !== nextHaId) {
    // REMAP
    message = "HA device reassigned to business device";
    metadata = {
      new_device_name: targetDevice.device_name,
      previous_device_id: remappedFromDeviceId,
      previous_device_name: remappedFromDeviceName,
    };
  }

  if (message) {
    await supabase.from("b_records_log").insert({
      org_id,
      site_id,
      equipment_id: targetDevice.equipment_id,
      device_id,
      event_type: "configuration",
      source: "system",
      message,
      metadata,
      created_by: "system",
      ha_device_id: nextHaId ?? previousHaId,
    });
  }

  return NextResponse.json({ success: true });
}
