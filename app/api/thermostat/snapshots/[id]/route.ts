import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth/requireAdminRole";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  // Fetch snapshot
  const { data: snapshot, error: snapErr } = await supabase
    .from("a_org_thermostat_snapshots")
    .select("*")
    .eq("snapshot_id", id)
    .single();

  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });
  if (!snapshot) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });

  // Fetch all items
  const { data: items, error: itemsErr } = await supabase
    .from("a_org_thermostat_snapshot_items")
    .select("*")
    .eq("snapshot_id", id)
    .order("site_name")
    .order("zone_name");

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  // Group items by site
  const siteGroups: Record<string, { site_id: string; site_name: string; items: any[] }> = {};
  for (const item of items || []) {
    if (!siteGroups[item.site_id]) {
      siteGroups[item.site_id] = {
        site_id: item.site_id,
        site_name: item.site_name,
        items: [],
      };
    }
    siteGroups[item.site_id].items.push(item);
  }

  return NextResponse.json({
    ...snapshot,
    items: items || [],
    site_groups: Object.values(siteGroups),
  });
}
