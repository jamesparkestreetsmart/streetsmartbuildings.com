// app/api/sites/[siteid]/sync-ha/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ siteid: string }> }
): Promise<NextResponse> {
  const { siteid } = await context.params;

  if (!siteid) {
    return NextResponse.json({ error: "Missing siteid" }, { status: 400 });
  }

  // Parse JSON
  let payload: any;
  try {
    payload = await req.json();
  } catch (err) {
    console.error("Invalid JSON payload:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entities = payload.entities ?? [];

  // Create Supabase client
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

  // Build upsert rows for a_gateway_entities
  const upserts = entities.map((ent: any) => ({
    site_id: siteid,
    entity_id: ent.entity_id,
    friendly_name: ent.friendly_name ?? null,
    domain: ent.domain ?? null,
    device_class: ent.device_class ?? null,
    value: ent.value ?? null,
    unit: ent.unit ?? null,
    state: ent.state ?? null,
    raw: ent,
    updated_at: new Date().toISOString(),
  }));

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("a_gateway_entities")
      .upsert(upserts, { onConflict: "site_id,entity_id" });

    if (error) {
      console.error("Supabase upsert error in /sync-ha:", error);
      return NextResponse.json(
        { error: "Supabase upsert failed", detail: error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    status: "ok",
    siteid,
    entities_received: entities.length,
  });
}
