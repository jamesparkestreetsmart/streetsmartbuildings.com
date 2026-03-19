-- Add attachments jsonb column to all four tracking tables
ALTER TABLE c_work_items      ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]';
ALTER TABLE c_platform_issues ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]';
ALTER TABLE c_learnings       ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]';
ALTER TABLE c_org_issues      ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]';
