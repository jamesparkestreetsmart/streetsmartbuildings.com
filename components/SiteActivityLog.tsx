"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useOrg } from "@/context/OrgContext";

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
  created_at: string;
}

type Scope = "site" | "equipment" | "devices";

export default function SiteActivityLog({ siteId }: { siteId: string }) {
  const { userEmail } = useOrg();
  const [records, setRecords] = useState<RecordLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeScopes, setActiveScopes] = useState<Set<Scope>>(new Set(["site"]));
  const [sortColumn, setSortColumn] = useState<string>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [equipmentMap, setEquipmentMap] = useState<Map<string, string>>(new Map());
  const [deviceMap, setDeviceMap] = useState<Map<string, string>>(new Map());

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("b_records_log")
      .select("*")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("Error fetching site activity:", error);
      setRecords([]);
    } else {
      const allRecords = data || [];
      setRecords(allRecords);

      // Lookup equipment names
      const eqIds = [...new Set(allRecords.map((r) => r.equipment_id).filter(Boolean))] as string[];
      if (eqIds.length > 0) {
        const { data: eqData } = await supabase
          .from("a_equipments")
          .select("equipment_id, equipment_name")
          .in("equipment_id", eqIds);
        if (eqData) {
          setEquipmentMap(new Map(eqData.map((e) => [e.equipment_id, e.equipment_name])));
        }
      }

      // Lookup device names
      const devIds = [...new Set(allRecords.map((r) => r.device_id).filter(Boolean))] as string[];
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
  }, [siteId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Filter by scope
  const filteredRecords = records.filter((r) => {
    const isSiteLevel = !r.equipment_id && !r.device_id;
    const isEquipmentLevel = !!r.equipment_id && !r.device_id;
    const isDeviceLevel = !!r.device_id;

    if (isSiteLevel && activeScopes.has("site")) return true;
    if (isEquipmentLevel && activeScopes.has("equipment")) return true;
    if (isDeviceLevel && activeScopes.has("devices")) return true;
    return false;
  });

  // Sort
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

  // Scope toggle
  function toggleScope(scope: Scope) {
    setActiveScopes((prev) => {
      const next = new Set(prev);
      if (scope === "site") return next; // Always on

      if (next.has(scope)) {
        next.delete(scope);
        if (scope === "equipment") next.delete("devices");
      } else {
        next.add(scope);
        if (scope === "devices") next.add("equipment");
      }
      return next;
    });
  }

  // Add note
  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      let orgId = records[0]?.org_id;
      if (!orgId) {
        const { data: site } = await supabase
          .from("a_sites")
          .select("org_id")
          .eq("site_id", siteId)
          .single();
        orgId = site?.org_id;
      }

      const { error } = await supabase.from("b_records_log").insert({
        org_id: orgId,
        site_id: siteId,
        event_type: "note",
        source: "site_activity_ui",
        message: noteText.trim(),
        metadata: {},
        created_by: userEmail || "unknown",
        event_date: new Date().toISOString().split("T")[0],
      });

      if (error) {
        alert("❌ Failed to add note: " + error.message);
      } else {
        setNoteText("");
        fetchLogs();
      }
    } catch (err) {
      console.error("Note error:", err);
    } finally {
      setAddingNote(false);
    }
  };

  // CSV Export
  const exportCSV = () => {
    if (sortedRecords.length === 0) return;
    const header = ["Time", "Event Type", "Equipment", "Device", "Message", "Created By"];
    const rows = sortedRecords.map((r) => [
      new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" }),
      r.event_type,
      r.equipment_id ? equipmentMap.get(r.equipment_id) || r.equipment_id : "",
      r.device_id ? deviceMap.get(r.device_id) || r.device_id : "",
      `"${(r.message || "").replace(/"/g, '""')}"`,
      r.created_by || "system",
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `site_activity_${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
  };

  const scopeButtons: { scope: Scope; label: string }[] = [
    { scope: "site", label: "Site" },
    { scope: "equipment", label: "Equipment" },
    { scope: "devices", label: "Devices" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-lg font-semibold">Activity Log</h2>
          <p className="text-sm text-gray-500">
            {sortedRecords.length} event{sortedRecords.length !== 1 ? "s" : ""} recorded for this site
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {scopeButtons.map(({ scope, label }) => {
              const isActive = activeScopes.has(scope);
              const isSite = scope === "site";
              return (
                <button
                  key={scope}
                  onClick={() => toggleScope(scope)}
                  disabled={isSite}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    isActive
                      ? "bg-green-600 text-white"
                      : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                  } ${isSite ? "cursor-default" : "cursor-pointer"}`}
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

      {/* Add Note */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Add a note to this site's activity log…"
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

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 p-4">Loading…</div>
      ) : sortedRecords.length === 0 ? (
        <div className="text-sm text-gray-400 border rounded p-6 text-center bg-white">
          No activity recorded for this site yet.
        </div>
      ) : (
        <div className="border rounded overflow-hidden bg-white max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort("created_at")}>
                  Time{sortColumn === "created_at" && (sortAsc ? " ▲" : " ▼")}
                </th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort("event_type")}>
                  Event Type{sortColumn === "event_type" && (sortAsc ? " ▲" : " ▼")}
                </th>
                {activeScopes.has("equipment") && (
                  <th className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort("equipment_id")}>
                    Equipment{sortColumn === "equipment_id" && (sortAsc ? " ▲" : " ▼")}
                  </th>
                )}
                {activeScopes.has("devices") && (
                  <th className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort("device_id")}>
                    Device{sortColumn === "device_id" && (sortAsc ? " ▲" : " ▼")}
                  </th>
                )}
                <th className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort("message")}>
                  Message{sortColumn === "message" && (sortAsc ? " ▲" : " ▼")}
                </th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort("created_by")}>
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
  );
}
