import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  let body: {
    org_id?: string | null;
    site_id?: string | null;
    equipment_id?: string | null;
    device_id?: string | null;
    note?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    org_id = null,
    site_id = null,
    equipment_id = null,
    device_id = null,
    note,
  } = body;

  if (!note || !note.trim()) {
    return NextResponse.json(
      { error: "Note is required" },
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

  const { error } = await supabase.from("b_records_log").insert({
    org_id,
    site_id,
    equipment_id,
    device_id,
    event_type: "note",
    source: "user",
    message: "User note added",
    metadata: {
      note: note.trim(),
    },
    created_by: "ui",
  });

  if (error) {
    console.error("Add record note error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
