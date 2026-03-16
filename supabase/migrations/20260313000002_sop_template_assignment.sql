-- Migration: Replace a_sop_configs with a_sop_templates + a_sop_assignments
-- Depends on: 20260313000000_sop_hierarchy_v3.sql (applied)

-- ═════════════════════════════════════════════════════════════
-- PRE-FLIGHT CHECKS
-- ═════════════════════════════════════════════════════════════

DO $$
DECLARE config_count integer; compliance_count integer;
BEGIN
  SELECT COUNT(*) INTO config_count FROM a_sop_configs;
  SELECT COUNT(*) INTO compliance_count FROM b_sop_compliance_log;

  IF config_count > 0 THEN
    RAISE EXCEPTION
      'MIGRATION BLOCKED: % rows in a_sop_configs require manual '
      'review before replacement. Run: '
      'SELECT id, label, metric, scope_level FROM a_sop_configs;',
      config_count;
  END IF;

  IF compliance_count > 0 THEN
    RAISE EXCEPTION
      'MIGRATION BLOCKED: % rows in b_sop_compliance_log require '
      'manual review. These reference sop_config_id which will be '
      'renamed. Run: SELECT * FROM b_sop_compliance_log;',
      compliance_count;
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════
-- STEP 1: Create a_sop_templates
-- ═════════════════════════════════════════════════════════════

CREATE TABLE a_sop_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind       text NOT NULL,
  label             text NOT NULL,
  metric            text NOT NULL,
  unit              text NOT NULL,
  min_value         numeric,
  max_value         numeric,
  evaluation_window text NOT NULL DEFAULT 'all_hours',
  notes             text,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sop_template_target_kind_check
    CHECK (target_kind IN ('equipment','space')),
  CONSTRAINT sop_template_metric_check
    CHECK (metric IN (
      'zone_temp','space_temp','setpoint_delta','cooler_temp',
      'freezer_temp','humidity','power_kw','pressure_differential'
    )),
  CONSTRAINT sop_template_unit_check
    CHECK (unit IN ('F','C','percent','kW','kWh','Pa','inH2O','count')),
  CONSTRAINT sop_template_window_check
    CHECK (evaluation_window IN ('all_hours','occupied_hours_only')),
  CONSTRAINT sop_template_range_check
    CHECK (min_value IS NOT NULL OR max_value IS NOT NULL)
);

CREATE TRIGGER set_updated_at_sop_templates
  BEFORE UPDATE ON a_sop_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_sop_templates_metric
  ON a_sop_templates(metric);
CREATE INDEX idx_sop_templates_target_kind
  ON a_sop_templates(target_kind);

-- ═════════════════════════════════════════════════════════════
-- STEP 2: Create a_sop_assignments
-- ═════════════════════════════════════════════════════════════

CREATE TABLE a_sop_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL
                  REFERENCES a_sop_templates(id) ON DELETE RESTRICT,
  owner_kind      text NOT NULL,
  org_id          uuid REFERENCES a_organizations(org_id) ON DELETE CASCADE,
  scope_level     text NOT NULL,
  site_id         uuid REFERENCES a_sites(site_id) ON DELETE CASCADE,
  equipment_type  text,
  equipment_id    uuid REFERENCES a_equipments(equipment_id) ON DELETE CASCADE,
  space_type      text,
  space_id        uuid REFERENCES a_spaces(space_id) ON DELETE CASCADE,
  effective_from  date,
  effective_to    date,
  retired_at      date,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sop_assignment_owner_kind_check
    CHECK (owner_kind IN ('ssb','org')),
  CONSTRAINT sop_assignment_scope_level_check
    CHECK (scope_level IN (
      'ssb','org','site','equipment_type','equipment',
      'space_type','space'
    )),
  CONSTRAINT sop_assignment_org_required CHECK (
    (owner_kind = 'ssb' AND org_id IS NULL)
    OR (owner_kind = 'org' AND org_id IS NOT NULL)
  ),
  CONSTRAINT sop_assignment_date_check CHECK (
    effective_to IS NULL OR effective_from IS NULL
    OR effective_to > effective_from
  ),
  CONSTRAINT sop_assignment_scope_validity CHECK (
    (scope_level = 'ssb'
      AND org_id IS NULL AND site_id IS NULL
      AND equipment_type IS NULL AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'org'
      AND org_id IS NOT NULL AND site_id IS NULL
      AND equipment_type IS NULL AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'equipment_type'
      AND org_id IS NOT NULL AND equipment_type IS NOT NULL
      AND equipment_id IS NULL AND site_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'equipment'
      AND org_id IS NOT NULL AND equipment_type IS NOT NULL
      AND equipment_id IS NOT NULL AND site_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'site'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND equipment_type IS NULL AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'space_type'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NOT NULL AND space_id IS NULL
      AND equipment_type IS NULL AND equipment_id IS NULL)
    OR (scope_level = 'space'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NOT NULL AND space_id IS NOT NULL
      AND equipment_type IS NULL AND equipment_id IS NULL)
  )
);

