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
    event_date?: string;
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
    event_date,
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

  const insertData = {
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
    event_date: event_date || new Date().toISOString().split("T")[0],
  };

  console.log("Inserting record note:", insertData);

  const { error } = await supabase.from("b_records_log").insert(insertData);

  if (error) {
    console.error("Add record note error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  console.log("Record note inserted successfully");

  return NextResponse.json({ success: true });
}
