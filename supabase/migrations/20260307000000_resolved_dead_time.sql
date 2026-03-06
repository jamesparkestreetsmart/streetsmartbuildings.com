-- Phase A: Resolved Dead Time
-- Adds dead time before resolved notifications fire.
-- Default 0 = immediate resolve (preserves existing behavior).

ALTER TABLE b_alert_definitions
  ADD COLUMN IF NOT EXISTS resolved_dead_time_minutes INTEGER DEFAULT 0;

ALTER TABLE b_alert_eval_state
  ADD COLUMN IF NOT EXISTS resolved_pending_since TIMESTAMPTZ;
