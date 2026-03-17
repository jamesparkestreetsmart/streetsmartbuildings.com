-- Migration: SOP Metric Library — bridge tables mapping equipment/space types to eligible SOP metrics
-- Depends on: library_equipment_types, a_sop_templates metric CHECK

-- ═════════════════════════════════════════════════════════════
-- Equipment SOP Metrics — maps equipment_type_id + sensor_role → sop_metric
-- ═════════════════════════════════════════════════════════════

CREATE TABLE library_equipment_sop_metrics (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_type_id text NOT NULL
    REFERENCES library_equipment_types(equipment_type_id)
    ON DELETE CASCADE,
  sensor_role       text NOT NULL,
  sensor_type       text NOT NULL,
  sop_metric        text NOT NULL,
  display_name      text NOT NULL,
  unit              text NOT NULL,
  enabled           boolean NOT NULL DEFAULT true,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (equipment_type_id, sensor_role, sop_metric),

  CONSTRAINT esm_sop_metric_check
    CHECK (sop_metric IN (
      'zone_temp', 'space_temp', 'setpoint_delta',
      'cooler_temp', 'freezer_temp', 'humidity',
      'power_kw', 'pressure_differential'
    ))
);

CREATE INDEX idx_esm_equipment_type
  ON library_equipment_sop_metrics(equipment_type_id)
  WHERE enabled = true;

-- ═════════════════════════════════════════════════════════════
-- Space SOP Metrics — maps space_type + sensor_role → sop_metric
-- ═════════════════════════════════════════════════════════════

CREATE TABLE library_space_sop_metrics (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_type        text NOT NULL,
  sensor_role       text NOT NULL,
  sensor_type       text NOT NULL,
  sop_metric        text NOT NULL,
  display_name      text NOT NULL,
  unit              text NOT NULL,
  enabled           boolean NOT NULL DEFAULT true,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (space_type, sensor_role, sop_metric),

  CONSTRAINT ssm_sop_metric_check
    CHECK (sop_metric IN (
      'zone_temp', 'space_temp', 'setpoint_delta',
      'cooler_temp', 'freezer_temp', 'humidity',
      'power_kw', 'pressure_differential'
    ))
);

CREATE INDEX idx_ssm_space_type
  ON library_space_sop_metrics(space_type)
  WHERE enabled = true;

-- ═════════════════════════════════════════════════════════════
-- RLS — readable by all, writable via service role only
-- ═════════════════════════════════════════════════════════════

ALTER TABLE library_equipment_sop_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_space_sop_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "esm_select_all" ON library_equipment_sop_metrics
  FOR SELECT USING (true);
CREATE POLICY "ssm_select_all" ON library_space_sop_metrics
  FOR SELECT USING (true);

-- ═════════════════════════════════════════════════════════════
-- Seed data — equipment SOP metrics
-- ═════════════════════════════════════════════════════════════

INSERT INTO library_equipment_sop_metrics
  (equipment_type_id, sensor_role, sensor_type, sop_metric, display_name, unit)
VALUES
  -- HVAC Rooftop Unit
  ('hvac_rooftop_unit', 'zone_temp', 'temperature', 'zone_temp', 'Zone Temperature', 'F'),
  ('hvac_rooftop_unit', 'setpoint_delta', 'temperature', 'setpoint_delta', 'Setpoint Delta', 'F'),
  ('hvac_rooftop_unit', 'power_kw', 'power', 'power_kw', 'Power (kW)', 'kW'),
  -- HVAC Split System
  ('hvac_split_system', 'zone_temp', 'temperature', 'zone_temp', 'Zone Temperature', 'F'),
  -- Refrigerator
  ('refrigerator', 'cooler_temp', 'temperature', 'cooler_temp', 'Cooler Temperature', 'F'),
  ('refrigerator', 'power_kw', 'power', 'power_kw', 'Power (kW)', 'kW'),
  -- Freezer
  ('freezer', 'freezer_temp', 'temperature', 'freezer_temp', 'Freezer Temperature', 'F'),
  ('freezer', 'power_kw', 'power', 'power_kw', 'Power (kW)', 'kW'),
  -- Walk-in Cooler
  ('walkin_cooler', 'cooler_temp', 'temperature', 'cooler_temp', 'Cooler Temperature', 'F'),
  ('walkin_cooler', 'power_kw', 'power', 'power_kw', 'Power (kW)', 'kW'),
  -- Walk-in Freezer
  ('walkin_freezer', 'freezer_temp', 'temperature', 'freezer_temp', 'Freezer Temperature', 'F'),
  ('walkin_freezer', 'power_kw', 'power', 'power_kw', 'Power (kW)', 'kW'),
  -- Dehumidifier
  ('dehumidifier', 'humidity', 'humidity', 'humidity', 'Humidity', 'percent');

-- ═════════════════════════════════════════════════════════════
-- Seed data — space SOP metrics
-- ═════════════════════════════════════════════════════════════

INSERT INTO library_space_sop_metrics
  (space_type, sensor_role, sensor_type, sop_metric, display_name, unit)
VALUES
  ('dining', 'air_temperature', 'temperature', 'space_temp', 'Space Temperature', 'F'),
  ('dining', 'humidity', 'humidity', 'humidity', 'Humidity', 'percent'),
  ('kitchen', 'air_temperature', 'temperature', 'space_temp', 'Space Temperature', 'F'),
  ('kitchen', 'humidity', 'humidity', 'humidity', 'Humidity', 'percent'),
  ('lobby', 'air_temperature', 'temperature', 'space_temp', 'Space Temperature', 'F'),
  ('office', 'air_temperature', 'temperature', 'space_temp', 'Space Temperature', 'F');
