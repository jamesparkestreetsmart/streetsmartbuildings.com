"use client";

import { useState, useEffect, useCallback } from "react";

interface BrowseDef {
  id: string;
  name: string;
  severity: string;
  entity_type: string;
  condition_type: string;
  threshold_value: number | null;
  equipment_type: string | null;
  sensor_role: string | null;
  subscription: {
    id: string;
    dashboard_enabled: boolean;
    email_enabled: boolean;
    sms_enabled: boolean;
    send_resolved: boolean;
  } | null;
}

interface BrowseEquipment {
  equipment_id: string;
  equipment_name: string;
  equipment_group: string | null;
  definitions: BrowseDef[];
}

interface BrowseSite {
  site_id: string;
  site_name: string;
  equipment: BrowseEquipment[];
}

export default function AlertBrowseView({ orgId }: { orgId: string }) {
  const [browse, setBrowse] = useState<BrowseSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [expandedEquipment, setExpandedEquipment] = useState<Set<string>>(new Set());

  // Filters
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [unsubscribedOnly, setUnsubscribedOnly] = useState(false);
  const [search, setSearch] = useState("");

  const fetchBrowse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/entities?org_id=${orgId}&level=browse`);
      const data = await res.json();
      setBrowse(data.browse || []);
      // Auto-expand all sites
      const siteIds = new Set<string>((data.browse || []).map((s: BrowseSite) => s.site_id));
      setExpandedSites(siteIds);
    } catch (err) {
      console.error("Failed to fetch browse data:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchBrowse(); }, [fetchBrowse]);

  const toggleSubscription = async (defId: string, currentSub: BrowseDef["subscription"]) => {
    if (currentSub) {
      // Unsubscribe
      await fetch(`/api/alerts/subscriptions?subscription_id=${currentSub.id}`, { method: "DELETE" });
    } else {
      // Quick subscribe with defaults
      await fetch("/api/alerts/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_def_id: defId,
          dashboard_enabled: true,
          email_enabled: false,
          sms_enabled: false,
          send_resolved: true,
        }),
      });
    }
    await fetchBrowse();
  };

  const toggleSiteExpand = (siteId: string) => {
    setExpandedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId); else next.add(siteId);
      return next;
    });
  };

  const toggleEquipExpand = (equipId: string) => {
    setExpandedEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(equipId)) next.delete(equipId); else next.add(equipId);
      return next;
    });
  };

  // Collect unique equipment types for filter
  const allEquipTypes = [...new Set(
    browse.flatMap((s) => s.equipment.map((eq) => eq.equipment_group).filter(Boolean))
  )] as string[];

  // Apply filters
  const filteredBrowse = browse
    .filter((site) => siteFilter === "all" || site.site_id === siteFilter)
    .map((site) => ({
      ...site,
      equipment: site.equipment
        .filter((eq) => typeFilter === "all" || eq.equipment_group === typeFilter)
        .map((eq) => ({
          ...eq,
          definitions: eq.definitions.filter((def) => {
            if (unsubscribedOnly && def.subscription) return false;
            if (search) {
              const q = search.toLowerCase();
              return (
                def.name.toLowerCase().includes(q) ||
                eq.equipment_name.toLowerCase().includes(q) ||
                site.site_name.toLowerCase().includes(q)
              );
            }
            return true;
          }),
        }))
        .filter((eq) => eq.definitions.length > 0),
    }))
    .filter((site) => site.equipment.length > 0);

  const severityColor = (s: string) => {
    if (s === "critical") return "bg-red-50 text-red-600 border-red-200";
    if (s === "warning") return "bg-amber-50 text-amber-600 border-amber-200";
    return "bg-blue-50 text-blue-600 border-blue-200";
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="bg-emerald-500 text-white px-4 py-3">
        <span className="text-lg font-semibold">Browse by Site & Equipment</span>
      </div>

      <div className="p-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
          >
            <option value="all">All Sites</option>
            {browse.map((s) => (
              <option key={s.site_id} value={s.site_id}>{s.site_name}</option>
            ))}
          </select>

          {allEquipTypes.length > 1 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
            >
              <option value="all">All Equipment Types</option>
              {allEquipTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={unsubscribedOnly}
              onChange={(e) => setUnsubscribedOnly(e.target.checked)}
            />
            Unsubscribed only
          </label>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg w-48"
          />
        </div>

        {/* Browse tree */}
        {loading ? (
          <div className="text-sm text-gray-400 py-4 text-center">Loading...</div>
        ) : filteredBrowse.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">
            No matching equipment with alert definitions found.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredBrowse.map((site) => (
              <div key={site.site_id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Site header */}
                <button
                  onClick={() => toggleSiteExpand(site.site_id)}
                  className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-sm font-medium text-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`transition-transform ${expandedSites.has(site.site_id) ? "rotate-90" : ""}`}>
                      &#9654;
                    </span>
                    {site.site_name}
                    <span className="text-xs text-gray-400 font-normal">
                      {site.equipment.length} equipment
                    </span>
                  </div>
                </button>

                {expandedSites.has(site.site_id) && (
                  <div className="px-3 pb-2">
                    {site.equipment.map((eq) => (
                      <div key={eq.equipment_id} className="mt-1">
                        {/* Equipment header */}
                        <button
                          onClick={() => toggleEquipExpand(eq.equipment_id)}
                          className="w-full px-2 py-1.5 hover:bg-gray-50 flex items-center gap-2 text-sm text-gray-700 rounded transition-colors"
                        >
                          <span className={`text-xs transition-transform ${expandedEquipment.has(eq.equipment_id) ? "rotate-90" : ""}`}>
                            &#9654;
                          </span>
                          <span className="font-medium">{eq.equipment_name}</span>
                          {eq.equipment_group && (
                            <span className="text-xs text-gray-400">{eq.equipment_group}</span>
                          )}
                          <span className="text-xs text-gray-400">
                            {eq.definitions.length} alert{eq.definitions.length !== 1 ? "s" : ""}
                          </span>
                        </button>

                        {expandedEquipment.has(eq.equipment_id) && (
                          <div className="ml-6 mt-1 space-y-1">
                            {eq.definitions.map((def) => (
                              <div
                                key={def.id}
                                className={`flex items-center justify-between px-2 py-1.5 rounded border text-xs ${
                                  def.subscription
                                    ? "border-indigo-200 bg-indigo-50/30"
                                    : "border-gray-200 bg-white"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded-full border ${severityColor(def.severity)}`}>
                                    {def.severity}
                                  </span>
                                  <span className="font-medium text-gray-800">{def.name}</span>
                                  {def.sensor_role && (
                                    <span className="text-gray-400">{def.sensor_role}</span>
                                  )}
                                </div>
                                <button
                                  onClick={() => toggleSubscription(def.id, def.subscription)}
                                  className={`px-2.5 py-1 rounded-full font-medium transition-colors border ${
                                    def.subscription
                                      ? "bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200"
                                      : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                                  }`}
                                >
                                  {def.subscription ? "Subscribed" : "Subscribe"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
