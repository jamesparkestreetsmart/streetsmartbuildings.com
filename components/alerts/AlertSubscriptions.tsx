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

export default function AlertSubscriptions({ orgId }: { orgId: string }) {
  const [definitions, setDefinitions] = useState<SubscriptionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

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

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  const toggleSubscription = async (def: SubscriptionDef) => {
    if (def.subscription) {
      // Unsubscribe — DELETE
      await fetch(`/api/alerts/subscriptions?subscription_id=${def.subscription.id}`, {
        method: "DELETE",
      });
      setDefinitions((prev) =>
        prev.map((d) => (d.id === def.id ? { ...d, subscription: null } : d))
      );
    } else {
      // Subscribe with defaults — INSERT
      const res = await fetch("/api/alerts/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_def_id: def.id,
          dashboard_enabled: true,
          email_enabled: false,
          sms_enabled: false,
          repeat_enabled: false,
          repeat_interval_min: 60,
          send_resolved: true,
        }),
      });
      const data = await res.json();
      if (data.subscription) {
        setDefinitions((prev) =>
          prev.map((d) => (d.id === def.id ? { ...d, subscription: data.subscription } : d))
        );
      }
    }
  };

  const updateSubscription = async (defId: string, updates: Record<string, unknown>) => {
    const def = definitions.find((d) => d.id === defId);
    if (!def?.subscription) return;

    const res = await fetch("/api/alerts/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alert_def_id: defId,
        ...def.subscription,
        ...updates,
      }),
    });
    const data = await res.json();
    if (data.subscription) {
      setDefinitions((prev) =>
        prev.map((d) => (d.id === defId ? { ...d, subscription: data.subscription } : d))
      );
    }
  };

  // ─── Display helpers (matches AlertRulesManager) ─────────────────────────

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

  const scopeLabel = (def: SubscriptionDef) => {
    if (def.scope_mode === "all" || !def.scope_mode) return "All Sites";
    const count = def.scope_ids?.length || 0;
    if (def.scope_mode === "include") return `${count} site${count !== 1 ? "s" : ""}`;
    return `Excluding ${count} site${count !== 1 ? "s" : ""}`;
  };

  const subscribedCount = definitions.filter((d) => d.subscription).length;

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full bg-indigo-500 text-white px-4 py-3 flex items-center justify-between hover:bg-indigo-600 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">My Notifications</span>
          <span className="text-xs bg-indigo-400 px-2 py-0.5 rounded-full">
            {subscribedCount} subscribed
          </span>
        </div>
        <span className={`transition-transform ${collapsed ? "" : "rotate-180"}`}>&#9650;</span>
      </button>

      {!collapsed && (
        <div className="p-4">
          {loading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading...</div>
          ) : definitions.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">
              No alert definitions available. Ask your program manager to create alert definitions.
            </div>
          ) : (
            <div className="space-y-2">
              {definitions.map((def) => (
                <div
                  key={def.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    def.subscription
                      ? "border-indigo-200 bg-indigo-50/30"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  {/* Row 1: Toggle + Name + Active badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSubscription(def)}
                        className={`w-8 h-5 rounded-full relative transition-colors ${
                          def.subscription ? "bg-indigo-500" : "bg-gray-300"
                        }`}
                        title={def.subscription ? "Unsubscribe" : "Subscribe"}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            def.subscription ? "left-3.5" : "left-0.5"
                          }`}
                        />
                      </button>
                      <span className="font-medium text-sm text-gray-900">{def.name}</span>
                      {def.active_instances > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                          {def.active_instances} active
                        </span>
                      )}
                      {!def.subscription && (
                        <button
                          onClick={() => toggleSubscription(def)}
                          className="px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-100 border border-indigo-200 rounded-full hover:bg-indigo-200 transition-colors"
                        >
                          Subscribe
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Condition tags (severity, watch, scope, sustain) */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5 ml-10">
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${severityColor(def.severity)}`}>
                      {def.severity}
                    </span>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full border border-indigo-200">
                      {watchDescription(def)}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                      {scopeLabel(def)}
                    </span>
                    {(def.sustain_minutes ?? 0) > 0 && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                        {def.sustain_minutes}min sustain
                      </span>
                    )}
                  </div>

                  {/* Row 3: Description */}
                  {def.description && (
                    <div className="mt-1 ml-10 text-xs text-gray-500">{def.description}</div>
                  )}

                  {/* Row 4: Channel toggles (only when subscribed) */}
                  {def.subscription && (
                    <div className="mt-2 ml-10 flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-gray-500">Channels:</span>
                      {([
                        { key: "dashboard_enabled", label: "Dashboard" },
                        { key: "email_enabled", label: "Email" },
                        { key: "sms_enabled", label: "SMS" },
                      ] as const).map((ch) => (
                        <button
                          key={ch.key}
                          onClick={() =>
                            updateSubscription(def.id, {
                              [ch.key]: !(def.subscription as NonNullable<typeof def.subscription>)[ch.key],
                            })
                          }
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                            (def.subscription as NonNullable<typeof def.subscription>)[ch.key]
                              ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                              : "bg-gray-100 text-gray-400 border-gray-200"
                          }`}
                        >
                          {ch.label}
                        </button>
                      ))}
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() =>
                          updateSubscription(def.id, { send_resolved: !def.subscription!.send_resolved })
                        }
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                          def.subscription.send_resolved
                            ? "bg-green-100 text-green-700 border-green-300"
                            : "bg-gray-100 text-gray-400 border-gray-200"
                        }`}
                      >
                        Resolved
                      </button>
                      <button
                        onClick={() =>
                          updateSubscription(def.id, { repeat_enabled: !def.subscription!.repeat_enabled })
                        }
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                          def.subscription.repeat_enabled
                            ? "bg-amber-100 text-amber-700 border-amber-300"
                            : "bg-gray-100 text-gray-400 border-gray-200"
                        }`}
                      >
                        Repeat
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
