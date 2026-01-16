import { useEffect, useState } from "react";

export interface FutureException {
  event_id: string;
  exception_id: string;
  site_id: string;
  event_date: string; // YYYY-MM-DD
  name: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  source_rule?: any;
}

function isValidFutureException(x: any): x is FutureException {
  return (
    x &&
    typeof x.event_id === "string" &&
    typeof x.exception_id === "string" &&
    typeof x.site_id === "string" &&
    typeof x.event_date === "string" &&
    x.event_date.length > 0 &&
    typeof x.name === "string" &&
    x.name.length > 0
  );
}

export function useFutureExceptions(siteId: string) {
  const [rows, setRows] = useState<FutureException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchRows() {
    try {
      setLoading(true);

      const res = await fetch(`/api/store-hours/future?site_id=${siteId}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch future events");

      const json = await res.json();

      const mapped = (json.rows ?? [])
        .map((r: any) => ({
          event_id: r.event_id,
          exception_id: r.exception_id,
          site_id: r.site_id,
          event_date: r.event_date,
          name: r.name,
          open_time: r.open_time,
          close_time: r.close_time,
          is_closed: r.is_closed,
          source_rule: r.source_rule,
        }))
        .filter(isValidFutureException);

      setRows(mapped);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (siteId) fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  return { rows, loading, error, refetch: fetchRows };
}
