-- Migration: HA Automation Templates, Deployments, and Deployment Log
-- Implements the HA Automation Management architecture.
-- Three tables: template library (append-only revisions), per-site deployment state, deployment history.

-- ═════════════════════════════════════════════════════════════
-- TABLE 1: c_ha_automation_templates
-- Canonical automation definition library. Revisions are append-only.
-- ═════════════════════════════════════════════════════════════

CREATE TABLE c_ha_automation_templates (
  automation_template_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  scope_level             text NOT NULL CHECK (scope_level IN ('ssb', 'org', 'site')),
  org_id                  uuid NULL REFERENCES a_organizations(org_id),
  site_id                 uuid NULL REFERENCES a_sites(site_id),

  automation_key          text NOT NULL,

  label                   text NOT NULL,
  description             text NULL,

  enabled                 boolean NOT NULL DEFAULT true,
  is_active               boolean NOT NULL DEFAULT true,

  definition_format       text NOT NULL DEFAULT 'yaml'
                            CHECK (definition_format IN ('yaml', 'json')),
  definition_json         jsonb NULL,

  yaml_rendered           text NULL,

  parent_template_id      uuid NULL
                            REFERENCES c_ha_automation_templates(automation_template_id),

  version                 integer NOT NULL DEFAULT 1,

  checksum                text NOT NULL,

  notes                   text NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT c_ha_automation_templates_scope_ck CHECK (
    (scope_level = 'ssb'  AND org_id IS NULL  AND site_id IS NULL) OR
    (scope_level = 'org'  AND org_id IS NOT NULL AND site_id IS NULL) OR
    (scope_level = 'site' AND org_id IS NOT NULL AND site_id IS NOT NULL)
  ),

  CONSTRAINT c_ha_automation_templates_yaml_required_ck CHECK (
    NOT (
      definition_format = 'yaml'
      AND enabled = true
      AND is_active = true
      AND (yaml_rendered IS NULL OR TRIM(yaml_rendered) = '')
    )
  )
);

