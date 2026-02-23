import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const site_id = req.nextUrl.searchParams.get("site_id");
  const date = req.nextUrl.searchParams.get("date");

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Get site timezone to determine today if no date provided
  const { data: site } = await supabase
    .from("a_sites")
    .select("timezone")
    .eq("site_id", site_id)
    .single();

  const tz = site?.timezone || "America/Chicago";
  const targetDate =
    date || new Date().toLocaleDateString("en-CA", { timeZone: tz });

  const { data: manifest, error } = await supabase
    .from("b_store_hours_manifests")
    .select(
      "manifest_date, open_time, close_time, is_closed, operations_manifest, manifest_push_status, manifest_pushed_at"
    )
    .eq("site_id", site_id)
    .eq("manifest_date", targetDate)
    .single();

  if (error || !manifest) {
    return NextResponse.json({
      date: targetDate,
      manifest: null,
      message: "No manifest found for this date",
    });
  }

  return NextResponse.json({
    date: targetDate,
    manifest: manifest.operations_manifest,
    store_hours: {
      open: manifest.open_time,
      close: manifest.close_time,
      is_closed: manifest.is_closed,
    },
    push_status: manifest.manifest_push_status,
    pushed_at: manifest.manifest_pushed_at,
  });
}
