ALTER TABLE b_anomaly_config_profiles
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'org'
CHECK (scope IN ('org', 'site'));
