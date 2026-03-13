-- ═══════════════════════════════════════════════════════════════════════════
-- Add mute/snooze support to b_alert_subscriptions
--
-- muted_at IS NOT NULL             → subscription is muted or snoozed
-- mute_until IS NULL               → muted indefinitely (Mute)
-- mute_until IS NOT NULL           → snoozed until that timestamp (Snooze)
-- muted_at IS NULL                 → active, notifications deliver normally
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE b_alert_subscriptions
  ADD COLUMN IF NOT EXISTS muted_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mute_until  timestamptz DEFAULT NULL;

-- Helper function: determines if a subscription is active for delivery.
-- A subscription is active when:
--   1. Not muted (muted_at IS NULL), OR
--   2. Snooze has expired (mute_until IS NOT NULL AND mute_until <= now())
CREATE OR REPLACE FUNCTION subscription_is_active(
  p_muted_at   timestamptz,
  p_mute_until timestamptz
) RETURNS boolean AS $$
  SELECT p_muted_at IS NULL
      OR (p_mute_until IS NOT NULL AND p_mute_until <= now());
$$ LANGUAGE sql IMMUTABLE;

-- Also fix the FK on b_alert_notifications.subscription_id to SET NULL
-- on delete, preventing the 500 error when unsubscribing with existing
-- notification history.
DO $$
BEGIN
  -- Drop existing FK if present, then re-add with SET NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'b_alert_notifications_subscription_id_fkey'
      AND table_name = 'b_alert_notifications'
  ) THEN
    ALTER TABLE b_alert_notifications
      DROP CONSTRAINT b_alert_notifications_subscription_id_fkey;
  END IF;

  -- Only add FK if the column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'b_alert_notifications' AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE b_alert_notifications
      ADD CONSTRAINT b_alert_notifications_subscription_id_fkey
        FOREIGN KEY (subscription_id) REFERENCES b_alert_subscriptions(id)
        ON DELETE SET NULL;
  END IF;
END $$;
