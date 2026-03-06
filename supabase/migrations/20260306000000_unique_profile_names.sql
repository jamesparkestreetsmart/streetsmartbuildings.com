-- Prevent duplicate thermostat profile names within the same org+site scope.
-- org-scoped profiles have site_id = NULL, so we need two partial indexes
-- (Postgres unique indexes treat NULLs as distinct).

-- Unique name per org for org-scoped profiles (site_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_name_org
  ON b_thermostat_profiles (org_id, name)
  WHERE site_id IS NULL;

-- Unique name per org+site for site-scoped profiles (site_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_name_site
  ON b_thermostat_profiles (org_id, site_id, name)
  WHERE site_id IS NOT NULL;
