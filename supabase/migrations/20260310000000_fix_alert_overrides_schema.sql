-- Undo columns incorrectly added by 20260307010000_alert_overrides_update.sql.
-- Those columns (alert_def_id, sustain_override_min, silence_reason, created_by)
-- do not belong on b_alert_overrides. The table already had alert_type_id as
-- the canonical key. The columns may never have been applied in production,
-- so all DROPs use IF EXISTS.
--
-- The canonical columns that remain are:
--   override_id, org_id, site_id, equipment_id, alert_type_id,
--   threshold_override, severity_override, cooldown_override, enabled,
--   created_at, updated_at

-- Drop indexes from the bad migration that referenced alert_def_id
DROP INDEX IF EXISTS uq_override_org_def;
DROP INDEX IF EXISTS uq_override_site_def;
DROP INDEX IF EXISTS uq_override_equip_def;

-- Drop the incorrect columns (IF EXISTS — safe if they were never applied)
ALTER TABLE b_alert_overrides DROP COLUMN IF EXISTS alert_def_id;
ALTER TABLE b_alert_overrides DROP COLUMN IF EXISTS sustain_override_min;
ALTER TABLE b_alert_overrides DROP COLUMN IF EXISTS silence_reason;
ALTER TABLE b_alert_overrides DROP COLUMN IF EXISTS created_by;

-- Proper unique indexes: composite across scope level + alert_type_id.
-- One override per (org, alert_type) at each scope level.

-- Org-level override (no site, no equipment)
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_overrides_org
  ON b_alert_overrides (org_id, alert_type_id)
  WHERE site_id IS NULL AND equipment_id IS NULL;

-- Site-level override
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_overrides_site
  ON b_alert_overrides (org_id, site_id, alert_type_id)
  WHERE site_id IS NOT NULL AND equipment_id IS NULL;

-- Equipment-level override
-- equipment_id is globally unique in this system, but we include org_id
-- for RLS/partition alignment. site_id is NOT included because equipment
-- overrides are created with equipment_id directly — site_id may or may
-- not be populated on the override row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_overrides_equipment
  ON b_alert_overrides (org_id, equipment_id, alert_type_id)
  WHERE equipment_id IS NOT NULL;