-- Only one active template per scope target + automation_key
CREATE UNIQUE INDEX uq_c_ha_automation_templates_active_scope_key
ON c_ha_automation_templates (
  scope_level,
  COALESCE(org_id,  '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
  automation_key
)
WHERE is_active = true;

CREATE INDEX idx_c_ha_automation_templates_org_id   ON c_ha_automation_templates(org_id);
CREATE INDEX idx_c_ha_automation_templates_site_id  ON c_ha_automation_templates(site_id);
CREATE INDEX idx_c_ha_automation_templates_key      ON c_ha_automation_templates(automation_key);
CREATE INDEX idx_c_ha_automation_templates_parent   ON c_ha_automation_templates(parent_template_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON c_ha_automation_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═════════════════════════════════════════════════════════════
-- TABLE 2: c_ha_automation_deployments
-- Resolved per-site desired/installed state. One row per (site_id, automation_key).
-- ═════════════════════════════════════════════════════════════

CREATE TABLE c_ha_automation_deployments (
  deployment_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id                  uuid NOT NULL REFERENCES a_organizations(org_id),
  site_id                 uuid NOT NULL REFERENCES a_sites(site_id),
  automation_key          text NOT NULL,

  resolved_template_id    uuid NOT NULL
                            REFERENCES c_ha_automation_templates(automation_template_id),

  desired_enabled         boolean NOT NULL,
  desired_version         integer NOT NULL,
  desired_checksum        text NOT NULL,
  desired_yaml            text NULL,

  installed_enabled       boolean NULL,
  installed_version       integer NULL,
  installed_checksum      text NULL,

  ha_automation_ref       text NULL,

  drift_status            text NOT NULL DEFAULT 'pending'
                            CHECK (drift_status IN (
                              'pending',
                              'in_sync',
                              'out_of_sync',
                              'failed',
                              'unknown'
                            )),

  last_pushed_at          timestamptz NULL,
  last_success_at         timestamptz NULL,
  last_status             text NULL
                            CHECK (last_status IN (
                              'pending', 'pushed', 'acknowledged', 'failed', 'skipped'
                            )),
  last_error              text NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_c_ha_automation_deployments_site_key UNIQUE (site_id, automation_key)
);

CREATE INDEX idx_c_ha_automation_deployments_site_id ON c_ha_automation_deployments(site_id);
CREATE INDEX idx_c_ha_automation_deployments_drift   ON c_ha_automation_deployments(drift_status);
CREATE INDEX idx_c_ha_automation_deployments_org_id  ON c_ha_automation_deployments(org_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON c_ha_automation_deployments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═════════════════════════════════════════════════════════════
-- TABLE 3: c_ha_automation_deployment_log
-- Immutable deployment attempt history. INSERT ONLY.
-- ═════════════════════════════════════════════════════════════

CREATE TABLE c_ha_automation_deployment_log (
  deployment_log_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  deployment_id           uuid NOT NULL
                            REFERENCES c_ha_automation_deployments(deployment_id),
  resolved_template_id    uuid NOT NULL
                            REFERENCES c_ha_automation_templates(automation_template_id),

  org_id                  uuid NOT NULL REFERENCES a_organizations(org_id),
  site_id                 uuid NOT NULL REFERENCES a_sites(site_id),
  automation_key          text NOT NULL,

  desired_version         integer NOT NULL,
  desired_checksum        text NOT NULL,

  attempted_at            timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz NULL,

  result                  text NOT NULL
                            CHECK (result IN ('pending', 'success', 'failed', 'skipped')),

  error_text              text NULL,
  response_payload        jsonb NULL,

  manifest_revision       text NULL
);

CREATE INDEX idx_c_ha_automation_deployment_log_site    ON c_ha_automation_deployment_log(site_id);
CREATE INDEX idx_c_ha_automation_deployment_log_key     ON c_ha_automation_deployment_log(automation_key);
CREATE INDEX idx_c_ha_automation_deployment_log_result  ON c_ha_automation_deployment_log(result);
CREATE INDEX idx_c_ha_automation_deployment_log_time    ON c_ha_automation_deployment_log(attempted_at DESC);

-- No updated_at trigger on deployment_log (insert-only table)

-- ═════════════════════════════════════════════════════════════
-- RLS — all three tables readable by authenticated, writable via service role
-- ═════════════════════════════════════════════════════════════

ALTER TABLE c_ha_automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE c_ha_automation_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE c_ha_automation_deployment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "c_ha_automation_templates_select" ON c_ha_automation_templates
  FOR SELECT USING (true);
CREATE POLICY "c_ha_automation_deployments_select" ON c_ha_automation_deployments
  FOR SELECT USING (true);
CREATE POLICY "c_ha_automation_deployment_log_select" ON c_ha_automation_deployment_log
  FOR SELECT USING (true);

-- ═════════════════════════════════════════════════════════════
-- Resolution function
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION resolve_effective_automations(p_site_id uuid)
RETURNS TABLE (
  automation_key          text,
  resolved_template_id    uuid,
  desired_enabled         boolean,
  desired_version         integer,
  desired_checksum        text,
  desired_yaml            text,
  org_id                  uuid,
  site_id                 uuid
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT s.org_id INTO v_org_id FROM a_sites s WHERE s.site_id = p_site_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Site % not found or has no org_id', p_site_id;
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      t.automation_key,
      t.automation_template_id,
      t.enabled,
      t.version,
      t.checksum,
      t.yaml_rendered,
      t.org_id AS t_org_id,
      t.site_id AS t_site_id,
      ROW_NUMBER() OVER (
        PARTITION BY t.automation_key
        ORDER BY
          CASE t.scope_level
            WHEN 'site' THEN 1
            WHEN 'org'  THEN 2
            WHEN 'ssb'  THEN 3
          END,
          t.updated_at DESC,
          t.created_at DESC
      ) AS rn
    FROM c_ha_automation_templates t
    WHERE t.is_active = true
      AND (
        (t.scope_level = 'ssb')
        OR (t.scope_level = 'org'  AND t.org_id  = v_org_id)
        OR (t.scope_level = 'site' AND t.site_id = p_site_id)
      )
  )
  SELECT
    r.automation_key,
    r.automation_template_id AS resolved_template_id,
    r.enabled                AS desired_enabled,
    r.version                AS desired_version,
    r.checksum               AS desired_checksum,
    r.yaml_rendered          AS desired_yaml,
    v_org_id                 AS org_id,
    p_site_id                AS site_id
  FROM ranked r
  WHERE r.rn = 1;
END;
$$;
