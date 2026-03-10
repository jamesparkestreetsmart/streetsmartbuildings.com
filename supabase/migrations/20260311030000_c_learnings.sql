-- Internal tracking: learnings
CREATE TABLE IF NOT EXISTS c_learnings (
  learning_id           uuid primary key default gen_random_uuid(),
  org_id                uuid null,
  title                 text not null,
  category              text,
  summary               text not null,
  related_issue_id      uuid null references c_platform_issues(issue_id),
  related_work_item_id  uuid null references c_work_items(work_item_id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_c_learnings_category
  ON c_learnings(category);
CREATE INDEX IF NOT EXISTS idx_c_learnings_related_issue_id
  ON c_learnings(related_issue_id);
CREATE INDEX IF NOT EXISTS idx_c_learnings_related_work_item_id
  ON c_learnings(related_work_item_id);

CREATE TRIGGER trg_c_learnings_updated_at
  BEFORE UPDATE ON c_learnings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
