"use client";

import { useState, useEffect, useCallback } from "react";

interface Subscription {
  id: string;
  dashboard_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  repeat_enabled: boolean;
  repeat_interval_min: number;
  max_repeats: number | null;
  send_resolved: boolean;
  enabled: boolean;
  muted_at: string | null;
  mute_until: string | null;
}

interface SubscriptionDef {
  id: string;
  name: string;
  description: string | null;
  severity: string;
  entity_type: string;
  entity_id: string | null;
  condition_type: string;
  threshold_value: number | null;
  target_value: string | null;
  stale_minutes: number | null;
  delta_value: number | null;
  delta_direction: string | null;
  window_minutes: number | null;
  sustain_minutes: number | null;
  resolved_dead_time_minutes: number;
  equipment_type: string | null;
  sensor_role: string | null;
  anomaly_type: string | null;
  derived_metric: string | null;
  scope_level: string | null;
  scope_mode: string | null;
  scope_ids: string[] | null;
  active_instances: number;
  subscription: Subscription | null;
}

type MuteState = "active" | "muted" | "snoozed";

function getSubscriptionState(sub: Subscription): MuteState {
  if (!sub.muted_at) return "active";
  // Snooze expired → treat as active (Option A: lazy cleanup)
  if (sub.mute_until && new Date(sub.mute_until) <= new Date()) return "active";
  if (sub.mute_until) return "snoozed";
  return "muted";
}

