-- ═══════════════════════════════════════════════════════════════════════════
-- SOP Reporting Foundation — Schema + Resolution Function
-- ═══════════════════════════════════════════════════════════════════════════

-- Clean up partial state from prior failed run (safe no-ops if objects don't exist)
DROP FUNCTION IF EXISTS resolve_sop_config(text, uuid, uuid, uuid, date);
DROP TABLE IF EXISTS b_sop_compliance_log;
DROP TABLE IF EXISTS a_sop_configs;

-- ─── TABLE: a_sop_configs ─────────────────────────────────────────────────
-- Hierarchical SOP threshold configuration: org → site → equipment.
-- These are brand / contractual standards, not real-time alert triggers.

CREATE TABLE IF NOT EXISTS a_sop_configs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES a_organizations(org_id) ON DELETE CASCADE,
  site_id             uuid REFERENCES a_sites(site_id) ON DELETE CASCADE,
  equipment_id        uuid REFERENCES a_equipments(equipment_id) ON DELETE CASCADE,
  label               text NOT NULL,
  metric              text NOT NULL,
  min_value           numeric,
  max_value           numeric,
  evaluation_window   text NOT NULL DEFAULT 'all_hours',
  unit                text NOT NULL DEFAULT 'F',
  notes               text,
  effective_from      date,
  effective_to        date,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Enforce scope hierarchy: equipment requires site, site requires org (org always required)
ALTER TABLE a_sop_configs
  ADD CONSTRAINT sop_scope_hierarchy CHECK (
    (equipment_id IS NULL OR site_id IS NOT NULL)
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sop_configs_org    ON a_sop_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_sop_configs_site   ON a_sop_configs(site_id);
CREATE INDEX IF NOT EXISTS idx_sop_configs_equip  ON a_sop_configs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_sop_configs_metric ON a_sop_configs(metric);

-- RLS
ALTER TABLE a_sop_configs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sop_configs_select' AND tablename = 'a_sop_configs') THEN
    CREATE POLICY "sop_configs_select" ON a_sop_configs
      FOR SELECT USING (
        org_id IN (SELECT org_id FROM a_orgs_users_memberships WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sop_configs_all' AND tablename = 'a_sop_configs') THEN
    CREATE POLICY "sop_configs_all" ON a_sop_configs
      FOR ALL USING (
        org_id IN (SELECT org_id FROM a_orgs_users_memberships WHERE user_id = auth.uid())
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM a_orgs_users_memberships WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- Updated-at trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_a_sop_configs_updated_at') THEN
    CREATE TRIGGER trg_a_sop_configs_updated_at
      BEFORE UPDATE ON a_sop_configs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;


-- ─── TABLE: b_sop_compliance_log ──────────────────────────────────────────
-- Daily compliance calculation results. One row per (config, site, equipment, day).

CREATE TABLE IF NOT EXISTS b_sop_compliance_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_config_id       uuid NOT NULL REFERENCES a_sop_configs(id) ON DELETE CASCADE,
  site_id             uuid NOT NULL REFERENCES a_sites(site_id) ON DELETE CASCADE,
  equipment_id        uuid REFERENCES a_equipments(equipment_id) ON DELETE SET NULL,
  space_id            uuid REFERENCES a_spaces(space_id) ON DELETE SET NULL,
  period_start        timestamptz NOT NULL,
  period_end          timestamptz NOT NULL,
  total_readings      integer NOT NULL DEFAULT 0,
  compliant_readings  integer NOT NULL DEFAULT 0,
  compliance_pct      numeric GENERATED ALWAYS AS (
                        CASE WHEN total_readings = 0 THEN NULL
                             ELSE ROUND((compliant_readings::numeric / total_readings) * 100, 2)
                        END
                      ) STORED,
  calculated_at       timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate periods per config+site+equipment
  UNIQUE (sop_config_id, site_id, equipment_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_sop_compliance_config ON b_sop_compliance_log(sop_config_id);
CREATE INDEX IF NOT EXISTS idx_sop_compliance_site   ON b_sop_compliance_log(site_id);
CREATE INDEX IF NOT EXISTS idx_sop_compliance_period ON b_sop_compliance_log(period_start, period_end);

-- RLS
ALTER TABLE b_sop_compliance_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sop_compliance_select' AND tablename = 'b_sop_compliance_log') THEN
    CREATE POLICY "sop_compliance_select" ON b_sop_compliance_log
      FOR SELECT USING (
        site_id IN (
          SELECT s.site_id FROM a_sites s
          JOIN a_orgs_users_memberships m ON m.org_id = s.org_id
          WHERE m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sop_compliance_write' AND tablename = 'b_sop_compliance_log') THEN
    CREATE POLICY "sop_compliance_write" ON b_sop_compliance_log
      FOR ALL USING (true)
      WITH CHECK (true);
  END IF;
END $$;


-- ─── FUNCTION: resolve_sop_config ─────────────────────────────────────────
-- Most-specific-wins resolution: equipment → site → org.
-- Returns the single best-match config id (or NULL).

CREATE OR REPLACE FUNCTION resolve_sop_config(
  p_metric text,
  p_org_id uuid,
  p_site_id uuid DEFAULT NULL,
  p_equipment_id uuid DEFAULT NULL,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id
  FROM a_sop_configs
  WHERE org_id = p_org_id
    AND metric = p_metric
    AND (effective_from IS NULL OR effective_from <= p_as_of)
    AND (effective_to   IS NULL OR effective_to   >= p_as_of)
    AND (
      -- equipment-level match (most specific)
      (equipment_id = p_equipment_id AND site_id = p_site_id)
      OR
      -- site-level match
      (equipment_id IS NULL AND site_id = p_site_id)
      OR
      -- org-level match (least specific)
      (equipment_id IS NULL AND site_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN equipment_id IS NOT NULL THEN 1
      WHEN site_id IS NOT NULL THEN 2
      ELSE 3
    END
  LIMIT 1;
$$;
