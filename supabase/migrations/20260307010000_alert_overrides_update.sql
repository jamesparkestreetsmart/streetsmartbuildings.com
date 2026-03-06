-- Phase B: Alert Override Management
-- Table b_alert_overrides already exists with columns:
--   override_id, org_id, site_id, equipment_id, alert_type_id,
--   threshold_override, severity_override, cooldown_override,
--   enabled, created_at, updated_at
-- This migration adds missing columns only.

-- Proper FK to alert definitions
ALTER TABLE b_alert_overrides
  ADD COLUMN IF NOT EXISTS alert_def_id UUID REFERENCES b_alert_definitions(id) ON DELETE CASCADE;

-- Sustain time override
ALTER TABLE b_alert_overrides
  ADD COLUMN IF NOT EXISTS sustain_override_min INTEGER;

-- Required when enabled=false (silencing reason)
ALTER TABLE b_alert_overrides
  ADD COLUMN IF NOT EXISTS silence_reason TEXT;

-- Audit trail
ALTER TABLE b_alert_overrides
  ADD COLUMN IF NOT EXISTS created_by TEXT;

-- If rows exist with alert_type_id but no alert_def_id, attempt to map them.
-- If alert_type_id looks like a UUID, cast directly. Otherwise skip.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM b_alert_overrides
    WHERE alert_type_id IS NOT NULL AND alert_def_id IS NULL
    LIMIT 1
  ) THEN
    -- Try UUID cast for rows where alert_type_id is a valid UUID
    UPDATE b_alert_overrides
    SET alert_def_id = alert_type_id::uuid
    WHERE alert_type_id IS NOT NULL
      AND alert_def_id IS NULL
      AND alert_type_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM b_alert_definitions WHERE id = alert_type_id::uuid
      );
  END IF;
END $$;

-- Partial unique indexes to prevent duplicate scopes
CREATE UNIQUE INDEX IF NOT EXISTS uq_override_org_def
  ON b_alert_overrides (org_id, alert_def_id)
  WHERE site_id IS NULL AND equipment_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_override_site_def
  ON b_alert_overrides (org_id, alert_def_id, site_id)
  WHERE site_id IS NOT NULL AND equipment_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_override_equip_def
  ON b_alert_overrides (org_id, alert_def_id, equipment_id)
  WHERE equipment_id IS NOT NULL;

-- RLS policies (idempotent)
ALTER TABLE b_alert_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'b_alert_overrides' AND policyname = 'overrides_org_access'
  ) THEN
    CREATE POLICY overrides_org_access ON b_alert_overrides
      FOR ALL
      USING (org_id IN (SELECT org_id FROM a_user_orgs WHERE user_id = auth.uid()))
      WITH CHECK (org_id IN (SELECT org_id FROM a_user_orgs WHERE user_id = auth.uid()));
  END IF;
END $$;