function formatSnoozeUntil(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function AlertSubscriptions({
  orgId,
  refreshKey,
  onSubscriptionChange,
}: {
  orgId: string;
  refreshKey?: number;
  onSubscriptionChange?: () => void;
}) {
  const [definitions, setDefinitions] = useState<SubscriptionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Local edit state for the expanded dispatch editor
  const [editState, setEditState] = useState<{
    email_enabled: boolean;
    sms_enabled: boolean;
    repeat_enabled: boolean;
    repeat_interval_min: number;
    send_resolved: boolean;
  } | null>(null);

  // Inline action states
  const [confirmingMute, setConfirmingMute] = useState<string | null>(null);
  const [confirmingUnsub, setConfirmingUnsub] = useState<string | null>(null);
  const [showSnooze, setShowSnooze] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState("");
  const [snoozeTime, setSnoozeTime] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/subscriptions?org_id=${orgId}`);
      const data = await res.json();
      setDefinitions(data.definitions || []);
    } catch (err) {
      console.error("Failed to fetch subscriptions:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions, refreshKey]);

  // Only show subscribed alerts
  const subscribedDefs = definitions.filter((d) => d.subscription);

  const expandDef = (def: SubscriptionDef) => {
    if (expandedId === def.id) {
      setExpandedId(null);
      setEditState(null);
      return;
    }
    setExpandedId(def.id);
    setConfirmingMute(null);
    setConfirmingUnsub(null);
    setShowSnooze(null);
    if (def.subscription) {
      setEditState({
        email_enabled: def.subscription.email_enabled,
        sms_enabled: def.subscription.sms_enabled,
        repeat_enabled: def.subscription.repeat_enabled,
        repeat_interval_min: def.subscription.repeat_interval_min || 0,
        send_resolved: def.subscription.send_resolved,
      });
    }
  };

  const saveDispatch = async (defId: string) => {
    if (!editState) return;
    setSaving(true);
    try {
      const res = await fetch("/api/alerts/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_def_id: defId,
          ...editState,
        }),
      });
      const data = await res.json();
      if (data.subscription) {
        setDefinitions((prev) =>
          prev.map((d) => (d.id === defId ? { ...d, subscription: data.subscription } : d))
        );
      }
    } catch (err) {
      console.error("Failed to save dispatch:", err);
    } finally {
      setSaving(false);
    }
  };

  const unsubscribe = async (def: SubscriptionDef) => {
    if (!def.subscription) return;
    setActionLoading(true);
    try {
      await fetch(`/api/alerts/subscriptions?subscription_id=${def.subscription.id}`, { method: "DELETE" });
      setDefinitions((prev) =>
        prev.map((d) => (d.id === def.id ? { ...d, subscription: null } : d))
      );
      setExpandedId(null);
      setEditState(null);
      setConfirmingUnsub(null);
      onSubscriptionChange?.();
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const muteSubscription = async (def: SubscriptionDef) => {
    if (!def.subscription) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/alerts/subscriptions/mute", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: def.subscription.id }),
      });
      const data = await res.json();
      if (data.subscription) {
        setDefinitions((prev) =>
          prev.map((d) => (d.id === def.id ? { ...d, subscription: data.subscription } : d))
        );
      }
      setConfirmingMute(null);
    } catch (err) {
      console.error("Failed to mute:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const snoozeSubscription = async (def: SubscriptionDef, until: string) => {
    if (!def.subscription) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/alerts/subscriptions/snooze", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: def.subscription.id, snooze_until: until }),
      });
      const data = await res.json();
      if (data.subscription) {
        setDefinitions((prev) =>
          prev.map((d) => (d.id === def.id ? { ...d, subscription: data.subscription } : d))
        );
      }
      setShowSnooze(null);
      setSnoozeDate("");
      setSnoozeTime("");
    } catch (err) {
      console.error("Failed to snooze:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const unmuteSubscription = async (def: SubscriptionDef) => {
    if (!def.subscription) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/alerts/subscriptions/unmute", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: def.subscription.id }),
      });
      const data = await res.json();
      if (data.subscription) {
        setDefinitions((prev) =>
          prev.map((d) => (d.id === def.id ? { ...d, subscription: data.subscription } : d))
        );
      }
    } catch (err) {
      console.error("Failed to unmute:", err);
    } finally {
      setActionLoading(false);
    }
  };

  // Snooze preset helpers
  function getSnoozePreset(preset: string): string {
    const now = new Date();
    switch (preset) {
      case "tonight": {
        const d = new Date(now);
        d.setHours(24, 0, 0, 0); // next midnight
        return d.toISOString();
      }
      case "tomorrow": {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(8, 0, 0, 0);
        return d.toISOString();
      }
      case "weekend": {
        const d = new Date(now);
        const day = d.getDay(); // 0=Sun ... 6=Sat
        const daysUntilMon = day === 0 ? 1 : (8 - day);
        d.setDate(d.getDate() + daysUntilMon);
        d.setHours(8, 0, 0, 0);
        return d.toISOString();
      }
      case "1week": {
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
      default:
        return now.toISOString();
    }
  }

  // ─── Display helpers ─────────────────────────────────────────────────────

  const severityColor = (s: string) => {
    if (s === "critical") return "bg-red-50 text-red-600 border-red-200";
    if (s === "warning") return "bg-amber-50 text-amber-600 border-amber-200";
    return "bg-blue-50 text-blue-600 border-blue-200";
  };

  const watchDescription = (def: SubscriptionDef) => {
    let what = "";
    if (def.entity_type === "sensor") {
      if (def.equipment_type) {
        what = `${def.equipment_type} → ${def.sensor_role || "sensor"}`;
      } else if (def.entity_id) {
        what = def.entity_id;
      } else {
        what = "Sensor";
      }
    } else if (def.entity_type === "derived") {
      what = def.derived_metric?.replace(/_/g, " ") || "Derived";
    } else if (def.entity_type === "anomaly") {
      what = def.anomaly_type?.replace(/_/g, " ") || "Anomaly";
    }

    let condition = "";
    if (def.condition_type === "above_threshold") condition = `> ${def.threshold_value}`;
    else if (def.condition_type === "below_threshold") condition = `< ${def.threshold_value}`;
    else if (def.condition_type === "changes_to") condition = `= "${def.target_value}"`;
    else if (def.condition_type === "stale") condition = `${def.stale_minutes}min stale`;
    else if (def.condition_type === "rate_of_change") condition = `delta ${def.delta_value} / ${def.window_minutes}min`;

    return `${what} ${condition}`.trim();
  };

  const dispatchSummary = (sub: Subscription) => {
    const channels: string[] = [];
    if (sub.email_enabled) channels.push("Email");
    if (sub.sms_enabled) channels.push("SMS");

    const parts: string[] = [];
    if (channels.length > 0) {
      parts.push(channels.join(" + "));
    } else {
      parts.push("Dashboard only");
    }
    if (sub.repeat_enabled && sub.repeat_interval_min > 0) {
      parts.push(`${sub.repeat_interval_min}min repeat`);
    }
    parts.push(sub.send_resolved ? "Resolve notify" : "No resolve");
    return parts.join(" \u00b7 ");
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full bg-indigo-500 text-white px-4 py-3 flex items-center justify-between hover:bg-indigo-600 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">My Notifications</span>
          <span className="text-xs bg-indigo-400 px-2 py-0.5 rounded-full">
            {subscribedDefs.length} subscribed
          </span>
        </div>
        <span className={`transition-transform ${collapsed ? "" : "rotate-180"}`}>&#9650;</span>
      </button>

      {!collapsed && (
        <div className="p-4">
          {loading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading...</div>
          ) : subscribedDefs.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">
              No subscriptions yet. Subscribe to alerts above to configure how you get notified.
            </div>
          ) : (
            <div className="space-y-2">
              {subscribedDefs.map((def) => {
                const sub = def.subscription!;
                const isExpanded = expandedId === def.id;
                const muteState = getSubscriptionState(sub);

                return (
                  <div
                    key={def.id}
                    className={`rounded-lg border overflow-hidden ${
                      muteState === "muted"
                        ? "border-gray-300 bg-gray-50/30"
                        : muteState === "snoozed"
                        ? "border-yellow-300 bg-yellow-50/30"
                        : "border-indigo-200 bg-indigo-50/30"
                    }`}
                  >
                    {/* Collapsed row — click to expand */}
                    <div
                      onClick={() => expandDef(def)}
                      className="p-3 cursor-pointer hover:bg-indigo-50/60 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            muteState !== "active"
                              ? "bg-gray-400"
                              : def.severity === "critical" ? "bg-red-500" : def.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
                          }`} />
                          <span className="font-medium text-sm text-gray-900">{def.name}</span>
                          <span className={`px-1.5 py-0.5 text-xs rounded-full border ${severityColor(def.severity)}`}>
                            {def.severity}
                          </span>
                          {def.active_instances > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                              {def.active_instances} active
                            </span>
                          )}
                          {/* Mute/Snooze state badge */}
                          {muteState === "muted" && (
                            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full font-medium">
                              Muted
                            </span>
                          )}
                          {muteState === "snoozed" && (
                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">
                              Snoozed until {formatSnoozeUntil(sub.mute_until!)}
                            </span>
                          )}
                        </div>
                        <span className={`text-xs transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                          &#9660;
                        </span>
                      </div>
                      <div className="mt-1 ml-4 text-xs text-gray-500">
                        {dispatchSummary(sub)}
                      </div>
                    </div>

                    {/* Expanded dispatch editor */}
                    {isExpanded && editState && (
                      <div className="px-4 pb-4 border-t border-indigo-200 space-y-4">
                        {/* Condition summary */}
                        <div className="pt-3 flex flex-wrap gap-1.5">
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full border border-indigo-200">
                            {watchDescription(def)}
                          </span>
                          {(def.sustain_minutes ?? 0) > 0 && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                              {def.sustain_minutes}min sustain
                            </span>
                          )}
                        </div>

                        {/* Channels */}
                        <div>
                          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Channels</label>
                          <p className="mt-1 text-xs text-gray-400">Dashboard notifications are always on.</p>
                          <div className="mt-2 space-y-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editState.email_enabled}
                                onChange={(e) => setEditState({ ...editState, email_enabled: e.target.checked })}
                              />
                              Email
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editState.sms_enabled}
                                onChange={(e) => setEditState({ ...editState, sms_enabled: e.target.checked })}
                              />
                              SMS
                            </label>
                          </div>
                        </div>

                        {/* Repeat */}
                        <div>
                          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Repeat Notifications</label>
                          <div className="mt-2 flex items-center gap-2 text-sm">
                            <span className="text-gray-600">Repeat every</span>
                            <input
                              type="number"
                              min={0}
                              max={240}
                              value={editState.repeat_interval_min}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setEditState({
                                  ...editState,
                                  repeat_interval_min: val,
                                  repeat_enabled: val > 0,
                                });
                              }}
                              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg"
                            />
                            <span className="text-gray-600">minutes while alert is active</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-400">
                            Set to 0 to receive only the initial alert. Range: 0-240 minutes.
                          </p>
                        </div>

                        {/* Resolved notification */}
                        <div>
                          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Resolved Notification</label>
                          <div className="mt-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editState.send_resolved}
                                onChange={(e) => setEditState({ ...editState, send_resolved: e.target.checked })}
                              />
                              Notify me when this alert resolves
                            </label>
                            {editState.send_resolved && def.resolved_dead_time_minutes > 0 && (
                              <p className="mt-1 ml-6 text-xs text-teal-600">
                                Notifies after {def.resolved_dead_time_minutes} min of sustained resolution.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* ─── Action Buttons ─── */}
                        <div className="pt-2 border-t border-indigo-200/50 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Save */}
                            <button
                              onClick={() => saveDispatch(def.id)}
                              disabled={saving}
                              className="px-4 py-1.5 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>

                            {/* Mute / Unmute */}
                            {muteState === "active" ? (
                              <button
                                onClick={() => { setConfirmingMute(def.id); setShowSnooze(null); setConfirmingUnsub(null); }}
                                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                Mute
                              </button>
                            ) : (
                              <button
                                onClick={() => unmuteSubscription(def)}
                                disabled={actionLoading}
                                className="px-3 py-1.5 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                Unmute
                              </button>
                            )}

                            {/* Snooze / Adjust Snooze */}
                            <button
                              onClick={() => { setShowSnooze(showSnooze === def.id ? null : def.id); setConfirmingMute(null); setConfirmingUnsub(null); }}
                              className="px-3 py-1.5 text-xs text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded-lg transition-colors"
                            >
                              {muteState === "snoozed" ? "Adjust Snooze" : "Snooze"}
                            </button>

                            {/* Unsubscribe */}
                            <button
                              onClick={() => { setConfirmingUnsub(def.id); setConfirmingMute(null); setShowSnooze(null); }}
                              className="px-3 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              Unsubscribe
                            </button>
                          </div>

                          {/* Mute confirmation */}
                          {confirmingMute === def.id && (
                            <div className="p-2 bg-gray-50 rounded-lg text-xs text-gray-600">
                              <p>Mute this alert? You won&apos;t receive notifications until you unmute. Your settings will be saved.</p>
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => setConfirmingMute(null)}
                                  className="px-3 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => muteSubscription(def)}
                                  disabled={actionLoading}
                                  className="px-3 py-1 rounded bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50"
                                >
                                  Mute
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Snooze picker */}
                          {showSnooze === def.id && (
                            <div className="p-2 bg-yellow-50 rounded-lg text-xs space-y-2">
                              <p className="text-gray-600 font-medium">Snooze until:</p>
                              <div className="flex flex-wrap gap-1">
                                <button
                                  onClick={() => snoozeSubscription(def, getSnoozePreset("tonight"))}
                                  disabled={actionLoading}
                                  className="px-2 py-1 rounded border border-yellow-300 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                                >
                                  Tonight
                                </button>
                                <button
                                  onClick={() => snoozeSubscription(def, getSnoozePreset("tomorrow"))}
                                  disabled={actionLoading}
                                  className="px-2 py-1 rounded border border-yellow-300 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                                >
                                  Tomorrow 8 AM
                                </button>
                                <button
                                  onClick={() => snoozeSubscription(def, getSnoozePreset("weekend"))}
                                  disabled={actionLoading}
                                  className="px-2 py-1 rounded border border-yellow-300 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                                >
                                  Monday 8 AM
                                </button>
                                <button
                                  onClick={() => snoozeSubscription(def, getSnoozePreset("1week"))}
                                  disabled={actionLoading}
                                  className="px-2 py-1 rounded border border-yellow-300 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                                >
                                  1 week
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="date"
                                  value={snoozeDate}
                                  onChange={(e) => setSnoozeDate(e.target.value)}
                                  className="border rounded px-2 py-1 text-xs"
                                />
                                <input
                                  type="time"
                                  value={snoozeTime}
                                  onChange={(e) => setSnoozeTime(e.target.value)}
                                  className="border rounded px-2 py-1 text-xs"
                                />
                                <button
                                  onClick={() => {
                                    if (snoozeDate && snoozeTime) {
                                      const dt = new Date(`${snoozeDate}T${snoozeTime}`);
                                      if (dt > new Date()) {
                                        snoozeSubscription(def, dt.toISOString());
                                      }
                                    }
                                  }}
                                  disabled={actionLoading || !snoozeDate || !snoozeTime}
                                  className="px-3 py-1 rounded bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
                                >
                                  Snooze
                                </button>
                                <button
                                  onClick={() => setShowSnooze(null)}
                                  className="px-2 py-1 text-gray-400 hover:text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Unsubscribe confirmation */}
                          {confirmingUnsub === def.id && (
                            <div className="p-2 bg-red-50 rounded-lg text-xs text-gray-600">
                              <p>Unsubscribe from this alert? This will remove all your settings for this alert.</p>
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => setConfirmingUnsub(null)}
                                  className="px-3 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => unsubscribe(def)}
                                  disabled={actionLoading}
                                  className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  Unsubscribe
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
