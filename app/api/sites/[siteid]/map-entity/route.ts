// app/api/sites/[siteid]/map-entity/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ siteid: string }> }
) {
  const { siteid } = await context.params;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ha_device_id, equipment_id } = body;

  if (!ha_device_id || !equipment_id) {
    return NextResponse.json(
      { error: "Missing ha_device_id or equipment_id" },
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

  const { error } = await supabase
    .from("a_devices_gateway_registry")
    .update({ mapped_equipment_id: equipment_id })
    .eq("site_id", siteid)
    .eq("ha_device_id", ha_device_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
