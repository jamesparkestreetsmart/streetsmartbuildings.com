-- Migration 005: Compressor Cycle Log
-- Tracks computed compressor run cycles with timing, power, and efficiency data.

CREATE TABLE IF NOT EXISTS b_compressor_cycles (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES a_organizations(org_id),
  site_id UUID NOT NULL REFERENCES a_sites(site_id),
  hvac_zone_id UUID REFERENCES a_hvac_zones(hvac_zone_id),
  equipment_id UUID REFERENCES a_equipments(equipment_id),

  -- Cycle timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,              -- NULL = currently running
  duration_min NUMERIC(8,1),         -- computed: (ended_at - started_at) in minutes

  -- Mode during this cycle
  hvac_mode TEXT,                     -- 'cooling', 'heating', 'fan_only', 'unknown'

  -- Staging (for multi-stage equipment)
  stage1_minutes NUMERIC(8,1) DEFAULT 0,
  stage2_minutes NUMERIC(8,1) DEFAULT 0,

  -- Power / energy during cycle
  avg_power_kw NUMERIC(8,3),         -- average power_kw during cycle
  peak_power_kw NUMERIC(8,3),        -- max power_kw during cycle
  total_energy_kwh NUMERIC(10,3),    -- energy consumed during cycle
  peak_current_a NUMERIC(8,2),       -- max compressor current during cycle

  -- Conditions at start
  start_zone_temp_f NUMERIC(6,1),
  start_supply_temp_f NUMERIC(6,1),
  start_setpoint_f NUMERIC(6,1),

  -- Conditions at end
  end_zone_temp_f NUMERIC(6,1),
  end_supply_temp_f NUMERIC(6,1),
  temp_delta_f NUMERIC(6,1),         -- how much zone temp changed during cycle

  -- Efficiency
  efficiency_ratio NUMERIC(8,3),     -- temp_delta_f / total_energy_kwh (degrees per kWh)

  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comp_cycles_zone
  ON b_compressor_cycles(hvac_zone_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_comp_cycles_site
  ON b_compressor_cycles(site_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_comp_cycles_active
  ON b_compressor_cycles(site_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comp_cycles_equipment
  ON b_compressor_cycles(equipment_id, started_at DESC)
  WHERE equipment_id IS NOT NULL;
