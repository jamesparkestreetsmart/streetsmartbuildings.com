-- Z-Wave pairing & commissioning fields on a_devices
ALTER TABLE a_devices
  ADD COLUMN IF NOT EXISTS smartstart_dsk text,
  ADD COLUMN IF NOT EXISTS inclusion_pin text,
  ADD COLUMN IF NOT EXISTS pairing_status text DEFAULT 'unpaired',
  ADD COLUMN IF NOT EXISTS pairing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS paired_at timestamptz,
  ADD COLUMN IF NOT EXISTS pairing_error text,
  ADD COLUMN IF NOT EXISTS commissioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS commissioned_by uuid;

-- Commissioning evidence (photos, labels)
CREATE TABLE IF NOT EXISTS b_device_commissioning_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES a_devices(device_id) ON DELETE CASCADE,
  site_id uuid REFERENCES a_sites(site_id),
  org_id uuid,
  asset_type text DEFAULT 'label_photo',
  storage_path text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

-- NOTE: Create 'commissioning' private storage bucket in Supabase dashboard
