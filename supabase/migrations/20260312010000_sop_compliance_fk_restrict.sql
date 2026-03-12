-- ═══════════════════════════════════════════════════════════════════════════
-- Fix FK delete rule: b_sop_compliance_log.sop_config_id
-- Change from CASCADE to RESTRICT so that deleting a config with
-- existing compliance rows is blocked, preserving audit trail.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE b_sop_compliance_log
  DROP CONSTRAINT IF EXISTS b_sop_compliance_log_sop_config_id_fkey;

ALTER TABLE b_sop_compliance_log
  ADD CONSTRAINT b_sop_compliance_log_sop_config_id_fkey
    FOREIGN KEY (sop_config_id) REFERENCES a_sop_configs(id) ON DELETE RESTRICT;