CREATE TRIGGER set_updated_at_sop_assignments
  BEFORE UPDATE ON a_sop_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX idx_sop_assignments_template
  ON a_sop_assignments(template_id);
CREATE INDEX idx_sop_assignments_org
  ON a_sop_assignments(org_id);
CREATE INDEX idx_sop_assignments_scope
  ON a_sop_assignments(scope_level, org_id);
CREATE INDEX idx_sop_assignments_ssb
  ON a_sop_assignments(scope_level)
  WHERE owner_kind = 'ssb';
CREATE INDEX idx_sop_assignments_equipment_type
  ON a_sop_assignments(org_id, equipment_type)
  WHERE equipment_type IS NOT NULL;
CREATE INDEX idx_sop_assignments_space_type
  ON a_sop_assignments(org_id, site_id, space_type)
  WHERE space_type IS NOT NULL;

-- Unique assignment index (null-safe via COALESCE)
CREATE UNIQUE INDEX uq_sop_assignment
  ON a_sop_assignments (
    template_id,
    COALESCE(org_id, '00000000-0000-0000-0000-000000000000'),
    scope_level,
    COALESCE(site_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(equipment_type, ''),
    COALESCE(equipment_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(space_type, ''),
    COALESCE(space_id, '00000000-0000-0000-0000-000000000000')
  );

-- ═════════════════════════════════════════════════════════════
-- STEP 3: Update b_sop_compliance_log FK
-- ═════════════════════════════════════════════════════════════

-- Drop old FK and index
ALTER TABLE b_sop_compliance_log
  DROP CONSTRAINT IF EXISTS b_sop_compliance_log_sop_config_id_fkey;

DROP INDEX IF EXISTS idx_sop_compliance_config;

-- Rename column
ALTER TABLE b_sop_compliance_log
  RENAME COLUMN sop_config_id TO sop_assignment_id;

-- Add new FK
ALTER TABLE b_sop_compliance_log
  ADD CONSTRAINT b_sop_compliance_log_assignment_fkey
  FOREIGN KEY (sop_assignment_id)
  REFERENCES a_sop_assignments(id) ON DELETE SET NULL;

-- Update unique index on compliance log
DROP INDEX IF EXISTS uq_sop_compliance_period;
CREATE UNIQUE INDEX uq_sop_compliance_period
  ON b_sop_compliance_log (
    sop_assignment_id,
    site_id,
    COALESCE(equipment_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(space_id,     '00000000-0000-0000-0000-000000000000'),
    period_start,
    period_end
  );

CREATE INDEX idx_sop_compliance_assignment
  ON b_sop_compliance_log(sop_assignment_id);

-- ═════════════════════════════════════════════════════════════
-- STEP 4: RLS
-- ═════════════════════════════════════════════════════════════

-- Templates: readable by all authenticated users
ALTER TABLE a_sop_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sop_templates_select" ON a_sop_templates
  FOR SELECT USING (true);

-- SSB admin can write templates
-- SSB admin = member of org with parent_org_id IS NULL
CREATE POLICY "sop_templates_write" ON a_sop_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM a_orgs_users_memberships m
      JOIN a_organizations o ON o.org_id = m.org_id
      WHERE m.user_id = auth.uid()
        AND o.parent_org_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM a_orgs_users_memberships m
      JOIN a_organizations o ON o.org_id = m.org_id
      WHERE m.user_id = auth.uid()
        AND o.parent_org_id IS NULL
    )
  );

-- Assignments
ALTER TABLE a_sop_assignments ENABLE ROW LEVEL SECURITY;

-- SSB assignments visible to all; org assignments visible to own org members + SSB admin
CREATE POLICY "sop_assignments_select" ON a_sop_assignments
  FOR SELECT USING (
    owner_kind = 'ssb'
    OR org_id IN (
      SELECT org_id FROM a_orgs_users_memberships WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM a_orgs_users_memberships m
      JOIN a_organizations o ON o.org_id = m.org_id
      WHERE m.user_id = auth.uid()
        AND o.parent_org_id IS NULL
    )
  );

-- SSB admin: write any; org user: write own org assignments only
CREATE POLICY "sop_assignments_write" ON a_sop_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM a_orgs_users_memberships m
      JOIN a_organizations o ON o.org_id = m.org_id
      WHERE m.user_id = auth.uid()
        AND o.parent_org_id IS NULL
    )
    OR (
      owner_kind = 'org'
      AND org_id IN (
        SELECT org_id FROM a_orgs_users_memberships WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM a_orgs_users_memberships m
      JOIN a_organizations o ON o.org_id = m.org_id
      WHERE m.user_id = auth.uid()
        AND o.parent_org_id IS NULL
    )
    OR (
      owner_kind = 'org'
      AND org_id IN (
        SELECT org_id FROM a_orgs_users_memberships WHERE user_id = auth.uid()
      )
    )
  );

-- ═════════════════════════════════════════════════════════════
-- STEP 5: Drop a_sop_configs (confirmed empty by pre-flight)
-- ═════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS a_sop_configs CASCADE;
