"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    async function fetchIssues() {
      setLoading(true);
      const params = new URLSearchParams();
      if (!isSSB) params.set("org_id", orgId);
      if (statusFilter) params.set("status", statusFilter);
      if (scopeFilter) params.set("scope", scopeFilter);

      const res = await fetch(`/api/org-issues?${params.toString()}`);
      if (res.ok) {
        const data: OrgIssue[] = await res.json();
        // Client-side severity filter
        if (severityFilter) {
          setIssues(data.filter((i) => i.severity === severityFilter));
        } else {
          setIssues(data);
        }
      } else {
        setIssues([]);
      }
      setLoading(false);
    }
    fetchIssues();
  }, [orgId, isSSB, statusFilter, scopeFilter, severityFilter]);

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
                  <tr key={issue.issue_id} className="hover:bg-gray-50">
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
    </div>
  );
}
