-- Internal tracking: shared comments (polymorphic parent)
CREATE TABLE IF NOT EXISTS c_item_comments (
  comment_id          uuid primary key default gen_random_uuid(),
  org_id              uuid null,
  issue_id            uuid null references c_platform_issues(issue_id),
  work_item_id        uuid null references c_work_items(work_item_id),
  learning_id         uuid null references c_learnings(learning_id),
  author_user_id      uuid not null,
  author_name         text,
  comment_text        text not null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),

  CONSTRAINT chk_exactly_one_parent CHECK (
    (
      (issue_id IS NOT NULL)::int +
      (work_item_id IS NOT NULL)::int +
      (learning_id IS NOT NULL)::int
    ) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_c_item_comments_issue_id
  ON c_item_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_c_item_comments_work_item_id
  ON c_item_comments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_c_item_comments_learning_id
  ON c_item_comments(learning_id);

CREATE TRIGGER trg_c_item_comments_updated_at
  BEFORE UPDATE ON c_item_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reload schema cache so PostgREST picks up new tables
NOTIFY pgrst, 'reload schema';
