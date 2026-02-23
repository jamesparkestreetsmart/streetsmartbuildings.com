"use client";

import { useEffect, useState } from "react";

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  message: string;
  source: "base_hours" | "exception_rule" | "comment";
  action: string;
  changed_by: string;
  metadata?: Record<string, any>;
}

export function useStoreHoursChangeLog(siteId: string) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchEntries() {
    if (!siteId) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/store-hours/change-log?site_id=${siteId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEntries(json.entries ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (siteId) fetchEntries();
  }, [siteId]);

  return { entries, loading, error, refetch: fetchEntries };
}
