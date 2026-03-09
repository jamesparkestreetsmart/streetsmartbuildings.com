-- Cron job overlap protection: prevents simultaneous execution of long-running cron jobs
CREATE TABLE IF NOT EXISTS b_cron_locks (
  cron_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ
);

-- Seed the thermostat-enforce lock row so UPDATE-based acquisition works immediately
INSERT INTO b_cron_locks (cron_name) VALUES ('thermostat-enforce')
ON CONFLICT (cron_name) DO NOTHING;
