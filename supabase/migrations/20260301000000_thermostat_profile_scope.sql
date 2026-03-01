-- 1. Add scope column to b_thermostat_profiles
ALTER TABLE b_thermostat_profiles
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'org'
CHECK (scope IN ('org', 'site'));

-- Profiles created before this change keep 'org' as default (correct assumption)

-- 2. Create store hours templates table
CREATE TABLE IF NOT EXISTS b_store_hours_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES a_organizations(org_id) ON DELETE CASCADE,
  template_name text NOT NULL,
  is_global boolean DEFAULT false,
  created_by uuid REFERENCES a_users(user_id),
  created_at timestamptz DEFAULT now(),
  -- 7 days, each with open_time, close_time, is_closed
  mon_open time, mon_close time, mon_closed boolean DEFAULT false,
  tue_open time, tue_close time, tue_closed boolean DEFAULT false,
  wed_open time, wed_close time, wed_closed boolean DEFAULT false,
  thu_open time, thu_close time, thu_closed boolean DEFAULT false,
  fri_open time, fri_close time, fri_closed boolean DEFAULT false,
  sat_open time, sat_close time, sat_closed boolean DEFAULT false,
  sun_open time, sun_close time, sun_closed boolean DEFAULT false
);

ALTER TABLE b_store_hours_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_or_global_hours" ON b_store_hours_templates
  FOR SELECT USING (
    org_id = (SELECT org_id FROM a_orgs_users_memberships
              WHERE user_id = auth.uid() LIMIT 1)
    OR is_global = true
  );

CREATE POLICY "insert_own_org_hours" ON b_store_hours_templates
  FOR INSERT WITH CHECK (
    org_id = (SELECT org_id FROM a_orgs_users_memberships
              WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "delete_own_non_global_hours" ON b_store_hours_templates
  FOR DELETE USING (
    org_id = (SELECT org_id FROM a_orgs_users_memberships
              WHERE user_id = auth.uid() LIMIT 1)
    AND is_global = false
  );
