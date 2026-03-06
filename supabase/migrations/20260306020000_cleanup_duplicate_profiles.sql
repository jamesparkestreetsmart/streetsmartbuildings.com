-- ============================================================================
-- Migration: Clean up duplicate thermostat profile names
-- Context: Before uniqueness constraints were added (20260306000000 / 20260306010000),
--          repeated inline setpoint edits created multiple "House HVAC - Custom"
--          profiles at the site scope under Parke Ventures LLC.
-- ============================================================================

BEGIN;

-- ── Step 1: Dry-run preview (uncomment to review before running) ─────────────
-- Shows all duplicate groups with zone reference counts.
--
-- SELECT
--   p.profile_id,
--   p.org_id,
--   p.site_id,
--   p.name,
--   p.created_at,
--   COALESCE(z.zone_count, 0) AS zone_count,
--   ROW_NUMBER() OVER (
--     PARTITION BY p.org_id, COALESCE(p.site_id::text, '__NULL__'), p.name
--     ORDER BY COALESCE(z.zone_count, 0) DESC, p.created_at ASC
--   ) AS rn
-- FROM b_thermostat_profiles p
-- LEFT JOIN (
--   SELECT profile_id, COUNT(*) AS zone_count
--   FROM a_hvac_zones
--   WHERE profile_id IS NOT NULL
--   GROUP BY profile_id
-- ) z ON z.profile_id = p.profile_id
-- WHERE (p.org_id, COALESCE(p.site_id::text, '__NULL__'), p.name) IN (
--   SELECT org_id, COALESCE(site_id::text, '__NULL__'), name
--   FROM b_thermostat_profiles
--   GROUP BY org_id, COALESCE(site_id::text, '__NULL__'), name
--   HAVING COUNT(*) > 1
-- )
-- ORDER BY p.org_id, p.name, rn;

-- ── Step 2: Delete unused duplicates ─────────────────────────────────────────
-- Within each duplicate group (org_id + site_id + name), keep the profile with
-- the most zone references (ties broken by oldest created_at). Delete the rest
-- ONLY if they have zero zone references. Profiles with zone references in a
-- duplicate group are left alone (flagged for manual review).

WITH duplicates AS (
  SELECT
    p.profile_id,
    p.org_id,
    p.site_id,
    p.name,
    COALESCE(z.zone_count, 0) AS zone_count,
    ROW_NUMBER() OVER (
      PARTITION BY p.org_id, COALESCE(p.site_id::text, '__NULL__'), p.name
      ORDER BY COALESCE(z.zone_count, 0) DESC, p.created_at ASC
    ) AS rn
  FROM b_thermostat_profiles p
  LEFT JOIN (
    SELECT profile_id, COUNT(*) AS zone_count
    FROM a_hvac_zones
    WHERE profile_id IS NOT NULL
    GROUP BY profile_id
  ) z ON z.profile_id = p.profile_id
  WHERE (p.org_id, COALESCE(p.site_id::text, '__NULL__'), p.name) IN (
    SELECT org_id, COALESCE(site_id::text, '__NULL__'), name
    FROM b_thermostat_profiles
    GROUP BY org_id, COALESCE(site_id::text, '__NULL__'), name
    HAVING COUNT(*) > 1
  )
),
to_delete AS (
  SELECT profile_id, name, org_id, site_id
  FROM duplicates
  WHERE rn > 1 AND zone_count = 0
)
-- Audit: log what we're deleting
-- Deleted profiles (for traceability):
--   Profiles in to_delete CTE are unused duplicates (0 zone references).
--   The keeper (rn=1) has the most zone references or is the oldest.
DELETE FROM b_thermostat_profiles
WHERE profile_id IN (SELECT profile_id FROM to_delete);

-- ── Step 3: Verify no duplicates remain across all profile tables ────────────

-- 3a. b_thermostat_profiles: no duplicate (org_id, site_id, name) combos
DO $$
DECLARE
  dupe_count integer;
BEGIN
  SELECT COUNT(*) INTO dupe_count
  FROM (
    SELECT org_id, COALESCE(site_id::text, '__NULL__'), name
    FROM b_thermostat_profiles
    GROUP BY org_id, COALESCE(site_id::text, '__NULL__'), name
    HAVING COUNT(*) > 1
  ) dupes;

  IF dupe_count > 0 THEN
    RAISE WARNING 'b_thermostat_profiles still has % duplicate name group(s) — profiles with active zone references were preserved for manual review', dupe_count;
  END IF;
END $$;

-- 3b. b_anomaly_config_profiles: no duplicate (org_id, profile_name) combos
DO $$
DECLARE
  dupe_count integer;
BEGIN
  SELECT COUNT(*) INTO dupe_count
  FROM (
    SELECT org_id, profile_name
    FROM b_anomaly_config_profiles
    GROUP BY org_id, profile_name
    HAVING COUNT(*) > 1
  ) dupes;

  IF dupe_count > 0 THEN
    RAISE EXCEPTION 'b_anomaly_config_profiles has % duplicate name group(s) — manual cleanup required before unique index can hold', dupe_count;
  END IF;
END $$;

-- 3c. b_store_hours_templates: no duplicate (org_id, template_name) combos
DO $$
DECLARE
  dupe_count integer;
BEGIN
  SELECT COUNT(*) INTO dupe_count
  FROM (
    SELECT org_id, template_name
    FROM b_store_hours_templates
    GROUP BY org_id, template_name
    HAVING COUNT(*) > 1
  ) dupes;

  IF dupe_count > 0 THEN
    RAISE EXCEPTION 'b_store_hours_templates has % duplicate name group(s) — manual cleanup required before unique index can hold', dupe_count;
  END IF;
END $$;

COMMIT;
