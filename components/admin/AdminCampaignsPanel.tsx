"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  email_subject: string;
  email_body: string;
  segment_filter: { field: string; value: string } | null;
  delay_hours: number | null;
  trigger_type: string;
  target_type: string;
  is_active: boolean;
  created_at: string;
  last_audience_built_at: string | null;
  audience_built_by: string | null;
  recipient_count: number | null;
  max_delay_hours: number | null;
}

interface ScheduledEmail {
  id: string;
  lead_id: string;
  email_type: string;
  campaign_name: string | null;
  status: string;
  sent_at: string | null;
  send_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

interface Recipient {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  contact_id: string | null;
  email_normalized: string;
  is_eligible: boolean;
  ineligible_reason: string | null;
  status: string;
  added_by: string;
  enrolled_at: string | null;
  name: string;
  email: string;
  type: "lead" | "contact";
}

interface PersonOption {
  lead_id?: string;
  contact_id?: string;
  email: string;
  name: string;
  type: "lead" | "contact";
  unsubscribed?: boolean;
  outreach_ok?: boolean;
  lead_status?: string;
  duplicate_of?: string | null;
}

const TRIGGER_OPTIONS = ["manual", "auto_follow_up", "auto_segment", "auto_milestone"] as const;
const TARGET_OPTIONS = ["manual_selection", "lead_filter", "contact_filter"] as const;

const TARGET_LABELS: Record<string, string> = {
  manual_selection: "Manual Selection",
  lead_filter: "Lead Filter",
  contact_filter: "Contact Filter",
};

const LEAD_FILTER_FIELDS = ["lead_status", "source_type", "industry", "assigned_to"] as const;
const CONTACT_FILTER_FIELDS = ["role_type", "source_type", "industry", "company_id"] as const;

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
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCountdown(sendAt: string): string {
  const diff = new Date(sendAt).getTime() - Date.now();
  if (diff <= 0) return "";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const EMPTY_FORM = {
  name: "", description: "", email_subject: "", email_body: "",
  trigger_type: "manual", target_type: "manual_selection",
  delay_hours: "", is_active: true,
  filter_field: "", filter_value: "",
};

export default function AdminCampaignsPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Audience preview
  const [preview, setPreview] = useState<{ eligible_count: number; ineligible_count: number; sample: { name: string; email: string }[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Manual selection
  const [personOptions, setPersonOptions] = useState<PersonOption[]>([]);
  const [selectedPersons, setSelectedPersons] = useState<PersonOption[]>([]);
  const [personSearch, setPersonSearch] = useState("");
  const [personLoading, setPersonLoading] = useState(false);

  // Recipients for expanded campaign
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsCampaignId, setRecipientsCampaignId] = useState<string | null>(null);

  // Countdown tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Building audience
  const [buildingId, setBuildingId] = useState<string | null>(null);

  // Add recipients modal
  const [addRecipientsOpen, setAddRecipientsOpen] = useState(false);
  const [addRecipientsCampaignId, setAddRecipientsCampaignId] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/campaigns");
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.emails) setEmails(data.emails);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch person options for manual selection
  const fetchPersonOptions = useCallback(async () => {
    setPersonLoading(true);
    try {
      const [lRes, cRes] = await Promise.all([
        fetch("/api/marketing/scheduled-emails"),
        fetch("/api/admin/contacts"),
      ]);
      const leadsData = await lRes.json();
      const contactsData = await cRes.json();

      const options: PersonOption[] = [];
      const seenEmails = new Set<string>();

      // Add contacts first (they take priority)
      for (const c of contactsData.contacts || []) {
        if (!c.email) continue;
        const norm = c.email.toLowerCase().trim();
        if (seenEmails.has(norm)) continue;
        seenEmails.add(norm);
        options.push({
          contact_id: c.id,
          email: c.email,
          name: `${c.first_name} ${c.last_name}`,
          type: "contact",
          unsubscribed: c.unsubscribed,
          outreach_ok: c.outreach_ok,
          duplicate_of: c.duplicate_of,
        });
      }

      // Add leads (skip if email already seen from contacts)
      for (const l of leadsData.leads || []) {
        if (!l.email) continue;
        const norm = l.email.toLowerCase().trim();
        if (seenEmails.has(norm)) continue;
        seenEmails.add(norm);
        options.push({
          lead_id: l.id,
          email: l.email,
          name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email,
          type: "lead",
          unsubscribed: l.unsubscribed,
          outreach_ok: l.outreach_ok,
          lead_status: l.lead_status,
        });
      }

      setPersonOptions(options);
    } catch {} finally {
      setPersonLoading(false);
    }
  }, []);

  // Fetch recipients for a campaign
  async function fetchRecipients(campaignId: string) {
    setRecipientsLoading(true);
    setRecipientsCampaignId(campaignId);
    try {
      const res = await fetch(`/api/admin/campaigns?recipients_for=${campaignId}`);
      const data = await res.json();
      if (data.recipients) setRecipients(data.recipients);
    } catch {} finally {
      setRecipientsLoading(false);
    }
  }

  // Preview audience
  async function fetchPreview() {
    if (!form.filter_field || !form.filter_value) return;
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/admin/campaigns/preview-audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: form.target_type,
          segment_filter: { field: form.filter_field, value: form.filter_value },
        }),
      });
      const data = await res.json();
      setPreview(data);
    } catch {} finally {
      setPreviewLoading(false);
    }
  }

  // Build audience
  async function handleBuildAudience(campaignId: string) {
    setBuildingId(campaignId);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/build-audience`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Added ${data.added} \u00B7 Skipped ${data.skipped_ineligible} ineligible \u00B7 ${data.skipped_duplicate} duplicates`, "success");
        await fetchData();
        await fetchRecipients(campaignId);
      } else {
        showToast(data.error || "Build failed", "error");
      }
    } catch {
      showToast("Build audience failed", "error");
    } finally {
      setBuildingId(null);
    }
  }

  async function handleCancelEmail(emailId: string) {
    try {
      const res = await fetch(`/api/admin/scheduled-emails/${emailId}/cancel`, { method: "POST" });
      if (res.ok) {
        showToast("Email cancelled", "success");
        await fetchData();
      } else {
        const d = await res.json();
        showToast(d.error || "Cancel failed", "error");
      }
    } catch {
      showToast("Cancel failed", "error");
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setPreview(null);
    setSelectedPersons([]);
    setModalOpen(true);
  }

  // When target_type changes to manual_selection, load person options
  function handleTargetTypeChange(value: string) {
    setForm({ ...form, target_type: value, filter_field: "", filter_value: "" });
    setPreview(null);
    if (value === "manual_selection") {
      fetchPersonOptions();
    }
  }

  async function handleSave() {
    if (!form.name || !form.email_subject || !form.email_body || !form.trigger_type) {
      showToast("Name, subject, body, and trigger type are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description || null,
        email_subject: form.email_subject,
        email_body: form.email_body,
        trigger_type: form.trigger_type,
        target_type: form.target_type,
        delay_hours: form.delay_hours ? parseInt(form.delay_hours, 10) : null,
        is_active: form.is_active,
      };

      if (form.target_type === "lead_filter" || form.target_type === "contact_filter") {
        if (form.filter_field && form.filter_value) {
          payload.segment_filter = { field: form.filter_field, value: form.filter_value };
        }
      }

      if (form.target_type === "manual_selection" && selectedPersons.length > 0) {
        payload.selected_recipients = selectedPersons.map((p) => ({
          lead_id: p.lead_id || null,
          contact_id: p.contact_id || null,
          email: p.email,
          unsubscribed: p.unsubscribed,
          outreach_ok: p.outreach_ok,
          lead_status: p.lead_status,
          duplicate_of: p.duplicate_of,
        }));
      }

      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setModalOpen(false);
      showToast("Campaign created", "success");
      await fetchData();
    } catch (err: unknown) {
      showToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  // Handle expanding a campaign row
  function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setRecipients([]);
      setRecipientsCampaignId(null);
    } else {
      setExpandedId(id);
      fetchRecipients(id);
    }
  }

  // Add recipients modal
  function openAddRecipients(campaignId: string) {
    setAddRecipientsCampaignId(campaignId);
    setSelectedPersons([]);
    setPersonSearch("");
    fetchPersonOptions();
    setAddRecipientsOpen(true);
  }

  async function handleAddRecipients() {
    if (!addRecipientsCampaignId || selectedPersons.length === 0) return;
    setSaving(true);
    try {
      // We'll use the same POST endpoint logic but need a dedicated add-recipients endpoint
      // For now, insert directly via a PATCH-like approach
      const payload = {
        campaign_id: addRecipientsCampaignId,
        recipients: selectedPersons.map((p) => ({
          lead_id: p.lead_id || null,
          contact_id: p.contact_id || null,
          email: p.email,
          unsubscribed: p.unsubscribed,
          outreach_ok: p.outreach_ok,
          lead_status: p.lead_status,
          duplicate_of: p.duplicate_of,
        })),
      };
      const res = await fetch("/api/admin/campaigns/add-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setAddRecipientsOpen(false);
      showToast(`Added ${data.added} recipients`, "success");
      await fetchData();
      await fetchRecipients(addRecipientsCampaignId);
    } catch (err: unknown) {
      showToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  // Stats
  const totalEmails = emails.length;
  const sentCount = emails.filter((e) => e.status === "sent").length;
  const pendingCount = emails.filter((e) => e.status === "pending").length;
  const failedCount = emails.filter((e) => e.status === "failed").length;

  const sendCounts: Record<string, number> = {};
  for (const e of emails) {
    if (e.campaign_name) sendCounts[e.campaign_name] = (sendCounts[e.campaign_name] || 0) + 1;
  }

  // Filter person options for search
  const filteredPersons = personSearch
    ? personOptions.filter((p) =>
        p.name.toLowerCase().includes(personSearch.toLowerCase()) ||
        p.email.toLowerCase().includes(personSearch.toLowerCase())
      )
    : personOptions;

  const isPersonSelected = (p: PersonOption) =>
    selectedPersons.some((s) => s.email.toLowerCase() === p.email.toLowerCase());

  function togglePerson(p: PersonOption) {
    if (isPersonSelected(p)) {
      setSelectedPersons(selectedPersons.filter((s) => s.email.toLowerCase() !== p.email.toLowerCase()));
    } else {
      setSelectedPersons([...selectedPersons, p]);
    }
  }

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading campaigns...</div>;

  return (
    <div className="space-y-4 mt-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Campaigns</h2>
          <p className="text-xs text-gray-400">
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} &middot; {totalEmails} email{totalEmails !== 1 ? "s" : ""} scheduled
          </p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
          + New Campaign
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
              <th className="text-left px-3 py-2 font-medium text-gray-600">Audience</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Recipients</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Last Built</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Active</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[60px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {campaigns.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No campaigns yet.</td></tr>
            ) : campaigns.map((c) => (
              <Fragment key={c.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => handleExpand(c.id)}>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{c.email_subject}</td>
                  <td className="px-3 py-2"><Badge value={c.trigger_type} meta={TRIGGER_META} /></td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-600">
                      {TARGET_LABELS[c.target_type] || c.target_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{c.recipient_count ?? 0}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(c.last_audience_built_at)}</td>
                  <td className="px-3 py-2">
                    {c.is_active ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}
                  </td>
                  <td className="px-3 py-2 text-center"><span className="text-xs text-gray-400">{expandedId === c.id ? "\u25B2" : "\u25BC"}</span></td>
                </tr>

                {expandedId === c.id && (
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={8} className="px-6 py-4">
                      <div className="space-y-4">
                        {/* Campaign details */}
                        <div className="space-y-3 text-xs">
                          {c.description && (
                            <div>
                              <span className="font-semibold text-gray-400 uppercase tracking-wide">Description</span>
                              <p className="mt-1 text-gray-700">{c.description}</p>
                            </div>
                          )}
                          <div>
                            <span className="font-semibold text-gray-400 uppercase tracking-wide">Email Body Preview</span>
                            <pre className="mt-1 text-gray-700 whitespace-pre-wrap bg-white border rounded p-3 max-h-40 overflow-auto">{c.email_body}</pre>
                          </div>
                          {c.segment_filter && (
                            <div>
                              <span className="font-semibold text-gray-400 uppercase tracking-wide">Segment Filter</span>
                              <pre className="mt-1 text-gray-700 font-mono bg-white border rounded p-3 max-h-32 overflow-auto">{JSON.stringify(c.segment_filter, null, 2)}</pre>
                            </div>
                          )}
                          {c.max_delay_hours && (
                            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                              <span className="font-semibold text-gray-400">Send Window</span>
                              <span className="text-gray-700">{c.max_delay_hours}h</span>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={c.is_active}
                              onChange={async (e) => {
                                const newVal = e.target.checked;
                                try {
                                  const res = await fetch("/api/admin/campaigns", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: c.id, is_active: newVal }),
                                  });
                                  if (res.ok) {
                                    setCampaigns(campaigns.map((camp) => camp.id === c.id ? { ...camp, is_active: newVal } : camp));
                                  }
                                } catch {}
                              }}
                              className="rounded border-gray-300"
                            />
                            <span className="text-xs font-medium text-gray-600">{c.is_active ? "Active" : "Inactive"}</span>
                          </label>
                          {(c.target_type === "lead_filter" || c.target_type === "contact_filter") && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleBuildAudience(c.id); }}
                              disabled={buildingId === c.id}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                            >
                              {buildingId === c.id ? "Building..." : "Build Audience"}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); openAddRecipients(c.id); }}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            + Add Recipients
                          </button>
                        </div>

                        {/* Recipients table */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recipients</h4>
                          {recipientsLoading && recipientsCampaignId === c.id ? (
                            <div className="text-xs text-gray-400 py-4 text-center">Loading recipients...</div>
                          ) : recipients.length === 0 && recipientsCampaignId === c.id ? (
                            <div className="text-xs text-gray-400 py-4 text-center border rounded bg-white">No recipients yet. Build audience or add manually.</div>
                          ) : recipientsCampaignId === c.id ? (
                            <div className="border rounded bg-white overflow-auto max-h-64">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-b sticky top-0">
                                  <tr>
                                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Name / Email</th>
                                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Type</th>
                                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Eligible</th>
                                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Status</th>
                                    <th className="text-left px-3 py-1.5 font-medium text-gray-500">Enrolled</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {recipients.map((r) => (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                      <td className="px-3 py-1.5">
                                        <div className="font-medium">{r.name}</div>
                                        <div className="text-gray-400">{r.email}</div>
                                      </td>
                                      <td className="px-3 py-1.5">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${r.type === "contact" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                                          {r.type === "contact" ? "Contact" : "Lead"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1.5">
                                        {r.is_eligible ? (
                                          <span className="text-green-600 font-semibold">✓</span>
                                        ) : (
                                          <span className="text-red-500" title={r.ineligible_reason || ""}>✕ {r.ineligible_reason}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-1.5"><Badge value={r.status} meta={STATUS_META} /></td>
                                      <td className="px-3 py-1.5 text-gray-400">{formatDateTime(r.enrolled_at)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
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
                <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No scheduled emails yet.</td></tr>
              ) : emails.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{e.lead_id.slice(0, 8)}&hellip;</td>
                  <td className="px-3 py-2">{e.campaign_name ? <span className="font-medium">{e.campaign_name}</span> : <span className="text-gray-500">{e.email_type}</span>}</td>
                  <td className="px-3 py-2"><Badge value={e.status} meta={STATUS_META} /></td>
                  <td className="px-3 py-2 text-gray-500">
                    {e.status === "pending" && e.send_at && new Date(e.send_at).getTime() > Date.now() ? (
                      <span className="flex items-center gap-2">
                        <span className="text-amber-600 font-medium">Sends in {formatCountdown(e.send_at)}</span>
                        <button
                          onClick={() => handleCancelEmail(e.id)}
                          className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : e.status === "pending" ? (
                      <span className="text-green-600 font-medium">Sending soon...</span>
                    ) : e.status === "sent" ? (
                      <span className="text-green-600">Sent {formatDateTime(e.sent_at)}</span>
                    ) : e.status === "cancelled" ? (
                      <span className="text-gray-400">Cancelled</span>
                    ) : e.status === "failed" ? (
                      <span className="text-red-600">Failed</span>
                    ) : (
                      formatDateTime(e.sent_at)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Campaign Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email Subject *</label>
              <input type="text" value={form.email_subject} onChange={(e) => setForm({ ...form, email_subject: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email Body *</label>
              <textarea value={form.email_body} onChange={(e) => setForm({ ...form, email_body: e.target.value })} rows={6} className="w-full border rounded px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Trigger Type *</label>
              <select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                {TRIGGER_OPTIONS.map((t) => <option key={t} value={t}>{TRIGGER_META[t]?.label || t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delay (hours)</label>
              <input type="number" value={form.delay_hours} onChange={(e) => setForm({ ...form, delay_hours: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" min={0} />
            </div>

            {/* Audience Type */}
            <div className="col-span-2 border-t pt-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Audience Type *</label>
              <select value={form.target_type} onChange={(e) => handleTargetTypeChange(e.target.value)} className="w-full border rounded px-3 py-2 text-sm bg-white">
                {TARGET_OPTIONS.map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
              </select>
            </div>

            {/* Filter builder for lead_filter / contact_filter */}
            {(form.target_type === "lead_filter" || form.target_type === "contact_filter") && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Filter Field</label>
                  <select value={form.filter_field} onChange={(e) => setForm({ ...form, filter_field: e.target.value, filter_value: "" })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                    <option value="">-- Select field --</option>
                    {(form.target_type === "lead_filter" ? LEAD_FILTER_FIELDS : CONTACT_FILTER_FIELDS).map((f) => (
                      <option key={f} value={f}>{f.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Filter Value</label>
                  {(() => {
                    const FILTER_VALUE_OPTIONS: Record<string, string[]> = {
                      lead_status: ["new", "enriched", "qualified", "contacted", "dead"],
                      source_type: ["inbound_form", "scraped", "apollo", "referral", "manual", "import"],
                      role_type: ["decision_maker", "influencer", "gatekeeper", "unknown"],
                    };
                    const options = FILTER_VALUE_OPTIONS[form.filter_field];
                    if (options) {
                      return (
                        <select value={form.filter_value} onChange={(e) => setForm({ ...form, filter_value: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                          <option value="">-- Select --</option>
                          {options.map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
                        </select>
                      );
                    }
                    if (form.filter_field === "industry") {
                      return (
                        <select value={form.filter_value} onChange={(e) => setForm({ ...form, filter_value: e.target.value })} className="w-full border rounded px-3 py-2 text-sm bg-white">
                          <option value="">-- Select --</option>
                          <option value="Quick Service Restaurant">QSR</option>
                          <option value="Hospitality / Hotels">Hotel</option>
                          <option value="Retail">Retail</option>
                          <option value="Healthcare">Healthcare</option>
                          <option value="Other">Other</option>
                        </select>
                      );
                    }
                    return <input type="text" value={form.filter_value} onChange={(e) => setForm({ ...form, filter_value: e.target.value })} className="w-full border rounded px-3 py-2 text-sm" />;
                  })()}
                </div>
                <div className="col-span-2">
                  <button
                    onClick={fetchPreview}
                    disabled={previewLoading || !form.filter_field || !form.filter_value}
                    className="px-3 py-1.5 rounded border text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {previewLoading ? "Loading..." : "Preview Audience"}
                  </button>
                  {preview && (
                    <div className="mt-2 p-3 bg-white border rounded text-xs">
                      <div className="flex gap-4 mb-2">
                        <span className="text-green-700 font-semibold">~{preview.eligible_count} eligible</span>
                        <span className="text-red-600">{preview.ineligible_count} ineligible</span>
                      </div>
                      {preview.sample.length > 0 && (
                        <div className="text-gray-500">
                          Sample: {preview.sample.map((s) => s.name || s.email).join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Manual selection */}
            {form.target_type === "manual_selection" && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Select Recipients ({selectedPersons.length} selected)</label>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm mb-2"
                />
                {personLoading ? (
                  <div className="text-xs text-gray-400 py-4 text-center">Loading...</div>
                ) : (
                  <div className="border rounded max-h-48 overflow-y-auto">
                    {filteredPersons.slice(0, 50).map((p) => {
                      const selected = isPersonSelected(p);
                      return (
                        <div
                          key={p.email}
                          onClick={() => togglePerson(p)}
                          className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-gray-50 border-b last:border-b-0 ${selected ? "bg-green-50" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={selected} readOnly className="rounded border-gray-300" />
                            <div>
                              <span className="font-medium">{p.name}</span>
                              <span className="text-gray-400 ml-2">{p.email}</span>
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${p.type === "contact" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                            {p.type === "contact" ? "Contact" : "Lead"}
                          </span>
                        </div>
                      );
                    })}
                    {filteredPersons.length === 0 && (
                      <div className="text-xs text-gray-400 py-4 text-center">No matches</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? "Saving..." : "Create Campaign"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Recipients Modal */}
      <Dialog open={addRecipientsOpen} onOpenChange={setAddRecipientsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Recipients</DialogTitle>
          </DialogHeader>
          <div>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={personSearch}
              onChange={(e) => setPersonSearch(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mb-2"
            />
            <div className="text-xs text-gray-400 mb-2">{selectedPersons.length} selected</div>
            {personLoading ? (
              <div className="text-xs text-gray-400 py-4 text-center">Loading...</div>
            ) : (
              <div className="border rounded max-h-64 overflow-y-auto">
                {filteredPersons.slice(0, 50).map((p) => {
                  const selected = isPersonSelected(p);
                  return (
                    <div
                      key={p.email}
                      onClick={() => togglePerson(p)}
                      className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-gray-50 border-b last:border-b-0 ${selected ? "bg-green-50" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={selected} readOnly className="rounded border-gray-300" />
                        <div>
                          <span className="font-medium">{p.name}</span>
                          <span className="text-gray-400 ml-2">{p.email}</span>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${p.type === "contact" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                        {p.type === "contact" ? "Contact" : "Lead"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setAddRecipientsOpen(false)} className="px-4 py-2 rounded-lg border text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleAddRecipients} disabled={saving || selectedPersons.length === 0} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? "Adding..." : `Add ${selectedPersons.length} Recipients`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
