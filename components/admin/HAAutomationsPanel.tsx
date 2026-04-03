"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──

interface Template {
  automation_template_id: string;
  automation_key: string;
  scope_level: string;
  org_id: string | null;
  site_id: string | null;
  label: string | null;
  enabled: boolean;
  is_active: boolean;
  version: number;
  checksum: string;
  created_at: string;
  updated_at: string;
  parent_template_id: string | null;
  notes: string | null;
  yaml_rendered: string | null;
}

interface Deployment {
  deployment_id: string;
  automation_key: string;
  desired_enabled: boolean;
  desired_version: number;
  desired_checksum: string;
  installed_enabled: boolean | null;
  installed_version: number | null;
  installed_checksum: string | null;
  drift_status: string;
  last_status: string | null;
  last_pushed_at: string | null;
  last_success_at: string | null;
  ha_automation_ref: string | null;
  last_error: string | null;
  resolved_template_id: string;
  scope_level: string | null;
  label: string | null;
}

interface DeploymentLog {
  deployment_log_id: string;
  automation_key: string;
  result: string;
  attempted_at: string;
  completed_at: string | null;
  desired_version: number;
  desired_checksum: string;
  error_text: string | null;
  manifest_revision: string | null;
  response_payload: Record<string, unknown> | null;
}

interface SiteOption {
  site_id: string;
  site_slug: string;
  site_name: string;
}

interface SiteGroup {
  org_name: string;
  org_identifier: string;
  sites: SiteOption[];
}

interface DeploymentStatusRecord {
  id: string;
  site_id: string;
  alias: string;
  deployment_key: string;
  state: string;
  retry_count: number;
  failure_domain: string | null;
  last_error: string | null;
  pushed_at: string | null;
  acknowledged_at: string | null;
  updated_at: string;
}

interface DeploymentHealth {
  global_summary: {
    total: number;
    states: { state: string; count: number }[];
  };
  per_site_summary: {
    totals_by_site: Record<string, number>;
    states: { site_id: string; state: string; count: number }[];
  };
}

// ── Helpers ──

const SCOPE_COLORS: Record<string, string> = {
  ssb: "bg-blue-100 text-blue-800",
  org: "bg-purple-100 text-purple-800",
  site: "bg-orange-100 text-orange-800",
};

const DRIFT_COLORS: Record<string, { bg: string; label: string }> = {
  in_sync:           { bg: "bg-green-100 text-green-800",  label: "In Sync" },
  out_of_sync:       { bg: "bg-yellow-100 text-yellow-800", label: "Out of Sync" },
  pending:           { bg: "bg-gray-100 text-gray-600",    label: "Pending" },
  failed:            { bg: "bg-red-100 text-red-800",      label: "Failed" },
  unknown:           { bg: "bg-gray-100 text-gray-500",    label: "Unknown" },
  disabled_mismatch: { bg: "bg-orange-100 text-orange-800", label: "Disabled Mismatch" },
};

const RESULT_COLORS: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failed:  "bg-red-100 text-red-800",
  pending: "bg-gray-100 text-gray-600",
  skipped: "bg-gray-100 text-gray-500",
};

const STATE_BG: Record<string, string> = {
  in_sync:           "bg-green-100 text-green-800",
  acknowledged:      "bg-blue-100 text-blue-800",
  pending:           "bg-gray-100 text-gray-600",
  pushed:            "bg-purple-100 text-purple-800",
  push_attempted:    "bg-yellow-100 text-yellow-800",
  rendered:          "bg-orange-100 text-orange-800",
  failed:            "bg-red-100 text-red-800",
  mismatch:          "bg-red-200 text-red-900",
  permanent_failure: "bg-red-300 text-red-900",
};

const STATE_TEXT_COLOR: Record<string, string> = {
  in_sync:           "text-green-700",
  acknowledged:      "text-blue-700",
  pending:           "text-gray-600",
  pushed:            "text-purple-700",
  push_attempted:    "text-yellow-700",
  rendered:          "text-orange-700",
  failed:            "text-red-700",
  mismatch:          "text-red-900",
  permanent_failure: "text-red-900",
};

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Badge({ value, colorMap }: { value: string; colorMap: Record<string, string> }) {
  const color = colorMap[value] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {value.toUpperCase()}
    </span>
  );
}

