import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { site_id, rows } = body;

    if (!site_id || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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

    // 🔐 Verify user session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    for (const row of rows) {
      const { error: updateError } = await supabase
        .from("b_store_hours")
        .update({
          open_time: row.open_time,
          close_time: row.close_time,
          is_closed: row.is_closed,
          last_updated_by: user.id, // 👈 critical
        })
        .eq("store_hours_id", row.store_hours_id);

      if (updateError) {
        console.error(updateError);
        throw updateError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Store hours API error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
