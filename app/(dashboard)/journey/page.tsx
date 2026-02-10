//app/journey/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useOrg } from "@/context/OrgContext";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface RecordLog {
  id: number;
  org_id: string;
  site_id: string | null;
  equipment_id: string | null;
  device_id: string | null;
  event_type: string;
  source: string;
  message: string;
  metadata: Record<string, any>;
  created_by: string | null;
  created_by_user: string | null;
  created_at: string;
  event_date: string;
}

interface SiteOption {
  site_id: string;
  site_name: string;
}

type Scope = "org" | "sites" | "equipment" | "devices";

export default function JourneyPage() {
  const { selectedOrgId, userEmail } = useOrg();
  const [records, setRecords] = useState<RecordLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [activeScopes, setActiveScopes] = useState<Set<Scope>>(new Set(["org"]));

  // Fetch sites for this org
  useEffect(() => {
    if (!selectedOrgId) return;
    async function fetchSites() {
      const { data } = await supabase
        .from("a_sites")
        .select("site_id, site_name")
        .eq("org_id", selectedOrgId)
        .neq("status", "inventory")
        .order("site_name");
      setSites(data || []);
    }
    fetchSites();
  }, [selectedOrgId]);

  const [sortColumn, setSortColumn] = useState<string>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  const [equipmentMap, setEquipmentMap] = useState<Map<string, string>>(new Map());
  const [deviceMap, setDeviceMap] = useState<Map<string, string>>(new Map());

  const fetchRecords = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);

    // Fetch all records for this org
    const { data, error } = await supabase
      .from("b_records_log")
      .select("*")
      .eq("org_id", selectedOrgId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("Error fetching records:", error);
      setRecords([]);
    } else {
      const allRecords = data || [];
      setRecords(allRecords);

      // Collect unique equipment_ids and device_ids to look up names
      const eqIds = [...new Set(allRecords.map((r) => r.equipment_id).filter(Boolean))] as string[];
      const devIds = [...new Set(allRecords.map((r) => r.device_id).filter(Boolean))] as string[];

      // Fetch equipment names
      if (eqIds.length > 0) {
        const { data: eqData } = await supabase
          .from("a_equipments")
          .select("equipment_id, equipment_name")
          .in("equipment_id", eqIds);
        if (eqData) {
          setEquipmentMap(new Map(eqData.map((e) => [e.equipment_id, e.equipment_name])));
        }
      }

      // Fetch device names
      if (devIds.length > 0) {
        const { data: devData } = await supabase
          .from("a_devices")
          .select("device_id, device_name")
          .in("device_id", devIds);
        if (devData) {
          setDeviceMap(new Map(devData.map((d) => [d.device_id, d.device_name])));
        }
      }
    }
    setLoading(false);
  }, [selectedOrgId]);

  // Filter records based on active scopes (client-side)
  const filteredRecords = records.filter((r) => {
    // Org-level events: no site, equipment, or device
    const isOrgLevel = !r.site_id && !r.equipment_id && !r.device_id;
    // Site-level: has site but no equipment/device
    const isSiteLevel = !!r.site_id && !r.equipment_id && !r.device_id;
    // Equipment-level: has equipment but no device
    const isEquipmentLevel = !!r.equipment_id && !r.device_id;
    // Device-level: has device
    const isDeviceLevel = !!r.device_id;

    if (isOrgLevel && activeScopes.has("org")) return true;
    if (isSiteLevel && activeScopes.has("sites")) return true;
    if (isEquipmentLevel && activeScopes.has("equipment")) return true;
    if (isDeviceLevel && activeScopes.has("devices")) return true;
    return false;
  });

  // Sort filtered records
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    const valA = (a as any)[sortColumn] ?? "";
    const valB = (b as any)[sortColumn] ?? "";
    const cmp = String(valA).localeCompare(String(valB));
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(col);
      setSortAsc(true);
    }
  };

  // CSV Export
  const exportCSV = () => {
    if (sortedRecords.length === 0) return;
    const header = ["Time", "Event Type", "Site", "Equipment", "Device", "Message", "Created By"];
    const rows = sortedRecords.map((r) => [
      new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" }),
      r.event_type,
      r.site_id ? siteMap.get(r.site_id) || r.site_id : "",
      r.equipment_id ? equipmentMap.get(r.equipment_id) || r.metadata?.equipment_name || r.equipment_id : "",
      r.device_id ? deviceMap.get(r.device_id) || r.metadata?.device_name || r.device_id : "",
      `"${(r.message || "").replace(/"/g, '""')}"`,
      r.created_by || "system",
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `journey_activity_${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
  };

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  function toggleScope(scope: Scope) {
    setActiveScopes((prev) => {
      const next = new Set(prev);
      if (scope === "org") return next; // Org is always on

      if (next.has(scope)) {
        // Turning off: also turn off child scopes
        next.delete(scope);
        if (scope === "sites") {
          next.delete("equipment");
          next.delete("devices");
        }
        if (scope === "equipment") {
          next.delete("devices");
        }
      } else {
        // Turning on: also turn on parent scopes
        next.add(scope);
        if (scope === "devices") {
          next.add("equipment");
          next.add("sites");
        }
        if (scope === "equipment") {
          next.add("sites");
        }
      }
      return next;
    });
  }

  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const handleAddNote = async () => {
    if (!noteText.trim() || !selectedOrgId) return;
    setAddingNote(true);
    try {
      const { error } = await supabase.from("b_records_log").insert({
        org_id: selectedOrgId,
        event_type: "note",
        source: "journey_ui",
        message: noteText.trim(),
        metadata: {},
        created_by: userEmail || "unknown",
        event_date: new Date().toISOString().split("T")[0],
      });
      if (error) {
        console.error("Failed to add note:", error);
        alert("❌ Failed to add note: " + error.message);
      } else {
        setNoteText("");
        fetchRecords();
      }
    } catch (err) {
      console.error("Note error:", err);
    } finally {
      setAddingNote(false);
    }
  };

  const scopeButtons: { scope: Scope; label: string }[] = [
    { scope: "org", label: "Organization" },
    { scope: "sites", label: "Sites" },
    { scope: "equipment", label: "Equipment" },
    { scope: "devices", label: "Devices" },
  ];

  // Map site_id to site_name for display
  const siteMap = new Map(sites.map((s) => [s.site_id, s.site_name]));

  return (
    <div className="p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-[#00a859] to-[#e0b53f] bg-clip-text text-transparent mb-2 drop-shadow-[0_0_6px_rgba(224,181,63,0.45)]">
          My Journey
        </h1>
        <p className="text-gray-600 text-sm max-w-2xl mx-auto">
          To be filled out on an annual basis as Eagle Eyes reviews{" "}
          <span className="font-semibold text-gray-800">
            customer savings, efficiency gains, and productivity data
          </span>{" "}
          — tracking your building's evolution toward smarter, leaner operations.
        </p>
      </div>

      {/* Organization Activity Log */}
      <div className="border rounded-lg bg-white shadow-sm max-w-5xl mx-auto">
        <div className="px-6 py-4 border-b bg-gray-50 rounded-t-lg flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Organization Activity</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {sortedRecords.length} event{sortedRecords.length !== 1 ? "s" : ""} recorded
            </p>
          </div>

          {/* Scope toggles + Export */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {scopeButtons.map(({ scope, label }) => {
                const isActive = activeScopes.has(scope);
                const isOrg = scope === "org";
                return (
                  <button
                    key={scope}
                    onClick={() => toggleScope(scope)}
                    disabled={isOrg}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      isActive
                        ? "bg-green-600 text-white"
                        : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                    } ${isOrg ? "cursor-default" : "cursor-pointer"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={exportCSV}
              disabled={sortedRecords.length === 0}
              className="px-3 py-1 rounded-md text-xs font-medium bg-gradient-to-r from-[#00a859] to-[#d4af37] text-white hover:opacity-90 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b bg-white flex items-center gap-2">
          <input
            type="text"
            placeholder="Add a note to the activity log…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }}
            className="flex-1 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={handleAddNote}
            disabled={addingNote || !noteText.trim()}
            className="px-4 py-1.5 rounded-md text-sm font-medium bg-gradient-to-r from-[#00a859] to-[#d4af37] text-white hover:opacity-90 disabled:opacity-50"
          >
            {addingNote ? "Adding…" : "+ Add Note"}
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-gray-400 p-4">Loading…</div>
          ) : sortedRecords.length === 0 ? (
            <div className="text-sm text-gray-400 border rounded p-4 text-center">
              No activity recorded yet. Events will appear here as your team uses the platform.
            </div>
          ) : (
            <div className="border rounded overflow-hidden max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th
                      className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none"
                      onClick={() => handleSort("created_at")}
                    >
                      Time{sortColumn === "created_at" && (sortAsc ? " ▲" : " ▼")}
                    </th>
                    <th
                      className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none"
                      onClick={() => handleSort("event_type")}
                    >
                      Event Type{sortColumn === "event_type" && (sortAsc ? " ▲" : " ▼")}
                    </th>
                    {activeScopes.has("sites") && (
                      <th
                        className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none"
                        onClick={() => handleSort("site_id")}
                      >
                        Site{sortColumn === "site_id" && (sortAsc ? " ▲" : " ▼")}
                      </th>
                    )}
                    {activeScopes.has("equipment") && (
                      <th
                        className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none"
                        onClick={() => handleSort("equipment_id")}
                      >
                        Equipment{sortColumn === "equipment_id" && (sortAsc ? " ▲" : " ▼")}
                      </th>
                    )}
                    {activeScopes.has("devices") && (
                      <th
                        className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none"
                        onClick={() => handleSort("device_id")}
                      >
                        Device{sortColumn === "device_id" && (sortAsc ? " ▲" : " ▼")}
                      </th>
                    )}
                    <th
                      className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none"
                      onClick={() => handleSort("message")}
                    >
                      Message{sortColumn === "message" && (sortAsc ? " ▲" : " ▼")}
                    </th>
                    <th
                      className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none"
                      onClick={() => handleSort("created_by")}
                    >
                      Created By{sortColumn === "created_by" && (sortAsc ? " ▲" : " ▼")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                        {new Date(record.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          record.event_type.includes("created") || record.event_type.includes("joined")
                            ? "bg-green-100 text-green-700"
                            : record.event_type.includes("invited")
                            ? "bg-blue-100 text-blue-700"
                            : record.event_type.includes("updated") || record.event_type.includes("edit") || record.event_type.includes("config")
                            ? "bg-purple-100 text-purple-700"
                            : record.event_type.includes("retired") || record.event_type.includes("failed")
                            ? "bg-red-100 text-red-700"
                            : record.event_type.includes("restored")
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {record.event_type}
                        </span>
                      </td>
                      {activeScopes.has("sites") && (
                        <td className="px-3 py-2 text-gray-600 text-xs">
                          {record.site_id ? (
                            <a
                              href={`/sites/${record.site_id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {siteMap.get(record.site_id) || record.site_id.slice(0, 8)}
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      )}
                      {activeScopes.has("equipment") && (
                        <td className="px-3 py-2 text-gray-600 text-xs">
                          {record.equipment_id ? (
                            <span className="text-gray-700" title={record.equipment_id}>
                              {equipmentMap.get(record.equipment_id) || record.metadata?.equipment_name || record.equipment_id.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      )}
                      {activeScopes.has("devices") && (
                        <td className="px-3 py-2 text-gray-600 text-xs">
                          {record.device_id ? (
                            <span className="text-gray-700" title={record.device_id}>
                              {deviceMap.get(record.device_id) || record.metadata?.device_name || record.device_id.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-gray-700 text-xs max-w-[400px] truncate" title={record.message}>
                        {record.message}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                        {record.created_by || "system"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {records.length >= 1000 && (
            <p className="text-xs text-amber-600 mt-2 text-center">
              Showing most recent 1,000 records. Export CSV for complete history.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 text-center text-gray-400 italic">
        (Coming soon — annual insights, progress dashboards, and sustainability benchmarks.)
      </div>
    </div>
  );
}
