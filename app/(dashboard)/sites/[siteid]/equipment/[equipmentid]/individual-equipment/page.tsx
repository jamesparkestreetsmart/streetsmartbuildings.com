// ❌ DO NOT add "use client" here

console.log("EQUIPMENT PAGE FILE HIT (module loaded)");

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import IndividualEquipmentClient from "./IndividualEquipmentClient";

export const dynamic = "force-dynamic";

export default async function IndividualEquipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{
    siteid: string;
    equipmentid: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  console.log("EQUIPMENT PAGE FUNCTION HIT");

  // ✅ unwrap promises (Next 16 requirement)
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
        {"\n"}params: {JSON.stringify(resolvedParams, null, 2)}
        {"\n"}searchParams: {JSON.stringify(resolvedSearchParams, null, 2)}
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

  const { data: equipment, error } = await supabase
    .from("a_equipments")
    .select("equipment_id, site_id, org_id")
    .eq("equipment_id", equipmentid)
    .eq("site_id", siteid)
    .maybeSingle();

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

  return (
    <IndividualEquipmentClient
      siteid={siteid}
      equipmentid={equipment.equipment_id}
      orgId={equipment.org_id}
      returnTo={returnTo}
    />
  );
}
