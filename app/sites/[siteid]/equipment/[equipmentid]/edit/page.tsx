// app/sites/[siteid]/equipment/[equipmentid]/edit/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import EditEquipmentForm from "@/components/equipment/EditEquipmentForm";

export const dynamic = "force-dynamic";

export default async function EditEquipmentPage({
  params,
}: {
  params: { siteid: string; equipmentid: string };
}) {
  const { siteid, equipmentid } = params;

  if (!equipmentid) {
    console.error("Missing equipmentid in route params");
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-red-600">
          Error: Missing equipment ID in URL
        </h1>
      </div>
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

  const { data: equipment, error } = await supabase
    .from("a_equipments")
    .select("*")
    .eq("equipment_id", equipmentid)
    .single();

  if (error || !equipment) {
    console.error("Equipment fetch error:", error);
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-red-600">
          Error loading equipment
        </h1>
        <p className="text-gray-700 mt-2">
          Could not find equipment with ID: <code>{equipmentid}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <EditEquipmentForm equipment={equipment} siteid={siteid} />
      </div>
    </div>
  );
}
