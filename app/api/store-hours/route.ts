import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const { site_id, rows } = await req.json();

    if (!site_id || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    /**
     * 1️⃣ Cookies MUST be awaited in App Router
     */
    const cookieStore = await cookies();

    /**
     * 2️⃣ User-scoped client (auth only)
     */
    const supabaseUser = createServerClient(
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

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    /**
     * 3️⃣ Service-role client (writes only)
     * NOTE: options object is REQUIRED
     */
    const supabaseAdmin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get() {
            return undefined;
          },
        },
      }
    );

    /**
     * 4️⃣ Update store hours
     * Trigger handles change log
     */
    for (const row of rows) {
      const { error } = await supabaseAdmin
        .from("b_store_hours")
        .update({
          open_time: row.open_time,
          close_time: row.close_time,
          is_closed: row.is_closed,
          last_updated_by: userId,
          last_updated_at: new Date(),
        })
        .eq("store_hours_id", row.store_hours_id);

      if (error) {
        console.error("Store hours update failed:", error);
        throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Store hours save error:", e);
    return NextResponse.json(
      { error: e.message || "Server error" },
      { status: 500 }
    );
  }
}
