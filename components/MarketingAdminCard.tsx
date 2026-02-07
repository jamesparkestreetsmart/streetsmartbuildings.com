"use client";

import { useEffect, useState, useCallback } from "react";

interface ScheduledEmail {
  id: string;
  email_type: string;
  send_at: string;
  status: string;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  z_marketing_leads: {
    email: string;
    first_name: string | null;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function MarketingAdminCard() {
  const [delayHours, setDelayHours] = useState(48);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(true);

  const [showPreview, setShowPreview] = useState(false);

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

  const fetchEmails = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/scheduled-emails");
      const data = await res.json();
      setEmails(data.emails || []);
    } catch (err) {
      console.error("Failed to load emails:", err);
    } finally {
      setEmailsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchEmails();
  }, [fetchConfig, fetchEmails]);

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
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMessage("Settings saved successfully");
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
    <div className="border rounded-lg bg-white shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg">
        <h3 className="text-lg font-semibold text-gray-900">Marketing Automation</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Welcome email settings & scheduled sends
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Delay Config */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Welcome Email Delay
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={168}
              value={delayHours}
              onChange={(e) => setDelayHours(parseInt(e.target.value, 10))}
              className="flex-1"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={720}
                value={delayHours}
                onChange={(e) => setDelayHours(parseInt(e.target.value, 10) || 1)}
                className="w-16 border rounded px-2 py-1 text-sm text-center"
              />
              <span className="text-sm text-gray-500">hours</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {delayHours >= 24
              ? `≈ ${(delayHours / 24).toFixed(1)} days after sign-up`
              : `${delayHours} hour${delayHours !== 1 ? "s" : ""} after sign-up`}
          </p>
        </div>

        {/* Email Template */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Email Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Email subject line..."
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-semibold text-gray-700">
              Email Body
            </label>
            <span className="text-xs text-gray-400">
              Tokens: {"{{first_name}}"} {"{{email}}"}
            </span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full border rounded px-3 py-2 text-sm font-mono"
            placeholder="Email body with {{first_name}} tokens..."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 rounded-md text-sm font-semibold border text-gray-700 hover:bg-gray-50"
          >
            {showPreview ? "Hide Preview" : "Preview Email"}
          </button>
          {saveMessage && (
            <span
              className={`text-sm ${
                saveMessage.startsWith("Error") ? "text-red-600" : "text-green-600"
              }`}
            >
              {saveMessage}
            </span>
          )}
        </div>

        {showPreview && renderPreview()}

        {/* Recent Scheduled Emails */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Recent Scheduled Emails</h4>
            <button
              onClick={() => {
                setEmailsLoading(true);
                fetchEmails();
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Refresh
            </button>
          </div>

          {emailsLoading ? (
            <div className="text-sm text-gray-400">Loading…</div>
          ) : emails.length === 0 ? (
            <div className="text-sm text-gray-400 border rounded p-4 text-center">
              No scheduled emails yet. They&apos;ll appear here when new leads sign up.
            </div>
          ) : (
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Lead</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Scheduled</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {emails.map((email) => (
                    <tr key={email.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">
                          {email.z_marketing_leads?.first_name || "—"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {email.z_marketing_leads?.email || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {formatDate(email.send_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[email.status] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {email.status}
                        </span>
                        {email.error && (
                          <div className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]" title={email.error}>
                            {email.error}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {email.sent_at ? formatDate(email.sent_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
