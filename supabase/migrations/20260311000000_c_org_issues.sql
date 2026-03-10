-- Platform & org issue tracker
CREATE TABLE IF NOT EXISTS c_org_issues (
  issue_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid,                          -- null = platform-level issue
  scope              text NOT NULL DEFAULT 'org',    -- platform | org | site | equipment
  issue_type         text NOT NULL,                  -- bug | improvement | site_issue
  title              text NOT NULL,
  description        text,
  severity           text,                           -- critical | high | medium | low
  priority           text,                           -- p0 | p1 | p2 | p3
  status             text NOT NULL DEFAULT 'open',   -- open | triaged | in_progress | blocked | verified | closed
  area               text,                           -- thermostat | alerts | ui | auth | sensors | scheduling
  target_type        text,                           -- org | site | equipment | zone | device | sensor
  site_id            uuid,
  equipment_id       uuid,
  entity_id          text,
  assigned_to_user_id uuid,
  created_by_user_id uuid NOT NULL,
  source             text,                           -- manual | audit | auto_generated
  source_ref         text,                           -- e.g. "5.4-A"
  source_metadata    jsonb DEFAULT '{}',
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  closed_at          timestamptz
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_c_org_issues_org_id ON c_org_issues (org_id);
CREATE INDEX IF NOT EXISTS idx_c_org_issues_status ON c_org_issues (status);
CREATE INDEX IF NOT EXISTS idx_c_org_issues_scope ON c_org_issues (scope);
