import { useEffect, useState } from "react";

export interface FutureException {
  event_id: string;
  rule_id: string;
  site_id: string;
  event_date: string;
  event_name: string;
  event_type: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
}

export function useFutureExceptions(siteId: string) {
  const [rows, setRows] = useState<FutureException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchRows() {
    try {
      setLoading(true);

      const url = `/api/store-hours/events?site_id=${siteId}&status=upcoming`;
      const res = await fetch(url, { cache: "no-store" });

      const text = await res.text();

      if (!res.ok) {
        let msg = `HTTP ${res.status} ${res.statusText}`;
        try {
          const j = JSON.parse(text);
          if (j?.error) msg += `: ${j.error}`;
        } catch {}
        throw new Error(msg);
      }

      const json = JSON.parse(text);

      setRows(json.rows ?? []);
      setError(null);
    } catch (e: any) {
      console.error("future events fetch failed:", e);
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (siteId) fetchRows();
  }, [siteId]);

  return {
    rows,
    loading,
    error,
    refetch: fetchRows,
  };
}
