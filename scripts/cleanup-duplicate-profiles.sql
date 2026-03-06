-- Detect duplicate thermostat profile names (same org_id + site_id + name)
-- Run this query first to review before deleting:

SELECT
  org_id,
  site_id,
  name,
  COUNT(*) as count,
  ARRAY_AGG(profile_id ORDER BY created_at ASC) as profile_ids
FROM b_thermostat_profiles
GROUP BY org_id, site_id, name
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- To identify which duplicates are unused (0 zones referencing them):
-- For each duplicate group, keep the one with zones assigned, delete the rest.

WITH duplicates AS (
  SELECT
    p.profile_id,
    p.org_id,
    p.site_id,
    p.name,
    COALESCE(z.zone_count, 0) as zone_count,
    ROW_NUMBER() OVER (
      PARTITION BY p.org_id, p.site_id, p.name
      ORDER BY COALESCE(z.zone_count, 0) DESC, p.created_at ASC
    ) as rn
  FROM b_thermostat_profiles p
  LEFT JOIN (
    SELECT profile_id, COUNT(*) as zone_count
    FROM a_hvac_zones
    WHERE profile_id IS NOT NULL
    GROUP BY profile_id
  ) z ON z.profile_id = p.profile_id
  WHERE (p.org_id, p.site_id, p.name) IN (
    SELECT org_id, site_id, name
    FROM b_thermostat_profiles
    GROUP BY org_id, site_id, name
    HAVING COUNT(*) > 1
  )
)
-- Preview what would be deleted (rn > 1 = duplicates to remove):
SELECT * FROM duplicates ORDER BY org_id, name, rn;

-- Uncomment below to actually delete unused duplicates:
-- DELETE FROM b_thermostat_profiles
-- WHERE profile_id IN (
--   SELECT profile_id FROM duplicates WHERE rn > 1 AND zone_count = 0
-- );
