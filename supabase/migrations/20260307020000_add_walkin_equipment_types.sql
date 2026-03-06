-- Add missing walk-in equipment types to library_equipment_types
INSERT INTO library_equipment_types (equipment_type_id, name, equipment_group)
VALUES
  ('walkin_cooler', 'Walk-in Cooler', 'Refrigeration'),
  ('walkin_freezer', 'Walk-in Freezer', 'Refrigeration')
ON CONFLICT (equipment_type_id) DO NOTHING;
