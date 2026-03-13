-- ═══════════════════════════════════════════════════════════════════════════
-- SOP Hierarchy v3: Add explicit discriminators (target_kind, scope_level)
-- Replaces nullable-column inference with self-describing rows.
-- ═══════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- PRE-FLIGHT: abort if site-level rows exist (require manual review)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE row_count integer;
BEGIN
  SELECT COUNT(*) INTO row_count
  FROM a_sop_configs
  WHERE site_id IS NOT NULL AND equipment_id IS NULL;

  IF row_count > 0 THEN
    RAISE EXCEPTION
      'MIGRATION BLOCKED: % site-scoped SOP config(s) found. '
      'Run: SELECT id, label, metric, site_id FROM a_sop_configs '
      'WHERE site_id IS NOT NULL AND equipment_id IS NULL; '
      'Decide: keep as space-track site scope, promote to equipment_type, or delete.',
      row_count;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- STEP 1: Make org_id nullable (SSB-level rows have no org)
-- ════════════════════════════════════════════════════════════
ALTER TABLE a_sop_configs
  ALTER COLUMN org_id DROP NOT NULL;

-- ════════════════════════════════════════════════════════════
-- STEP 2: Add discriminator columns with temporary defaults
-- ════════════════════════════════════════════════════════════
ALTER TABLE a_sop_configs
  ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'equipment',
  ADD COLUMN IF NOT EXISTS scope_level text NOT NULL DEFAULT 'org';

-- ════════════════════════════════════════════════════════════
-- STEP 3: Backfill discriminators on existing rows
-- ════════════════════════════════════════════════════════════
UPDATE a_sop_configs SET
  target_kind = 'equipment',
  scope_level = CASE
    WHEN equipment_id IS NOT NULL THEN 'equipment'
    ELSE 'org'
  END;

-- Remove defaults after backfill
ALTER TABLE a_sop_configs
  ALTER COLUMN target_kind DROP DEFAULT,
  ALTER COLUMN scope_level DROP DEFAULT;

-- ════════════════════════════════════════════════════════════
-- STEP 4: Add new scope columns
-- ════════════════════════════════════════════════════════════
ALTER TABLE a_sop_configs
  ADD COLUMN IF NOT EXISTS equipment_type text,
  ADD COLUMN IF NOT EXISTS space_type     text,
  ADD COLUMN IF NOT EXISTS space_id       uuid;

-- Backfill equipment_type from a_equipments.equipment_group for existing equipment-level rows
UPDATE a_sop_configs c SET
  equipment_type = e.equipment_group
FROM a_equipments e
WHERE c.equipment_id IS NOT NULL
  AND c.equipment_id = e.equipment_id
  AND c.equipment_type IS NULL;

