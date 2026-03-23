import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/auth/requireAdminRole";
import { THERMOSTAT_FUNCTIONAL_FIELDS } from "@/lib/thermostat/profileIdentity";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const auth = await requireAdminRole(orgId);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabase
    .from("a_org_thermostat_snapshots")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { org_id, name, snapshot_date, notes } = body;

    if (!org_id || !name || !snapshot_date) {
      return NextResponse.json(
        { error: "org_id, name, and snapshot_date are required" },
        { status: 400 }
      );
    }

    const auth = await requireAdminRole(org_id);
    if (auth instanceof NextResponse) return auth;
    const { userId, email } = auth;

    // 1. Fetch all active zones for org with their profile assignments
    const { data: sites } = await supabase
      .from("a_sites")
      .select("site_id, site_name")
      .eq("org_id", org_id);

    if (!sites || sites.length === 0) {
      return NextResponse.json(
        { error: "No sites found for this org" },
        { status: 400 }
      );
    }

    const siteIds = sites.map((s: any) => s.site_id);
    const siteNameMap = new Map(sites.map((s: any) => [s.site_id, s.site_name]));

    const { data: zones } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, site_id, profile_id")
      .in("site_id", siteIds);

    if (!zones || zones.length === 0) {
      return NextResponse.json(
        { error: "No HVAC zones found for this org" },
        { status: 400 }
      );
    }

    // 2. Fetch profiles for all zones that have one
    const profileIds = [...new Set(zones.filter((z: any) => z.profile_id).map((z: any) => z.profile_id))];
    const profileMap = new Map<string, any>();

    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("b_thermostat_profiles")
        .select("*")
        .in("profile_id", profileIds);

      for (const p of profiles || []) {
        profileMap.set(p.profile_id, p);
      }
    }

    // 3. Build snapshot items — only zones with active profiles
    const snapshotItems: any[] = [];
    let skippedZones = 0;
    const capturedSites = new Set<string>();

    for (const zone of zones) {
      if (!zone.profile_id) {
        skippedZones++;
        continue;
      }

      const profile = profileMap.get(zone.profile_id);
      if (!profile) {
        skippedZones++;
        continue;
      }

      capturedSites.add(zone.site_id);

      const item: any = {
        site_id: zone.site_id,
        zone_id: zone.hvac_zone_id,
        zone_name: zone.name,
        site_name: siteNameMap.get(zone.site_id) || "Unknown",
        source_profile_id: profile.profile_id,
        source_profile_name: profile.name,
      };

      // Copy all functional fields from profile to snapshot item
      for (const field of THERMOSTAT_FUNCTIONAL_FIELDS) {
        item[field] = profile[field] ?? null;
      }

      snapshotItems.push(item);
    }

    if (snapshotItems.length === 0) {
      return NextResponse.json(
        { error: "No zones with active profiles found — nothing to snapshot" },
        { status: 400 }
      );
    }

    // 4. Create parent snapshot
    const { data: snapshot, error: snapErr } = await supabase
      .from("a_org_thermostat_snapshots")
      .insert({
        org_id,
        name,
        snapshot_date,
        notes: notes || null,
        zone_count: snapshotItems.length,
        site_count: capturedSites.size,
        created_by_user_id: userId,
      })
      .select()
      .single();

    if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });

    // 5. Insert all snapshot items
    const itemRows = snapshotItems.map((item) => ({
      ...item,
      snapshot_id: snapshot.snapshot_id,
    }));

    const { error: itemsErr } = await supabase
      .from("a_org_thermostat_snapshot_items")
      .insert(itemRows);

    if (itemsErr) {
      // Clean up parent if items fail
      await supabase
        .from("a_org_thermostat_snapshots")
        .delete()
        .eq("snapshot_id", snapshot.snapshot_id);
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    // 6. Write to b_records_log
    await supabase.from("b_records_log").insert({
      org_id,
      event_type: "thermostat_snapshot",
      event_date: new Date().toISOString().split("T")[0],
      message: `Saved snapshot "${name}" — ${snapshotItems.length} zones across ${capturedSites.size} sites`,
      source: "thermostat_snapshots",
      created_by: email,
    });

    return NextResponse.json({
      ...snapshot,
      items: itemRows,
      skipped_zones: skippedZones,
    }, { status: 201 });
  } catch (err: any) {
    console.error("[snapshots] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
