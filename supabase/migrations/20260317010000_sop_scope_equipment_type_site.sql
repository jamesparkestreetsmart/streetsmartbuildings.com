-- Fix: equipment_type scope requires site_id (otherwise redundant with org scope)
-- Allow equipment_type_id at ssb/org scopes (always required for equipment track)

-- Drop old constraint first so data cleanup can proceed
ALTER TABLE a_sop_assignments
  DROP CONSTRAINT IF EXISTS sop_assignment_scope_validity;

-- Clean up any equipment_type scope rows that lack site_id
-- (upgrade them to org scope since they have no site targeting)
UPDATE a_sop_assignments
SET scope_level = 'org'
WHERE scope_level = 'equipment_type'
  AND site_id IS NULL;

-- Re-add constraint with relaxed rules:
-- ssb/org scopes allow equipment_type_id (needed for equipment track)
-- equipment_type scope now requires site_id
ALTER TABLE a_sop_assignments
  ADD CONSTRAINT sop_assignment_scope_validity CHECK (
    (scope_level = 'ssb'
      AND org_id IS NULL AND site_id IS NULL
      AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'org'
      AND org_id IS NOT NULL AND site_id IS NULL
      AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'equipment_type'
      AND org_id IS NOT NULL
      AND site_id IS NOT NULL
      AND equipment_type_id IS NOT NULL
      AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'equipment'
      AND org_id IS NOT NULL
      AND equipment_type_id IS NOT NULL
      AND equipment_id IS NOT NULL
      AND site_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'site'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND equipment_type_id IS NULL AND equipment_id IS NULL
      AND space_type IS NULL AND space_id IS NULL)
    OR (scope_level = 'space_type'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NOT NULL AND space_id IS NULL
      AND equipment_type_id IS NULL AND equipment_id IS NULL)
    OR (scope_level = 'space'
      AND org_id IS NOT NULL AND site_id IS NOT NULL
      AND space_type IS NOT NULL AND space_id IS NOT NULL
      AND equipment_type_id IS NULL AND equipment_id IS NULL)
  );
