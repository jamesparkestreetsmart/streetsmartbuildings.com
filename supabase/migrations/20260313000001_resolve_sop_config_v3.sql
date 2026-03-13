-- ═══════════════════════════════════════════════════════════════════════════
-- SOP Resolution Functions v3
-- Two track-specific functions replacing the old single resolve_sop_config()
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Equipment Track ──────────────────────────────────────────────────────
-- Resolution order: equipment → equipment_type → org → ssb
CREATE OR REPLACE FUNCTION resolve_sop_config_equipment(
  p_metric         text,
  p_org_id         uuid,
  p_equipment_type text,   -- a_equipments.equipment_group; pass NULL if unknown
  p_equipment_id   uuid    -- pass NULL if querying at type/org level
) RETURNS SETOF a_sop_configs AS $$
  SELECT * FROM a_sop_configs
  WHERE target_kind = 'equipment'
    AND metric = p_metric
    AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
    AND (effective_to   IS NULL OR effective_to   >= CURRENT_DATE)
    AND (
      (scope_level = 'equipment'
        AND equipment_id = p_equipment_id
        AND p_equipment_id IS NOT NULL)
      OR (scope_level = 'equipment_type'
        AND org_id = p_org_id
        AND equipment_type = p_equipment_type
        AND p_equipment_type IS NOT NULL)
      OR (scope_level = 'org'
        AND org_id = p_org_id)
      OR (scope_level = 'ssb')
    )
  ORDER BY
    CASE scope_level
      WHEN 'equipment'      THEN 1
      WHEN 'equipment_type' THEN 2
      WHEN 'org'            THEN 3
      WHEN 'ssb'            THEN 4
      ELSE 5
    END
  LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ── Space Track ──────────────────────────────────────────────────────────
-- Resolution order: space → space_type → site → org → ssb
CREATE OR REPLACE FUNCTION resolve_sop_config_space(
  p_metric     text,
  p_org_id     uuid,
  p_site_id    uuid,    -- pass NULL if querying at org level
  p_space_type text,    -- pass NULL if unknown
  p_space_id   uuid     -- pass NULL if querying at type/site level
) RETURNS SETOF a_sop_configs AS $$
  SELECT * FROM a_sop_configs
  WHERE target_kind = 'space'
    AND metric = p_metric
    AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
    AND (effective_to   IS NULL OR effective_to   >= CURRENT_DATE)
    AND (
      (scope_level = 'space'
        AND space_id = p_space_id
        AND p_space_id IS NOT NULL)
      OR (scope_level = 'space_type'
        AND site_id = p_site_id
        AND space_type = p_space_type
        AND p_space_type IS NOT NULL)
      OR (scope_level = 'site'
        AND site_id = p_site_id
        AND p_site_id IS NOT NULL)
      OR (scope_level = 'org'
        AND org_id = p_org_id)
      OR (scope_level = 'ssb')
    )
  ORDER BY
    CASE scope_level
      WHEN 'space'      THEN 1
      WHEN 'space_type' THEN 2
      WHEN 'site'       THEN 3
      WHEN 'org'        THEN 4
      WHEN 'ssb'        THEN 5
      ELSE 6
    END
  LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ── Drop old function ────────────────────────────────────────────────────
-- Old resolve_sop_config() is replaced by the two track-specific functions.
DROP FUNCTION IF EXISTS resolve_sop_config(text, uuid, uuid, uuid);
