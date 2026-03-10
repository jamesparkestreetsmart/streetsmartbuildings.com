-- Internal tracking: work items (created first — c_platform_issues references this)
CREATE TABLE IF NOT EXISTS c_work_items (
  work_item_id          uuid primary key default gen_random_uuid(),
  org_id                uuid null,
  title                 text not null,
  description           text,
  work_type             text not null default 'task',
  status                text not null default 'backlog',
  priority              text not null default 'medium',
  area                  text,
  sprint_label          text null,
  quarter_label         text null,
  owner                 text,
  requested_by          text,
  related_issue_id      uuid null,
  acceptance_criteria   text null,
  lessons_learned       text null,
  latest_note           text null,
  target_date           date null,
  completed_at          timestamptz null,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_c_work_items_status
  ON c_work_items(status);
CREATE INDEX IF NOT EXISTS idx_c_work_items_sprint_label
  ON c_work_items(sprint_label);
CREATE INDEX IF NOT EXISTS idx_c_work_items_related_issue_id
  ON c_work_items(related_issue_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_c_work_items_updated_at
  BEFORE UPDATE ON c_work_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
