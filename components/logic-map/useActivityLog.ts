"use client";

import { useEffect, useState, useCallback } from "react";

export interface ActivityLogEntry {
  id: string;
  event_type: string;
  source: string;
  message: string;
  metadata: any;
  created_by: string;
  created_at: string;
  event_time?: string | null;
  equipment_id?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  equipment_name?: string | null;
  site_name?: string | null;
}

export function useActivityLog(siteId: string, date?: string) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!siteId || !date) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ site_id: siteId, date });
      const res = await fetch(`/api/activity-log?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEntries(json.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, date]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const addComment = useCallback(
    async (message: string, createdBy: string, eventTime?: string) => {
      if (!siteId || !date) return;
      try {
        const payload: any = {
          site_id: siteId,
          date,
          message,
          created_by: createdBy,
        };
        if (eventTime) payload.event_time = eventTime;
        const res = await fetch("/api/activity-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.entry) {
          setEntries((prev) => [...prev, json.entry]);
        }
      } catch {
        alert("Failed to add note");
      }
    },
    [siteId, date]
  );

  return { entries, loading, refetch: fetchEntries, addComment };
}
