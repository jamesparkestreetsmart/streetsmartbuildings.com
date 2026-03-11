"use client";

import { useState, useEffect, useCallback } from "react";

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
  subscription: {
    id: string;
    dashboard_enabled: boolean;
    email_enabled: boolean;
    sms_enabled: boolean;
    repeat_enabled: boolean;
    repeat_interval_min: number;
    max_repeats: number | null;
    send_resolved: boolean;
    enabled: boolean;
  } | null;
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
    if (!confirm("Unsubscribe from this alert? You can re-subscribe from Alert Definitions above.")) return;
    await fetch(`/api/alerts/subscriptions?subscription_id=${def.subscription.id}`, { method: "DELETE" });
    setDefinitions((prev) =>
      prev.map((d) => (d.id === def.id ? { ...d, subscription: null } : d))
    );
    setExpandedId(null);
    setEditState(null);
    onSubscriptionChange?.();
  };

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

  const dispatchSummary = (sub: NonNullable<SubscriptionDef["subscription"]>) => {
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

                return (
                  <div
                    key={def.id}
                    className="rounded-lg border border-indigo-200 bg-indigo-50/30 overflow-hidden"
                  >
                    {/* Collapsed row — click to expand */}
                    <div
                      onClick={() => expandDef(def)}
                      className="p-3 cursor-pointer hover:bg-indigo-50/60 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            def.severity === "critical" ? "bg-red-500" : def.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
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

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-indigo-200/50">
                          <button
                            onClick={() => saveDispatch(def.id)}
                            disabled={saving}
                            className="px-4 py-1.5 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => unsubscribe(def)}
                            className="px-3 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Unsubscribe
                          </button>
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
