-- Set all currently unassigned alert definitions to org-wide scope
-- so they immediately start evaluating across all sites.
-- Definitions with explicit site/equipment assignments are not touched.

-- Update Street Smart org definitions first
UPDATE b_alert_definitions
SET
  scope_level = 'org',
  scope_mode  = 'all',
  scope_ids   = '{}'
WHERE
  org_id = (SELECT id FROM a_organizations WHERE name ILIKE '%street smart%' LIMIT 1)
  AND (scope_ids = '{}' OR scope_ids IS NULL)
  AND scope_mode != 'all';

-- Also update any other orgs that have unassigned definitions
-- (scope_mode = 'include' with empty scope_ids = evaluating nothing)
UPDATE b_alert_definitions
SET
  scope_level = 'org',
  scope_mode  = 'all',
  scope_ids   = '{}'
WHERE
  (scope_ids = '{}' OR scope_ids IS NULL)
  AND scope_mode = 'include';
