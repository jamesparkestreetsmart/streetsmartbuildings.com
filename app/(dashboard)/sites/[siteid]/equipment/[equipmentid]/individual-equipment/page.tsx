import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import IndividualEquipmentClient from "./IndividualEquipmentClient";

export const dynamic = "force-dynamic";

export default async function IndividualEquipmentPage({
  params,
  searchParams,
}: {
  params: { siteid: string; equipmentid: string };
  searchParams?: { returnTo?: string };
}) {
  const { siteid, equipmentid } = params;

  /* =======================
     HARD GUARD (DEBUG SAFE)
  ======================= */
  if (!siteid || !equipmentid) {
    return (
      <pre className="p-6 text-red-600 whitespace-pre-wrap">
        Missing parameters
        {"\n"}siteid: {String(siteid)}
        {"\n"}equipmentid: {String(equipmentid)}
        {"\n"}params: {JSON.stringify(params, null, 2)}
        {"\n"}searchParams: {JSON.stringify(searchParams, null, 2)}
      </pre>
    );
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

  /* =======================
     DEFENSIVE EQUIPMENT FETCH
     (validates site + org)
  ======================= */
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

  /* =======================
     PASS VERIFIED DATA
  ======================= */
  return (
    <IndividualEquipmentClient
      siteid={siteid}
      equipmentid={equipment.equipment_id}
      orgId={equipment.org_id}
      returnTo={searchParams?.returnTo}
    />
  );
}
