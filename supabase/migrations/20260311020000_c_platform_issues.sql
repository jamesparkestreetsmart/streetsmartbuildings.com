-- Internal tracking: platform issues (depends on c_work_items)
CREATE TABLE IF NOT EXISTS c_platform_issues (
  issue_id              uuid primary key default gen_random_uuid(),
  org_id                uuid null,
  title                 text not null,
  description           text,
  issue_type            text not null default 'bug',
  severity              text not null default 'medium',
  status                text not null default 'open',
  source                text,
  source_record_id      text null,
  reported_by           text,
  owner                 text,
  target_sprint         text null,
  lessons_learned       text null,
  latest_note           text null,
  linked_work_item_id   uuid null references c_work_items(work_item_id),
  opened_at             timestamptz default now(),
  resolved_at           timestamptz null,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_c_platform_issues_status
  ON c_platform_issues(status);
CREATE INDEX IF NOT EXISTS idx_c_platform_issues_severity
  ON c_platform_issues(severity);
CREATE INDEX IF NOT EXISTS idx_c_platform_issues_linked_work_item
  ON c_platform_issues(linked_work_item_id);

CREATE TRIGGER trg_c_platform_issues_updated_at
  BEFORE UPDATE ON c_platform_issues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Now that c_platform_issues exists, add the reverse FK on c_work_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_work_items_related_issue'
  ) THEN
    ALTER TABLE c_work_items
      ADD CONSTRAINT fk_work_items_related_issue
      FOREIGN KEY (related_issue_id)
      REFERENCES c_platform_issues(issue_id);
  END IF;
END $$;
