import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await context.params;
  const url = req.nextUrl.searchParams;

  const equipmentId = url.get("equipment_id") || null;
  const limit = Math.min(parseInt(url.get("limit") || "50", 10) || 50, 200);

  try {
    let query = supabase
      .from("b_compressor_cycles")
      .select("*")
      .eq("site_id", siteId)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (equipmentId) query = query.eq("equipment_id", equipmentId);

    const { data, error } = await query;

    if (error) {
      console.error(
        "[compressor-cycles] Query error:",
        error.message,
        "| code:", error.code,
        "| details:", (error as any).details,
        "| hint:", (error as any).hint
      );
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("[compressor-cycles] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