function DriftBadge({ status }: { status: string }) {
  const info = DRIFT_COLORS[status] || DRIFT_COLORS.unknown;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${info.bg}`}>
      {info.label}
    </span>
  );
}

// ── Main Component ──

export default function HAAutomationsPanel() {
  const [activeTab, setActiveTab] = useState<"library" | "site" | "deployment_status">("library");

  // Library state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [yamlModal, setYamlModal] = useState<{ key: string; yaml: string } | null>(null);
  const [historyModal, setHistoryModal] = useState<{ key: string; scope: string; rows: Template[] } | null>(null);

  // Site state
  const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Deployment status state
  const [deploymentHealth, setDeploymentHealth] = useState<DeploymentHealth | null>(null);
  const [deploymentRecords, setDeploymentRecords] = useState<DeploymentStatusRecord[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusExpandedId, setStatusExpandedId] = useState<string | null>(null);
  const [statusLastUpdated, setStatusLastUpdated] = useState("");

  // ── Data fetching ──

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/admin/ha-automations?view=templates");
      const data = await res.json();
      setTemplates(data.templates || []);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const fetchSites = useCallback(async () => {
    const res = await fetch("/api/admin/ha-automations?view=sites");
    const data = await res.json();
    setSiteGroups(data.site_groups || []);
  }, []);

  const fetchDeployments = useCallback(async (siteId: string) => {
    setLoadingDeployments(true);
    try {
      const res = await fetch(`/api/admin/ha-automations?view=deployments&site_id=${siteId}`);
      const data = await res.json();
      setDeployments(data.deployments || []);
    } finally {
      setLoadingDeployments(false);
    }
  }, []);

  const fetchLogs = useCallback(async (siteId: string) => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/admin/ha-automations?view=deployment_log&site_id=${siteId}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const fetchHistory = useCallback(async (key: string, scope: string) => {
    const res = await fetch(
      `/api/admin/ha-automations?view=template_history&automation_key=${encodeURIComponent(key)}&scope_level=${scope}`
    );
    const data = await res.json();
    setHistoryModal({ key, scope, rows: data.history || [] });
  }, []);

  const fetchDeploymentStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [healthRes, listRes] = await Promise.all([
        fetch("/api/deployments/health"),
        fetch("/api/deployments/list?hours=24"),
      ]);
      if (healthRes.ok) setDeploymentHealth(await healthRes.json());
      if (listRes.ok)   setDeploymentRecords(await listRes.json());
      setStatusLastUpdated(
        new Date().toLocaleString("en-US", {
          timeZone: "America/Chicago",
          hour12: true,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      );
    } catch (err) {
      console.error("Failed to fetch deployment status", err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchSites();
  }, [fetchTemplates, fetchSites]);

  useEffect(() => {
    if (selectedSiteId) {
      fetchDeployments(selectedSiteId);
      fetchLogs(selectedSiteId);
    }
  }, [selectedSiteId, fetchDeployments, fetchLogs]);

  useEffect(() => {
    if (activeTab === "deployment_status") {
      fetchDeploymentStatus();
      const interval = setInterval(fetchDeploymentStatus, 60_000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchDeploymentStatus]);

  // ── Actions ──

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const runAudit = async () => {
    if (!selectedSiteId) return;
    setActionLoading("audit");
    try {
      const res = await fetch("/api/admin/ha-automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "audit", site_id: selectedSiteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audit failed");
      const summary = data.result?.summary;
      showToast(
        summary
          ? `Audit complete: ${summary.in_sync || 0} in_sync, ${summary.out_of_sync || 0} out_of_sync, ${summary.unknown_to_platform || 0} unknown_to_platform`
          : "Audit complete",
        "success"
      );
      fetchDeployments(selectedSiteId);
      fetchLogs(selectedSiteId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Audit failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const runReconcile = async () => {
    if (!selectedSiteId) return;
    setActionLoading("reconcile");
    try {
      const res = await fetch("/api/admin/ha-automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile", site_id: selectedSiteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reconcile failed");
      const r = data.result?.results?.[0];
      showToast(
        r
          ? `Reconcile complete: ${r.upserted} upserted, ${r.removed} removed${r.errors?.length ? `, ${r.errors.length} errors` : ""}`
          : "Reconcile complete",
        "success"
      );
      fetchDeployments(selectedSiteId);
      fetchLogs(selectedSiteId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reconcile failed", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Render ──

  const tabs = [
    { key: "library" as const,           label: "Automation Library" },
    { key: "site" as const,              label: "Site Deployments" },
    { key: "deployment_status" as const, label: "Deployment Status" },
  ];

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Info panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        Platform keys are permanent identifiers. HA slugs and aliases are display references only.
        Revisions are tracked by version and checksum.
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ VIEW 1: AUTOMATION LIBRARY ═══ */}
      {activeTab === "library" && (
        <div className="bg-white border rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg">
            <h3 className="text-lg font-semibold text-gray-900">Automation Templates</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              All active templates across SSB, org, and site scopes
            </p>
          </div>

          {loadingTemplates ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              No automation templates seeded yet. Use the bootstrap function to seed your first template.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Key</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Label</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Scope</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Enabled</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Version</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Updated</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {templates.map((t) => (
                    <tr key={t.automation_template_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-900">
                        {t.automation_key}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{t.label || "—"}</td>
                      <td className="px-3 py-2">
                        <Badge value={t.scope_level} colorMap={SCOPE_COLORS} />
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium ${t.enabled ? "text-green-600" : "text-gray-400"}`}>
                          {t.enabled ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">v{t.version}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{relativeTime(t.updated_at)}</td>
                      <td className="px-3 py-2 space-x-2">
                        <button
                          onClick={() =>
                            setYamlModal({
                              key: t.automation_key,
                              yaml: t.yaml_rendered || "(no YAML rendered)",
                            })
                          }
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View YAML
                        </button>
                        <button
                          onClick={() => fetchHistory(t.automation_key, t.scope_level)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ VIEW 2: EFFECTIVE SITE PREVIEW ═══ */}
      {activeTab === "site" && (
        <>
          <div className="bg-white border rounded-lg shadow-sm">
            <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Effective Site Preview</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Resolved deployment state for selected site
                </p>
              </div>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm min-w-[320px]"
              >
                <option value="">Select a site...</option>
                {siteGroups.map((group) => (
                  <optgroup key={group.org_identifier} label={`${group.org_name} (${group.org_identifier})`}>
                    {group.sites.map((s) => (
                      <option key={s.site_id} value={s.site_id}>
                        {s.site_slug} — {s.site_name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {selectedSiteId && (
              <div className="px-6 py-3 border-b flex items-center gap-3">
                <button
                  onClick={runAudit}
                  disabled={!!actionLoading}
                  className="px-3 py-1.5 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {actionLoading === "audit" ? "Running..." : "Run Audit"}
                </button>
                <button
                  onClick={runReconcile}
                  disabled={!!actionLoading}
                  className="px-3 py-1.5 rounded text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {actionLoading === "reconcile" ? "Running..." : "Reconcile Site"}
                </button>
              </div>
            )}

            {!selectedSiteId ? (
              <div className="px-6 py-12 text-center text-gray-400 text-sm">
                Select a site to view deployment status
              </div>
            ) : loadingDeployments ? (
              <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading deployments...</div>
            ) : deployments.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400 text-sm">
                No deployment rows for this site. Run Reconcile to populate from current templates.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Key</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Label</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Resolved From</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Desired</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Drift</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Installed</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">HA Ref</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Last Success</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {deployments.map((d) => (
                      <tr key={d.deployment_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-900">
                          {d.automation_key}
                        </td>
                        <td className="px-3 py-2 text-gray-700 text-xs">{d.label || "—"}</td>
                        <td className="px-3 py-2">
                          {d.scope_level ? (
                            <Badge value={d.scope_level} colorMap={SCOPE_COLORS} />
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs">v{d.desired_version}</td>
                        <td className="px-3 py-2">
                          <DriftBadge status={d.drift_status} />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {d.installed_enabled === null ? "—" : d.installed_enabled ? "enabled" : "disabled"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 max-w-[180px] truncate">
                          {d.ha_automation_ref || <span className="text-gray-300 italic">not audited</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {relativeTime(d.last_success_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedSiteId && deployments.length > 0 && (
              <div className="px-6 py-3 border-t text-xs text-gray-400">
                Audit uses enabled-state comparison only. Full YAML checksum drift detection requires
                HA filesystem access (future enhancement).
              </div>
            )}
          </div>

          {/* Deployment History */}
          {selectedSiteId && (
            <div className="bg-white border rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg">
                <h3 className="text-lg font-semibold text-gray-900">Deployment History</h3>
                <p className="text-sm text-gray-500 mt-0.5">Recent deployment log entries for this site</p>
              </div>

              {loadingLogs ? (
                <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading history...</div>
              ) : logs.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400 text-sm">
                  No deployment history for this site yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Key</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Version</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Result</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {logs.map((log) => (
                        <>
                          <tr
                            key={log.deployment_log_id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() =>
                              setExpandedLogId(
                                expandedLogId === log.deployment_log_id ? null : log.deployment_log_id
                              )
                            }
                          >
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {relativeTime(log.attempted_at)}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-900">
                              {log.automation_key}
                            </td>
                            <td className="px-3 py-2 text-gray-600 text-xs">v{log.desired_version}</td>
                            <td className="px-3 py-2">
                              <Badge value={log.result} colorMap={RESULT_COLORS} />
                            </td>
                            <td className="px-3 py-2 text-xs text-red-600 max-w-[200px] truncate">
                              {log.error_text || "—"}
                            </td>
                          </tr>
                          {expandedLogId === log.deployment_log_id && (
                            <tr key={`${log.deployment_log_id}-detail`}>
                              <td colSpan={5} className="px-6 py-3 bg-gray-50 text-xs">
                                <div className="space-y-2">
                                  <div>
                                    <span className="font-medium text-gray-600">Completed:</span>{" "}
                                    {log.completed_at ? new Date(log.completed_at).toLocaleString() : "—"}
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600">Checksum:</span>{" "}
                                    <span className="font-mono">{log.desired_checksum}</span>
                                  </div>
                                  {log.response_payload && (
                                    <details>
                                      <summary className="cursor-pointer font-medium text-gray-600">
                                        Response Payload
                                      </summary>
                                      <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto max-h-48">
                                        {JSON.stringify(log.response_payload, null, 2)}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ VIEW 3: DEPLOYMENT STATUS ═══ */}
      {activeTab === "deployment_status" && (
        <div className="space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Live push/ack status from the deployment engine.
              {statusLastUpdated && (
                <span className="ml-2 text-gray-400">Last updated: {statusLastUpdated}</span>
              )}
            </p>
            <button
              onClick={fetchDeploymentStatus}
              className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg transition
                         bg-gradient-to-r from-[#00a859] to-[#d4af37]
                         hover:from-[#15b864] hover:to-[#e1bf4b]
                         shadow-sm shadow-green-700/30"
            >
              Refresh
            </button>
          </div>

          {loadingStatus ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Loading deployment status...
            </div>
          ) : !deploymentHealth ? (
            <div className="text-center py-12 text-red-500 text-sm">
              Could not reach deployment backend. Is the worker running?
            </div>
          ) : (
            <>
              {/* Health summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="col-span-2 md:col-span-1 rounded-xl border bg-white p-4 shadow-sm">
                  <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Total</p>
                  <p className="text-3xl font-bold mt-1">{deploymentHealth.global_summary.total}</p>
                  <p className="text-xs text-gray-400 mt-1">tracked</p>
                </div>
                {deploymentHealth.global_summary.states.map((s) => (
                  <div key={s.state} className="rounded-xl border bg-white p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">
                      {s.state.replace(/_/g, " ")}
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${STATE_TEXT_COLOR[s.state] ?? "text-gray-900"}`}>
                      {s.count}
                    </p>
                  </div>
                ))}
              </div>

              {/* Records table */}
              <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-gray-50">
                  <h3 className="text-base font-semibold text-gray-900">
                    Recent Deployments
                    <span className="ml-2 text-xs text-gray-400 font-normal">last 24 hours</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Automation</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">State</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Retries</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Last Push</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Acknowledged</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Error</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {deploymentRecords.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                            No deployments in the last 24 hours
                          </td>
                        </tr>
                      )}
                      {deploymentRecords.map((r) => (
                        <>
                          <tr
                            key={r.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() =>
                              setStatusExpandedId((prev) => prev === r.id ? null : r.id)
                            }
                          >
                            <td className="px-3 py-2">
                              <p className="font-mono text-xs font-semibold text-gray-900">
                                {r.deployment_key}
                              </p>
                              <p className="text-xs text-gray-400">{r.alias}</p>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATE_BG[r.state] ?? "bg-gray-100 text-gray-600"}`}>
                                {r.state.replace(/_/g, " ").toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs">
                              {r.retry_count > 0
                                ? <span className="text-orange-600 font-semibold">{r.retry_count}</span>
                                : <span className="text-gray-300">0</span>
                              }
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {relativeTime(r.pushed_at)}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {relativeTime(r.acknowledged_at)}
                            </td>
                            <td className="px-3 py-2 text-xs text-red-600 max-w-[200px] truncate">
                              {r.last_error
                                ? r.last_error.slice(0, 60) + (r.last_error.length > 60 ? "…" : "")
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                            <td className="px-3 py-2 text-gray-400 text-xs">
                              {statusExpandedId === r.id ? "▲" : "▼"}
                            </td>
                          </tr>
                          {statusExpandedId === r.id && (
                            <tr key={`${r.id}-detail`}>
                              <td colSpan={7} className="px-6 py-4 bg-gray-50 text-xs">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <p className="text-gray-400 uppercase font-semibold tracking-wider mb-1">
                                      Site ID
                                    </p>
                                    <p className="font-mono text-gray-600 break-all">{r.site_id}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-400 uppercase font-semibold tracking-wider mb-1">
                                      Failure Domain
                                    </p>
                                    <p>{r.failure_domain ?? "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-400 uppercase font-semibold tracking-wider mb-1">
                                      Last Updated
                                    </p>
                                    <p>{relativeTime(r.updated_at)}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-400 uppercase font-semibold tracking-wider mb-1">
                                      Alias
                                    </p>
                                    <p className="font-mono">{r.alias}</p>
                                  </div>
                                  {r.last_error && (
                                    <div className="col-span-2 md:col-span-4">
                                      <p className="text-gray-400 uppercase font-semibold tracking-wider mb-1">
                                        Full Error
                                      </p>
                                      <p className="text-red-600 font-mono whitespace-pre-wrap break-all">
                                        {r.last_error}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ YAML MODAL ═══ */}
      {yamlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                YAML — <span className="font-mono text-sm">{yamlModal.key}</span>
              </h3>
              <button
                onClick={() => setYamlModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <pre className="bg-gray-50 border rounded p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                {yamlModal.yaml}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HISTORY MODAL ═══ */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Version History —{" "}
                <span className="font-mono text-sm">{historyModal.key}</span>{" "}
                <Badge value={historyModal.scope} colorMap={SCOPE_COLORS} />
              </h3>
              <button
                onClick={() => setHistoryModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              {historyModal.rows.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">
                  No prior versions found — this is the first version.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Version</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Enabled</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Checksum</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Created</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {historyModal.rows.map((h) => (
                      <tr key={h.automation_template_id}>
                        <td className="px-3 py-2">v{h.version}</td>
                        <td className="px-3 py-2">{h.enabled ? "Yes" : "No"}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 max-w-[120px] truncate">
                          {h.checksum}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {relativeTime(h.created_at)}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{h.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}