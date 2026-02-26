"use client";

import { useState, useEffect, useCallback } from "react";

interface SubscriptionDef {
  id: string;
  name: string;
  description: string | null;
  severity: string;
  entity_type: string;
  condition_type: string;
  threshold_value: number | null;
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
      // Unsubscribe
      await fetch(`/api/alerts/subscriptions?subscription_id=${def.subscription.id}`, {
        method: "DELETE",
      });
      setDefinitions((prev) =>
        prev.map((d) => (d.id === def.id ? { ...d, subscription: null } : d))
      );
    } else {
      // Subscribe with defaults
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

  const updateSubscription = async (defId: string, updates: Record<string, any>) => {
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

  const severityColor = (s: string) => {
    if (s === "critical") return "bg-red-100 text-red-700 border-red-200";
    if (s === "warning") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-blue-100 text-blue-700 border-blue-200";
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
            {definitions.filter((d) => d.subscription).length} subscribed
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
            <div className="space-y-3">
              {definitions.map((def) => (
                <div key={def.id} className="p-3 rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSubscription(def)}
                        className={`w-8 h-5 rounded-full relative transition-colors ${
                          def.subscription ? "bg-indigo-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            def.subscription ? "left-3.5" : "left-0.5"
                          }`}
                        />
                      </button>
                      <span className="font-medium text-sm text-gray-900">{def.name}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${severityColor(def.severity)}`}>
                        {def.severity}
                      </span>
                      {def.active_instances > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                          {def.active_instances} active
                        </span>
                      )}
                    </div>
                  </div>
                  {def.description && (
                    <div className="mt-1 ml-10 text-xs text-gray-500">{def.description}</div>
                  )}

                  {/* Subscription channels */}
                  {def.subscription && (
                    <div className="mt-2 ml-10 flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-gray-500">Channels:</span>
                      {[
                        { key: "dashboard_enabled", label: "Dashboard" },
                        { key: "email_enabled", label: "Email" },
                        { key: "sms_enabled", label: "SMS" },
                      ].map((ch) => (
                        <button
                          key={ch.key}
                          onClick={() =>
                            updateSubscription(def.id, {
                              [ch.key]: !(def.subscription as any)[ch.key],
                            })
                          }
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                            (def.subscription as any)[ch.key]
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
