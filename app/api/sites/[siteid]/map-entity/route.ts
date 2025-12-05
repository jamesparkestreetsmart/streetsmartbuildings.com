// app/api/sites/[siteid]/map-entity/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: { siteid: string } }
) {
  const { siteid } = params;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  // -------------------------------------------------------------
  // 1. Read JSON
  // -------------------------------------------------------------
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Expected payload from website:
  // {
  //   entity_id: "sensor.kitchen_temp",
  //   equipment_id: "uuid-of-equipment"
  // }
  const { entity_id, equipment_id } = body;

  if (!entity_id || !equipment_id) {
    return NextResponse.json(
      { error: "Missing entity_id or equipment_id" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------
  // 2. Create Supabase client
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // 3. Update the NEW table: b_entity_sync
  // -------------------------------------------------------------
  const { error } = await supabase
    .from("b_entity_sync")
    .update({
      equipment_id: equipment_id,
      last_updated_at: new Date().toISOString(),
    })
    .eq("site_id", siteid)
    .eq("entity_id", entity_id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to update b_entity_sync", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "ok",
    mapped_entity: entity_id,
    mapped_to_equipment: equipment_id,
  });
}
