-- Expose the hidden lock winner: add observability fields to b_cron_locks
-- Safe to run against a live table — all ADD COLUMN IF NOT EXISTS

ALTER TABLE b_cron_locks ADD COLUMN IF NOT EXISTS owner_run_id TEXT;
ALTER TABLE b_cron_locks ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE b_cron_locks ADD COLUMN IF NOT EXISTS last_step TEXT;
-- last_started_at and last_finished_at already exist from the original migration
