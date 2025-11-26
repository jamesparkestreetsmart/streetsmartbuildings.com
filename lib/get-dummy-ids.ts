import { supabase } from "@/lib/supabaseClient";

export async function get_dummy_ids(org_id: string) {
  const { data, error } = await supabase
    .from("a_organizations")
    .select("dummy_site_id, dummy_equipment_id")
    .eq("org_id", org_id)
    .single();

  if (error || !data) {
    throw new Error("failed to load dummy ids");
  }

  return {
    dummy_site_id: data.dummy_site_id,
    dummy_equipment_id: data.dummy_equipment_id
  };
}
