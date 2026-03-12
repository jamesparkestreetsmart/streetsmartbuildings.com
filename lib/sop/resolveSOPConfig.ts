import { SupabaseClient } from "@supabase/supabase-js";

export interface SOPConfig {
  id: string;
  org_id: string;
  site_id: string | null;
  equipment_id: string | null;
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
 * Resolve the effective SOP config for a given metric + scope.
 * Resolution order (most-specific wins):
 *   1. equipment-level (equipment_id + site_id match)
 *   2. site-level (site_id match, equipment_id null)
 *   3. org-level (org_id match, site_id null)
 *   4. null (no SOP defined)
 *
 * "Active" = effective_from <= today AND (effective_to IS NULL OR effective_to >= today)
 */
export async function resolveSOPConfig(
  supabase: SupabaseClient,
  metric: string,
  orgId: string,
  siteId?: string | null,
  equipmentId?: string | null,
  asOf?: string // YYYY-MM-DD, defaults to today
): Promise<SOPConfig | null> {
  const today = asOf || new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("a_sop_configs")
    .select("*")
    .eq("org_id", orgId)
    .eq("metric", metric)
    .or(`effective_from.is.null,effective_from.lte.${today}`)
    .or(`effective_to.is.null,effective_to.gte.${today}`);

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[resolveSOPConfig] Query error:", error.message);
    return null;
  }

  if (!data || data.length === 0) return null;

  // Most-specific-wins: equipment → site → org
  const candidates = data as SOPConfig[];

  // 1. Equipment-level match
  if (equipmentId && siteId) {
    const match = candidates.find(
      (c) => c.equipment_id === equipmentId && c.site_id === siteId
    );
    if (match) return match;
  }

  // 2. Site-level match
  if (siteId) {
    const match = candidates.find(
      (c) => c.site_id === siteId && c.equipment_id === null
    );
    if (match) return match;
  }

  // 3. Org-level match
  const match = candidates.find(
    (c) => c.site_id === null && c.equipment_id === null
  );
  return match || null;
}
