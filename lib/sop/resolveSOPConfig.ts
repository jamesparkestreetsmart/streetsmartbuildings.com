import { SupabaseClient } from "@supabase/supabase-js";

export interface EffectiveAssignment {
  assignment_id: string;
  template_id: string;
  owner_kind: string;
  org_id: string | null;
  scope_level: string;
  site_id: string | null;
  equipment_type_id: string | null;
  equipment_id: string | null;
  space_type: string | null;
  space_id: string | null;
  effective_from: string | null;
  effective_to: string | null;
  retired_at: string | null;
  // Template fields
  target_kind: "equipment" | "space";
  label: string;
  metric: string;
  unit: string;
  min_value: number | null;
  max_value: number | null;
  evaluation_window: string;
  notes: string | null;
}

/**
 * Resolve the effective SOP assignment for the equipment track.
 * Resolution order: equipment → equipment_type → org → ssb
 */
export async function resolveSOPEquipment(
  supabase: SupabaseClient,
  metric: string,
  orgId: string,
  equipmentTypeId?: string | null,
  equipmentId?: string | null,
): Promise<EffectiveAssignment | null> {
  const { data, error } = await supabase
    .rpc("resolve_sop_equipment", {
      p_metric: metric,
      p_org_id: orgId,
      p_equipment_type_id: equipmentTypeId || null,
      p_equipment_id: equipmentId || null,
    });

  if (error) {
    console.error("[resolveSOPEquipment] RPC error:", error.message);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Resolve the effective SOP assignment for the space track.
 * Resolution order: space → space_type → site → org → ssb
 */
export async function resolveSOPSpace(
  supabase: SupabaseClient,
  metric: string,
  orgId: string,
  siteId?: string | null,
  spaceType?: string | null,
  spaceId?: string | null,
): Promise<EffectiveAssignment | null> {
  const { data, error } = await supabase
    .rpc("resolve_sop_space", {
      p_metric: metric,
      p_org_id: orgId,
      p_site_id: siteId || null,
      p_space_type: spaceType || null,
      p_space_id: spaceId || null,
    });

  if (error) {
    console.error("[resolveSOPSpace] RPC error:", error.message);
    return null;
  }

  return data?.[0] || null;
}
