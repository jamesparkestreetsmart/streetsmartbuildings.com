-- Fix recurring schema drift warnings on zone-config and anomaly-events routes.
--
-- WARNING 1: "[zone-config] zone_weight column may not exist, falling back:
--   column a_spaces.equipment_id does not exist"
-- The a_spaces table is missing equipment_id (links space to zone equipment)
-- and zone_weight (relative weight for blended zone temp).
--
-- WARNING 2: "[anomaly-events] resolved_reason column not found, retrying without it"
-- The b_anomaly_events table is missing resolved_reason, which is set to
-- 'manual_reset' by the anomaly reset endpoint.

-- ── a_spaces: equipment_id + zone_weight ──────────────────────────────────────
ALTER TABLE a_spaces
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES a_equipments(equipment_id),
  ADD COLUMN IF NOT EXISTS zone_weight REAL DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS idx_a_spaces_equipment_id ON a_spaces(equipment_id);

-- ── b_anomaly_events: resolved_reason ─────────────────────────────────────────
ALTER TABLE b_anomaly_events
  ADD COLUMN IF NOT EXISTS resolved_reason TEXT;
