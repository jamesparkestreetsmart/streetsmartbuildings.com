// app/api/sites/[siteid]/map-entity/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  context: { params: { siteid: string } }
) {
  const { siteid } = context.params;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entity_id, equipment_id } = body;

  if (!entity_id || !equipment_id) {
    return NextResponse.json(
      { error: "Missing entity_id or equipment_id" },
      { status: 400 }
    );
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
    .from("b_entity_sync")
    .update({ equipment_id })
    .eq("site_id", siteid)
    .eq("entity_id", entity_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    mapped_entity: entity_id,
    mapped_to_equipment: equipment_id,
  });
}
