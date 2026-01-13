// ❌ DO NOT add "use client" here

console.log("EQUIPMENT PAGE FILE HIT (module loaded)");

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import IndividualEquipmentClient from "./IndividualEquipmentClient";

export const dynamic = "force-dynamic";

/* =======================
   Types
======================= */

interface Equipment {
  equipment_id: string;
  site_id: string;
  equipment_name: string;
  description: string | null;
  equipment_group: string | null;
  equipment_type: string | null;
  space_name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  manufacture_date: string | null;
  install_date: string | null;
  voltage: string | null;
  amperage: string | null;
  maintenance_interval_days: number | null;
  status: string;
}

interface Device {
  device_id: string;
  equipment_id: string;
  device_name: string;
  device_type: string | null;
  status: string | null;
  last_seen_at: string | null;
  ha_device_id: string | null;
}

interface EntityRow {
  entity_id: string;
  ha_device_id: string | null;
  sensor_type: string | null;
  unit_of_measurement: string | null;
  last_state: string | number | null;
  last_seen_at: string | null;
}

interface RecordLog {
  id: number;
  event_type: string;
  source: string;
  message: string;
  metadata: any;
  created_at: string;
  device_id: string | null;
}

export default async function IndividualEquipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteid: string; equipmentid: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  console.log("EQUIPMENT PAGE FUNCTION HIT");

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  console.log("PARAMS RECEIVED:", resolvedParams);
  console.log("SEARCH PARAMS RECEIVED:", resolvedSearchParams);

  const { siteid, equipmentid } = resolvedParams;

  if (!siteid || !equipmentid) {
    return (
      <pre className="p-6 text-red-600 whitespace-pre-wrap">
        Missing parameters!!!!
        {"\n"}siteid: {String(siteid)}
        {"\n"}equipmentid: {String(equipmentid)}
      </pre>
    );
  }

  const returnToRaw = resolvedSearchParams?.returnTo;
  const returnTo =
    Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;

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

  /* ---------- SITE ---------- */
  const { data: site } = await supabase
    .from("a_sites")
    .select("timezone, org_id")
    .eq("site_id", siteid)
    .single();

  const siteTimezone = site?.timezone || "America/Chicago";

  /* ---------- EQUIPMENT ---------- */
  const { data: equipment, error } = await supabase
    .from("a_equipments")
    .select("*")
    .eq("equipment_id", equipmentid)
    .eq("site_id", siteid)
    .single<Equipment>();

  if (error || !equipment) {
    return (
      <pre className="p-6 text-red-600 whitespace-pre-wrap">
        Equipment not found or access denied
        {"\n"}error: {JSON.stringify(error, null, 2)}
        {"\n"}equipmentid: {equipmentid}
        {"\n"}siteid: {siteid}
      </pre>
    );
  }

  /* ---------- DEVICES ---------- */
  const { data: devices } = await supabase
    .from("a_devices")
    .select("*")
    .eq("equipment_id", equipmentid)
    .order("device_name");

  const deviceList = (devices || []) as Device[];

  /* ---------- ENTITIES ---------- */
  let entitiesByHaDevice: Record<string, EntityRow[]> = {};

  const haIds = deviceList
    .map((d) => d.ha_device_id)
    .filter((id): id is string => !!id);

  if (haIds.length) {
    const { data: entities } = await supabase
      .from("view_entity_sync")
      .select(
        "entity_id, ha_device_id, sensor_type, unit_of_measurement, last_state, last_seen_at"
      )
      .in("ha_device_id", haIds);

    if (entities) {
      entitiesByHaDevice = (entities as EntityRow[]).reduce((acc, e) => {
        if (!e.ha_device_id) return acc;
        if (!acc[e.ha_device_id]) acc[e.ha_device_id] = [];
        acc[e.ha_device_id].push(e);
        return acc;
      }, {} as Record<string, EntityRow[]>);
    }
  }

  /* ---------- ACTIVITY ---------- */
  const { data: records } = await supabase
    .from("b_records_log")
    .select("*")
    .eq("equipment_id", equipmentid)
    .order("created_at", { ascending: false })
    .limit(15);

  const recordList = (records || []) as RecordLog[];

  /* ---------- RENDER ---------- */
  return (
    <IndividualEquipmentClient
      siteid={siteid}
      equipment={equipment}
      devices={deviceList}
      entitiesByHaDevice={entitiesByHaDevice}
      recordList={recordList}
      siteTimezone={siteTimezone}
      orgId={site?.org_id || null}
      returnTo={returnTo}
    />
  );
}
