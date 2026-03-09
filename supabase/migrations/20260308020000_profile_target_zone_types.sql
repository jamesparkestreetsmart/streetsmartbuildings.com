ALTER TABLE b_thermostat_profiles
  ADD COLUMN IF NOT EXISTS target_zone_types TEXT[] NOT NULL DEFAULT '{}';