-- FK for space_id (a_spaces.space_id is the PK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sop_configs_space_id_fkey'
  ) THEN
    ALTER TABLE a_sop_configs
      ADD CONSTRAINT sop_configs_space_id_fkey
      FOREIGN KEY (space_id) REFERENCES a_spaces(space_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- STEP 5: CHECK constraints on discriminators
-- ════════════════════════════════════════════════════════════
ALTER TABLE a_sop_configs
  DROP CONSTRAINT IF EXISTS sop_target_kind_check;

ALTER TABLE a_sop_configs
  ADD CONSTRAINT sop_target_kind_check
  CHECK (target_kind IN ('equipment', 'space'));

ALTER TABLE a_sop_configs
  DROP CONSTRAINT IF EXISTS sop_scope_level_check;

ALTER TABLE a_sop_configs
  ADD CONSTRAINT sop_scope_level_check
  CHECK (scope_level IN (
    'ssb', 'org', 'site',
    'equipment_type', 'equipment',
    'space_type', 'space'
  ));

-- ════════════════════════════════════════════════════════════
-- STEP 6: Scope validity constraint
-- ════════════════════════════════════════════════════════════
ALTER TABLE a_sop_configs
  DROP CONSTRAINT IF EXISTS sop_scope_hierarchy;

ALTER TABLE a_sop_configs
  DROP CONSTRAINT IF EXISTS sop_scope_validity;

ALTER TABLE a_sop_configs
  ADD CONSTRAINT sop_scope_validity CHECK (
    -- SSB level: no org or targeting columns
    (scope_level = 'ssb' AND org_id IS NULL
      AND site_id IS NULL AND equipment_type IS NULL
      AND equipment_id IS NULL AND space_type IS NULL
      AND space_id IS NULL)

    OR (scope_level = 'org' AND org_id IS NOT NULL
      AND equipment_type IS NULL AND equipment_id IS NULL
      AND site_id IS NULL AND space_type IS NULL
      AND space_id IS NULL)

    -- Equipment track scopes
    OR (scope_level = 'equipment_type'
      AND target_kind = 'equipment'
      AND org_id IS NOT NULL AND equipment_type IS NOT NULL
      AND equipment_id IS NULL AND site_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)

    OR (scope_level = 'equipment'
      AND target_kind = 'equipment'
      AND org_id IS NOT NULL AND equipment_type IS NOT NULL
      AND equipment_id IS NOT NULL AND site_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)

    -- Space track scopes
    OR (scope_level = 'site'
      AND target_kind = 'space'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NULL AND space_id IS NULL
      AND equipment_type IS NULL AND equipment_id IS NULL)

    OR (scope_level = 'space_type'
      AND target_kind = 'space'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NOT NULL AND space_id IS NULL
      AND equipment_type IS NULL AND equipment_id IS NULL)

    OR (scope_level = 'space'
      AND target_kind = 'space'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NOT NULL AND space_id IS NOT NULL
      AND equipment_type IS NULL AND equipment_id IS NULL)
  );

-- ════════════════════════════════════════════════════════════
-- STEP 7: Metric check (add space metrics)
-- ════════════════════════════════════════════════════════════
ALTER TABLE a_sop_configs
  DROP CONSTRAINT IF EXISTS sop_metric_check;

ALTER TABLE a_sop_configs
  ADD CONSTRAINT sop_metric_check
  CHECK (metric IN (
    'zone_temp', 'space_temp', 'setpoint_delta',
    'cooler_temp', 'freezer_temp', 'humidity',
    'power_kw', 'pressure_differential'
  ));

-- ════════════════════════════════════════════════════════════
-- STEP 8: Indexes
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_sop_configs_target_scope
  ON a_sop_configs(target_kind, scope_level, metric);

CREATE INDEX IF NOT EXISTS idx_sop_configs_equipment_type
  ON a_sop_configs(org_id, equipment_type)
  WHERE equipment_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sop_configs_space_type
  ON a_sop_configs(org_id, site_id, space_type)
  WHERE space_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sop_configs_ssb
  ON a_sop_configs(target_kind, metric)
  WHERE org_id IS NULL;

-- ════════════════════════════════════════════════════════════
-- STEP 9: Update RLS policies
-- Uses a_orgs_users_memberships (the actual table name)
-- SSB admin identified by membership in org with parent_org_id IS NULL
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "sop_configs_select" ON a_sop_configs;
DROP POLICY IF EXISTS "sop_configs_insert_update_delete" ON a_sop_configs;
DROP POLICY IF EXISTS "sop_configs_write" ON a_sop_configs;

-- SELECT: SSB rows visible to all, org rows visible to org members, SSB admins see all
CREATE POLICY "sop_configs_select" ON a_sop_configs
  FOR SELECT USING (
    scope_level = 'ssb'
    OR org_id IN (
      SELECT org_id FROM a_orgs_users_memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM a_orgs_users_memberships m
      JOIN a_organizations o ON o.org_id = m.org_id
      WHERE m.user_id = auth.uid() AND m.status = 'active'
        AND o.parent_org_id IS NULL
    )
  );

-- WRITE: SSB admins can write anything, org users can write their org's non-SSB rows
CREATE POLICY "sop_configs_write" ON a_sop_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM a_orgs_users_memberships m
      JOIN a_organizations o ON o.org_id = m.org_id
      WHERE m.user_id = auth.uid() AND m.status = 'active'
        AND o.parent_org_id IS NULL
    )
    OR (
      scope_level != 'ssb'
      AND org_id IN (
        SELECT org_id FROM a_orgs_users_memberships
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM a_orgs_users_memberships m
      JOIN a_organizations o ON o.org_id = m.org_id
      WHERE m.user_id = auth.uid() AND m.status = 'active'
        AND o.parent_org_id IS NULL
    )
    OR (
      scope_level != 'ssb'
      AND org_id IN (
        SELECT org_id FROM a_orgs_users_memberships
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );
