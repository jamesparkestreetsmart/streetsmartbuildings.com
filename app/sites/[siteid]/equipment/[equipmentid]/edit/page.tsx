// app/sites/[siteid]/equipment/[equipmentid]/edit/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function EditEquipmentPage(props: any) {
  // Vercel sometimes sends params as a Promise – resolve safely
  const resolved = await props.params;
  const { siteid, equipmentid } = resolved;

  // Resolve cookies() (async on Vercel, sync in local dev)
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

  // Fetch equipment data
  const { data: equipment, error } = await supabase
    .from("a_equipments")
    .select("*")
    .eq("equipment_id", equipmentid)
    .single();

  if (error || !equipment) {
    console.error(error);
    return (
      <div className="p-6 text-red-600">
        Error loading equipment record.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="bg-white shadow p-6 rounded-xl border border-gray-200">
        <h1 className="text-3xl font-bold mb-2">
          Edit Equipment — {equipment.equipment_name}
        </h1>

        <p className="text-gray-600">
          You’ll add your edit form UI here soon.
        </p>
      </div>

      {/* DATA PREVIEW */}
      <div className="bg-gray-100 p-4 rounded shadow-inner">
        <h2 className="font-semibold mb-2">Equipment Record</h2>
        <pre className="text-xs overflow-auto">
          {JSON.stringify(equipment, null, 2)}
        </pre>
      </div>
    </div>
  );
}
