-- Migration: Resolution functions v4 — template/assignment architecture
-- Depends on: 20260313000002_sop_template_assignment.sql

-- ═════════════════════════════════════════════════════════════
-- View: v_sop_effective — active assignments joined with templates
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_sop_effective AS
  SELECT
    a.id              AS assignment_id,
    a.template_id,
    a.owner_kind,
    a.org_id,
    a.scope_level,
    a.site_id,
    a.equipment_type,
    a.equipment_id,
    a.space_type,
    a.space_id,
    a.effective_from,
    a.effective_to,
    a.retired_at,
    -- Template rule values
    t.target_kind,
    t.label,
    t.metric,
    t.unit,
    t.min_value,
    t.max_value,
    t.evaluation_window,
    t.notes
  FROM a_sop_assignments a
  JOIN a_sop_templates t ON t.id = a.template_id
  WHERE a.retired_at IS NULL
    AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
    AND (a.effective_to   IS NULL OR a.effective_to   >= CURRENT_DATE);

-- ═════════════════════════════════════════════════════════════
-- Equipment track resolution
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION resolve_sop_equipment(
  p_metric         text,
  p_org_id         uuid,
  p_equipment_type text,
  p_equipment_id   uuid
) RETURNS SETOF v_sop_effective AS $$
  SELECT * FROM v_sop_effective
  WHERE target_kind = 'equipment'
    AND metric = p_metric
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

-- ═════════════════════════════════════════════════════════════
-- Space track resolution
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION resolve_sop_space(
  p_metric     text,
  p_org_id     uuid,
  p_site_id    uuid,
  p_space_type text,
  p_space_id   uuid
) RETURNS SETOF v_sop_effective AS $$
  SELECT * FROM v_sop_effective
  WHERE target_kind = 'space'
    AND metric = p_metric
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

-- ═════════════════════════════════════════════════════════════
-- Drop old resolve functions (superseded)
-- ═════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS resolve_sop_config(text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS resolve_sop_config_equipment(text, uuid, text, uuid);
DROP FUNCTION IF EXISTS resolve_sop_config_space(text, uuid, uuid, text, uuid);
