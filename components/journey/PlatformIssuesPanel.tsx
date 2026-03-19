"use client";

import { useEffect, useState, useCallback } from "react";
import AttachmentsPanel from "@/components/admin/AttachmentsPanel";
import type { Attachment } from "@/components/admin/AttachmentsPanel";

interface OrgIssue {
  issue_id: string;
  org_id: string | null;
  scope: string;
  issue_type: string;
  title: string;
  description: string | null;
  severity: string | null;
  priority: string | null;
  status: string;
  area: string | null;
  attachments: Attachment[];
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  triaged: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-purple-100 text-purple-700",
  blocked: "bg-red-100 text-red-700",
  verified: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

const TYPE_COLORS: Record<string, string> = {
  bug: "bg-red-50 text-red-600",
  improvement: "bg-blue-50 text-blue-600",
  site_issue: "bg-amber-50 text-amber-600",
};

const ORG_ISSUE_STATUSES = ["open", "triaged", "in_progress", "blocked", "verified", "closed"];
const ORG_ISSUE_SEVERITIES = ["critical", "high", "medium", "low"];

interface Props {
  orgId: string;
  isSSB: boolean;
}

export default function PlatformIssuesPanel({ orgId, isSSB }: Props) {
  const [issues, setIssues] = useState<OrgIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open,triaged,in_progress,blocked");
  const [scopeFilter, setScopeFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");

  // Detail modal state (SSB only)
  const [detailIssue, setDetailIssue] = useState<OrgIssue | null>(null);
  const [detailEdits, setDetailEdits] = useState<Record<string, any>>({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (!isSSB) params.set("org_id", orgId);
    if (statusFilter) params.set("status", statusFilter);
    if (scopeFilter) params.set("scope", scopeFilter);

    const res = await fetch(`/api/org-issues?${params.toString()}`);
    if (res.ok) {
      const data: OrgIssue[] = await res.json();
      if (severityFilter) {
        setIssues(data.filter((i) => i.severity === severityFilter));
      } else {
        setIssues(data);
      }
    } else {
      setIssues([]);
    }
    setLoading(false);
  }, [orgId, isSSB, statusFilter, scopeFilter, severityFilter]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  // Open detail modal
  function openDetail(issue: OrgIssue) {
    if (!isSSB) return;
    setDetailIssue(issue);
    setDetailEdits({});
    setDetailError(null);
  }

  function closeDetail() {
    setDetailIssue(null);
    setDetailEdits({});
    setDetailError(null);
  }

  function setDetailField(key: string, value: any) {
    setDetailEdits((prev) => ({ ...prev, [key]: value }));
  }

  // Get effective value (edited or original)
  function val(key: keyof OrgIssue): any {
    if (key in detailEdits) return detailEdits[key];
    return detailIssue?.[key] ?? "";
  }

  async function handleDetailSave() {
    if (!detailIssue || Object.keys(detailEdits).length === 0) {
      closeDetail();
      return;
    }
    setDetailSaving(true);
    setDetailError(null);

    // Don't send attachments via PATCH — managed by RPC
    const { attachments: _a, ...payload } = detailEdits;

    try {
      const res = await fetch(`/api/org-issues/${detailIssue.issue_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        closeDetail();
        fetchIssues();
      } else {
        const body = await res.json().catch(() => ({}));
        setDetailError(body.error || `Save failed (${res.status})`);
      }
    } catch (err: any) {
      setDetailError(err.message || "Network error");
    } finally {
      setDetailSaving(false);
    }
  }

  const statusOptions = [
    { value: "open,triaged,in_progress,blocked", label: "Active" },
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "blocked", label: "Blocked" },
    { value: "verified,closed", label: "Resolved" },
    { value: "", label: "All" },
  ];

  const scopeOptions = [
    { value: "", label: "All Scopes" },
    { value: "platform", label: "Platform" },
    { value: "org", label: "Org" },
    { value: "site", label: "Site" },
    { value: "equipment", label: "Equipment" },
  ];

  const severityOptions = [
    { value: "", label: "All Severities" },
    { value: "critical", label: "Critical" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];

  // Effective attachments (with local edits applied)
  const currentAttachments: Attachment[] =
    detailEdits.attachments ?? detailIssue?.attachments ?? [];

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Platform Issues</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {issues.length} issue{issues.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border rounded-md px-2 py-1 bg-white"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="text-xs border rounded-md px-2 py-1 bg-white"
            >
              {scopeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="text-xs border rounded-md px-2 py-1 bg-white"
            >
              {severityOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-sm text-gray-400 p-4 text-center">Loading...</div>
        ) : issues.length === 0 ? (
          <div className="text-sm text-gray-400 border rounded p-4 text-center">
            No issues recorded yet.
          </div>
        ) : (
          <div className="border rounded overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Title</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Severity</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {issues.map((issue) => (
                  <tr
                    key={issue.issue_id}
                    className={`hover:bg-gray-50 ${isSSB ? "cursor-pointer" : ""}`}
                    onClick={() => openDetail(issue)}
                  >
                    <td className="px-3 py-2 text-gray-900 text-xs font-medium max-w-[300px] truncate" title={issue.title}>
                      {issue.title}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[issue.issue_type] || "bg-gray-100 text-gray-600"}`}>
                        {issue.issue_type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {issue.severity && (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[issue.severity] || "bg-gray-100 text-gray-600"}`}>
                          {issue.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[issue.status] || "bg-gray-100 text-gray-600"}`}>
                        {issue.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {issue.area || "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                      {new Date(issue.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / Edit modal — SSB only */}
      {detailIssue && isSSB && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Issue Details</h3>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Title (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <p className="text-sm text-gray-900">{detailIssue.title}</p>
              </div>

              {/* Description */}
              {detailIssue.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailIssue.description}</p>
                </div>
              )}

              {/* Editable status + severity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={val("status")}
                    onChange={(e) => setDetailField("status", e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ORG_ISSUE_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                  <select
                    value={val("severity") ?? ""}
                    onChange={(e) => setDetailField("severity", e.target.value || null)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {ORG_ISSUE_SEVERITIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Read-only metadata */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Type:</span>{" "}
                  <span className="font-medium">{detailIssue.issue_type}</span>
                </div>
                <div>
                  <span className="text-gray-500">Scope:</span>{" "}
                  <span className="font-medium">{detailIssue.scope}</span>
                </div>
                <div>
                  <span className="text-gray-500">Area:</span>{" "}
                  <span className="font-medium">{detailIssue.area || "—"}</span>
                </div>
              </div>

              {/* Attachments */}
              <AttachmentsPanel
                recordType="org_issues"
                recordId={detailIssue.issue_id}
                idColumn="issue_id"
                storagePathPrefix={`org-issues/${detailIssue.issue_id}`}
                attachments={currentAttachments}
                onAttachmentsChange={(updated) => setDetailField("attachments", updated)}
              />
            </div>

            {detailError && (
              <div className="mx-6 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {detailError}
              </div>
            )}

            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={closeDetail}
                className="px-4 py-2 text-sm text-gray-700 bg-white border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDetailSave}
                disabled={detailSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {detailSaving ? "Saving..." : Object.keys(detailEdits).length > 0 ? "Save Changes" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
