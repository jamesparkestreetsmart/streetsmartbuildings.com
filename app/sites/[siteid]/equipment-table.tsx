import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import EquipmentTableClient from "./equipment-table-client";

export default async function EquipmentTable({ siteid }: { siteid: string }) {
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

  // Fetch from the view
  const { data, error } = await supabase
    .from("view_equipment")
    .select("*")
    .eq("site_id", siteid)
    .order("equipment_name", { ascending: true });

  return (
    <EquipmentTableClient
      initialData={data ?? []}
      siteid={siteid}
    />
  );
}
