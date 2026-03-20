"use client";

import { useEffect, useState, useCallback } from "react";

interface MarketingLead {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  created_at: string;
  source_page: string | null;
  organization_name: string | null;
  projected_sites: number | null;
  welcome_email_status: string;
  welcome_email_sent_at: string | null;
  welcome_email_error: string | null;
  org_id: string | null;
  video_count: number;
  source_type: string;
  lead_status: string;
  promotion_state: string;
  matched_contact_id: string | null;
  contact_id: string | null;
  promoted_at: string | null;
}

interface Stats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
}

interface AuditLogEntry {
  id: number;
  event_type: string;
  source: string;
  message: string;
  metadata: any;
  created_by: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  inbound_form: "bg-green-100 text-green-800",
  scraped: "bg-amber-100 text-amber-800",
  apollo: "bg-amber-100 text-amber-800",
  referral: "bg-green-100 text-green-800",
  manual: "bg-stone-100 text-stone-600",
  import: "bg-stone-100 text-stone-600",
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  new: "bg-amber-100 text-amber-800",
  enriched: "bg-amber-200 text-amber-900",
  qualified: "bg-green-100 text-green-800",
  contacted: "bg-green-200 text-green-900",
  dead: "bg-red-100 text-red-800",
};

export default function MarketingAdminCard({ userEmail }: { userEmail?: string }) {
  const [delayHours, setDelayHours] = useState(48);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, sent: 0, failed: 0 });
  const [dataLoading, setDataLoading] = useState(true);
  const [orgNames, setOrgNames] = useState<string[]>([]);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    first_name: string;
    organization_name: string;
    projected_sites: string;
  }>({ first_name: "", organization_name: "", projected_sites: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Promote state
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<{ id: string; message: string } | null>(null);
  const [softWarning, setSoftWarning] = useState<{ id: string; contacts: any[] } | null>(null);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/config");
      const data = await res.json();
      if (data.config) {
        setDelayHours(parseInt(data.config.welcome_email_delay_hours || "48", 10));
        setSubject(data.config.welcome_email_subject || "");
        setBody(data.config.welcome_email_body || "");
      }
    } catch (err) {
      console.error("Failed to load config:", err);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/scheduled-emails");
      const data = await res.json();
      const videoCounts: Record<string, number> = data.videoCounts || {};
      const leadsWithVideos = (data.leads || []).map((l: any) => ({
        ...l,
        video_count: videoCounts[l.id] || 0,
      }));
      setLeads(leadsWithVideos);
      setStats(data.stats || { total: 0, pending: 0, sent: 0, failed: 0 });
      setOrgNames(data.orgNames || []);
    } catch (err) {
      console.error("Failed to load marketing data:", err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/audit-log");
      const data = await res.json();
      setAuditLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to load audit log:", err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchData();
    fetchAuditLog();
  }, [fetchConfig, fetchData, fetchAuditLog]);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/marketing/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: {
            welcome_email_delay_hours: String(delayHours),
            welcome_email_subject: subject,
            welcome_email_body: body,
          },
          updated_by: userEmail || "admin",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMessage("Settings saved successfully");
        fetchAuditLog();
      } else {
        setSaveMessage(`Error: ${data.error || "Failed to save"}`);
      }
    } catch {
      setSaveMessage("Error: Failed to save settings");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  function startEdit(lead: MarketingLead) {
    setEditingId(lead.id);
    setEditValues({
      first_name: lead.first_name || "",
      organization_name: lead.organization_name || "",
      projected_sites: lead.projected_sites != null ? String(lead.projected_sites) : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({ first_name: "", organization_name: "", projected_sites: "" });
  }

  async function saveEdit(leadId: string) {
    setEditSaving(true);
    try {
      const res = await fetch("/api/marketing/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: leadId,
          first_name: editValues.first_name || null,
          organization_name: editValues.organization_name || null,
          projected_sites: editValues.projected_sites ? parseInt(editValues.projected_sites, 10) : null,
          updated_by: userEmail || "admin",
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchData();
        fetchAuditLog();
      } else {
        const data = await res.json();
        alert(`Failed to save: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Failed to save lead");
    } finally {
      setEditSaving(false);
    }
  }

  async function handlePromote(leadId: string, force = false) {
    setPromotingId(leadId);
    setPromoteError(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(force ? { force: true } : {}),
      });
      const data = await res.json();

      if (data.blocked) {
        setPromoteError({ id: leadId, message: "Blocked: generic email address (info@, admin@, etc.)" });
      } else if (data.duplicate) {
        setPromoteError({ id: leadId, message: `Duplicate: contact already exists (${data.existing_contact_id?.slice(0, 8)}...)` });
        fetchData();
      } else if (data.soft_warning) {
        setSoftWarning({ id: leadId, contacts: data.similar_contacts });
      } else if (data.ok) {
        setSoftWarning(null);
        fetchData();
      } else if (data.error) {
        setPromoteError({ id: leadId, message: data.error });
      }
    } catch {
      setPromoteError({ id: leadId, message: "Failed to promote lead" });
    } finally {
      setPromotingId(null);
    }
  }

  function isPromotionReady(lead: MarketingLead): boolean {
    return !!(lead.first_name && lead.last_name && lead.email && lead.organization_name && lead.title) && lead.promotion_state === "none";
  }

  function renderPreview() {
    const previewBody = body
      .replace(/\{\{first_name\}\}/g, "Joe")
      .replace(/\{\{email\}\}/g, "joe@example.com");
    const previewSubject = subject.replace(/\{\{first_name\}\}/g, "Joe");

    return (
      <div className="mt-4 border rounded-lg bg-gray-50 p-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-semibold text-sm text-gray-700">Email Preview</h4>
          <button
            onClick={() => setShowPreview(false)}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ✕ Close
          </button>
        </div>
        <div className="text-xs text-gray-500 mb-1">
          Subject: <span className="text-gray-900 font-medium">{previewSubject}</span>
        </div>
        <div className="bg-white border rounded p-3 text-sm whitespace-pre-wrap text-gray-800">
          {previewBody}
        </div>
        <div className="mt-2 text-xs text-gray-500">
          📎 EagleEyes_Overview_Presentation.pdf (attached)
        </div>
      </div>
    );
  }

  function matchesKnownOrg(orgName: string | null): boolean {
    if (!orgName) return false;
    const lower = orgName.toLowerCase().trim();
    return orgNames.some((known) => {
      const knownLower = known.toLowerCase().trim();
      return knownLower.includes(lower) || lower.includes(knownLower);
    });
  }

  function getOrgStatus(lead: MarketingLead): "linked" | "similar" | "unmatched" | "empty" {
    if (!lead.organization_name) return "empty";
    if (lead.org_id) return "linked";
    if (matchesKnownOrg(lead.organization_name)) return "similar";
    return "unmatched";
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (configLoading) {
    return (
      <div className="border rounded-lg p-6 bg-white">
        <div className="animate-pulse text-gray-400">Loading marketing settings…</div>
      </div>
    );
  }

  return (
    <>
      {/* ─── Activity Log Card ─── */}
      <div className="border rounded-lg bg-white shadow-sm mb-6">
        <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg">
          <h3 className="text-lg font-semibold text-gray-900">Activity Log</h3>
          <p className="text-sm text-gray-500 mt-0.5">Recent marketing changes by your team</p>
        </div>
        <div className="p-6">
          {auditLoading ? (
            <div className="text-sm text-gray-400 p-4">Loading…</div>
          ) : auditLogs.length === 0 ? (
            <div className="text-sm text-gray-400 border rounded p-4 text-center">
              No activity logged yet. Changes will appear here as they happen.
            </div>
          ) : (
            <div className="border rounded overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Event Type</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Message</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.event_type.includes("edit")
                            ? "bg-blue-100 text-blue-700"
                            : log.event_type.includes("config")
                            ? "bg-purple-100 text-purple-700"
                            : log.event_type.includes("sent")
                            ? "bg-green-100 text-green-700"
                            : log.event_type.includes("failed")
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {log.event_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">
                        {log.source}
                      </td>
                      <td className="px-3 py-2 text-gray-700 text-xs max-w-[400px] truncate" title={log.message}>
                        {log.message}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                        {log.created_by || "system"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── Marketing Automation Card ─── */}
      <div className="border rounded-lg bg-white shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Marketing Automation</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Welcome email settings & lead tracking
            </p>
          </div>
          {(stats.failed > 0 || stats.pending > 0) && (
            <div className="flex gap-2">
              {stats.failed > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {stats.failed} failed
                </span>
              )}
              {stats.pending > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                  {stats.pending} pending
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Delay Config */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Welcome Email Delay</label>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={168} value={delayHours} onChange={(e) => setDelayHours(parseInt(e.target.value, 10))} className="flex-1" />
            <div className="flex items-center gap-1.5">
              <input type="number" min={1} max={720} value={delayHours} onChange={(e) => setDelayHours(parseInt(e.target.value, 10) || 1)} className="w-16 border rounded px-2 py-1 text-sm text-center" />
              <span className="text-sm text-gray-500">hours</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {delayHours >= 24 ? `≈ ${(delayHours / 24).toFixed(1)} days after sign-up • sent daily at 7 AM CT` : `${delayHours} hour${delayHours !== 1 ? "s" : ""} after sign-up • sent daily at 7 AM CT`}
          </p>
        </div>

        {/* Email Subject */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Email Subject</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="Email subject line..." />
        </div>

        {/* Email Body */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-semibold text-gray-700">Email Body</label>
            <span className="text-xs text-gray-400">Tokens: {"{{first_name}}"} {"{{email}}"}</span>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="Email body with {{first_name}} tokens..." />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save Settings"}
          </button>
          <button onClick={() => setShowPreview(!showPreview)} className="px-4 py-2 rounded-md text-sm font-semibold border text-gray-700 hover:bg-gray-50">
            {showPreview ? "Hide Preview" : "Preview Email"}
          </button>
          {saveMessage && <span className={`text-sm ${saveMessage.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>{saveMessage}</span>}
        </div>

        {showPreview && renderPreview()}

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total Leads</div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
            <div className="text-xs text-gray-500 mt-0.5">Emails Sent</div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-xs text-gray-500 mt-0.5">Pending</div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${stats.failed > 0 ? "text-red-600" : "text-gray-400"}`}>{stats.failed}</div>
            <div className="text-xs text-gray-500 mt-0.5">Failed</div>
          </div>
        </div>

        {/* Leads Table */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Marketing Leads</h4>

          {dataLoading ? (
            <div className="text-sm text-gray-400 p-4">Loading…</div>
          ) : leads.length === 0 ? (
            <div className="text-sm text-gray-400 border rounded p-4 text-center">No leads yet. They&apos;ll appear here when visitors sign up.</div>
          ) : (
            <div className="border rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Email</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">First Name</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">
                        <div>Organization</div>
                        <div className="flex items-center gap-3 mt-1 font-normal">
                          <span className="flex items-center gap-1 text-[10px] text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Linked
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            High value
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                            Duplicate?
                          </span>
                        </div>
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Projected Sites</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Lead Status</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Promotion</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Videos</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Welcome Email</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Sent At</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {leads.map((lead) => {
                      const isEditing = editingId === lead.id;
                      const incomplete = !lead.organization_name || lead.projected_sites == null;

                      return (
                        <tr key={lead.id} className={`${incomplete ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                          <td className="px-3 py-2 text-gray-900 text-xs">{lead.email}</td>

                          {/* First Name */}
                          <td className="px-3 py-2 text-gray-900">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editValues.first_name}
                                onChange={(e) => setEditValues({ ...editValues, first_name: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                                placeholder="First name"
                              />
                            ) : (
                              lead.first_name || <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Organization */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editValues.organization_name}
                                onChange={(e) => setEditValues({ ...editValues, organization_name: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-sm"
                                placeholder="Organization"
                              />
                            ) : lead.organization_name ? (
                              (() => {
                                const status = getOrgStatus(lead);
                                const dotColor = status === "linked" ? "bg-green-500" : status === "similar" ? "bg-blue-400" : "bg-amber-500";
                                const textColor = status === "linked" ? "text-green-700" : status === "similar" ? "text-blue-700" : "text-amber-700";
                                const tooltip = status === "linked" ? "Linked to organization" : status === "similar" ? "Similar to existing org — possible duplicate" : "High value lead — ready for onboarding";
                                return (
                                  <span className={`inline-flex items-center gap-1.5 text-sm ${textColor}`} title={tooltip}>
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                                    {lead.organization_name}
                                  </span>
                                );
                              })()
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Projected Sites */}
                          <td className="px-3 py-2 text-gray-600 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValues.projected_sites}
                                onChange={(e) => setEditValues({ ...editValues, projected_sites: e.target.value })}
                                className="w-20 border rounded px-2 py-1 text-sm text-center"
                                placeholder="#"
                              />
                            ) : (
                              lead.projected_sites ?? <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Source Type */}
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_TYPE_COLORS[lead.source_type] || "bg-stone-100 text-stone-600"}`}>
                              {lead.source_type.replace("_", " ")}
                            </span>
                          </td>

                          {/* Lead Status */}
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${LEAD_STATUS_COLORS[lead.lead_status] || "bg-stone-100 text-stone-600"}`}>
                              {lead.lead_status.replace("_", " ")}
                            </span>
                          </td>

                          {/* Promotion State */}
                          <td className="px-3 py-2">
                            {lead.promotion_state === "promoted" ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                Contact ✓
                              </span>
                            ) : lead.promotion_state === "duplicate_review" ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                Possible duplicate
                              </span>
                            ) : isPromotionReady(lead) ? (
                              <div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handlePromote(lead.id); }}
                                  disabled={promotingId === lead.id}
                                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-400 text-amber-900 hover:bg-amber-500 transition-colors animate-pulse disabled:opacity-50"
                                >
                                  {promotingId === lead.id ? "..." : "Promote \u2192"}
                                </button>
                                {promoteError?.id === lead.id && (
                                  <div className="text-xs text-red-600 mt-1">{promoteError.message}</div>
                                )}
                                {softWarning?.id === lead.id && (
                                  <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                                    <div className="font-semibold text-amber-800 mb-1">Similar contacts found:</div>
                                    {softWarning.contacts.map((c: any) => (
                                      <div key={c.id} className="text-amber-700">{c.first_name} {c.last_name} ({c.email})</div>
                                    ))}
                                    <div className="flex gap-2 mt-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handlePromote(lead.id, true); }}
                                        className="px-2 py-1 rounded text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600"
                                      >
                                        Promote anyway
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSoftWarning(null); }}
                                        className="px-2 py-1 rounded text-xs font-semibold border text-gray-600 hover:bg-gray-100"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </td>

                          {/* Videos */}
                          <td className="px-3 py-2 text-center">
                            <span className={`font-medium ${lead.video_count > 0 ? "text-gray-900" : "text-gray-400"}`}>
                              {lead.video_count}
                            </span>
                          </td>

                          {/* Welcome Email Status */}
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lead.welcome_email_status] || "bg-gray-100 text-gray-600"}`}>
                              {lead.welcome_email_status}
                            </span>
                            {lead.welcome_email_error && (
                              <div className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]" title={lead.welcome_email_error}>{lead.welcome_email_error}</div>
                            )}
                          </td>

                          {/* Sent At */}
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                            {lead.welcome_email_sent_at ? formatDate(lead.welcome_email_sent_at) : "—"}
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2 text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => saveEdit(lead.id)}
                                  disabled={editSaving}
                                  className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  {editSaving ? "…" : "Save"}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="px-2 py-1 text-xs font-medium rounded border text-gray-600 hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEdit(lead)}
                                className="px-2 py-1 text-xs font-medium rounded border text-gray-600 hover:bg-gray-100"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
