-- Add email/sms override fields to subscriptions.
-- Most dispatch fields already exist: dashboard_enabled, email_enabled,
-- sms_enabled, repeat_enabled, repeat_interval_min, max_repeats,
-- send_resolved, quiet_hours_override, quiet_start, quiet_end, timezone.
-- These two columns allow overriding the recipient address per subscription.

ALTER TABLE b_alert_subscriptions
  ADD COLUMN IF NOT EXISTS email_override TEXT;

ALTER TABLE b_alert_subscriptions
  ADD COLUMN IF NOT EXISTS sms_override TEXT;
