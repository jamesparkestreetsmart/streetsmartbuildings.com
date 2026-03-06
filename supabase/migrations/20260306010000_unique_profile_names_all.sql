-- Prevent duplicate profile/template names within the same org scope.
-- Mirrors the pattern from 20260306000000_unique_profile_names.sql (thermostat profiles).

-- ── Anomaly Config Profiles ──────────────────────────────────────────────────
-- Unique profile_name per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_anomaly_profile_name_org
  ON b_anomaly_config_profiles (org_id, profile_name);

-- ── Store Hours Templates ────────────────────────────────────────────────────
-- Unique template_name per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_hours_template_name_org
  ON b_store_hours_templates (org_id, template_name);
