import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Convert a local date string (e.g. "2026-02-21") in a given timezone
 * to a UTC range: [start_of_day_utc, start_of_next_day_utc).
 */
function localDateToUtcRange(dateStr: string, tz: string): { gte: string; lt: string } {
  // Use a noon reference point to determine the timezone offset
  const refNoon = new Date(`${dateStr}T12:00:00Z`);
  const utcStr = refNoon.toLocaleString("en-US", { timeZone: "UTC" });
  const localStr = refNoon.toLocaleString("en-US", { timeZone: tz });
  const offsetMs = new Date(utcStr).getTime() - new Date(localStr).getTime();

  // Midnight local time in UTC
  const gte = new Date(
    new Date(`${dateStr}T00:00:00Z`).getTime() + offsetMs
  ).toISOString();

  // Next day midnight local time in UTC
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = nextDay.toISOString().split("T")[0];
  const lt = new Date(
    new Date(`${nextStr}T00:00:00Z`).getTime() + offsetMs
  ).toISOString();

  return { gte, lt };
}

export async function GET(req: NextRequest) {
  const site_id = req.nextUrl.searchParams.get("site_id");
  const date = req.nextUrl.searchParams.get("date");

  if (!site_id || !date) {
    return NextResponse.json(
      { error: "site_id and date required" },
      { status: 400 }
    );
  }

  // Fetch equipment, device, and site info (timezone + name)
  const [eqRes, devRes, siteRes] = await Promise.all([
    supabase
      .from("a_equipments")
      .select("equipment_id, equipment_name")
      .eq("site_id", site_id),
    supabase
      .from("a_devices")
      .select("device_id, device_name")
      .eq("site_id", site_id),
    supabase
      .from("a_sites")
      .select("site_name, timezone")
      .eq("site_id", site_id)
      .single(),
  ]);

  const equipRows = eqRes.data || [];
  const deviceRows = devRes.data || [];
  const siteName = siteRes.data?.site_name || null;
  const tz = siteRes.data?.timezone || "America/Chicago";

  const equipIds = equipRows.map((r: any) => r.equipment_id);
  const deviceIds = deviceRows.map((r: any) => r.device_id);

  // Name lookup maps
  const equipNameMap = new Map<string, string>();
  for (const r of equipRows) equipNameMap.set(r.equipment_id, r.equipment_name);
  const deviceNameMap = new Map<string, string>();
  for (const r of deviceRows) deviceNameMap.set(r.device_id, r.device_name);

  // Build OR filter: site_id matches, OR equipment/device belongs to this site
  const orParts: string[] = [`site_id.eq.${site_id}`];
  if (equipIds.length > 0) {
    orParts.push(`equipment_id.in.(${equipIds.join(",")})`);
  }
  if (deviceIds.length > 0) {
    orParts.push(`device_id.in.(${deviceIds.join(",")})`);
  }

  // Convert the requested local date to a UTC range for timezone-aware filtering.
  // This prevents evening CST entries (which have UTC dates of the next day)
  // from appearing on the wrong day's Logic Map.
  const { gte, lt } = localDateToUtcRange(date, tz);

  const { data, error } = await supabase
    .from("b_records_log")
    .select(
      "id, event_type, source, message, metadata, created_by, created_at, event_time, equipment_id, device_id"
    )
    .or(orParts.join(","))
    .gte("created_at", gte)
    .lt("created_at", lt)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich entries with resolved entity names
  const enriched = (data ?? []).map((row: any) => ({
    ...row,
    device_name: row.device_id ? deviceNameMap.get(row.device_id) || null : null,
    equipment_name: row.equipment_id
      ? equipNameMap.get(row.equipment_id) || null
      : null,
    site_name: siteName,
  }));

  return NextResponse.json({ entries: enriched });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { site_id, date, message, created_by, event_time, event_type, source, device_id, equipment_id, metadata } = body;

  if (!site_id || !date || !message?.trim()) {
    return NextResponse.json(
      { error: "site_id, date, and message required" },
      { status: 400 }
    );
  }

  const { data: site } = await supabase
    .from("a_sites")
    .select("org_id")
    .eq("site_id", site_id)
    .single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const insertRow: any = {
    org_id: site.org_id,
    site_id,
    event_type: event_type || "logic_map_comment",
    source: source || "logic_map",
    message: message.trim(),
    event_date: date,
    created_by: created_by || "system",
    metadata: metadata || {},
  };
  if (event_time) insertRow.event_time = event_time;
  if (device_id) insertRow.device_id = device_id;
  if (equipment_id) insertRow.equipment_id = equipment_id;

  const { data, error } = await supabase
    .from("b_records_log")
    .insert(insertRow)
    .select(
      "id, event_type, source, message, metadata, created_by, created_at, event_time, equipment_id, device_id"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}
