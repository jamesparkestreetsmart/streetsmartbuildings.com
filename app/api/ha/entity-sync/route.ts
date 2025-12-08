import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  // ✅ MUST await cookies()
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

  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const {
    org_id,
    site_id,
    equipment_id,
    entity_id,
    domain,
    device_class,
    unit_of_measurement,
    area_id,
    last_state,
    ha_device_id,
    raw_json,
  } = payload ?? {};

  // ✅ Hard validation (prevents silent failures)
  if (!org_id || !site_id || !equipment_id || !entity_id || !domain) {
    return NextResponse.json(
      {
        error: "Missing required fields",
        required: [
          "org_id",
          "site_id",
          "equipment_id",
          "entity_id",
          "domain",
        ],
      },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("b_entity_sync")
    .upsert(
      {
        org_id,
        site_id,
        equipment_id,
        entity_id,
        domain,
        device_class,
        unit_of_measurement,
        area_id,
        last_state,
        ha_device_id,
        raw_json,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: "org_id,site_id,equipment_id,entity_id",
      }
    );

  if (error) {
    console.error("Entity sync error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    entity_id,
  });
}
