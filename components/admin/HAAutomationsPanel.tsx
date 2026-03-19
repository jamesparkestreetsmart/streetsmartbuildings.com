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

interface Site {
  site_id: string;
  site_name: string;
}

// ── Helpers ──

const SCOPE_COLORS: Record<string, string> = {
  ssb: "bg-blue-100 text-blue-800",
  org: "bg-purple-100 text-purple-800",
  site: "bg-orange-100 text-orange-800",
};

const DRIFT_COLORS: Record<string, { bg: string; label: string }> = {
  in_sync: { bg: "bg-green-100 text-green-800", label: "In Sync" },
  out_of_sync: { bg: "bg-yellow-100 text-yellow-800", label: "Out of Sync" },
  pending: { bg: "bg-gray-100 text-gray-600", label: "Pending" },
  failed: { bg: "bg-red-100 text-red-800", label: "Failed" },
  unknown: { bg: "bg-gray-100 text-gray-500", label: "Unknown" },
  disabled_mismatch: { bg: "bg-orange-100 text-orange-800", label: "Disabled Mismatch" },
};

const RESULT_COLORS: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-gray-100 text-gray-600",
  skipped: "bg-gray-100 text-gray-500",
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
  const [activeTab, setActiveTab] = useState<"library" | "site">("library");

  // Library state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [yamlModal, setYamlModal] = useState<{ key: string; yaml: string } | null>(null);
  const [historyModal, setHistoryModal] = useState<{ key: string; scope: string; rows: Template[] } | null>(null);

  // Site state
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

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
    setSites(data.sites || []);
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
    { key: "library" as const, label: "Automation Library" },
    { key: "site" as const, label: "Site Deployments" },
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
                className="border rounded px-3 py-1.5 text-sm min-w-[220px]"
              >
                <option value="">Select a site...</option>
                {sites.map((s) => (
                  <option key={s.site_id} value={s.site_id}>
                    {s.site_name}
                  </option>
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

          {/* ═══ VIEW 3: DEPLOYMENT HISTORY ═══ */}
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
                                    {log.completed_at
                                      ? new Date(log.completed_at).toLocaleString()
                                      : "—"}
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
