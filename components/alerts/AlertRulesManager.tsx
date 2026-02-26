"use client";

import { useState, useEffect, useCallback } from "react";

interface AlertRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_conditions: {
    anomaly_types?: string[];
    severity?: string[];
    min_duration_min?: number;
  };
  scope_type: string;
  scope_ids: string[] | null;
  notify_channels: string[];
  notify_users: string[] | null;
  cooldown_min: number;
  auto_resolve: boolean;
  enabled: boolean;
  created_by: string;
  created_at: string;
}

const ANOMALY_TYPES = [
  { key: "coil_freeze", label: "Coil Freeze" },
  { key: "short_cycling", label: "Short Cycling" },
  { key: "long_cycle", label: "Long Cycle" },
  { key: "filter_restriction", label: "Filter Restriction" },
  { key: "refrigerant_low", label: "Low Refrigerant" },
  { key: "idle_heat_gain", label: "Idle Heat Gain" },
  { key: "delayed_temp_response", label: "Delayed Response" },
];

const SEVERITY_LEVELS = [
  { key: "info", label: "Info", bgActive: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "warning", label: "Warning", bgActive: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "critical", label: "Critical", bgActive: "bg-red-100 text-red-700 border-red-300" },
];

export default function AlertRulesManager({ orgId }: { orgId: string }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // New rule form state
  const [newRule, setNewRule] = useState({
    name: "",
    anomaly_types: [] as string[],
    severity: ["critical", "warning"] as string[],
    min_duration_min: 0,
    notify_channels: ["dashboard"] as string[],
    cooldown_min: 60,
    auto_resolve: true,
  });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/rules?org_id=${orgId}`);
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      console.error("Failed to fetch rules:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const createRule = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          name: newRule.name,
          trigger_type: "anomaly_opened",
          trigger_conditions: {
            anomaly_types: newRule.anomaly_types.length ? newRule.anomaly_types : undefined,
            severity: newRule.severity,
            min_duration_min: newRule.min_duration_min || undefined,
          },
          notify_channels: newRule.notify_channels,
          cooldown_min: newRule.cooldown_min,
          auto_resolve: newRule.auto_resolve,
        }),
      });
      const data = await res.json();
      if (data.rule) {
        setRules((prev) => [data.rule, ...prev]);
        setShowCreate(false);
        setNewRule({
          name: "",
          anomaly_types: [],
          severity: ["critical", "warning"],
          min_duration_min: 0,
          notify_channels: ["dashboard"],
          cooldown_min: 60,
          auto_resolve: true,
        });
      }
    } catch (err) {
      console.error("Failed to create rule:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    await fetch("/api/alerts/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this alert rule?")) return;
    await fetch(`/api/alerts/rules?id=${id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleArrayItem = (arr: string[], item: string): string[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full bg-amber-500 text-white px-4 py-3 flex items-center justify-between hover:bg-amber-600 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Alert Rules</span>
          <span className="text-xs bg-amber-400 px-2 py-0.5 rounded-full">
            {rules.filter((r) => r.enabled).length} active
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <span
              onClick={(e) => { e.stopPropagation(); setShowCreate(!showCreate); }}
              className="text-sm bg-amber-600 hover:bg-amber-700 px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              + New Rule
            </span>
          )}
          <span className={`transition-transform ${collapsed ? "" : "rotate-180"}`}>&#9650;</span>
        </div>
      </button>

      {!collapsed && (
        <div className="p-4">
          {/* Create Rule Form */}
          {showCreate && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">New Alert Rule</h4>

              <div className="space-y-3">
                {/* Name */}
                <div>
                  <label className="text-sm font-medium text-gray-700">Rule Name</label>
                  <input
                    type="text"
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    placeholder="e.g., Critical Equipment Alerts"
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Anomaly Types */}
                <div>
                  <label className="text-sm font-medium text-gray-700">Anomaly Types (empty = all)</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {ANOMALY_TYPES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setNewRule({ ...newRule, anomaly_types: toggleArrayItem(newRule.anomaly_types, t.key) })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          newRule.anomaly_types.includes(t.key)
                            ? "bg-amber-100 text-amber-700 border border-amber-300"
                            : "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Severity */}
                <div>
                  <label className="text-sm font-medium text-gray-700">Severity Filter</label>
                  <div className="mt-1 flex gap-2">
                    {SEVERITY_LEVELS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setNewRule({ ...newRule, severity: toggleArrayItem(newRule.severity, s.key) })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          newRule.severity.includes(s.key)
                            ? s.bgActive
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Channels */}
                <div>
                  <label className="text-sm font-medium text-gray-700">Notification Channels</label>
                  <div className="mt-1 flex gap-2">
                    {["dashboard", "email", "sms"].map((ch) => (
                      <button
                        key={ch}
                        onClick={() => setNewRule({ ...newRule, notify_channels: toggleArrayItem(newRule.notify_channels, ch) })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                          newRule.notify_channels.includes(ch)
                            ? "bg-indigo-100 text-indigo-700 border border-indigo-300"
                            : "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {ch === "sms" ? "SMS (coming soon)" : ch}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cooldown + Auto-resolve */}
                <div className="flex gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Cooldown (min)</label>
                    <input
                      type="number"
                      value={newRule.cooldown_min}
                      onChange={(e) => setNewRule({ ...newRule, cooldown_min: parseInt(e.target.value) || 60 })}
                      className="mt-1 w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newRule.auto_resolve}
                        onChange={(e) => setNewRule({ ...newRule, auto_resolve: e.target.checked })}
                        className="rounded"
                      />
                      Auto-resolve when anomaly clears
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="px-3 py-1.5 text-sm text-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createRule}
                    disabled={!newRule.name || saving}
                    className="px-4 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
                  >
                    {saving ? "Creating..." : "Create Rule"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rules List */}
          {loading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading rules...</div>
          ) : rules.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">
              No alert rules configured. Create one to start receiving notifications.
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    rule.enabled
                      ? "border-gray-200 bg-white"
                      : "border-gray-100 bg-gray-50 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRule(rule)}
                        className={`w-8 h-5 rounded-full relative transition-colors ${
                          rule.enabled ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            rule.enabled ? "left-3.5" : "left-0.5"
                          }`}
                        />
                      </button>
                      <span className="font-medium text-sm text-gray-900">{rule.name}</span>
                    </div>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 ml-10">
                    {rule.trigger_conditions.anomaly_types?.length ? (
                      rule.trigger_conditions.anomaly_types.map((t: string) => (
                        <span key={t} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
                          {t.replace(/_/g, " ")}
                        </span>
                      ))
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">All anomalies</span>
                    )}
                    {rule.notify_channels.map((ch: string) => (
                      <span key={ch} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full capitalize">
                        {ch}
                      </span>
                    ))}
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                      {rule.cooldown_min}min cooldown
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
