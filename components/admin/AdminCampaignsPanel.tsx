"use client";

import { useState, useEffect, useCallback, Fragment } from "react";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  email_subject: string;
  email_body: string;
  segment_filter: Record<string, unknown> | null;
  delay_hours: number | null;
  trigger_type: string;
  is_active: boolean;
  created_at: string;
}

interface ScheduledEmail {
  id: string;
  lead_id: string;
  email_type: string;
  campaign_name: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

const TRIGGER_META: Record<string, { label: string; bg: string; text: string }> = {
  manual:          { label: "Manual",        bg: "bg-gray-100",   text: "text-gray-600" },
  auto_follow_up:  { label: "Auto Follow-up", bg: "bg-blue-100",   text: "text-blue-800" },
  auto_segment:    { label: "Auto Segment",  bg: "bg-purple-100", text: "text-purple-800" },
  auto_milestone:  { label: "Auto Milestone", bg: "bg-amber-100",  text: "text-amber-800" },
};

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  sent:      { label: "Sent",      bg: "bg-green-100",  text: "text-green-800" },
  pending:   { label: "Pending",   bg: "bg-amber-100",  text: "text-amber-800" },
  failed:    { label: "Failed",    bg: "bg-red-100",    text: "text-red-800" },
  cancelled: { label: "Cancelled", bg: "bg-gray-100",   text: "text-gray-500" },
};

function Badge({ value, meta }: { value: string; meta: Record<string, { label: string; bg: string; text: string }> }) {
  const m = meta[value] ?? { label: value, bg: "bg-gray-100", text: "text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
      {m.label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminCampaignsPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/campaigns");
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.emails) setEmails(data.emails);
    } catch {
      // silently fail — empty state handles it
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Stats
  const totalEmails = emails.length;
  const sentCount = emails.filter((e) => e.status === "sent").length;
  const pendingCount = emails.filter((e) => e.status === "pending").length;
  const failedCount = emails.filter((e) => e.status === "failed").length;

  // Send counts per campaign name
  const sendCounts: Record<string, number> = {};
  for (const e of emails) {
    if (e.campaign_name) {
      sendCounts[e.campaign_name] = (sendCounts[e.campaign_name] || 0) + 1;
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500 py-8 text-center">Loading campaigns...</div>;
  }

  return (
    <div className="space-y-4 mt-8">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Campaigns</h2>
          <p className="text-xs text-gray-400">
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} &middot; {totalEmails} email{totalEmails !== 1 ? "s" : ""} scheduled
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border rounded-lg p-3 text-center bg-white">
          <div className="text-2xl font-bold text-gray-900">{totalEmails}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Emails</div>
        </div>
        <div className="border rounded-lg p-3 text-center bg-white">
          <div className="text-2xl font-bold text-green-600">{sentCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Sent</div>
        </div>
        <div className="border rounded-lg p-3 text-center bg-white">
          <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Pending</div>
        </div>
        <div className="border rounded-lg p-3 text-center bg-white">
          <div className="text-2xl font-bold text-red-600">{failedCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Failed</div>
        </div>
      </div>

      {/* Campaigns table */}
      <div className="border rounded-lg overflow-auto bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Subject</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Trigger</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Delay (hrs)</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Sends</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Active</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  No campaigns yet.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <Fragment key={c.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  >
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2">{c.email_subject}</td>
                    <td className="px-3 py-2">
                      <Badge value={c.trigger_type} meta={TRIGGER_META} />
                    </td>
                    <td className="px-3 py-2">{c.delay_hours ?? "\u2014"}</td>
                    <td className="px-3 py-2">{sendCounts[c.name] ?? 0}</td>
                    <td className="px-3 py-2">
                      {c.is_active ? (
                        <span className="text-green-600 font-semibold">Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs text-gray-400">
                        {expandedId === c.id ? "\u25B2" : "\u25BC"}
                      </span>
                    </td>
                  </tr>

                  {expandedId === c.id && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="space-y-3 text-xs">
                          {c.description && (
                            <div>
                              <span className="font-semibold text-gray-400 uppercase tracking-wide">Description</span>
                              <p className="mt-1 text-gray-700">{c.description}</p>
                            </div>
                          )}
                          <div>
                            <span className="font-semibold text-gray-400 uppercase tracking-wide">Email Body Preview</span>
                            <pre className="mt-1 text-gray-700 whitespace-pre-wrap bg-white border rounded p-3 max-h-40 overflow-auto">
                              {c.email_body}
                            </pre>
                          </div>
                          {c.segment_filter && (
                            <div>
                              <span className="font-semibold text-gray-400 uppercase tracking-wide">Segment Filter</span>
                              <pre className="mt-1 text-gray-700 font-mono bg-white border rounded p-3 max-h-32 overflow-auto">
                                {JSON.stringify(c.segment_filter, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Scheduled emails table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Scheduled Email Log</h3>
        <div className="border rounded-lg overflow-auto bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Lead ID</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Campaign / Type</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {emails.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-400">
                    No scheduled emails yet.
                  </td>
                </tr>
              ) : (
                emails.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{e.lead_id.slice(0, 8)}&hellip;</td>
                    <td className="px-3 py-2">
                      {e.campaign_name ? (
                        <span className="font-medium">{e.campaign_name}</span>
                      ) : (
                        <span className="text-gray-500">{e.email_type}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge value={e.status} meta={STATUS_META} />
                    </td>
                    <td className="px-3 py-2 text-gray-500">{formatDate(e.sent_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
