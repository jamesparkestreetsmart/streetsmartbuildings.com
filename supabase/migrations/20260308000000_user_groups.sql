-- ============================================================
-- User Groups (Regional Scoping)
-- ============================================================

-- 1. b_user_groups — named groups (regions) per org
CREATE TABLE IF NOT EXISTS b_user_groups (
  group_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES a_organizations(org_id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE INDEX idx_user_groups_org ON b_user_groups(org_id);

-- 2. b_user_group_members — users assigned to groups
CREATE TABLE IF NOT EXISTS b_user_group_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID NOT NULL REFERENCES b_user_groups(group_id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES a_users(user_id) ON DELETE CASCADE,
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_user_group_members_group ON b_user_group_members(group_id);
CREATE INDEX idx_user_group_members_user  ON b_user_group_members(user_id);

-- 3. b_user_group_sites — sites assigned to groups
CREATE TABLE IF NOT EXISTS b_user_group_sites (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID NOT NULL REFERENCES b_user_groups(group_id) ON DELETE CASCADE,
  site_id   UUID NOT NULL REFERENCES a_sites(site_id) ON DELETE CASCADE,
  UNIQUE(group_id, site_id)
);

CREATE INDEX idx_user_group_sites_group ON b_user_group_sites(group_id);
CREATE INDEX idx_user_group_sites_site  ON b_user_group_sites(site_id);

-- 4. b_org_excel_mappings — saved column mapping per org
CREATE TABLE IF NOT EXISTS b_org_excel_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES a_organizations(org_id) ON DELETE CASCADE UNIQUE,
  mapping         JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_headers  TEXT[] DEFAULT '{}',
  last_trained_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. b_org_excel_uploads — upload log
CREATE TABLE IF NOT EXISTS b_org_excel_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES a_organizations(org_id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT,
  uploaded_by   UUID REFERENCES a_users(user_id) ON DELETE SET NULL,
  row_count     INT DEFAULT 0,
  parse_result  JSONB DEFAULT '{}'::jsonb,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_excel_uploads_org ON b_org_excel_uploads(org_id);

-- ============================================================
-- updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Only create triggers if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_groups_updated_at') THEN
    CREATE TRIGGER trg_user_groups_updated_at
      BEFORE UPDATE ON b_user_groups
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_org_excel_mappings_updated_at') THEN
    CREATE TRIGGER trg_org_excel_mappings_updated_at
      BEFORE UPDATE ON b_org_excel_mappings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END$$;

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE b_user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE b_user_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE b_user_group_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE b_org_excel_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE b_org_excel_uploads ENABLE ROW LEVEL SECURITY;

-- Direct tables: org membership check
CREATE POLICY "user_groups_org_access" ON b_user_groups
  FOR ALL USING (
    org_id IN (SELECT org_id FROM a_user_orgs WHERE user_id = auth.uid())
  );

CREATE POLICY "org_excel_mappings_org_access" ON b_org_excel_mappings
  FOR ALL USING (
    org_id IN (SELECT org_id FROM a_user_orgs WHERE user_id = auth.uid())
  );

CREATE POLICY "org_excel_uploads_org_access" ON b_org_excel_uploads
  FOR ALL USING (
    org_id IN (SELECT org_id FROM a_user_orgs WHERE user_id = auth.uid())
  );

-- Join tables: access through b_user_groups.org_id
CREATE POLICY "user_group_members_org_access" ON b_user_group_members
  FOR ALL USING (
    group_id IN (
      SELECT group_id FROM b_user_groups
      WHERE org_id IN (SELECT org_id FROM a_user_orgs WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "user_group_sites_org_access" ON b_user_group_sites
  FOR ALL USING (
    group_id IN (
      SELECT group_id FROM b_user_groups
      WHERE org_id IN (SELECT org_id FROM a_user_orgs WHERE user_id = auth.uid())
    )
  );
