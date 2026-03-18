-- Guard: ha_device_id must never contain a dot.
-- HA entity strings (climate.xxx, sensor.xxx) always have dots;
-- HA device IDs are hex/UUID and never do.
-- This prevents accidentally storing an entity_id in ha_device_id.

ALTER TABLE a_devices
ADD CONSTRAINT chk_ha_device_id_not_entity
CHECK (
  ha_device_id IS NULL
  OR ha_device_id NOT LIKE '%.%'
);
