-- Seasonal thermostat snapshots: org-wide heterogeneous state capture
CREATE TABLE IF NOT EXISTS a_org_thermostat_snapshots (
  snapshot_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL,
  name                text NOT NULL,
  snapshot_date       date NOT NULL,
  notes               text,
  zone_count          int NOT NULL DEFAULT 0,
  site_count          int NOT NULL DEFAULT 0,
  created_by_user_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_a_org_thermostat_snapshots_org_id
  ON a_org_thermostat_snapshots(org_id);

CREATE TRIGGER trg_a_org_thermostat_snapshots_updated_at
  BEFORE UPDATE ON a_org_thermostat_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS a_org_thermostat_snapshot_items (
  snapshot_item_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id               uuid NOT NULL REFERENCES a_org_thermostat_snapshots(snapshot_id)
                            ON DELETE CASCADE,
  site_id                   uuid NOT NULL,
  zone_id                   uuid NOT NULL,
  zone_name                 text NOT NULL,
  site_name                 text NOT NULL,
  source_profile_id         uuid,
  source_profile_name       text,
  -- Frozen profile settings (13 canonical fields from b_thermostat_profiles)
  occupied_heat_f           numeric,
  occupied_cool_f           numeric,
  occupied_fan_mode         text,
  occupied_hvac_mode        text,
  unoccupied_heat_f         numeric,
  unoccupied_cool_f         numeric,
  unoccupied_fan_mode       text,
  unoccupied_hvac_mode      text,
  guardrail_min_f           numeric,
  guardrail_max_f           numeric,
  manager_offset_up_f       numeric,
  manager_offset_down_f     numeric,
  manager_override_reset_minutes int,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_items_snapshot_id
  ON a_org_thermostat_snapshot_items(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_items_zone_id
  ON a_org_thermostat_snapshot_items(zone_id);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
