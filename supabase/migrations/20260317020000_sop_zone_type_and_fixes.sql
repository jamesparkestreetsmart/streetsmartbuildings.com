-- Add hvac_zone_type scope + setpoint delta rename + space metric seeds

-- ═════════════════════════════════════════════════════════════
-- Fix 2: Add hvac_zone_type column to a_sop_assignments
-- ═════════════════════════════════════════════════════════════

ALTER TABLE a_sop_assignments
  ADD COLUMN IF NOT EXISTS hvac_zone_type text;

-- Update scope validity constraint to include hvac_zone_type
ALTER TABLE a_sop_assignments
  DROP CONSTRAINT IF EXISTS sop_assignment_scope_validity;

ALTER TABLE a_sop_assignments
  ADD CONSTRAINT sop_assignment_scope_validity CHECK (
    (scope_level = 'ssb'
      AND org_id IS NULL AND site_id IS NULL
      AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL
      AND hvac_zone_type IS NULL)
    OR (scope_level = 'org'
      AND org_id IS NOT NULL AND site_id IS NULL
      AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL
      AND hvac_zone_type IS NULL)
    OR (scope_level = 'equipment_type'
      AND org_id IS NOT NULL
      AND site_id IS NOT NULL
      AND equipment_type_id IS NOT NULL
      AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL
      AND hvac_zone_type IS NULL)
    OR (scope_level = 'hvac_zone_type'
      AND org_id IS NOT NULL
      AND site_id IS NOT NULL
      AND hvac_zone_type IS NOT NULL
      AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'equipment'
      AND org_id IS NOT NULL
      AND equipment_type_id IS NOT NULL
      AND equipment_id IS NOT NULL
      AND site_id IS NULL
      AND space_type IS NULL AND space_id IS NULL
      AND hvac_zone_type IS NULL)
    OR (scope_level = 'site'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND equipment_type_id IS NULL AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL
      AND hvac_zone_type IS NULL)
    OR (scope_level = 'space_type'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NOT NULL AND space_id IS NULL
      AND equipment_type_id IS NULL AND equipment_id IS NULL
      AND hvac_zone_type IS NULL)
    OR (scope_level = 'space'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NOT NULL AND space_id IS NOT NULL
      AND equipment_type_id IS NULL AND equipment_id IS NULL
      AND hvac_zone_type IS NULL)
  );

-- Add scope_level value to CHECK constraint
ALTER TABLE a_sop_assignments
  DROP CONSTRAINT IF EXISTS sop_assignment_scope_level_check;
ALTER TABLE a_sop_assignments
  ADD CONSTRAINT sop_assignment_scope_level_check
    CHECK (scope_level IN (
      'ssb','org','site','equipment_type','hvac_zone_type',
      'equipment','space_type','space'
    ));

-- ═════════════════════════════════════════════════════════════
-- Fix 4: Update setpoint_delta display name
-- ═════════════════════════════════════════════════════════════

UPDATE library_equipment_sop_metrics
SET display_name = 'Setpoint Adherence (°F from target)',
    notes = 'Derived: absolute difference between zone_temp_f and active_heat_f or active_cool_f from b_zone_setpoint_log. Measures how closely the HVAC system maintains the target setpoint.'
WHERE sop_metric = 'setpoint_delta';

-- ═════════════════════════════════════════════════════════════
-- Fix 3: Seed additional space metrics for QSR space types
-- ═════════════════════════════════════════════════════════════

INSERT INTO library_space_sop_metrics
  (space_type, sensor_role, sensor_type, sop_metric, display_name, unit)
VALUES
  ('back_room', 'air_temperature', 'temperature', 'space_temp', 'Space Temperature', 'F'),
  ('back_room', 'humidity', 'humidity', 'humidity', 'Humidity', 'percent'),
  ('drive_thru', 'air_temperature', 'temperature', 'space_temp', 'Space Temperature', 'F'),
  ('cook_line', 'air_temperature', 'temperature', 'space_temp', 'Space Temperature', 'F'),
  ('cook_line', 'humidity', 'humidity', 'humidity', 'Humidity', 'percent'),
  ('break_room', 'air_temperature', 'temperature', 'space_temp', 'Space Temperature', 'F')
ON CONFLICT (space_type, sensor_role, sop_metric) DO NOTHING;
