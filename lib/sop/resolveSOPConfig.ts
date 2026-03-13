import { SupabaseClient } from "@supabase/supabase-js";

export interface SOPConfig {
  id: string;
  org_id: string | null;
  site_id: string | null;
  equipment_id: string | null;
  space_id: string | null;
  target_kind: "equipment" | "space";
  scope_level: string;
  equipment_type: string | null;
  space_type: string | null;
  label: string;
  metric: string;
  min_value: number | null;
  max_value: number | null;
  evaluation_window: string;
  unit: string;
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
}

/**
 * Resolve the effective SOP config for the equipment track.
 * Resolution order: equipment → equipment_type → org → ssb
 */
export async function resolveSOPConfigEquipment(
  supabase: SupabaseClient,
  metric: string,
  orgId: string,
  equipmentType?: string | null,
  equipmentId?: string | null,
  asOf?: string
): Promise<SOPConfig | null> {
  const { data, error } = await supabase
    .rpc("resolve_sop_config_equipment", {
      p_metric: metric,
      p_org_id: orgId,
      p_equipment_type: equipmentType || null,
      p_equipment_id: equipmentId || null,
    });

  if (error) {
    console.error("[resolveSOPConfigEquipment] RPC error:", error.message);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Resolve the effective SOP config for the space track.
 * Resolution order: space → space_type → site → org → ssb
 */
export async function resolveSOPConfigSpace(
  supabase: SupabaseClient,
  metric: string,
  orgId: string,
  siteId?: string | null,
  spaceType?: string | null,
  spaceId?: string | null,
  asOf?: string
): Promise<SOPConfig | null> {
  const { data, error } = await supabase
    .rpc("resolve_sop_config_space", {
      p_metric: metric,
      p_org_id: orgId,
      p_site_id: siteId || null,
      p_space_type: spaceType || null,
      p_space_id: spaceId || null,
    });

  if (error) {
    console.error("[resolveSOPConfigSpace] RPC error:", error.message);
    return null;
  }

  return data?.[0] || null;
}

/**
 * @deprecated Use resolveSOPConfigEquipment or resolveSOPConfigSpace instead.
 */
export async function resolveSOPConfig(
  supabase: SupabaseClient,
  metric: string,
  orgId: string,
  siteId?: string | null,
  equipmentId?: string | null,
  asOf?: string
): Promise<SOPConfig | null> {
  return resolveSOPConfigEquipment(supabase, metric, orgId, null, equipmentId, asOf);
}
