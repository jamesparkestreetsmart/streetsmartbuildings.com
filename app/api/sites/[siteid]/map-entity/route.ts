import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(
  req: NextRequest,
  { params }: { params: { siteid: string } }
) {
  const site_id = params.siteid;
  const body = await req.json();

  const { equipment_id, ha_entity_id, sensor_type } = body;

  if (!equipment_id || !ha_entity_id || !sensor_type) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { error } = await supabase
    .from("a_equipment_sensor_map")
    .upsert({
      site_id,
      equipment_id,
      ha_entity_id,
      sensor_type,
    });

  if (error) {
    console.error("Map save error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
