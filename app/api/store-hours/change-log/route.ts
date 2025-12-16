import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Required: ensures this file is treated as a module
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const site_id = req.nextUrl.searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json(
      { error: "Missing site_id" },
      { status: 400 }
    );
  }

  const supabase = createServerClient(
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

  const { data, error } = await supabase
    .from("b_store_hours_change_log")
    .select("*")
    .eq("site_id", site_id)
    .order("changed_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ rows: data ?? [] });
}
