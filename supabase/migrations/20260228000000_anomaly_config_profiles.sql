CREATE TABLE b_anomaly_config_profiles (
  profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES a_organizations(org_id) ON DELETE CASCADE,
  profile_name text NOT NULL,
  is_global boolean DEFAULT false,
  created_by uuid REFERENCES a_users(user_id),
  created_at timestamptz DEFAULT now(),
  coil_freeze_temp_f numeric,
  delayed_response_min numeric,
  idle_heat_gain_f numeric,
  long_cycle_min numeric,
  short_cycle_count_1h numeric,
  filter_restriction_delta_t_max numeric,
  refrigerant_low_delta_t_min numeric,
  efficiency_ratio_min_pct numeric,
  compressor_current_threshold_a numeric
);

ALTER TABLE b_anomaly_config_profiles ENABLE ROW LEVEL SECURITY;

-- Read: own org OR global templates
CREATE POLICY "read_own_or_global" ON b_anomaly_config_profiles
  FOR SELECT USING (
    org_id = (
      SELECT org_id FROM a_orgs_users_memberships
      WHERE user_id = auth.uid() LIMIT 1
    )
    OR is_global = true
  );

-- Insert: own org only
CREATE POLICY "insert_own_org" ON b_anomaly_config_profiles
  FOR INSERT WITH CHECK (
    org_id = (
      SELECT org_id FROM a_orgs_users_memberships
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Delete: own org, non-global only
CREATE POLICY "delete_own_non_global" ON b_anomaly_config_profiles
  FOR DELETE USING (
    org_id = (
      SELECT org_id FROM a_orgs_users_memberships
      WHERE user_id = auth.uid() LIMIT 1
    )
    AND is_global = false
  );
